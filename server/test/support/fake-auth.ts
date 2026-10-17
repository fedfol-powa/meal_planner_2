import { vi } from 'vitest';
import type { TestDatabase } from './db.ts';
import { TEST_MAIL_URL, TEST_SUPABASE_URL } from './keys.ts';

function barrier() {
	let release!: () => void;
	let arrived!: () => void;
	const released = new Promise<void>((r) => (release = r));
	const reached = new Promise<void>((r) => (arrived = r));
	return { reached, release, released, arrived };
}

/** An email that reached the fake Mailpit (spec W15): the fields of Mailpit's send API. */
export interface FakeMail {
	to: string;
	subject: string;
	text: string;
	html: string;
}

/**
 * Auth's admin API on the test database, plus Mailpit's send API at TEST_MAIL_URL. A call to
 * /auth/v1/invite or /auth/v1/recover fails the test: the server never makes one (spec W15).
 */
export function installFakeAuth(db: TestDatabase) {
	const calls: string[] = [];
	/** Bodies of the POST /admin/users, in order. */
	const created: Record<string, unknown>[] = [];
	const metadata: { id: string; body: unknown }[] = [];
	const mails: FakeMail[] = [];
	const forbidden: string[] = [];
	const openTransactionsAtCreate: number[] = [];
	const openTransactionsAtPut: number[] = [];
	let before: ReturnType<typeof barrier> | null = null;
	let after: ReturnType<typeof barrier> | null = null;
	let beforeLink: ReturnType<typeof barrier> | null = null;
	let failAfter = false;
	let failDelete: number | 'network' | null = null;
	let failLink: number | null = null;
	let failMail: number | null = null;
	let failPut = false;
	const real = globalThis.fetch;
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (url === `${TEST_MAIL_URL}/api/v1/send`) {
			const body = JSON.parse(String(init!.body));
			const failure = failMail; failMail = null;
			if (failure !== null) return Response.json({}, { status: failure });
			mails.push({ to: body.To[0].Email, subject: body.Subject, text: body.Text, html: body.HTML });
			return Response.json({ ID: crypto.randomUUID() });
		}
		if (url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/invite`) || url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/recover`)) {
			forbidden.push(url);
			throw new Error(`the server must never call ${url}`);
		}
		if (url === `${TEST_SUPABASE_URL}/auth/v1/admin/generate_link`) {
			calls.push('generate_link');
			const body = JSON.parse(String(init!.body));
			const hold = beforeLink; beforeLink = null;
			if (hold) { hold.arrived(); await hold.released; }
			const failure = failLink; failLink = null;
			if (failure !== null) return Response.json({}, { status: failure });
			if (body.type !== 'recovery') return Response.json({ error_code: 'validation_failed' }, { status: 422 });
			const [user] = await db.admin<{ id: string }[]>`select id from auth.users where lower(email) = lower(${body.email})`;
			if (!user) return Response.json({ error_code: 'user_not_found' }, { status: 404 });
			return Response.json({ id: user.id, email: body.email, hashed_token: crypto.randomUUID().replace(/-/g, ''), action_link: 'unused' });
		}
		if (!url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/admin/users`)) return real(input, init);
		const method = init?.method ?? 'GET';
		const id = url.split('/admin/users/')[1];
		calls.push(`${method}${id ? ' id' : ''}`);
		if (method === 'POST') {
			const body = JSON.parse(String(init!.body));
			created.push(body);
			const [{ n }] = await db.admin<{ n: number }[]>`
				select count(*)::int as n from pg_stat_activity where usename = 'app_server' and xact_start is not null`;
			openTransactionsAtCreate.push(n);
			const hold = before; before = null;
			if (hold) { hold.arrived(); await hold.released; }
			let inserted;
			try {
				inserted = await db.admin`
					insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
					select ${body.id}, ${body.email}, 'authenticated', 'authenticated', ${db.admin.json(body.user_metadata)},
						case when ${Boolean(body.email_confirm)} then now() end
					where not exists (select 1 from auth.users where lower(email) = lower(${body.email}) or id = ${body.id})
					on conflict do nothing returning id`;
			} catch {
				// Like Auth when a trigger of the app refuses the row (a deleted id): nothing created.
				return Response.json({ error_code: 'unexpected_failure' }, { status: 500 });
			}
			if (inserted.length === 0) return Response.json({ error_code: 'email_exists' }, { status: 422 });
			const wait = after; after = null;
			if (wait) { wait.arrived(); await wait.released; }
			if (failAfter) { failAfter = false; return new Response('{}', { status: 500 }); }
			return Response.json({ id: body.id, email: body.email });
		}
		if (method === 'PUT') {
			const body = JSON.parse(String(init!.body));
			metadata.push({ id: id!, body });
			const [{ n }] = await db.admin<{ n: number }[]>`
				select count(*)::int as n from pg_stat_activity where usename = 'app_server' and xact_start is not null`;
			openTransactionsAtPut.push(n);
			if (failPut) { failPut = false; return Response.json({}, { status: 500 }); }
			const updated = await db.admin`
				update auth.users set raw_user_meta_data = raw_user_meta_data || ${db.admin.json(body.user_metadata ?? {})}
				where id = ${id!} returning id`;
			return updated.length > 0 ? Response.json({ id }) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
		}
		if (method === 'DELETE') {
			const failure = failDelete; failDelete = null;
			if (failure === 'network') throw new TypeError('fetch failed');
			if (failure !== null) return Response.json({}, { status: failure });
			const deleted = await db.admin`delete from auth.users where id = ${id!} returning id`;
			return deleted.length > 0 ? Response.json({}) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
		}
		const [user] = await db.admin<{ id: string; email: string; email_confirmed_at: string | null }[]>`
			select id, email, email_confirmed_at from auth.users where id = ${id!}`;
		return user ? Response.json(user) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
	});
	const hold = (set: (b: ReturnType<typeof barrier>) => void) => {
		const b = barrier();
		set(b);
		return { reached: b.reached, release: b.release };
	};
	return {
		calls,
		created,
		/** Bodies of the PUT /admin/users/{id}, in order. */
		metadata,
		mails,
		/** Calls to /auth/v1/invite or /auth/v1/recover: always empty in a correct server. */
		forbidden,
		openTransactionsAtCreate,
		openTransactionsAtPut,
		holdNextCreate: () => hold((b) => (before = b)),
		holdAfterNextCreate: () => hold((b) => (after = b)),
		/** Stops the next generate_link before it reads the user. */
		holdNextLink: () => hold((b) => (beforeLink = b)),
		failAfterNextCreate: () => { failAfter = true; },
		/** The next DELETE answers this status, or fails without an answer. */
		failNextDelete: (status: number | 'network') => { failDelete = status; },
		failNextLink: (status: number) => { failLink = status; },
		failNextMail: (status: number) => { failMail = status; },
		failNextPut: () => { failPut = true; },
		restore: () => spy.mockRestore(),
	};
}

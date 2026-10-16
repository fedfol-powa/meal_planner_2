import { vi } from 'vitest';
import type { TestDatabase } from './db.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

/** Refused by the fake Auth as `weak_password`. */
export const WEAK_PASSWORD = 'weak-password-1';

function barrier() {
	let release!: () => void;
	let arrived!: () => void;
	const released = new Promise<void>((r) => (release = r));
	const reached = new Promise<void>((r) => (arrived = r));
	return { reached, release, released, arrived };
}

export function installFakeAuth(db: TestDatabase) {
	const calls: string[] = [];
	const passwords = new Map<string, string>();
	const openTransactionsAtCreate: number[] = [];
	let before: ReturnType<typeof barrier> | null = null;
	let after: ReturnType<typeof barrier> | null = null;
	let failAfter = false;
	let failDelete: number | 'network' | null = null;
	const real = globalThis.fetch;
	const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
		if (!url.startsWith(`${TEST_SUPABASE_URL}/auth/v1/admin/users`)) return real(input, init);
		const method = init?.method ?? 'GET';
		const id = url.split('/admin/users/')[1];
		calls.push(`${method}${id ? ' id' : ''}`);
		if (method === 'POST') {
			const body = JSON.parse(String(init!.body));
			const [{ n }] = await db.admin<{ n: number }[]>`
				select count(*)::int as n from pg_stat_activity where usename = 'app_server' and xact_start is not null`;
			openTransactionsAtCreate.push(n);
			// A password the Auth policy refuses (production may be stricter than the contract).
			if (body.password === WEAK_PASSWORD) return Response.json({ error_code: 'weak_password' }, { status: 422 });
			const hold = before; before = null;
			if (hold) { hold.arrived(); await hold.released; }
			let inserted;
			try {
				inserted = await db.admin`
					insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
					select ${body.id}, ${body.email}, 'authenticated', 'authenticated', ${db.admin.json(body.user_metadata)}, now()
					where not exists (select 1 from auth.users where lower(email) = lower(${body.email}) or id = ${body.id})
					on conflict do nothing returning id`;
			} catch {
				// Like Auth when a trigger of the app refuses the row (a deleted id): nothing created.
				return Response.json({ error_code: 'unexpected_failure' }, { status: 500 });
			}
			if (inserted.length === 0) return Response.json({ error_code: 'email_exists' }, { status: 422 });
			passwords.set(body.email, body.password);
			const wait = after; after = null;
			if (wait) { wait.arrived(); await wait.released; }
			if (failAfter) { failAfter = false; return new Response('{}', { status: 500 }); }
			return Response.json({ id: body.id, email: body.email });
		}
		if (method === 'DELETE') {
			const failure = failDelete; failDelete = null;
			if (failure === 'network') throw new TypeError('fetch failed');
			if (failure !== null) return Response.json({}, { status: failure });
			const deleted = await db.admin`delete from auth.users where id = ${id!} returning id`;
			return deleted.length > 0 ? Response.json({}) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
		}
		const [user] = await db.admin<{ id: string; email: string }[]>`select id, email from auth.users where id = ${id!}`;
		return user ? Response.json(user) : Response.json({ error_code: 'user_not_found' }, { status: 404 });
	});
	const hold = (set: (b: ReturnType<typeof barrier>) => void) => {
		const b = barrier();
		set(b);
		return { reached: b.reached, release: b.release };
	};
	return {
		calls,
		passwords,
		openTransactionsAtCreate,
		holdNextCreate: () => hold((b) => (before = b)),
		holdAfterNextCreate: () => hold((b) => (after = b)),
		failAfterNextCreate: () => { failAfter = true; },
		/** The next DELETE answers this status, or fails without an answer. */
		failNextDelete: (status: number | 'network') => { failDelete = status; },
		restore: () => spy.mockRestore(),
	};
}

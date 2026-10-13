import { vi } from 'vitest';
import type { TestDatabase } from './db.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

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
			const hold = before; before = null;
			if (hold) { hold.arrived(); await hold.released; }
			const inserted = await db.admin`
				insert into auth.users (id, email, aud, role, raw_user_meta_data, email_confirmed_at)
				select ${body.id}, ${body.email}, 'authenticated', 'authenticated', ${db.admin.json(body.user_metadata)}, now()
				where not exists (select 1 from auth.users where lower(email) = lower(${body.email}) or id = ${body.id})
				on conflict do nothing returning id`;
			if (inserted.length === 0) return Response.json({ error_code: 'email_exists' }, { status: 422 });
			passwords.set(body.email, body.password);
			const wait = after; after = null;
			if (wait) { wait.arrived(); await wait.released; }
			if (failAfter) { failAfter = false; return new Response('{}', { status: 500 }); }
			return Response.json({ id: body.id, email: body.email });
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
		restore: () => spy.mockRestore(),
	};
}

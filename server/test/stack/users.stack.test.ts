import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { allowAll, rpcClient, testEnv } from '../support/requests.ts';

const NAMES = ['STACK_SUPABASE_URL', 'STACK_SUPABASE_PUBLISHABLE_KEY', 'STACK_SUPABASE_SECRET_KEY', 'STACK_DB_URL'] as const;
const present = NAMES.every((name) => process.env[name]);

describe.skipIf(!present)('user administration against the local stack', () => {
	let url: string;
	let publishable: string;
	let secret: string;
	let admin: postgres.Sql | undefined;
	let workerEnv: Env;
	let app: ReturnType<typeof createApp>;
	const emails: string[] = [];

	beforeAll(() => {
		url = process.env.STACK_SUPABASE_URL!;
		publishable = process.env.STACK_SUPABASE_PUBLISHABLE_KEY!;
		secret = process.env.STACK_SUPABASE_SECRET_KEY!;
		admin = postgres(process.env.STACK_DB_URL!, { max: 1, onnotice: () => {} });
		const appServer = new URL(process.env.STACK_DB_URL!);
		appServer.username = 'app_server';
		appServer.password = 'app_server_test';
		workerEnv = { ...testEnv(appServer.toString()), SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret, INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll };
		app = createApp({ contract, router, resourceName: 'stack' });
	});
	afterAll(async () => {
		if (!admin) return;
		if (emails.length) await admin`delete from auth.users where email = any(${emails})`;
		await admin.end();
	});

	const client = (token: string) => rpcClient<ContractRouterClient<Contract>>(app, workerEnv, token);
	/** A confirmed person created with the Auth admin API, signed in with the password. */
	async function person(prefix: string) {
		const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		const created = await fetch(`${url}/auth/v1/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'stack-password', email_confirm: true, user_metadata: { display_name: prefix } }),
		});
		if (!created.ok) throw new Error(`admin create: ${created.status}`);
		const { id } = (await created.json()) as { id: string };
		const signedIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'stack-password' }),
		});
		const { access_token } = (await signedIn.json()) as { access_token: string };
		return { id, email, token: access_token };
	}

	it('from the search to the role change, counted at once for a token already issued', async () => {
		const federico = await person('federico');
		await admin!`insert into app.user_roles (user_id, role) values (${federico.id}, 'app_admin')`;
		const giulia = await person('giulia');
		const found = await client(federico.token).users.list({ query: giulia.email.toUpperCase() });
		expect(found.users).toEqual([{ id: giulia.id, displayName: 'giulia', email: giulia.email, roles: [] }]);
		expect((await client(federico.token).users.get({ id: giulia.id })).families).toEqual([]);
		await client(federico.token).users.setRole({ id: giulia.id, role: 'recipe_curator', granted: true });
		expect((await client(giulia.token).profile.get({})).user.globalRoles).toEqual(['recipe_curator']);
		await client(federico.token).users.setRole({ id: giulia.id, role: 'recipe_curator', granted: false });
		expect((await client(giulia.token).profile.get({})).user.globalRoles).toEqual([]);
	});
});

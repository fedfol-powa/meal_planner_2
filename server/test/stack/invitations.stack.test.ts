import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { allowAll, rpcClient, testEnv } from '../support/requests.ts';

const NAMES = ['STACK_SUPABASE_URL', 'STACK_SUPABASE_PUBLISHABLE_KEY', 'STACK_SUPABASE_SECRET_KEY', 'STACK_DB_URL'] as const;
const present = NAMES.every((name) => process.env[name]);

describe.skipIf(!present)('invitations against the local stack', () => {
	let url: string;
	let publishable: string;
	let secret: string;
	let admin: postgres.Sql | undefined;
	let workerEnv: Env;
	let app: ReturnType<typeof createApp>;
	const emails: string[] = [];

	beforeAll(() => {
		const missing = NAMES.filter((name) => !process.env[name]);
		if (missing.length) throw new Error(`missing ${missing.join(', ')}`);
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

	const client = (token?: string) => rpcClient<ContractRouterClient<Contract>>(app, workerEnv, token);
	const fresh = (prefix: string) => {
		const email = `${prefix}-${crypto.randomUUID().slice(0, 8)}@x.it`;
		emails.push(email);
		return email;
	};
	const signIn = async (email: string, password: string) => {
		const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
		});
		return response.ok ? ((await response.json()) as { access_token: string }).access_token : null;
	};
	/** Real Auth admin API, as the test's own hand (not the Worker's). */
	const adminCreate = async (body: Record<string, unknown>) => {
		const response = await fetch(`${url}/auth/v1/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' }, body: JSON.stringify({ email_confirm: true, ...body }),
		});
		if (!response.ok) throw new Error(`admin create: ${response.status}`);
		return ((await response.json()) as { id: string }).id;
	};
	const newAdmin = async () => {
		const email = fresh('admin');
		const id = await adminCreate({ email, password: 'admin-pass-1', user_metadata: { display_name: 'Federico' } });
		await admin!`insert into app.user_roles (user_id, role) values (${id}, 'app_admin')`;
		return client((await signIn(email, 'admin-pass-1'))!);
	};
	const inviteFor = async (email: string, roles: ('recipe_curator' | 'app_admin')[] = []) => {
		const federico = await newAdmin();
		return (await federico.appInvitations.create({ id: crypto.randomUUID(), email, roles })).url.split('#')[1]!;
	};
	const hex = async (token: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');
	const reserve = async (token: string, email: string) =>
		(await admin!<{ user_id: string }[]>`select user_id from app.claim_app_invitation(decode(${await hex(token)}, 'hex'), ${email})`)[0]!.user_id;

	it('sign-ups are off', async () => {
		const settings = (await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } })).json()) as { disable_signup: boolean };
		expect(settings.disable_signup).toBe(true);
	});

	it('the whole path: invitation, account, roles, family and menu', async () => {
		const email = fresh('giulia');
		const token = await inviteFor(email, ['recipe_curator']);
		expect((await client().appInvitations.get({ token })).invitedBy).toBe('Federico');
		expect(await client().appInvitations.accept({ token, email, displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' })).toEqual({ email });
		const access = await signIn(email, 'segreta123');
		expect(access).not.toBeNull();
		const giulia = client(access!);
		expect((await giulia.profile.get({})).user).toMatchObject({ displayName: 'Giulia', locale: 'it-IT', globalRoles: ['recipe_curator'] });
		const familyId = crypto.randomUUID();
		await giulia.family.create({ id: familyId, name: 'Casa Giulia', measurementSystem: 'metric', timeZone: 'Europe/Rome' });
		await giulia.menu.getOpening({ familyId });
		expect((await admin!`select count(*)::int as n from app.weeks where family_id = ${familyId}`)[0]!.n).toBeGreaterThan(0);
	});

	it('the first creation prevails: a later acceptance changes neither password nor profile', async () => {
		const email = fresh('first');
		const token = await inviteFor(email, ['recipe_curator']);
		// A first acceptance stopped after the creation: id reserved, account created with its data.
		const id = await reserve(token, email);
		await adminCreate({ id, email, password: 'prima-pass-1', user_metadata: { display_name: 'Prima', locale: 'en-GB' } });
		expect(await client().appInvitations.accept({ token, email, displayName: 'Seconda', password: 'seconda-pass-2', locale: 'it-IT' })).toEqual({ email });
		expect(await signIn(email, 'seconda-pass-2')).toBeNull();
		const access = await signIn(email, 'prima-pass-1');
		expect(access).not.toBeNull();
		expect((await client(access!).profile.get({})).user).toMatchObject({ displayName: 'Prima', locale: 'en-GB', globalRoles: ['recipe_curator'] });
	});

	it('after internal (account not observable yet), the repeat finds the late creation and closes', async () => {
		const email = fresh('late');
		const token = await inviteFor(email, ['recipe_curator']);
		const real = globalThis.fetch;
		let intercepted = false;
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			// The first creation answers 500 without reaching Auth; the read of the id goes to the real Auth (404).
			if (!intercepted && target === `${url}/auth/v1/admin/users` && init?.method === 'POST') {
				intercepted = true;
				return new Response('{}', { status: 500 });
			}
			return real(input, init);
		});
		try {
			const first = await client().appInvitations.accept({ token, email, displayName: 'Tarda', password: 'tarda-pass-1', locale: 'it-IT' }).catch((e) => e);
			expect(first.code).toBe('internal');
		} finally {
			spy.mockRestore();
		}
		// The original creation becomes visible late, with the reserved id.
		const id = (await admin!<{ reserved_user_id: string }[]>`select reserved_user_id from app.app_invitations where email = ${email}`)[0]!.reserved_user_id;
		await adminCreate({ id, email, password: 'tarda-pass-1', user_metadata: { display_name: 'Tarda', locale: 'it-IT' } });
		expect(await client().appInvitations.accept({ token, email, displayName: 'Tarda', password: 'tarda-pass-1', locale: 'it-IT' })).toEqual({ email });
		expect((await admin!`select role from app.user_roles where user_id = ${id}`).map((r) => r.role)).toEqual(['recipe_curator']);
	});

	it('two concurrent acceptances from the Worker: one account', async () => {
		const email = fresh('twice');
		const token = await inviteFor(email);
		const accept = (password: string) => client().appInvitations.accept({ token, email, displayName: 'Due', password, locale: 'it-IT' });
		const results = await Promise.allSettled([accept('prima-pass-1'), accept('seconda-pass-2')]);
		expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
		for (const r of results) if (r.status === 'rejected') expect((r.reason as { code: string }).code).toBe('invitation_unavailable');
		expect((await admin!`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n).toBe(1);
	});

	it('the Data API does not reach the app schema', async () => {
		const response = await fetch(`${url}/rest/v1/rpc/app_invitation_by_token`, {
			method: 'POST',
			headers: { apikey: publishable, 'content-type': 'application/json', 'content-profile': 'app' },
			body: JSON.stringify({ p_token_hash: '\\x00' }),
		});
		expect(response.ok).toBe(false);
		expect(((await response.json()) as { code: string }).code).toBe('PGRST106');
	});
});

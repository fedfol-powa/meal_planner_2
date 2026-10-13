import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { refuseAll, rpcClient } from './support/requests.ts';

describe.skipIf(!hasDatabase)('app invitations: link and acceptance', () => {
	let actors: Actors;
	let auth: ReturnType<typeof installFakeAuth>;
	beforeAll(async () => {
		actors = await setupActors();
		auth = installFakeAuth(actors.db);
	});
	afterAll(async () => {
		auth?.restore();
		await actors?.close();
	});
	afterEach(() => {
		auth.calls.length = 0;
		auth.openTransactionsAtCreate.length = 0;
	});

	const anonymous = () => rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env);
	const invite = async (roles: ('recipe_curator' | 'app_admin')[] = []) => {
		const admin = await actors.user();
		await actors.db.grantGlobalRole(admin.userId, 'app_admin');
		const email = `p${crypto.randomUUID().slice(0, 8)}@x.it`;
		const { invitation, url } = await admin.client.appInvitations.create({ id: crypto.randomUUID(), email, roles });
		return { admin, email, id: invitation.id, token: url.split('#')[1]! };
	};
	const form = (token: string, email: string, over: Partial<{ displayName: string; password: string; locale: 'it-IT' | 'en-GB' }> = {}) =>
		({ token, email, displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' as const, ...over });
	const accounts = async (email: string) => (await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n;
	const profile = async (email: string) =>
		(await actors.db.admin<{ display_name: string; locale: string }[]>`
			select p.display_name, p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = ${email}`)[0];

	it('reads who invites and the roles, never the email', async () => {
		const { token } = await invite(['recipe_curator']);
		const view = await anonymous().appInvitations.get({ token });
		expect(view.roles).toEqual(['recipe_curator']);
		expect(view.invitedBy).toMatch(/^Test /);
		expect(JSON.stringify(view)).not.toContain('@');
	});

	it('creates the account, marks the invitation used and grants the roles', async () => {
		const { email, id, token } = await invite(['recipe_curator', 'app_admin']);
		expect(await anonymous().appInvitations.accept(form(token, ` ${email.toUpperCase()}`))).toEqual({ email });
		const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
		const [row] = await actors.db.admin<{ status: string; accepted_by: string }[]>`select status, accepted_by from app.app_invitations where id = ${id}`;
		expect(row).toEqual({ status: 'accepted', accepted_by: user!.id });
		expect((await actors.db.admin`select role from app.user_roles where user_id = ${user!.id} order by role`).map((r) => r.role)).toEqual(['app_admin', 'recipe_curator']);
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
	});

	it('holds no app_server transaction while Auth is called', async () => {
		const { email, token } = await invite();
		await anonymous().appInvitations.accept(form(token, email));
		expect(auth.openTransactionsAtCreate).toEqual([0]);
	});

	it('gives one answer for expired, revoked, used and unknown links', async () => {
		const expired = await invite();
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${expired.id}`;
		const revoked = await invite();
		await revoked.admin.client.appInvitations.revoke({ id: revoked.id });
		const used = await invite();
		await anonymous().appInvitations.accept(form(used.token, used.email));
		for (const token of [expired.token, revoked.token, used.token, 'A'.repeat(43)]) {
			expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
			expect((await errorOf(anonymous().appInvitations.accept(form(token, 'x@x.it')))).code).toBe('invitation_unavailable');
		}
	});

	it('refuses another email on the field, without calling Auth', async () => {
		const { token } = await invite();
		const error = await errorOf(anonymous().appInvitations.accept(form(token, 'other@x.it')));
		expect([error.code, error.data]).toEqual(['invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] }]);
		expect(auth.calls).toEqual([]);
	});

	it('refuses when an account with that email was created meanwhile', async () => {
		const { email, token } = await invite();
		await actors.db.admin`insert into auth.users (id, email, aud, role) values (gen_random_uuid(), ${email}, 'authenticated', 'authenticated')`;
		const error = await errorOf(anonymous().appInvitations.accept(form(token, email)));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('a creation that succeeded but answered 500 is reconciled as done', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		auth.failAfterNextCreate();
		expect(await anonymous().appInvitations.accept(form(token, email))).toEqual({ email });
		expect(auth.calls).toEqual(['POST', 'GET id']);
		expect((await actors.db.admin`select status from app.app_invitations where id = ${id}`)[0]!.status).toBe('accepted');
	});

	it('a second submission held until after the first one closed changes nothing', async () => {
		const { email, token } = await invite(['app_admin']);
		const hold = auth.holdNextCreate();
		const second = anonymous().appInvitations.accept(form(token, email, { password: 'seconda123', displayName: 'Altra', locale: 'en-GB' }));
		await hold.reached; // the second one has claimed and waits at Auth
		await anonymous().appInvitations.accept(form(token, email)); // the first one creates and closes
		hold.release();
		expect(await second).toEqual({ email });
		expect(await accounts(email)).toBe(1);
		expect(auth.passwords.get(email)).toBe('segreta123');
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect(auth.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
	});

	it('a second submission arriving after the first creation but before its closing changes nothing', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		const hold = auth.holdAfterNextCreate();
		const first = anonymous().appInvitations.accept(form(token, email));
		await hold.reached; // the account exists, the first one has not closed yet
		expect(await anonymous().appInvitations.accept(form(token, email, { password: 'seconda123', displayName: 'Altra', locale: 'en-GB' }))).toEqual({ email });
		hold.release();
		expect(await first).toEqual({ email });
		expect(await accounts(email)).toBe(1);
		expect(auth.passwords.get(email)).toBe('segreta123');
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await actors.db.admin`select status from app.app_invitations where id = ${id}`)[0]!.status).toBe('accepted');
	});

	it('a revocation between the creation and the closing stops the invitation: account without roles', async () => {
		const { admin, email, id, token } = await invite(['app_admin']);
		const hold = auth.holdAfterNextCreate();
		const pending = anonymous().appInvitations.accept(form(token, email));
		await hold.reached;
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${id}`;
		await admin.client.appInvitations.revoke({ id }); // expired but pending: revocable
		hold.release();
		expect((await errorOf(pending)).code).toBe('invitation_unavailable');
		const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
		expect(await actors.db.admin`select role from app.user_roles where user_id = ${user!.id}`).toHaveLength(0);
	});

	it('ignores the token of a signed-in caller', async () => {
		const { email, token } = await invite();
		const someone = await actors.user();
		await someone.client.appInvitations.accept(form(token, email));
		expect(await accounts(email)).toBe(1);
	});

	it('answers rate_limited from the accept limiter', async () => {
		const { email, token } = await invite();
		const client = rpcClient<ContractRouterClient<Contract>>(actors.app, { ...actors.env, INVITE_ACCEPT_LIMIT: refuseAll });
		expect((await errorOf(client.appInvitations.accept(form(token, email)))).code).toBe('rate_limited');
	});

	it('refuses a 73-byte password before any work', async () => {
		const { email, token } = await invite();
		expect((await errorOf(anonymous().appInvitations.accept(form(token, email, { password: 'a'.repeat(73) })))).code).toBe('invalid');
		expect(auth.calls).toEqual([]);
	});
});

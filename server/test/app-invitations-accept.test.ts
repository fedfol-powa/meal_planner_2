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
		// Spec W15: the server never calls /auth/v1/invite nor /auth/v1/recover.
		expect(auth.forbidden).toEqual([]);
		auth.calls.length = 0;
		auth.created.length = 0;
		auth.mails.length = 0;
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
	const form = (token: string, email: string, over: Partial<{ displayName: string; locale: 'it-IT' | 'en-GB' }> = {}) =>
		({ token, email, displayName: 'Giulia', locale: 'it-IT' as const, ...over });
	const accounts = async (email: string) => (await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users where email = ${email}`)[0]!.n;
	const profile = async (email: string) =>
		(await actors.db.admin<{ display_name: string; locale: string }[]>`
			select p.display_name, p.locale from app.profiles p join auth.users u on u.id = p.user_id where u.email = ${email}`)[0];
	const status = async (id: string) => (await actors.db.admin<{ status: string }[]>`select status from app.app_invitations where id = ${id}`)[0]!.status;
	const ageSends = (email: string) =>
		actors.db.admin`update app.password_emails set sent_at = now() - interval '61 seconds'
			where user_id = (select id from auth.users where email = ${email})`;
	const confirm = (email: string) => actors.db.admin`update auth.users set email_confirmed_at = now() where email = ${email}`;

	it('reads who invites and the roles, never the email', async () => {
		const { token } = await invite(['recipe_curator']);
		const view = await anonymous().appInvitations.get({ token });
		expect(view.roles).toEqual(['recipe_curator']);
		expect(view.invitedBy).toMatch(/^Test /);
		expect(JSON.stringify(view)).not.toContain('@');
	});

	it('creates the account with the email to confirm, closes the invitation, grants the roles, then sends the email', async () => {
		const { email, id, token } = await invite(['recipe_curator', 'app_admin']);
		expect(await anonymous().appInvitations.accept(form(token, ` ${email.toUpperCase()}`))).toEqual({ email, passwordEmail: 'sent' });
		const [user] = await actors.db.admin<{ id: string; confirmed: boolean }[]>`select id, email_confirmed_at is not null as confirmed from auth.users where email = ${email}`;
		expect(user!.confirmed).toBe(false);
		const [row] = await actors.db.admin<{ status: string; accepted_by: string }[]>`select status, accepted_by from app.app_invitations where id = ${id}`;
		expect(row).toEqual({ status: 'accepted', accepted_by: user!.id });
		expect((await actors.db.admin`select role from app.user_roles where user_id = ${user!.id} order by role`).map((r) => r.role)).toEqual(['app_admin', 'recipe_curator']);
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect((await errorOf(anonymous().appInvitations.get({ token }))).code).toBe('invitation_unavailable');
		// The email: normalised address, generic text in the page's language, the app's page with the code in the fragment.
		expect(auth.calls).toEqual(['POST', 'generate_link']);
		expect(auth.mails).toHaveLength(1);
		expect(auth.mails[0]!.to).toBe(email);
		expect(auth.mails[0]!.subject).toBe('Scegli la password per Cosa si mangia');
		expect(auth.mails[0]!.text).toContain(`Per cominciare a usare Cosa si mangia, scegli una password per ${email}.`);
		expect(auth.mails[0]!.text).toMatch(/https:\/\/app\.test\/password#token_hash=[0-9a-f]+&type=recovery/);
	});

	it('writes the language of the page in the email and sends no password to Auth, even from an old client', async () => {
		const { email, token } = await invite();
		const old = { ...form(token, email, { locale: 'en-GB' }), password: 'segreta123' };
		expect(await anonymous().appInvitations.accept(old)).toEqual({ email, passwordEmail: 'sent' });
		expect(auth.created).toEqual([{
			id: expect.any(String), email, email_confirm: false, user_metadata: { display_name: 'Giulia', locale: 'en-GB' },
		}]);
		expect(auth.mails[0]!.subject).toBe('Choose your password for Cosa si mangia');
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
		expect(auth.mails).toEqual([]);
	});

	it('a creation that succeeded but answered 500 is reconciled as done', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		auth.failAfterNextCreate();
		expect(await anonymous().appInvitations.accept(form(token, email))).toEqual({ email, passwordEmail: 'sent' });
		expect(auth.calls).toEqual(['POST', 'GET id', 'generate_link']);
		expect(await status(id)).toBe('accepted');
	});

	it('two submissions: the second, held until after the first closed, changes nothing and sends no second email', async () => {
		const { email, token } = await invite(['app_admin']);
		const hold = auth.holdNextCreate();
		const second = anonymous().appInvitations.accept(form(token, email, { displayName: 'Altra', locale: 'en-GB' }));
		await hold.reached; // the second one has claimed and waits at Auth
		expect(await anonymous().appInvitations.accept(form(token, email))).toEqual({ email, passwordEmail: 'sent' });
		hold.release();
		expect(await second).toEqual({ email, passwordEmail: 'too_soon' });
		expect(await accounts(email)).toBe(1);
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect(auth.mails).toHaveLength(1);
		expect(auth.calls.filter((c) => c.startsWith('PUT'))).toEqual([]);
	});

	it('a late submission after the email was confirmed: not_needed, no email', async () => {
		const { email, token } = await invite();
		const hold = auth.holdNextCreate();
		const second = anonymous().appInvitations.accept(form(token, email));
		await hold.reached;
		await anonymous().appInvitations.accept(form(token, email));
		await confirm(email);
		await ageSends(email);
		hold.release();
		expect(await second).toEqual({ email, passwordEmail: 'not_needed' });
		expect(auth.mails).toHaveLength(1);
	});

	it('a second submission arriving after the first creation but before its closing changes nothing', async () => {
		const { email, id, token } = await invite(['recipe_curator']);
		const hold = auth.holdAfterNextCreate();
		const first = anonymous().appInvitations.accept(form(token, email));
		await hold.reached; // the account exists, the first one has not closed yet
		const second = await anonymous().appInvitations.accept(form(token, email, { displayName: 'Altra', locale: 'en-GB' }));
		hold.release();
		const answers = [second, await first].map((a) => a.passwordEmail).sort();
		expect(answers).toEqual(['sent', 'too_soon']);
		expect(await accounts(email)).toBe(1);
		expect(await profile(email)).toEqual({ display_name: 'Giulia', locale: 'it-IT' });
		expect(await status(id)).toBe('accepted');
		expect(auth.mails).toHaveLength(1);
	});

	it('a revocation between the creation and the closing stops the invitation: account without roles, no email', async () => {
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
		expect(auth.mails).toEqual([]);
		expect(auth.calls).not.toContain('generate_link');
	});

	it('a failing link or a failing send answers failed and keeps the acceptance', async () => {
		const link = await invite();
		auth.failNextLink(500);
		expect(await anonymous().appInvitations.accept(form(link.token, link.email))).toEqual({ email: link.email, passwordEmail: 'failed' });
		expect(await status(link.id)).toBe('accepted');
		const mail = await invite();
		auth.failNextMail(500);
		expect(await anonymous().appInvitations.accept(form(mail.token, mail.email))).toEqual({ email: mail.email, passwordEmail: 'failed' });
		expect(await status(mail.id)).toBe('accepted');
	});

	it('account deleted after the closing and before the authorisation: unavailable, Auth not called again', async () => {
		const { email, id, token } = await invite();
		// The deletion happens inside the closing transaction, once the invitation is accepted.
		const trigger = `w15_delete_${id.replace(/-/g, '')}`;
		await actors.db.admin.unsafe(`
			create function app.${trigger}() returns trigger language plpgsql as $$
			begin delete from auth.users where id = new.reserved_user_id; return null; end $$;
			create trigger ${trigger} after update of status on app.app_invitations
			for each row when (new.id = '${id}' and new.status = 'accepted') execute function app.${trigger}()`);
		try {
			expect(await anonymous().appInvitations.accept(form(token, email))).toEqual({ email, passwordEmail: 'unavailable' });
		} finally {
			await actors.db.admin.unsafe(`drop trigger ${trigger} on app.app_invitations; drop function app.${trigger}()`);
		}
		expect(auth.calls).toEqual(['POST']);
		expect(await accounts(email)).toBe(0);
	});

	it('account deleted after the authorisation and before generate_link: 404, unavailable, no account created', async () => {
		const { email, token } = await invite();
		const hold = auth.holdNextLink();
		const pending = anonymous().appInvitations.accept(form(token, email));
		await hold.reached;
		await actors.db.admin`delete from auth.users where email = ${email}`;
		hold.release();
		expect(await pending).toEqual({ email, passwordEmail: 'unavailable' });
		expect(auth.calls).toEqual(['POST', 'generate_link']);
		expect(await accounts(email)).toBe(0);
		expect(auth.mails).toEqual([]);
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
		expect((await errorOf(client.appInvitations.resendPasswordEmail({ token, email, locale: 'it-IT' }))).code).toBe('rate_limited');
	});

	describe('resendPasswordEmail', () => {
		const resend = (token: string, email: string, locale: 'it-IT' | 'en-GB' = 'it-IT') => anonymous().appInvitations.resendPasswordEmail({ token, email, locale });

		it('too soon within 60 seconds, then sends the generic text in the language asked', async () => {
			const { email, token } = await invite();
			await anonymous().appInvitations.accept(form(token, email));
			expect(await resend(token, email)).toEqual({ passwordEmail: 'too_soon' });
			await ageSends(email);
			expect(await resend(token, ` ${email.toUpperCase()}`, 'en-GB')).toEqual({ passwordEmail: 'sent' });
			expect(auth.mails).toHaveLength(2);
			expect(auth.mails[1]!.to).toBe(email);
			expect(auth.mails[1]!.text).toContain(`To start using Cosa si mangia, choose a password for ${email}.`);
		});

		it('two concurrent resends: one email', async () => {
			const { email, token } = await invite();
			await anonymous().appInvitations.accept(form(token, email));
			await ageSends(email);
			const answers = await Promise.all([resend(token, email), resend(token, email)]);
			expect(answers.map((a) => a.passwordEmail).sort()).toEqual(['sent', 'too_soon']);
			expect(auth.mails).toHaveLength(2);
		});

		it('unavailable with another token, another email or a pending invitation, without calling Auth', async () => {
			const { email, token } = await invite();
			await anonymous().appInvitations.accept(form(token, email));
			const pending = await invite();
			auth.calls.length = 0;
			expect(await resend('A'.repeat(43), email)).toEqual({ passwordEmail: 'unavailable' });
			expect(await resend(token, 'other@x.it')).toEqual({ passwordEmail: 'unavailable' });
			expect(await resend(pending.token, pending.email)).toEqual({ passwordEmail: 'unavailable' });
			expect(auth.calls).toEqual([]);
		});

		it('not_needed once the email is confirmed', async () => {
			const { email, token } = await invite();
			await anonymous().appInvitations.accept(form(token, email));
			await confirm(email);
			expect(await resend(token, email)).toEqual({ passwordEmail: 'not_needed' });
		});

		it('account deleted: unavailable; deleted during generate_link: unavailable, nothing created', async () => {
			const gone = await invite();
			await anonymous().appInvitations.accept(form(gone.token, gone.email));
			await actors.db.admin`delete from auth.users where email = ${gone.email}`;
			expect(await resend(gone.token, gone.email)).toEqual({ passwordEmail: 'unavailable' });
			const racing = await invite();
			await anonymous().appInvitations.accept(form(racing.token, racing.email));
			await ageSends(racing.email);
			const hold = auth.holdNextLink();
			const pending = resend(racing.token, racing.email);
			await hold.reached;
			await actors.db.admin`delete from auth.users where email = ${racing.email}`;
			hold.release();
			expect(await pending).toEqual({ passwordEmail: 'unavailable' });
			expect(await accounts(racing.email)).toBe(0);
			expect(auth.calls.filter((c) => c === 'POST')).toHaveLength(2);
		});
	});
});

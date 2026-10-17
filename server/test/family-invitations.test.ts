import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { mcp, refuseAll, rpcClient } from './support/requests.ts';

const hex = async (token: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');

describe.skipIf(!hasDatabase)('family invitations', () => {
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
		auth.mails.length = 0;
		auth.openTransactionsAtCreate.length = 0;
	});

	const anonymous = () => rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env);
	const email = () => `f${crypto.randomUUID().slice(0, 8)}@x.it`;
	const form = (token: string, address: string, over: Partial<{ displayName: string; locale: 'it-IT' | 'en-GB' }> = {}) =>
		({ token, email: address, displayName: 'Giulia', locale: 'it-IT' as const, ...over });
	const ageSends = (address: string) =>
		actors.db.admin`update app.password_emails set sent_at = now() - interval '61 seconds'
			where user_id = (select id from auth.users where email = ${address})`;
	/** A family with its administrator, a plain member and one link of the administrator. */
	const setup = async () => {
		const admin = await actors.user();
		const member = await actors.user();
		const familyId = await actors.db.createFamily([
			{ userId: admin.userId, role: 'family_admin' },
			{ userId: member.userId, role: 'member' },
		]);
		const { invitation, url } = await admin.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
		return { admin, member, familyId, invitation, url, token: url.split('#')[1]! };
	};
	const userByEmail = async (address: string) =>
		(await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${address}`)[0]?.id;
	const memberRole = async (familyId: string, userId: string) =>
		(await actors.db.admin<{ role: string }[]>`select role from app.family_members where family_id = ${familyId} and user_id = ${userId}`)[0]?.role;
	const joins = async (userId: string) =>
		(await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_joins where user_id = ${userId}`)[0]!.n;
	/** Signs in an account created through a link, as the web app would after accept. */
	const signIn = async (userId: string): Promise<Actor> => {
		const sessionId = crypto.randomUUID();
		await actors.db.admin`insert into auth.sessions (id, user_id) values (${sessionId}, ${userId})`;
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId });
		return { userId, sessionId, token, client: rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token) };
	};
	const removeAs = (adminId: string, familyId: string, userId: string) =>
		actors.db.admin.begin(async (tx) => {
			await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: adminId, role: 'authenticated' })}, true)`;
			await tx`select app.remove_family_member(${familyId}::uuid, ${userId}::uuid)`;
		});
	/** The first transaction of an account deletion, then Auth removing the account. */
	const deleteAccount = async (userId: string) => {
		await actors.db.admin.begin(async (tx) => {
			await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
			await tx`select app.begin_account_deletion(${userId}::uuid, '{}'::jsonb, '{}'::uuid[])`;
		});
		await actors.db.admin`delete from auth.users where id = ${userId}`;
	};

	it('list, create and revoke are forbidden to a plain member', async () => {
		const { member, familyId, invitation } = await setup();
		expect((await errorOf(member.client.familyInvitations.list({ familyId }))).code).toBe('forbidden');
		expect((await errorOf(member.client.familyInvitations.create({ familyId, id: crypto.randomUUID() }))).code).toBe('forbidden');
		expect((await errorOf(member.client.familyInvitations.revoke({ familyId, id: invitation.id }))).code).toBe('forbidden');
		expect((await errorOf(member.client.familyInvitations.listJoins({ familyId }))).code).toBe('forbidden');
	});

	it('create returns a url with the token in the fragment', async () => {
		const { url, invitation, admin } = await setup();
		expect(url).toMatch(/^https:\/\/app\.test\/invite#[A-Za-z0-9_-]{43}$/);
		expect(invitation.createdBy).toBe(admin.userId);
		expect(invitation.registrations).toBe(0);
		expect(invitation.expired).toBe(false);
	});

	it('create repeated with the same id returns a working new link', async () => {
		const { admin, familyId, invitation, token } = await setup();
		const again = await admin.client.familyInvitations.create({ familyId, id: invitation.id });
		const fresh = again.url.split('#')[1]!;
		expect(fresh).not.toBe(token);
		expect((await anonymous().familyInvitations.get({ token: fresh })).familyName).toBe('Test');
		expect((await errorOf(anonymous().familyInvitations.get({ token }))).code).toBe('invitation_unavailable');
		expect((await admin.client.familyInvitations.list({ familyId })).invitations).toHaveLength(1);
	});

	it('get shows only the family name and who invites', async () => {
		const { token } = await setup();
		const view = await anonymous().familyInvitations.get({ token });
		expect(Object.keys(view).sort()).toEqual(['accountsAvailable', 'familyName', 'invitedBy']);
		expect(view).toMatchObject({ familyName: 'Test', accountsAvailable: true });
		expect(view.invitedBy).toMatch(/^Test /);
	});

	it('accept creates the account, the membership and the current family', async () => {
		const { familyId, token } = await setup();
		const address = email();
		expect(await anonymous().familyInvitations.accept(form(token, ` ${address.toUpperCase()}`))).toEqual({ email: address, joined: true, passwordEmail: 'sent' });
		const userId = (await userByEmail(address))!;
		expect(await memberRole(familyId, userId)).toBe('member');
		const [pref] = await actors.db.admin<{ current_family_id: string }[]>`select current_family_id from app.profile_preferences where user_id = ${userId}`;
		expect(pref!.current_family_id).toBe(familyId);
		expect(auth.openTransactionsAtCreate).toEqual([0]);
	});

	it('accept repeated does not duplicate', async () => {
		const { familyId, token } = await setup();
		const address = email();
		await anonymous().familyInvitations.accept(form(token, address));
		auth.calls.length = 0;
		expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: true, passwordEmail: 'not_sent' });
		expect(auth.calls).toEqual([]);
		const userId = (await userByEmail(address))!;
		expect(await joins(userId)).toBe(1);
		const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_members where family_id = ${familyId} and user_id = ${userId}`;
		expect(n).toBe(1);
	});

	describe('the email to choose the password (spec W15)', () => {
		it('the first email names the family, escaped in the HTML, in the language of the page', async () => {
			const { familyId, token } = await setup();
			await actors.db.admin`update app.families set name = '<b>Rossi & figli</b>' where id = ${familyId}`;
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			expect(auth.calls).toEqual(['POST', 'generate_link']);
			expect(auth.mails).toHaveLength(1);
			const [mail] = auth.mails;
			expect(mail!.to).toBe(address);
			expect(mail!.html).toContain('Per entrare nella famiglia &lt;b&gt;Rossi &amp; figli&lt;/b&gt; su Cosa si mangia');
			expect(mail!.html).not.toContain('<b>Rossi');
			expect(mail!.text).toMatch(/https:\/\/app\.test\/password#token_hash=[0-9a-f]+&type=recovery/);
			const english = email();
			await anonymous().familyInvitations.accept(form(token, english, { locale: 'en-GB' }));
			expect(auth.mails[1]!.subject).toBe('Choose your password for Cosa si mangia');
		});

		it('a failing link or send answers failed and keeps the membership; the reservation is not reopened', async () => {
			const { admin, familyId, token } = await setup();
			const address = email();
			auth.failNextLink(500);
			expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: true, passwordEmail: 'failed' });
			expect(await memberRole(familyId, (await userByEmail(address))!)).toBe('member');
			// Not versioned: the list shows the registration at once.
			expect((await admin.client.familyInvitations.list({ familyId })).invitations[0]!.registrations).toBe(1);
			const other = email();
			auth.failNextMail(500);
			expect(await anonymous().familyInvitations.accept(form(token, other))).toEqual({ email: other, joined: true, passwordEmail: 'failed' });
		});

		it('joined false: the first email has no family name', async () => {
			const { admin, familyId, invitation, token } = await setup();
			const address = email();
			const held = auth.holdAfterNextCreate();
			const accepting = anonymous().familyInvitations.accept(form(token, address));
			await held.reached;
			await admin.client.familyInvitations.revoke({ familyId, id: invitation.id });
			held.release();
			expect(await accepting).toEqual({ email: address, joined: false, passwordEmail: 'sent' });
			expect(auth.mails[0]!.text).toContain('Per cominciare a usare Cosa si mangia');
			expect(auth.mails[0]!.text).not.toContain('Test');
		});

		it('an error in the email step never undoes the acceptance: failed, membership kept, only a code logged', async () => {
			const { familyId, token } = await setup();
			const address = email();
			let lines: string[] = [];
		const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
			await actors.db.admin`revoke execute on function app.family_invitation_password_email(bytea, text, boolean) from anon`;
			try {
				expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: true, passwordEmail: 'failed' });
			} finally {
				await actors.db.admin`grant execute on function app.family_invitation_password_email(bytea, text, boolean) to anon`;
				lines = logs.mock.calls.map((c) => String(c[0]));
			logs.mockRestore();
			}
			expect(await memberRole(familyId, (await userByEmail(address))!)).toBe('member');
			const line = lines.find((l) => l.includes('password_email_failed'));
			expect(line).toBeDefined();
			expect(line).toContain('42501');
			expect(line).not.toContain(address);
			expect(auth.calls).toEqual(['POST']);
		});

		it('account deleted after the closing and before the authorisation: unavailable, Auth not called again', async () => {
			const { token } = await setup();
			const address = email();
			// The last write of the closing transaction is the current family of the new member:
			// the account of this email disappears right after it, inside the same transaction.
			const trigger = `w15_delete_${crypto.randomUUID().replace(/-/g, '')}`;
			await actors.db.admin.unsafe(`
				create function app.${trigger}() returns trigger language plpgsql as $$
				begin delete from auth.users where id = new.user_id and email = '${address}'; return null; end $$;
				create trigger ${trigger} after insert or update on app.profile_preferences
				for each row when (new.current_family_id is not null) execute function app.${trigger}()`);
			try {
				expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: true, passwordEmail: 'unavailable' });
			} finally {
				await actors.db.admin.unsafe(`drop trigger ${trigger} on app.profile_preferences; drop function app.${trigger}()`);
			}
			expect(auth.calls).toEqual(['POST']);
			expect(await userByEmail(address)).toBeUndefined();
		});

		it('account deleted after the authorisation and before generate_link: unavailable, nothing created', async () => {
			const { token } = await setup();
			const address = email();
			const hold = auth.holdNextLink();
			const pending = anonymous().familyInvitations.accept(form(token, address));
			await hold.reached;
			await deleteAccount((await userByEmail(address))!);
			hold.release();
			expect(await pending).toEqual({ email: address, joined: true, passwordEmail: 'unavailable' });
			expect(await userByEmail(address)).toBeUndefined();
			expect(auth.calls).toEqual(['POST', 'generate_link']);
			expect(auth.mails).toEqual([]);
		});

		const resend = (token: string, address: string) => anonymous().familyInvitations.resendPasswordEmail({ token, email: address, locale: 'it-IT' });

		it('resend: too soon within 60 seconds, then the generic text, never the family, also after a removal', async () => {
			const { admin, familyId, token } = await setup();
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			expect(await resend(token, address)).toEqual({ passwordEmail: 'too_soon' });
			await ageSends(address);
			expect(await resend(token, ` ${address.toUpperCase()}`)).toEqual({ passwordEmail: 'sent' });
			expect(auth.mails[1]!.text).toContain(`Per cominciare a usare Cosa si mangia, scegli una password per ${address}.`);
			expect(auth.mails[1]!.text).not.toContain('famiglia');
			await removeAs(admin.userId, familyId, (await userByEmail(address))!);
			await ageSends(address);
			expect(await resend(token, address)).toEqual({ passwordEmail: 'sent' });
			expect(auth.mails[2]!.text).not.toContain('famiglia');
		});

		it('resend: two concurrent requests send one email', async () => {
			const { token } = await setup();
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			await ageSends(address);
			const answers = await Promise.all([resend(token, address), resend(token, address)]);
			expect(answers.map((a) => a.passwordEmail).sort()).toEqual(['sent', 'too_soon']);
			expect(auth.mails).toHaveLength(2);
		});

		it('resend: unavailable with another link or email, and for a deleted account, without calling Auth', async () => {
			const { token } = await setup();
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			auth.calls.length = 0;
			expect(await resend('x'.repeat(43), address)).toEqual({ passwordEmail: 'unavailable' });
			expect(await resend(token, email())).toEqual({ passwordEmail: 'unavailable' });
			await deleteAccount((await userByEmail(address))!);
			expect(await resend(token, address)).toEqual({ passwordEmail: 'unavailable' });
			expect(auth.calls).toEqual([]);
		});

		it('resend: not_needed once the email is confirmed', async () => {
			const { token } = await setup();
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			await actors.db.admin`update auth.users set email_confirmed_at = now() where email = ${address}`;
			expect(await resend(token, address)).toEqual({ passwordEmail: 'not_needed' });
		});
	});

	it('accept answers account_exists for a registered email', async () => {
		const { member, token } = await setup();
		const error = await errorOf(anonymous().familyInvitations.accept(form(token, `${member.userId}@test.local`)));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('accept refuses the eleventh new account with invitation_unavailable', async () => {
		const { token } = await setup();
		for (let i = 0; i < 10; i++) {
			await actors.db.admin`select * from app.claim_family_invitation(decode(${await hex(token)}, 'hex'), ${email()})`;
		}
		expect((await anonymous().familyInvitations.get({ token })).accountsAvailable).toBe(false);
		expect((await errorOf(anonymous().familyInvitations.accept(form(token, email())))).code).toBe('invitation_unavailable');
		expect(auth.calls).toEqual([]);
	});

	it('a registered user joins after the cap', async () => {
		const { familyId, token } = await setup();
		for (let i = 0; i < 10; i++) {
			await actors.db.admin`select * from app.claim_family_invitation(decode(${await hex(token)}, 'hex'), ${email()})`;
		}
		const outsider = await actors.user();
		const profile = await outsider.client.family.join({ token });
		expect(profile.currentFamilyId).toBe(familyId);
	});

	it('expired, revoked and post-removal links give the same invitation_unavailable', async () => {
		const expired = await setup();
		await actors.db.admin`update app.family_invitations set expires_at = now() - interval '1 second' where id = ${expired.invitation.id}`;
		const revoked = await setup();
		await revoked.admin.client.familyInvitations.revoke({ familyId: revoked.familyId, id: revoked.invitation.id });
		const removal = await setup();
		await removeAs(removal.admin.userId, removal.familyId, removal.member.userId);
		const unknown = 'x'.repeat(43);
		for (const token of [expired.token, revoked.token, unknown]) {
			expect((await errorOf(anonymous().familyInvitations.get({ token }))).code).toBe('invitation_unavailable');
			expect((await errorOf(anonymous().familyInvitations.accept(form(token, email())))).code).toBe('invitation_unavailable');
		}
		const outsider = await actors.user();
		for (const [who, token] of [[outsider, expired.token], [outsider, revoked.token], [removal.member, removal.token]] as const) {
			expect((await errorOf(who.client.familyInvitations.status({ token }))).code).toBe('invitation_unavailable');
			expect((await errorOf(who.client.family.join({ token }))).code).toBe('invitation_unavailable');
		}
	});

	it('status reports alreadyMember without changes', async () => {
		const { member, familyId, token } = await setup();
		const status = await member.client.familyInvitations.status({ token });
		expect(status).toMatchObject({ familyId, familyName: 'Test', alreadyMember: true });
		const outsider = await actors.user();
		expect((await outsider.client.familyInvitations.status({ token })).alreadyMember).toBe(false);
		expect(await memberRole(familyId, outsider.userId)).toBeUndefined();
	});

	it('join is idempotent and returns the profile with the new current family', async () => {
		const { familyId, token } = await setup();
		const outsider = await actors.user();
		const first = await outsider.client.family.join({ token });
		expect(first.currentFamilyId).toBe(familyId);
		expect(first.families.map((f) => f.id)).toContain(familyId);
		const second = await outsider.client.family.join({ token });
		expect(second.currentFamilyId).toBe(familyId);
		expect(await memberRole(familyId, outsider.userId)).toBe('member');
		expect(await joins(outsider.userId)).toBe(1);
	});

	it('a removed member repeating accept stays out and Auth is not called', async () => {
		const { admin, familyId, token } = await setup();
		const address = email();
		await anonymous().familyInvitations.accept(form(token, address));
		const userId = (await userByEmail(address))!;
		await removeAs(admin.userId, familyId, userId);
		auth.calls.length = 0;
		expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: false, passwordEmail: 'not_sent' });
		expect(auth.calls).toEqual([]);
		expect(await memberRole(familyId, userId)).toBeUndefined();
	});

	it('repeating accept after the account was deleted does not recreate the old id', async () => {
		const { familyId, token } = await setup();
		const address = email();
		await anonymous().familyInvitations.accept(form(token, address));
		const old = (await userByEmail(address))!;
		await deleteAccount(old);
		expect(await anonymous().familyInvitations.accept(form(token, address))).toMatchObject({ email: address, joined: true });
		const renewed = (await userByEmail(address))!;
		expect(renewed).not.toBe(old);
		expect(await memberRole(familyId, renewed)).toBe('member');
	});

	it('revocation between claim and complete leaves the account without a family and answers joined false', async () => {
		const { admin, familyId, invitation, token } = await setup();
		const address = email();
		const held = auth.holdAfterNextCreate();
		const accepting = anonymous().familyInvitations.accept(form(token, address));
		await held.reached;
		await admin.client.familyInvitations.revoke({ familyId, id: invitation.id });
		held.release();
		expect(await accepting).toMatchObject({ email: address, joined: false });
		const userId = (await userByEmail(address))!;
		expect(userId).toBeDefined();
		expect(await memberRole(familyId, userId)).toBeUndefined();
	});

	it('family deleted during the Auth call: the retry answers joined false', async () => {
		const { familyId, token } = await setup();
		const address = email();
		const held = auth.holdNextCreate();
		const accepting = anonymous().familyInvitations.accept(form(token, address));
		await held.reached;
		await actors.db.admin`delete from app.families where id = ${familyId}`;
		held.release();
		expect(await accepting).toEqual({ email: address, joined: false, passwordEmail: 'sent' });
		expect(await userByEmail(address)).toBeDefined();
		expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: false, passwordEmail: 'not_sent' });
	});

	it('interruption after creation, then family deleted: the retry answers joined false', async () => {
		const { familyId, token } = await setup();
		const address = email();
		// The first attempt reserved and Auth created the account; the answer was lost before complete.
		const [{ user_id }] = await actors.db.admin<{ user_id: string }[]>`
			select user_id from app.claim_family_invitation(decode(${await hex(token)}, 'hex'), ${address})`;
		await actors.db.admin`insert into auth.users (id, email, aud, role) values (${user_id}, ${address}, 'authenticated', 'authenticated')`;
		await actors.db.admin`delete from app.families where id = ${familyId}`;
		auth.calls.length = 0;
		expect(await anonymous().familyInvitations.accept(form(token, address))).toEqual({ email: address, joined: false, passwordEmail: 'not_sent' });
		expect(auth.calls).toEqual([]);
	});

	it('listJoins shows new and existing accounts with former members unnamed', async () => {
		const { admin, familyId, token } = await setup();
		expect((await admin.client.familyInvitations.listJoins({ familyId })).joins).toEqual([]);
		const address = email();
		await anonymous().familyInvitations.accept(form(token, address, { displayName: 'Nuova' }));
		const outsider = await actors.user();
		await outsider.client.family.join({ token });
		await removeAs(admin.userId, familyId, outsider.userId);
		const { joins: rows } = await admin.client.familyInvitations.listJoins({ familyId });
		expect(rows.map((j) => [j.mode, j.userName])).toEqual([['existing_account', null], ['new_account', 'Nuova']]);
		expect(rows[0]!.invitationCreatedByName).toMatch(/^Test /);
	});

	it('the list is not versioned: an expired link without pending registrations leaves it', async () => {
		const { admin, familyId, invitation } = await setup();
		expect((await admin.client.familyInvitations.list({ familyId })).invitations.map((i) => i.id)).toEqual([invitation.id]);
		await actors.db.admin`update app.family_invitations set expires_at = now() - interval '1 second' where id = ${invitation.id}`;
		expect((await admin.client.familyInvitations.list({ familyId })).invitations).toEqual([]);
	});

	it('revoke answers the list and not_found for another family', async () => {
		const one = await setup();
		const other = await setup();
		expect((await one.admin.client.familyInvitations.revoke({ familyId: one.familyId, id: one.invitation.id })).invitations).toEqual([]);
		expect((await errorOf(one.admin.client.familyInvitations.revoke({ familyId: one.familyId, id: other.invitation.id }))).code).toBe('not_found');
	});

	describe('acceptance with requests in flight', () => {
		it('created, then the person joins and is removed before complete: no way back in, one join row', async () => {
			const { admin, familyId, token } = await setup();
			const address = email();
			const held = auth.holdAfterNextCreate();
			const accepting = anonymous().familyInvitations.accept(form(token, address));
			await held.reached;
			const userId = (await userByEmail(address))!;
			const person = await signIn(userId);
			await person.client.family.join({ token });
			await removeAs(admin.userId, familyId, userId);
			held.release();
			expect(await accepting).toMatchObject({ email: address, joined: false });
			expect(await memberRole(familyId, userId)).toBeUndefined();
			expect(await joins(userId)).toBe(1);
		});

		it('an id deleted while a second accept was in flight is not created again (beforeCreate)', async () => {
			const { token } = await setup();
			const address = email();
			await anonymous().familyInvitations.accept(form(token, address));
			const old = (await userByEmail(address))!;
			await deleteAccount(old);
			// What the second request knew when it claimed: the reservation of the old id, still with the email.
			await actors.db.admin`update app.family_invitation_reservations set email = ${address}, status = 'reserved', finished_at = null where user_id = ${old}`;
			auth.calls.length = 0;
			expect((await errorOf(anonymous().familyInvitations.accept(form(token, address)))).code).toBe('invitation_unavailable');
			expect(auth.calls).toEqual([]);
			expect(await userByEmail(address)).toBeUndefined();
		});

		it('an id deleted after beforeCreate: the trigger on profiles stops Auth from creating it', async () => {
			const { token } = await setup();
			const address = email();
			const held = auth.holdNextCreate();
			const second = anonymous().familyInvitations.accept(form(token, address)).catch((error) => error);
			await held.reached;
			// The first request, with the same reserved id, completes; then the account is deleted.
			expect(await anonymous().familyInvitations.accept(form(token, address))).toMatchObject({ email: address, joined: true });
			const old = (await userByEmail(address))!;
			await deleteAccount(old);
			held.release();
			expect((await second).code).toBe('internal');
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users where id = ${old}`;
			expect(n).toBe(0);
		});
	});

	it('public operations answer rate_limited with refuseAll', async () => {
		const { token } = await setup();
		const env = { ...actors.env, INVITE_READ_LIMIT: refuseAll, INVITE_ACCEPT_LIMIT: refuseAll };
		const client = rpcClient<ContractRouterClient<Contract>>(actors.app, env);
		expect((await errorOf(client.familyInvitations.get({ token }))).code).toBe('rate_limited');
		expect((await errorOf(client.familyInvitations.accept(form(token, email())))).code).toBe('rate_limited');
		expect((await errorOf(client.familyInvitations.resendPasswordEmail({ token, email: email(), locale: 'it-IT' }))).code).toBe('rate_limited');
	});

	it('MCP lists familyInvitations list/create/revoke/listJoins/status and family_join, not get or accept', async () => {
		const agent = await actors.user({ agent: true });
		const tools: string[] = (await mcp(actors.app, actors.env, agent.token, 'tools/list')).body.result.tools.map((t: { name: string }) => t.name);
		for (const name of ['familyInvitations_list', 'familyInvitations_create', 'familyInvitations_revoke', 'familyInvitations_listJoins', 'familyInvitations_status', 'family_join']) {
			expect(tools).toContain(name);
		}
		expect(tools).not.toContain('familyInvitations_get');
		expect(tools).not.toContain('familyInvitations_accept');
		expect(tools).not.toContain('familyInvitations_resendPasswordEmail');
		expect(tools).not.toContain('appInvitations_resendPasswordEmail');
	});
});

import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { choosePassword, emailIdsTo, latestEmailTo, markEmails, MAILPIT_API_URL } from '../support/mailpit.ts';
import { allowAll, rpcClient, testEnv } from '../support/requests.ts';

/**
 * The eight cases of spec W15, section 8, «Stack locale»: Supabase Auth with Mailpit and
 * `enable_confirmations = true`, the server's emails through Mailpit too. Cases 5 and 8 also
 * need the second Auth services of scripts/test-support/auth-require-current.sh (started by
 * scripts/invitations/invite-stack.sh): without their URLs they fail, they are not skipped.
 */
const NAMES = ['STACK_SUPABASE_URL', 'STACK_SUPABASE_PUBLISHABLE_KEY', 'STACK_SUPABASE_SECRET_KEY', 'STACK_DB_URL'] as const;
const present = NAMES.every((name) => process.env[name]);

type Client = ContractRouterClient<Contract>;

describe.skipIf(!present)('emails against the local stack', () => {
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
		workerEnv = {
			...testEnv(appServer.toString()),
			SUPABASE_URL: url,
			SUPABASE_PUBLISHABLE_KEY: publishable,
			SUPABASE_SECRET_KEY: secret,
			MAILPIT_API_URL,
			INVITE_READ_LIMIT: allowAll,
			INVITE_ACCEPT_LIMIT: allowAll,
		};
		app = createApp({ contract, router, resourceName: 'stack' });
	});
	afterAll(async () => {
		if (!admin) return;
		if (emails.length) await admin`delete from auth.users where email = any(${emails})`;
		await admin.end();
	});

	const auth = () => `${url}/auth/v1`;
	const client = (token?: string) => rpcClient<Client>(app, workerEnv, token);
	const fresh = (prefix: string) => {
		const email = `w15-${prefix}-${crypto.randomUUID().slice(0, 8)}@example.test`;
		emails.push(email);
		return email;
	};
	const signIn = async (email: string, password: string, base = auth()) => {
		const response = await fetch(`${base}/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
		});
		return response.ok ? ((await response.json()) as { access_token: string }).access_token : null;
	};
	const recover = async (email: string, base = auth()) => {
		const response = await fetch(`${base}/recover`, { method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
		const body = (await response.json().catch(() => ({}))) as { error_code?: string; msg?: string };
		return { status: response.status, code: body.error_code, message: body.msg };
	};
	/** A confirmed person with a password, created with the Auth admin API. */
	const person = async (prefix: string, metadata: Record<string, unknown> = { display_name: prefix }, password = 'stack-pass-1') => {
		const email = fresh(prefix);
		const response = await fetch(`${auth()}/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
		});
		if (!response.ok) throw new Error(`admin create: ${response.status}`);
		const { id } = (await response.json()) as { id: string };
		return { id, email, password, token: (await signIn(email, password))! };
	};
	const authUser = async (email: string) =>
		(await admin!<{ id: string; confirmed: boolean; metadata: Record<string, unknown> }[]>`
			select id::text, email_confirmed_at is not null as confirmed, raw_user_meta_data as metadata from auth.users where email = ${email}`)[0];
	/** The spacing of Supabase's /recover (max_frequency, 60 s) counts from the last link, generate_link's too. */
	const ageRecovery = (email: string) => admin!`update auth.users set recovery_sent_at = now() - interval '2 minutes' where email = ${email}`;
	/** The server's spacing of its own emails (60 s), moved back as the pgTAP tests do. */
	const agePasswordEmail = (userId: string) => admin!`update app.password_emails set sent_at = now() - interval '2 minutes' where user_id = ${userId}`;
	const appAdmin = async () => {
		const federico = await person('federico', { display_name: 'Federico' });
		await admin!`insert into app.user_roles (user_id, role) values (${federico.id}, 'app_admin')`;
		return client(federico.token);
	};
	const appInvitation = async (email: string, roles: ('recipe_curator' | 'app_admin')[] = []) =>
		(await (await appAdmin()).appInvitations.create({ id: crypto.randomUUID(), email, roles })).url.split('#')[1]!;
	const familyLink = async (name: string) => {
		const federico = await person('federico', { display_name: 'Federico' });
		const familyId = crypto.randomUUID();
		await client(federico.token).family.create({ id: familyId, name, measurementSystem: 'metric' });
		const { url: link } = await client(federico.token).familyInvitations.create({ familyId, id: crypto.randomUUID() });
		return { federico: client(federico.token), familyId, token: link.split('#')[1]! };
	};
	const members = async (federico: Client, familyId: string) => {
		const read = await federico.family.get({ familyId });
		if (read.unchanged) throw new Error('unexpected unchanged');
		return read.data.members;
	};

	it('1. family invitation: the server email in Mailpit, escaped name, page language, link, password, confirmation', async () => {
		const name = '<b>Rossi & figli</b>';
		const { federico, familyId, token } = await familyLink(name);
		const email = fresh('family');
		const before = await markEmails(email);
		expect(await client().familyInvitations.accept({ token, email, displayName: 'Giulia', locale: 'en-GB' })).toEqual({ email, joined: true, passwordEmail: 'sent' });
		const mail = await latestEmailTo(email, { after: before });
		expect(mail.subject).toBe('Choose your password for Cosa si mangia');
		expect(mail.html).toContain('&lt;b&gt;Rossi &amp; figli&lt;/b&gt;');
		expect(mail.html).not.toContain(name);
		expect(mail.text).toContain(`To join the ${name} family`);
		expect(mail.link).toMatch(/^https:\/\/app\.test\/password#token_hash=[^&]+&type=recovery$/);
		const { id } = (await authUser(email))!;
		expect((await members(federico, familyId)).find((m) => m.userId === id)!.emailUnconfirmed).toBe(true);
		expect(await choosePassword(auth(), publishable, mail.link!, 'giulia-pass-1')).toEqual({ verified: 200, saved: 200 });
		expect(await signIn(email, 'giulia-pass-1')).not.toBeNull();
		expect((await members(federico, familyId)).find((m) => m.userId === id)!.emailUnconfirmed).toBe(false);
	});

	it('2. app invitation: same path, roles assigned, text without a family', async () => {
		const email = fresh('app');
		const token = await appInvitation(email, ['recipe_curator']);
		const before = await markEmails(email);
		expect(await client().appInvitations.accept({ token, email, displayName: 'Marta', locale: 'it-IT' })).toEqual({ email, passwordEmail: 'sent' });
		const mail = await latestEmailTo(email, { after: before });
		expect(mail.subject).toBe('Scegli la password per Cosa si mangia');
		expect(mail.text).toContain(`Per cominciare a usare Cosa si mangia, scegli una password per ${email}.`);
		expect(mail.text).not.toContain('famiglia');
		// Only the server's email: neither the admin creation nor generate_link sends anything.
		expect(await emailIdsTo(email, before)).toEqual([mail.id]);
		expect(await choosePassword(auth(), publishable, mail.link!, 'marta-pass-1')).toEqual({ verified: 200, saved: 200 });
		const access = await signIn(email, 'marta-pass-1');
		expect((await client(access!).profile.get({})).user).toMatchObject({ displayName: 'Marta', locale: 'it-IT', globalRoles: ['recipe_curator'] });
	});

	it('3. verified without saving: confirmed, no known password; «Password dimenticata» saves it', async () => {
		const email = fresh('verified');
		const token = await appInvitation(email);
		const before = await markEmails(email);
		await client().appInvitations.accept({ token, email, displayName: 'Vera', locale: 'it-IT' });
		const mail = await latestEmailTo(email, { after: before });
		const verify = await fetch(`${auth()}/verify`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'recovery', token_hash: new URLSearchParams(new URL(mail.link!).hash.slice(1)).get('token_hash') }),
		});
		expect(verify.status).toBe(200);
		expect((await authUser(email))!.confirmed).toBe(true);
		expect(await signIn(email, 'any-password-1')).toBeNull();
		// generate_link set recovery_sent_at: Supabase's own spacing applies to /recover for 60 seconds.
		expect(await recover(email)).toMatchObject({ status: 429, code: 'over_email_send_rate_limit' });
		await ageRecovery(email);
		const asked = await markEmails(email);
		expect((await recover(email)).status).toBe(200);
		const recovery = await latestEmailTo(email, { after: asked });
		expect(recovery.subject).toBe('Scegli una nuova password per Cosa si mangia');
		expect(recovery.html).toContain('È stata chiesta una nuova password');
		expect(recovery.link).toMatch(/\/password#token_hash=[^&]+&type=recovery$/);
		expect(await choosePassword(auth(), publishable, recovery.link!, 'vera-pass-1')).toEqual({ verified: 200, saved: 200 });
		expect(await signIn(email, 'vera-pass-1')).not.toBeNull();

		// /recover does not look at the confirmation: an account never confirmed gets the email too.
		const unconfirmed = fresh('unconfirmed');
		const created = await fetch(`${auth()}/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' }, body: JSON.stringify({ email: unconfirmed, email_confirm: false }),
		});
		expect(created.status).toBe(200);
		const sent = await markEmails(unconfirmed);
		expect((await recover(unconfirmed)).status).toBe(200);
		expect((await latestEmailTo(unconfirmed, { after: sent })).subject).toBe('Scegli una nuova password per Cosa si mangia');
	});

	it('4. resend from the invitation page: generic text, even after removal; too_soon; the first link no longer works', async () => {
		const { federico, familyId, token } = await familyLink('Casa Bianchi');
		const email = fresh('resend');
		const first = await markEmails(email);
		await client().familyInvitations.accept({ token, email, displayName: 'Rino', locale: 'it-IT' });
		const firstMail = await latestEmailTo(email, { after: first });
		expect(firstMail.text).toContain('famiglia Casa Bianchi');
		const { id } = (await authUser(email))!;
		await federico.family.removeMember({ familyId, userId: id });
		expect(await client().familyInvitations.resendPasswordEmail({ token, email, locale: 'it-IT' })).toEqual({ passwordEmail: 'too_soon' });
		await agePasswordEmail(id);
		const second = await markEmails(email);
		expect(await client().familyInvitations.resendPasswordEmail({ token, email, locale: 'it-IT' })).toEqual({ passwordEmail: 'sent' });
		const secondMail = await latestEmailTo(email, { after: second });
		expect(secondMail.id).not.toBe(firstMail.id);
		expect(secondMail.text).toContain('Per cominciare a usare Cosa si mangia');
		expect(secondMail.text).not.toContain('Casa Bianchi');
		expect(await client().familyInvitations.resendPasswordEmail({ token, email, locale: 'it-IT' })).toEqual({ passwordEmail: 'too_soon' });
		// Auth replaced the token: the first link is refused, the second one works.
		const old = await choosePassword(auth(), publishable, firstMail.link!, 'rino-pass-1');
		expect(old.verified).toBeGreaterThanOrEqual(400);
		expect(old.verified).toBeLessThan(500);
		expect(await choosePassword(auth(), publishable, secondMail.link!, 'rino-pass-1')).toEqual({ verified: 200, saved: 200 });
	});

	it('5. «Require current password» on: /password saves for an invitee and for a recovery; the Profile change needs it', async () => {
		const strict = process.env.STACK_AUTH_REQUIRE_CURRENT_URL;
		if (!strict) throw new Error('missing STACK_AUTH_REQUIRE_CURRENT_URL (scripts/test-support/auth-require-current.sh start)');
		expect((await fetch(`${strict}/health`)).ok).toBe(true);

		// An invitee: the link of the server's email, verified and saved on the strict service.
		const email = fresh('strict');
		const token = await appInvitation(email);
		const before = await markEmails(email);
		await client().appInvitations.accept({ token, email, displayName: 'Sara', locale: 'it-IT' });
		const mail = await latestEmailTo(email, { after: before });
		expect(await choosePassword(strict, null, mail.link!, 'sara-pass-1')).toEqual({ verified: 200, saved: 200 });
		expect(await signIn(email, 'sara-pass-1')).not.toBeNull();

		// A recovery of someone with a password.
		const known = await person('strict-recovery');
		const asked = await markEmails(known.email);
		expect((await recover(known.email)).status).toBe(200);
		const recovery = await latestEmailTo(known.email, { after: asked });
		expect(await choosePassword(strict, null, recovery.link!, 'renewed-pass-2')).toEqual({ verified: 200, saved: 200 });
		const access = await signIn(known.email, 'renewed-pass-2');
		expect(access).not.toBeNull();

		// The Profile change of a signed-in person: refused without the current password (the option is on).
		const put = (body: object) =>
			fetch(`${strict}/user`, { method: 'PUT', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
		const refused = await put({ password: 'profile-pass-3' });
		expect(refused.status).toBe(400);
		expect(((await refused.json()) as { error_code: string }).error_code).toBe('current_password_required');
		expect((await put({ password: 'profile-pass-3', current_password: 'renewed-pass-2' })).status).toBe(200);
		expect(await signIn(known.email, 'profile-pass-3')).not.toBeNull();
	});

	it('6. race with the deletion: the account deleted before generate_link, no new user, no email', async () => {
		const federico = await appAdmin();
		const email = fresh('race');
		const token = (await federico.appInvitations.create({ id: crypto.randomUUID(), email, roles: [] })).url.split('#')[1]!;
		const real = globalThis.fetch;
		let deleted: { completed: boolean } | null = null;
		let generateLinkStatus: number | null = null;
		const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
			// The acceptance is held after its closing and the SQL authorisation: the account is deleted for good meanwhile.
			if (!deleted && target === `${url}/auth/v1/admin/generate_link`) {
				const { id } = (await authUser(email))!;
				deleted = await federico.users.delete({ id, successors: {}, deletedFamilies: [] });
				const answer = await real(input, init);
				generateLinkStatus = answer.status;
				return answer;
			}
			return real(input, init);
		});
		const before = await markEmails(email);
		try {
			expect(await client().appInvitations.accept({ token, email, displayName: 'Corsa', locale: 'it-IT' })).toEqual({ email, passwordEmail: 'unavailable' });
		} finally {
			spy.mockRestore();
		}
		expect(deleted).toEqual({ completed: true });
		expect(generateLinkStatus).toBe(404);
		expect(await authUser(email)).toBeUndefined();
		await new Promise((resolve) => setTimeout(resolve, 1000));
		expect(await emailIdsTo(email, before)).toEqual([]);
	});

	it('7. language: after profile.update to en-GB «Password dimenticata» comes in English and the name stays; without locale in Italian', async () => {
		const english = await person('english', { display_name: 'Emma' });
		await client(english.token).profile.update({ locale: 'en-GB' });
		const metadata = (await authUser(english.email))!.metadata;
		expect(metadata).toMatchObject({ display_name: 'Emma', locale: 'en-GB' });
		const asked = await markEmails(english.email);
		expect((await recover(english.email)).status).toBe(200);
		const mail = await latestEmailTo(english.email, { after: asked });
		expect(mail.subject).toBe('Choose a new password for Cosa si mangia');
		expect(mail.html).toContain('Someone asked for a new password');

		const italian = await person('italian', { display_name: 'Ivo' });
		const again = await markEmails(italian.email);
		expect((await recover(italian.email)).status).toBe(200);
		expect((await latestEmailTo(italian.email, { after: again })).subject).toBe('Scegli una nuova password per Cosa si mangia');
	});

	it("8. Supabase's limits: per address within 60 seconds; none without an account; the project's hourly limit", async () => {
		const limited = process.env.STACK_AUTH_EMAIL_LIMIT_URL;
		if (!limited) throw new Error('missing STACK_AUTH_EMAIL_LIMIT_URL (scripts/test-support/auth-require-current.sh start --email-limit 2)');

		const known = await person('limit');
		expect((await recover(known.email)).status).toBe(200);
		const again = await recover(known.email);
		expect(again).toMatchObject({ status: 429, code: 'over_email_send_rate_limit' });
		expect(again.message).toMatch(/^For security purposes, you can only request this after \d+ seconds?\.$/);
		const nobody = `w15-nobody-${crypto.randomUUID().slice(0, 8)}@example.test`;
		const quiet = await markEmails(nobody);
		expect((await recover(nobody)).status).toBe(200);
		expect((await recover(nobody)).status).toBe(200);

		// The dedicated service with GOTRUE_RATE_LIMIT_EMAIL_SENT=2: the third send of the hour is refused for the project.
		const people = [await person('hour-a'), await person('hour-b'), await person('hour-c')];
		const results = [];
		for (const one of people) results.push(await recover(one.email, limited));
		expect(results.map((r) => r.status)).toEqual([200, 200, 429]);
		expect(results[2]).toMatchObject({ code: 'over_email_send_rate_limit' });
		expect(results[2]!.message).toBe('email rate limit exceeded');
		// Without an account nothing is sent, nor refused, even with the hourly limit used up.
		expect((await recover(nobody, limited)).status).toBe(200);
		expect(await emailIdsTo(nobody, quiet)).toEqual([]);
	});
});

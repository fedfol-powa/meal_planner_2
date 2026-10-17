import { contract, type Contract } from '@app/contract';
import { ORPCError } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { createHash, randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { choosePassword, latestEmailTo, MAILPIT_API_URL } from '../support/mailpit.ts';
import { allowAll, mcp, rpcClient, testEnv } from '../support/requests.ts';

const NAMES = ['STACK_SUPABASE_URL', 'STACK_SUPABASE_PUBLISHABLE_KEY', 'STACK_SUPABASE_SECRET_KEY', 'STACK_DB_URL'] as const;
const present = NAMES.every((name) => process.env[name]);
const REDIRECT = 'http://127.0.0.1:9/callback';

async function codeOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error.code;
		throw error;
	}
	return 'ok';
}

describe.skipIf(!present)('family management against the local stack', () => {
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
		workerEnv = { ...testEnv(appServer.toString()), SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret, MAILPIT_API_URL, INVITE_READ_LIMIT: allowAll, INVITE_ACCEPT_LIMIT: allowAll };
		app = createApp({ contract, router, resourceName: 'stack' });
	});
	afterAll(async () => {
		if (!admin) return;
		if (emails.length) await admin`delete from auth.users where email = any(${emails})`;
		await admin.end();
	});

	const client = (token?: string) => rpcClient<ContractRouterClient<Contract>>(app, workerEnv, token);
	const signIn = async (email: string, password: string) => {
		const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
		});
		if (!response.ok) throw new Error(`sign-in: ${response.status}`);
		return (await response.json()) as { access_token: string; refresh_token: string; user: { id: string } };
	};
	/** A confirmed person created with the Auth admin API, signed in with the password. */
	async function person(prefix: string) {
		const email = `w15-${prefix}-${crypto.randomUUID().slice(0, 8)}@example.test`;
		emails.push(email);
		const created = await fetch(`${url}/auth/v1/admin/users`, {
			method: 'POST', headers: { apikey: secret, 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: 'stack-password', email_confirm: true, user_metadata: { display_name: prefix } }),
		});
		if (!created.ok) throw new Error(`admin create: ${created.status}`);
		const session = await signIn(email, 'stack-password');
		return { id: session.user.id, email, token: session.access_token, refresh: session.refresh_token };
	}
	/** An agent connected with the OAuth flow of the stack (registration, consent, code exchange). */
	async function connectAgent(webToken: string) {
		const registered = await fetch(`${url}/auth/v1/oauth/clients/register`, {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ client_name: 'Stack agent', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
		});
		const { client_id: clientId } = (await registered.json()) as { client_id: string };
		const verifier = randomBytes(32).toString('base64url');
		const challenge = createHash('sha256').update(verifier).digest('base64url');
		const query = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'openid email profile', state: 's' });
		const start = await fetch(`${url}/auth/v1/oauth/authorize?${query}`, { redirect: 'manual' });
		const id = new URL(start.headers.get('location')!).searchParams.get('authorization_id')!;
		const asWeb = { apikey: publishable, authorization: `Bearer ${webToken}`, 'content-type': 'application/json' };
		// What the /authorize page does: read the request, then approve it.
		const details = (await (await fetch(`${url}/auth/v1/oauth/authorizations/${id}`, { headers: asWeb })).json()) as { redirect_url?: string };
		let redirectUrl = details.redirect_url;
		if (!redirectUrl) {
			const decided = await fetch(`${url}/auth/v1/oauth/authorizations/${id}/consent`, { method: 'POST', headers: asWeb, body: JSON.stringify({ action: 'approve' }) });
			redirectUrl = ((await decided.json()) as { redirect_url: string }).redirect_url;
		}
		const code = new URL(redirectUrl).searchParams.get('code')!;
		const exchanged = await fetch(`${url}/auth/v1/oauth/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT }),
		});
		if (!exchanged.ok) throw new Error(`agent token: ${exchanged.status}`);
		return ((await exchanged.json()) as { access_token: string }).access_token;
	}

	it('a link, a real account, the menu; roles and removal at once; join; deletion of the account and its agent', async () => {
		const federico = await person('federico');
		const familyId = crypto.randomUUID();
		await client(federico.token).family.create({ id: familyId, name: 'Stack', measurementSystem: 'metric' });
		const { url: link } = await client(federico.token).familyInvitations.create({ familyId, id: crypto.randomUUID() });
		const token = link.split('#')[1]!;

		// A new person: the link creates the account in Auth and the membership; the password comes from the email.
		expect((await client().familyInvitations.get({ token })).familyName).toBe('Stack');
		const email = `w15-giulia-${crypto.randomUUID().slice(0, 8)}@example.test`;
		emails.push(email);
		const before = new Date();
		expect(await client().familyInvitations.accept({ token, email, displayName: 'Giulia', locale: 'it-IT' })).toEqual({ email, joined: true, passwordEmail: 'sent' });
		const mail = await latestEmailTo(email, { after: before });
		expect(await choosePassword(`${url}/auth/v1`, publishable, mail.link!, 'stack-password')).toEqual({ verified: 200, saved: 200 });
		const giulia = await signIn(email, 'stack-password');
		const profile = await client(giulia.access_token).profile.get({});
		expect(profile.currentFamilyId).toBe(familyId);
		expect(await codeOf(client(giulia.access_token).menu.getOpening({ familyId }))).toBe('ok');

		// Promotion and demotion, then removal: effective for the token already issued.
		await client(federico.token).family.setMemberRole({ familyId, userId: giulia.user.id, role: 'family_admin' });
		expect(await codeOf(client(giulia.access_token).familyInvitations.list({ familyId }))).toBe('ok');
		await client(federico.token).family.setMemberRole({ familyId, userId: giulia.user.id, role: 'member' });
		expect(await codeOf(client(giulia.access_token).familyInvitations.list({ familyId }))).toBe('forbidden');
		await client(federico.token).family.removeMember({ familyId, userId: giulia.user.id });
		expect(await codeOf(client(giulia.access_token).family.get({ familyId }))).toBe('forbidden');

		// Someone with an account joins with the same link, and connects an agent.
		const tom = await person('tom');
		expect((await client(tom.token).family.join({ token })).currentFamilyId).toBe(familyId);
		const agentToken = await connectAgent(tom.token);
		expect((await mcp(app, workerEnv, agentToken, 'tools/list')).status).toBe(200);
		expect((await client(tom.token).account.getDeletionPlan({})).connectedAgents).toBe(1);

		// Tom deletes the account: Auth removes sessions, identities and consents; every token is refused.
		expect(await client(tom.token).account.delete({ successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
		const [left] = await admin!<{ users: number; sessions: number; identities: number; consents: number }[]>`
			select (select count(*)::int from auth.users where id = ${tom.id}) as users,
				(select count(*)::int from auth.sessions where user_id = ${tom.id}) as sessions,
				(select count(*)::int from auth.identities where user_id = ${tom.id}) as identities,
				(select count(*)::int from auth.oauth_consents where user_id = ${tom.id}) as consents`;
		expect(left).toEqual({ users: 0, sessions: 0, identities: 0, consents: 0 });
		expect(await codeOf(client(tom.token).profile.get({}))).toBe('unauthorized');
		expect((await mcp(app, workerEnv, agentToken, 'tools/list')).status).toBe(401);
		const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
			method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: tom.refresh }),
		});
		expect(refreshed.ok).toBe(false);
		const [row] = await admin!<{ completed: boolean }[]>`select completed_at is not null as completed from app.account_deletions where user_id = ${tom.id}`;
		expect(row!.completed).toBe(true);
		// The family goes on with Federico.
		expect(await codeOf(client(federico.token).family.get({ familyId }))).toBe('ok');
	});
});

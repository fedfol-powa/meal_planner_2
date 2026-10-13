import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('app invitations: administration', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const admin = async () => {
		const person = await actors.user();
		await actors.db.grantGlobalRole(person.userId, 'app_admin');
		return person;
	};
	const email = () => `p${crypto.randomUUID().slice(0, 8)}@x.it`;

	it('creates an invitation and returns the link once, with the token in the fragment', async () => {
		const federico = await admin();
		const to = email();
		const { invitation, url } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: ` ${to.toUpperCase()}`, roles: ['recipe_curator'] });
		expect(invitation).toMatchObject({ email: to, roles: ['recipe_curator'], status: 'pending' });
		expect(url).toMatch(/^https:\/\/app\.test\/invite\/app#[A-Za-z0-9_-]{43}$/);
		const [row] = await actors.db.admin<{ token_hash: Buffer }[]>`select token_hash from app.app_invitations where id = ${invitation.id}`;
		const token = url.split('#')[1]!;
		expect(Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).toEqual(row!.token_hash);
	});

	it('carries no role, one role and two roles through the real withDb', async () => {
		const federico = await admin();
		for (const roles of [[], ['app_admin'], ['recipe_curator', 'app_admin']] as const) {
			const { invitation } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [...roles] });
			expect(invitation.roles).toEqual(roles);
			expect((await federico.client.appInvitations.list({})).invitations.find((i) => i.id === invitation.id)?.roles).toEqual(roles);
		}
	});

	it('repeating the same id gives a new link and no duplicate', async () => {
		const federico = await admin();
		const input = { id: crypto.randomUUID(), email: email(), roles: [] as [] };
		const first = await federico.client.appInvitations.create(input);
		const second = await federico.client.appInvitations.create(input);
		expect(second.url).not.toBe(first.url);
		expect((await federico.client.appInvitations.list({})).invitations.filter((i) => i.id === input.id)).toHaveLength(1);
	});

	it('concurrent creations: same id gives one row, same email gives one pending invitation, no error', async () => {
		const federico = await admin();
		const same = { id: crypto.randomUUID(), email: email(), roles: [] as [] };
		await Promise.all([federico.client.appInvitations.create(same), federico.client.appInvitations.create(same)]);
		const to = email();
		const results = await Promise.all([1, 2, 3].map(() => federico.client.appInvitations.create({ id: crypto.randomUUID(), email: to, roles: [] })));
		const rows = await actors.db.admin<{ status: string }[]>`select status from app.app_invitations where email = ${to}`;
		expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
		expect(rows).toHaveLength(results.length);
		expect((await actors.db.admin`select count(*)::int as n from app.app_invitations where id = ${same.id}`)[0]!.n).toBe(1);
	});

	it('refuses an email that has an account', async () => {
		const federico = await admin();
		const other = await actors.user();
		const error = await errorOf(federico.client.appInvitations.create({ id: crypto.randomUUID(), email: `${other.userId}@test.local`, roles: [] }));
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('lists with computed expiry and revokes pending and expired invitations', async () => {
		const federico = await admin();
		const { invitation } = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] });
		await actors.db.admin`update app.app_invitations set expires_at = now() - interval '1 second' where id = ${invitation.id}`;
		expect((await federico.client.appInvitations.list({})).invitations.find((i) => i.id === invitation.id)?.status).toBe('expired');
		expect((await federico.client.appInvitations.revoke({ id: invitation.id })).invitation.status).toBe('revoked');
		const pending = await federico.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] });
		expect((await federico.client.appInvitations.revoke({ id: pending.invitation.id })).invitation.status).toBe('revoked');
		expect((await federico.client.appInvitations.revoke({ id: pending.invitation.id })).invitation.status).toBe('revoked');
		expect((await errorOf(federico.client.appInvitations.revoke({ id: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('is forbidden to non app admins', async () => {
		const anna = await actors.user();
		expect((await errorOf(anna.client.appInvitations.list({}))).code).toBe('forbidden');
		expect((await errorOf(anna.client.appInvitations.create({ id: crypto.randomUUID(), email: email(), roles: [] }))).code).toBe('forbidden');
	});

	it('exposes create, list and revoke as MCP tools, never get and accept', async () => {
		const agent = await actors.user({ agent: true });
		await actors.db.grantGlobalRole(agent.userId, 'app_admin');
		const tools = (await mcp(actors.app, actors.env, agent.token, 'tools/list')).body.result.tools.map((t: { name: string }) => t.name);
		expect(tools).toEqual(expect.arrayContaining(['appInvitations_create', 'appInvitations_list', 'appInvitations_revoke']));
		expect(tools).not.toContain('appInvitations_get');
		expect(tools).not.toContain('appInvitations_accept');
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'appInvitations_create', arguments: { id: crypto.randomUUID(), email: email(), roles: [] } });
		expect(toolBody(result).url).toMatch(/^https:\/\/app\.test\/invite\/app#/);
	});
});

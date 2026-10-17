import { USERS_LIST_LIMIT } from '@app/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { collectTools } from '../src/mcp.ts';
import { contract } from '@app/contract';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe('users tools', () => {
	it('exposes list and get as read-only tools and setRole as a write', () => {
		const tools = new Map(collectTools(contract).map((tool) => [tool.name, tool.readOnly]));
		expect(tools.get('users_list')).toBe(true);
		expect(tools.get('users_get')).toBe(true);
		expect(tools.get('users_setRole')).toBe(false);
	});
});

describe.skipIf(!hasDatabase)('users administration', () => {
	let actors: Actors;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
	});
	afterAll(() => actors?.close());

	const admin = async (options: { agent?: boolean } = {}) => {
		const person = await actors.user(options);
		await actors.db.grantGlobalRole(person.userId, 'app_admin');
		return person;
	};
	const emailOf = (userId: string) => `${userId}@test.local`;
	const call = (token: string, name: string, args: unknown) => mcp(actors.app, actors.env, token, 'tools/call', { name, arguments: args });

	it('is forbidden to non app admins, on every operation and over MCP', async () => {
		const anna = await actors.user();
		const id = anna.userId;
		expect((await errorOf(anna.client.users.list({}))).code).toBe('forbidden');
		expect((await errorOf(anna.client.users.get({ id }))).code).toBe('forbidden');
		expect((await errorOf(anna.client.users.setRole({ id, role: 'recipe_curator', granted: true }))).code).toBe('forbidden');
		const agent = await actors.user({ agent: true });
		const result = await call(agent.token, 'users_list', {});
		expect(result.body.result.isError).toBe(true);
	});

	it('finds people by email and by name, including an account with no roles and no family', async () => {
		const federico = await admin();
		const orphan = await actors.user();
		const byEmail = await federico.client.users.list({ query: emailOf(orphan.userId).toUpperCase() });
		expect(byEmail.users).toEqual([{ id: orphan.userId, displayName: expect.any(String), email: emailOf(orphan.userId), roles: [], deletion: null, emailUnconfirmed: false }]);
		expect(byEmail.more).toBe(false);
		const [{ display_name }] = await actors.db.admin<{ display_name: string }[]>`select display_name from app.profiles where user_id = ${orphan.userId}`;
		expect((await federico.client.users.list({ query: display_name })).users.map((u) => u.id)).toContain(orphan.userId);
	});

	it('marks an account whose email is not confirmed, in the list, the detail and over MCP (spec W15)', async () => {
		const federico = await admin({ agent: true });
		const invited = await actors.user();
		await actors.db.admin`update auth.users set email_confirmed_at = null where id = ${invited.userId}`;
		const query = emailOf(invited.userId);
		expect((await federico.client.users.list({ query })).users[0]!.emailUnconfirmed).toBe(true);
		expect((await federico.client.users.get({ id: invited.userId })).user.emailUnconfirmed).toBe(true);
		const listed = await call(federico.token, 'users_list', { query });
		expect(toolBody(listed).users[0].emailUnconfirmed).toBe(true);
		await actors.db.admin`update auth.users set email_confirmed_at = now() where id = ${invited.userId}`;
		expect((await federico.client.users.get({ id: invited.userId })).user.emailUnconfirmed).toBe(false);
	});

	it('treats % and _ in the query as text', async () => {
		const federico = await admin();
		expect((await federico.client.users.list({ query: '%' })).users).toEqual([]);
		expect((await federico.client.users.list({ query: '_' })).users).toEqual([]);
	});

	it('answers at most the limit and says there are more', async () => {
		const federico = await admin();
		const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users`;
		for (let i = n; i <= USERS_LIST_LIMIT; i++) await actors.user();
		const page = await federico.client.users.list({});
		expect(page.users).toHaveLength(USERS_LIST_LIMIT);
		expect(page.more).toBe(true);
	});

	it('reads one user with families by name and role only', async () => {
		const federico = await admin();
		const anna = await actors.user();
		await actors.db.createFamily([{ userId: anna.userId, role: 'family_admin' }]);
		const detail = await federico.client.users.get({ id: anna.userId });
		expect(detail).toEqual({
			user: { id: anna.userId, displayName: expect.any(String), email: emailOf(anna.userId), roles: [], deletion: null, emailUnconfirmed: false, lastAppAdmin: false },
			families: [{ name: 'Test', role: 'family_admin' }],
		});
		expect(Object.keys(detail.families[0]!)).toEqual(['name', 'role']);
		expect((await errorOf(federico.client.users.get({ id: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('gives and removes roles, idempotently, answering the new detail', async () => {
		const federico = await admin();
		const anna = await actors.user();
		const given = await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: true });
		expect(given.user.roles).toEqual(['recipe_curator']);
		expect((await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: true })).user.roles).toEqual(['recipe_curator']);
		const both = await federico.client.users.setRole({ id: anna.userId, role: 'app_admin', granted: true });
		expect(both.user.roles).toEqual(['app_admin', 'recipe_curator']);
		await federico.client.users.setRole({ id: anna.userId, role: 'app_admin', granted: false });
		const removed = await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: false });
		expect(removed.user.roles).toEqual([]);
		expect((await federico.client.users.setRole({ id: anna.userId, role: 'recipe_curator', granted: false })).user.roles).toEqual([]);
		expect((await errorOf(federico.client.users.setRole({ id: crypto.randomUUID(), role: 'recipe_curator', granted: true }))).code).toBe('not_found');
	});

	it('protects the last app admin, also from themselves', async () => {
		const federico = await admin();
		restore = await onlyAppAdmins(actors.db.admin, [federico.userId]);
		expect((await federico.client.users.get({ id: federico.userId })).user.lastAppAdmin).toBe(true);
		const error = await errorOf(federico.client.users.setRole({ id: federico.userId, role: 'app_admin', granted: false }));
		expect(error.code).toBe('last_app_admin');
		expect((await federico.client.users.get({ id: federico.userId })).user.roles).toContain('app_admin');
	});

	it('giving up one’s own role works with another admin and counts at once, on the web and for a connected agent', async () => {
		const federico = await admin();
		const lucia = await admin();
		const agent = await actors.user({ agent: true });
		await actors.db.grantGlobalRole(agent.userId, 'app_admin');
		// The agent's token was issued before the change: no new session is needed for it to count.
		expect(toolBody(await call(agent.token, 'users_get', { id: lucia.userId })).user.id).toBe(lucia.userId);
		await federico.client.users.setRole({ id: agent.userId, role: 'app_admin', granted: false });
		expect((await call(agent.token, 'users_get', { id: lucia.userId })).body.result.isError).toBe(true);
		const after = await federico.client.users.setRole({ id: federico.userId, role: 'app_admin', granted: false });
		expect(after.user.roles).toEqual([]);
		expect((await errorOf(federico.client.users.list({}))).code).toBe('forbidden');
	});

	it('lets an administrator agent give a role over MCP', async () => {
		const agent = await admin({ agent: true });
		const anna = await actors.user();
		const result = await call(agent.token, 'users_setRole', { id: anna.userId, role: 'recipe_curator', granted: true });
		expect(toolBody(result).user.roles).toEqual(['recipe_curator']);
	});
});

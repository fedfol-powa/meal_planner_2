import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectTools } from '../src/mcp.ts';
import { messages } from '../src/messages.ts';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { mcp, rest, toolBody } from './support/requests.ts';

describe('profile and family tools', () => {
	it('lists one tool per operation, read-only only for reads', () => {
		const tools = new Map(collectTools(contract).map((tool) => [tool.name, tool.readOnly]));
		expect(tools.get('profile_get')).toBe(true);
		expect(tools.get('family_getSettings')).toBe(true);
		expect(tools.get('profile_update')).toBe(false);
		expect(tools.get('family_setMeal')).toBe(false);
		expect(tools.get('family_addExclusion')).toBe(false);
	});

	it('tells agents that profile_update switches the weekly menu email (spec W24)', () => {
		const update = collectTools(contract).find((tool) => tool.name === 'profile_update');
		expect(update?.description).toContain('weekly menu email');
	});
});

describe.skipIf(!hasDatabase)('profile and family over MCP and REST', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const call = (token: string, name: string, args: unknown) => mcp(actors.app, actors.env, token, 'tools/call', { name, arguments: args });

	it('a change of language from an agent reaches Auth too (spec W15)', async () => {
		const auth = installFakeAuth(actors.db);
		try {
			const agent = await actors.user({ agent: true });
			const result = await call(agent.token, 'profile_update', { locale: 'en-GB' });
			expect(result.body.result.isError).toBeFalsy();
			expect(auth.metadata).toEqual([{ id: agent.userId, body: { user_metadata: { locale: 'en-GB' } } }]);
		} finally {
			auth.restore();
		}
	});

	it('lets an agent switch off the menu email for the person', async () => {
		const agent = await actors.user({ agent: true });
		const result = await call(agent.token, 'profile_update', { menuEmails: false });
		expect(result.body.result.isError).toBeFalsy();
		expect(toolBody(await call(agent.token, 'profile_get', {})).user.menuEmails).toBe(false);
	});

	it('lets an administrator agent write and read back', async () => {
		const agent = await actors.user({ agent: true });
		const familyId = await actors.db.createFamily([{ userId: agent.userId, role: 'family_admin' }]);
		const write = await call(agent.token, 'family_setMeal', {
			familyId,
			mealType: 'dinner',
			weekday: 5,
			servings: 4,
			fixedText: 'Cena libera',
			maxMinutes: null,
		});
		expect(write.body.result.isError).toBeFalsy();
		const read = await call(agent.token, 'family_getSettings', { familyId });
		expect(read.body.result.isError).toBeFalsy();
		expect(toolBody(read).data.settings.slots.dinner[5]).toEqual({ servings: 4, fixedText: 'Cena libera', maxMinutes: null });
		const profile = await call(agent.token, 'profile_get', {});
		expect(toolBody(profile).families.map((f: { id: string }) => f.id)).toEqual([familyId]);
	});

	it('refuses a member write with a forbidden in the profile language', async () => {
		const agent = await actors.user({ agent: true, locale: 'en-GB' });
		const familyId = await actors.db.createFamily([{ userId: agent.userId, role: 'member' }]);
		const write = await call(agent.token, 'family_rename', { familyId, name: 'Mine' });
		expect(write.body.result.isError).toBe(true);
		expect(toolBody(write)).toMatchObject({ code: 'forbidden', message: messages.forbidden['en-GB'] });
	});

	it('answers not_found on REST as declared', async () => {
		const admin = await actors.user();
		const familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const response = await rest(actors.app, actors.env, 'PUT', `/api/families/${familyId}/books/${crypto.randomUUID()}`, admin.token, { owned: true });
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: 'not_found' });
	});
});

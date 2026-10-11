import { contract } from '@app/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { createTestKeys, type TestKeys } from '../support/keys.ts';
import { menuFixtures } from '../support/menu.ts';
import { mcp, testEnv, toolBody } from '../support/requests.ts';

/** The menu reads as an agent sees them (spec section 13). */
describe.skipIf(!hasDatabase)('menu reads on MCP', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;
	let user: { userId: string; sessionId: string };
	const env = () => testEnv(db.appServerUrl);
	// Signed after the clock is set: the token's times follow the fake clock.
	const signToken = () => keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
	const callTool = async (name: string, args: Record<string, unknown>) => mcp(app, env(), await signToken(), 'tools/call', { name, arguments: args });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		user = await db.createUser();
		const fx = menuFixtures(db);
		for (let i = 0; i < 20; i++) await fx.publishRecipe();
	});
	afterEach(() => vi.useRealTimers());
	afterAll(() => db?.close());

	const memberFamily = () => db.createFamily([{ userId: user.userId, role: 'member' }]);

	it('lists the three reads as read-only tools', async () => {
		const list = await mcp(app, env(), await signToken(), 'tools/list');
		const menu = list.body.result.tools.filter((t: any) => t.name.startsWith('menu_'));
		expect(menu.map((t: any) => t.name).sort()).toEqual(['menu_getDates', 'menu_getOpening', 'menu_getWeek']);
		expect(menu.every((t: any) => t.annotations?.readOnlyHint === true)).toBe(true);
	});

	it('generates the first week on tools/call', async () => {
		const familyId = await memberFamily();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
		const first = toolBody(await callTool('menu_getOpening', { familyId }));
		expect(first).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-12', weekStartsOn: '2026-10-12' } });
		const [{ weeks }] = await db.admin<{ weeks: number }[]>`select count(*)::int as weeks from app.weeks where family_id = ${familyId}`;
		expect(weeks).toBe(1);
	});

	it('changes the opening with the day on tools/call, even with the version of the day before', async () => {
		const fx = menuFixtures(db);
		const familyId = await memberFamily();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', freeText: 'A' });
		await fx.insertSlot(week, { date: '2026-10-13', mealType: 'lunch', freeText: 'B' });
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-12T08:00:00Z'));
		const first = toolBody(await callTool('menu_getOpening', { familyId }));
		expect(first).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-12' } });
		vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
		const second = toolBody(await callTool('menu_getOpening', { familyId, knownVersion: first.version }));
		expect(second).toMatchObject({ unchanged: false, data: { kind: 'day', date: '2026-10-13' } });
	});

	it('answers errors as tool errors: invalid today even with a version, missing week, other family', async () => {
		const familyId = await memberFamily();
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
		const { version } = toolBody(await callTool('menu_getOpening', { familyId }));
		const invalid = await callTool('menu_getOpening', { familyId, today: '2026-10-20', knownVersion: version });
		expect(invalid.body.result.isError).toBe(true);
		expect(toolBody(invalid).code).toBe('invalid');
		const missing = await callTool('menu_getWeek', { familyId, weekStartsOn: '2030-01-07' });
		expect(toolBody(missing).code).toBe('not_found');
		const other = await callTool('menu_getOpening', { familyId: await db.createFamily([]) });
		expect(toolBody(other).code).toBe('forbidden');
	});
});

import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { createTestKeys, type TestKeys } from '../support/keys.ts';
import { menuFixtures } from '../support/menu.ts';
import { mcp, testEnv, toolBody } from '../support/requests.ts';

describe.skipIf(!hasDatabase)('meals on MCP', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;
	let anna: { userId: string; sessionId: string };
	let bruno: { userId: string; sessionId: string };
	let familyId: string;
	let slotId: string;
	const env = () => testEnv(db.appServerUrl);
	const token = (u: { userId: string; sessionId: string }) => keys.sign({ sub: u.userId, session_id: u.sessionId, client_id: 'codex' });
	const call = async (u: typeof anna, name: string, args: Record<string, unknown>) => mcp(app, env(), await token(u), 'tools/call', { name, arguments: args });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		anna = await db.createUser();
		bruno = await db.createUser();
		familyId = await db.createFamily([{ userId: anna.userId, role: 'member' }, { userId: bruno.userId, role: 'member' }]);
		const fx = menuFixtures(db);
		const recipe = await fx.publishRecipe();
		const week = await fx.insertWeek(familyId, '2026-10-12');
		slotId = await fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', recipeId: recipe });
		for (let i = 0; i < 6; i++) await fx.publishRecipe();
	});
	afterAll(() => db?.close());

	it('lists the meal tools, only the suggestions read-only', async () => {
		const list = await mcp(app, env(), await token(anna), 'tools/list');
		const tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] = list.body.result.tools.filter((t: { name: string }) => t.name.startsWith('meals_'));
		expect(tools.map((t) => t.name).sort()).toEqual(['meals_getSuggestions', 'meals_setFree', 'meals_setNote', 'meals_setRecipe', 'meals_setServings', 'meals_swap', 'meals_undo']);
		expect(tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name)).toEqual(['meals_getSuggestions']);
	});

	it('changes a meal, and refuses to undo another member’s action with not_allowed', async () => {
		const changed = toolBody(await call(anna, 'meals_setServings', { familyId, slotId, id: crypto.randomUUID(), servings: 3 }));
		expect(changed).toMatchObject({ changed: true });
		const refused = await call(bruno, 'meals_undo', { familyId, actionId: changed.actionId, id: crypto.randomUUID() });
		expect(refused.body.result.isError).toBe(true);
		const text = JSON.stringify(refused.body.result);
		expect(text).toContain('not_allowed');
		expect(text).toContain('not_own_change');
	});

	it('an agent in a new conversation undoes through tools/call, from menu_getWeek alone', async () => {
		const changed = toolBody(await call(anna, 'meals_setNote', { familyId, slotId, id: crypto.randomUUID(), note: 'Senza cipolla' }));
		expect(changed).toMatchObject({ changed: true });
		// A new conversation: nothing kept from the call above, only what the tools answer.
		const read = toolBody(await call(anna, 'menu_getWeek', { familyId, weekStartsOn: '2026-10-12' }));
		const meal = read.data.days.flatMap((d: { meals: { slotId: string }[] }) => d.meals).find((m: { slotId: string }) => m.slotId === slotId);
		expect(meal).toMatchObject({ note: 'Senza cipolla', lastChange: { undoable: true, slotIds: [slotId] } });
		const undoId = crypto.randomUUID();
		const undone = toolBody(await call(anna, 'meals_undo', { familyId, actionId: meal.lastChange.actionId, id: undoId }));
		expect(undone).toMatchObject({ actionId: undoId, changed: true });
		const after = undone.week.days.flatMap((d: { meals: { slotId: string }[] }) => d.meals).find((m: { slotId: string }) => m.slotId === slotId);
		expect(after.note).toBeNull();
		expect((await db.admin<{ channel: string; kind: string }[]>`select channel, kind from app.meal_actions where id = ${undoId}`)[0]).toEqual({ channel: 'mcp', kind: 'undo' });
	});
});

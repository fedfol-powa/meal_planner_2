import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, testEnv, toolBody } from './support/requests.ts';
import { grams, seedIngredient, seedPublishedRecipe, seedWeek } from './support/shopping-fixtures.ts';

const MONDAY = '2026-10-12';
const TOOLS = {
	shopping_getWeekList: true,
	shopping_setItemChecked: false,
	shopping_setAddedBack: false,
	shopping_addFreeItem: false,
	shopping_setFreeItemChecked: false,
	shopping_removeFreeItem: false,
	shopping_exportList: true,
	shopping_createBringLink: false,
};

let keys: TestKeys;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	keys = await createTestKeys();
	app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
});

describe('shopping on OpenAPI', () => {
	it('documents the shopping routes', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/openapi.json');
		expect(response.status).toBe(200);
		const spec: any = await response.json();
		expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/shopping/week-list', '/shopping/set-item-checked', '/shopping/bring-link']));
	});
});

describe.skipIf(!hasDatabase)('shopping on MCP', () => {
	let db: TestDatabase;
	const env = () => testEnv(db.appServerUrl);

	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('lists every shopping tool, read-only only for reading and exporting', async () => {
		const user = await db.createUser();
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
		const result = await mcp(app, env(), token, 'tools/list');
		const tools = new Map<string, boolean>(
			result.body.result.tools.filter((t: any) => t.name.startsWith('shopping_')).map((t: any) => [t.name, t.annotations.readOnlyHint]),
		);
		expect(Object.fromEntries(tools)).toEqual(TOOLS);
	});

	it('lets an agent tick an item with the quantity of the view, then read it back', async () => {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(200) }] });
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId, client_id: 'codex' });
		const week = { familyId, weekStartsOn: MONDAY };

		const before = toolBody(await mcp(app, env(), token, 'tools/call', { name: 'shopping_getWeekList', arguments: week }));
		const item = before.data.departments[0].items[0];
		const ticked = await mcp(app, env(), token, 'tools/call', {
			name: 'shopping_setItemChecked',
			arguments: { ...week, id: crypto.randomUUID(), ingredientId: item.ingredientId, varietyKey: item.varietyKey, checked: true, quantityAtCheck: item.combined },
		});
		expect(ticked.body.result.isError).toBeFalsy();
		const after = toolBody(await mcp(app, env(), token, 'tools/call', { name: 'shopping_getWeekList', arguments: week }));
		expect(after.data.departments[0].items[0].checked).toBe(true);
		const exported = toolBody(await mcp(app, env(), token, 'tools/call', { name: 'shopping_exportList', arguments: week }));
		expect(exported.lines).toEqual([]);
	});
});

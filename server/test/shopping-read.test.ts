import type { ShoppingListView } from '@app/contract';
import { call } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { asUserFor, callOptions, errorOf, readList, shopping } from './support/shopping.ts';
import {
	avoidIngredient,
	grams,
	republish,
	seedDraftRecipe,
	seedIngredient,
	seedPublishedRecipe,
	seedShoppingEquivalence,
	seedWeek,
} from './support/shopping-fixtures.ts';

const MONDAY = '2026-10-12';
const items = (view: ShoppingListView) => view.departments.flatMap((d) => d.items);

describe.skipIf(!hasDatabase)('shopping.getWeekList', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let asUser: ReturnType<typeof asUserFor>;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		asUser = asUserFor(keys, db);
	});
	afterAll(() => db?.close());

	async function family(locale: 'it-IT' | 'en-GB' = 'it-IT') {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		return { user, familyId };
	}

	async function read(user: { userId: string; sessionId: string }, familyId: string, weekStartsOn = MONDAY, knownVersion?: string) {
		return readList({ familyId, weekStartsOn, knownVersion }, callOptions(await asUser(user)));
	}

	async function view(user: { userId: string; sessionId: string }, familyId: string, weekStartsOn = MONDAY) {
		const result = await read(user, familyId, weekStartsOn);
		if (result.unchanged) throw new Error('expected a view');
		return result.data;
	}

	it('sums the meals of the week, scaled, with their sources; free meals add nothing', async () => {
		const { user, familyId } = await family();
		const flour = await seedIngredient(db, { name: 'Farina', department: 'pasta_grains' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(100) }] });
		await seedWeek(db, familyId, MONDAY, [
			{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 },
			{ date: '2026-10-14', mealType: 'dinner', recipeId, servings: 4 },
			{ date: '2026-10-15', mealType: 'dinner', freeText: 'Pizza fuori', servings: 2 },
		]);
		const list = await view(user, familyId);
		expect(list.mealCount).toBe(2);
		expect(list.weekStartsOn).toBe(MONDAY);
		expect(list.measurementSystem).toBe('metric');
		const [item] = items(list);
		expect(item!.name).toBe('Farina');
		expect(item!.combined.mass_g).toBe(300);
		expect(item!.quantity).toBe('300 g');
		expect(item!.sources).toHaveLength(2);
		expect(item!.checked).toBe(false);
		expect(list.skipped).toEqual([]);
		expect(list.freeItems).toEqual([]);
		expect(list.lastChange).toBeNull();
	});

	it('buys as shops sell: lemon juice in lemons', async () => {
		const { user, familyId } = await family();
		const lemon = await seedIngredient(db, { name: 'Limone' });
		await seedShoppingEquivalence(db, { ingredientId: lemon, fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, preparation: 'succo' });
		const { recipeId } = await seedPublishedRecipe(db, {
			name: 'Limonata',
			baseServings: 2,
			lines: [{ ingredientId: lemon, quantity: grams(94), preparation: { 'it-IT': 'succo', 'en-GB': 'juice' } }],
		});
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const [item] = items(await view(user, familyId));
		expect(item!.combined.counts.piece).toBeCloseTo(2);
		expect(item!.quantity).toMatch(/^2\b/);
	});

	it('puts pantry and avoided ingredients under «Non in lista»', async () => {
		const { user, familyId } = await family();
		const salt = await seedIngredient(db, { name: 'Sale', department: 'condiments', isPantry: true });
		const peanuts = await seedIngredient(db, { name: 'Arachidi' });
		const carrot = await seedIngredient(db, { name: 'Carota' });
		await avoidIngredient(db, familyId, peanuts);
		const { recipeId } = await seedPublishedRecipe(db, {
			name: 'Insalata',
			baseServings: 2,
			lines: [salt, peanuts, carrot].map((ingredientId) => ({ ingredientId, quantity: grams(10) })),
		});
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const list = await view(user, familyId);
		expect(items(list).map((i) => i.name)).toEqual(['Carota']);
		expect(list.excluded.map((i) => [i.name, i.excluded])).toEqual([
			['Arachidi', 'avoid'],
			['Sale', 'pantry'],
		]);
	});

	it('uses the version each meal was eaten with (R1)', async () => {
		const { user, familyId } = await family();
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, {
			name: 'Pane',
			baseServings: 2,
			lines: [{ ingredientId: flour, quantity: grams(100) }],
			publishedAt: new Date('2026-01-01T00:00:00Z'),
		});
		await republish(db, recipeId, 'Pane', 2, [{ ingredientId: flour, quantity: grams(200) }], new Date('2026-10-05T00:00:00Z'));
		await seedWeek(db, familyId, '2026-09-28', [{ date: '2026-09-29', mealType: 'dinner', recipeId, servings: 2 }]);
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'dinner', recipeId, servings: 2 }]);
		expect(items(await view(user, familyId, '2026-09-28'))[0]!.combined.mass_g).toBe(100);
		expect(items(await view(user, familyId))[0]!.combined.mass_g).toBe(200);
	});

	it('reports never-published recipes among the skipped meals, never free or empty meals', async () => {
		const { user, familyId } = await family();
		const draft = await seedDraftRecipe(db, 'Ricetta importata');
		const { slotIds } = await seedWeek(db, familyId, MONDAY, [
			{ date: '2026-10-13', mealType: 'lunch', recipeId: draft, servings: 2 },
			{ date: '2026-10-13', mealType: 'dinner', freeText: 'Avanzi', servings: 2 },
			{ date: '2026-10-14', mealType: 'dinner', servings: 2 },
		]);
		const list = await view(user, familyId);
		expect(list.mealCount).toBe(0);
		expect(items(list)).toEqual([]);
		// Drafts cited by the family's meals are readable by its members (policy recipes_read_cited_draft).
		expect(list.skipped).toEqual([{ slotId: slotIds[0], recipeId: draft, recipeName: 'Ricetta importata' }]);
	});

	it('speaks the viewer language and the family measurement system', async () => {
		const { user, familyId } = await family('en-GB');
		await db.admin`update app.families set measurement_system = 'uk_imperial' where id = ${familyId}`;
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(500) }] });
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const list = await view(user, familyId);
		expect(list.locale).toBe('en-GB');
		expect(list.measurementSystem).toBe('uk_imperial');
		const [item] = items(list);
		expect(item!.name).toBe('Farina (en)');
		expect(item!.quantity).toMatch(/lb|oz/);
		expect(item!.sources[0]!.recipeName).toBe('Pane (en)');
	});

	it('answers not_found for a week not generated, forbidden for another family, invalid for a Tuesday', async () => {
		const { user, familyId } = await family();
		expect((await errorOf(read(user, familyId, '2026-11-02'))).code).toBe('not_found');
		const other = await family();
		expect((await errorOf(read(user, other.familyId))).code).toBe('forbidden');
		expect((await errorOf(read(user, familyId, '2026-10-13'))).code).toBe('invalid');
	});

	it('answers not_found for a week not generated even with a current version of another week (PR review, finding 2)', async () => {
		const { user, familyId } = await family();
		await seedWeek(db, familyId, MONDAY, []);
		const current = await read(user, familyId);
		const error = await errorOf(read(user, familyId, '2026-11-02', current.version));
		expect(error.code).toBe('not_found');
	});

	it('is no longer unchanged once a meal of the week passes (decision «R1 e risposta invariato»)', async () => {
		const { user, familyId } = await family();
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(100) }] });
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		// Tuesday lunch passes at 15:30 in Rome, 13:30 UTC.
		const at = (iso: string) => async () => callOptions(await asUser(user, {}, () => new Date(iso)));
		const input = { familyId, weekStartsOn: MONDAY };
		const before = await readList(input, await (await at('2026-10-13T13:00:00Z'))());
		const still = await readList({ ...input, knownVersion: before.version }, await (await at('2026-10-13T13:20:00Z'))());
		expect(still).toEqual({ unchanged: true, version: before.version });
		const after = await readList({ ...input, knownVersion: before.version }, await (await at('2026-10-13T13:40:00Z'))());
		expect(after.unchanged).toBe(false);
		expect(after.version).not.toBe(before.version);
	});

	it('answers unchanged with the same version, a new view after a change', async () => {
		const { user, familyId } = await family();
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(100) }] });
		const { slotIds } = await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const first = await read(user, familyId);
		expect(first.unchanged).toBe(false);
		expect(await read(user, familyId, MONDAY, first.version)).toEqual({ unchanged: true, version: first.version });
		await db.admin`update app.meal_slots set servings = 4 where id = ${slotIds[0]}`;
		const after = await read(user, familyId, MONDAY, first.version);
		expect(after.unchanged).toBe(false);
	});
});

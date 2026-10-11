import type { ShoppingListView } from '@app/contract';
import type { CombinedQuantity } from '@app/domain/units';
import { call } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { asUserFor, callOptions, errorOf, shopping } from './support/shopping.ts';
import { grams, seedIngredient, seedPublishedRecipe, seedWeek } from './support/shopping-fixtures.ts';

const MONDAY = '2026-10-12';
const NEXT_MONDAY = '2026-10-19';
const items = (view: ShoppingListView) => view.departments.flatMap((d) => d.items);
const g = (mass_g: number): CombinedQuantity => ({ mass_g, volume_ml: null, counts: {}, texts: [], to_taste: false });
type User = { userId: string; sessionId: string };

describe.skipIf(!hasDatabase)('shopping mutations', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let asUser: ReturnType<typeof asUserFor>;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		asUser = asUserFor(keys, db);
	});
	afterAll(() => db?.close());

	/** A family with one recipe of 200 g of flour (2 servings) on Tuesday lunch, and an empty next week. */
	async function setup() {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const flour = await seedIngredient(db, { name: 'Farina' });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(200) }] });
		const { slotIds } = await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		await seedWeek(db, familyId, NEXT_MONDAY, []);
		return { user, familyId, flour, slotId: slotIds[0]! };
	}

	const as = async (user: User) => callOptions(await asUser(user));
	/** The view of a read that cannot be unchanged (no knownVersion). */
	async function readView(user: User, familyId: string, weekStartsOn = MONDAY): Promise<ShoppingListView> {
		const result = await call(shopping.getWeekList, { familyId, weekStartsOn }, await as(user));
		if (result.unchanged) throw new Error('expected a view');
		return result.data;
	}

	const tick = async (user: User, familyId: string, ingredientId: string, quantityAtCheck: CombinedQuantity, id = crypto.randomUUID()) =>
		call(shopping.setItemChecked, { id, familyId, weekStartsOn: MONDAY, ingredientId, varietyKey: '', checked: true, quantityAtCheck }, await as(user));

	it('ticks and unticks an item, twice each with the same outcome', async () => {
		const { user, familyId, flour } = await setup();
		const input = { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, ingredientId: flour, varietyKey: '', checked: true, quantityAtCheck: g(200) };
		const first = await call(shopping.setItemChecked, input, await as(user));
		const again = await call(shopping.setItemChecked, input, await as(user));
		expect(items(first.data)[0]!.checked).toBe(true);
		// Same state; only the moment of the last change moves.
		expect({ ...again.data, lastChange: null }).toEqual({ ...first.data, lastChange: null });
		const off = { ...input, checked: false, quantityAtCheck: undefined };
		expect(items((await call(shopping.setItemChecked, off, await as(user))).data)[0]!.checked).toBe(false);
		expect(items((await call(shopping.setItemChecked, off, await as(user))).data)[0]!.checked).toBe(false);
	});

	it('refuses a tick without the quantity seen', async () => {
		const { user, familyId, flour } = await setup();
		const error = await errorOf(call(shopping.setItemChecked, { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, ingredientId: flour, varietyKey: '', checked: true }, await as(user)));
		expect(error.code).toBe('invalid');
		expect(error.data).toEqual({ issues: [expect.objectContaining({ path: ['quantityAtCheck'] })] });
	});

	it('asks to tick again when the item grows, not when it shrinks', async () => {
		const { user, familyId, flour, slotId } = await setup();
		await tick(user, familyId, flour, g(200));
		await db.admin`update app.meal_slots set servings = 4 where id = ${slotId}`;
		const grown = { data: await readView(user, familyId) };
		expect(items(grown.data)[0]).toMatchObject({ checked: false, previousQuantity: '200 g' });
		await db.admin`update app.meal_slots set servings = 1 where id = ${slotId}`;
		const shrunk = { data: await readView(user, familyId) };
		expect(items(shrunk.data)[0]).toMatchObject({ checked: true, previousQuantity: null });
	});

	it('repeats a lost tick with the same content after the servings changed (review, finding 6)', async () => {
		const { user, familyId, flour, slotId } = await setup();
		const id = crypto.randomUUID();
		await tick(user, familyId, flour, g(200), id);
		await db.admin`update app.meal_slots set servings = 4 where id = ${slotId}`;
		const repeated = await tick(user, familyId, flour, g(200), id);
		expect(items(repeated.data)[0]).toMatchObject({ checked: false, previousQuantity: '200 g' });
	});

	it('keeps a tick of an item that left the list and shows it when the item comes back', async () => {
		const { user, familyId, flour, slotId } = await setup();
		const salt = await seedIngredient(db, { name: 'Sale nero' });
		await tick(user, familyId, salt, g(5));
		expect(items((await tick(user, familyId, flour, g(200))).data).map((i) => i.name)).toEqual(['Farina']);
		const { recipeId: withSalt } = await seedPublishedRecipe(db, { name: 'Focaccia', baseServings: 2, lines: [{ ingredientId: salt, quantity: grams(5) }] });
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
			select week_id, '2026-10-14', 'dinner', ${withSalt}, 2 from app.meal_slots where id = ${slotId}`;
		const view = { data: await readView(user, familyId) };
		expect(items(view.data).find((i) => i.name === 'Sale nero')!.checked).toBe(true);
	});

	it('puts an excluded item back and takes it off again, idempotently', async () => {
		const { user, familyId } = await setup();
		const salt = await seedIngredient(db, { name: 'Sale', isPantry: true });
		const { recipeId } = await seedPublishedRecipe(db, { name: 'Brodo', baseServings: 2, lines: [{ ingredientId: salt, quantity: grams(5) }] });
		await db.admin`insert into app.meal_slots (week_id, date, meal_type, recipe_id, servings)
			select id, '2026-10-15', 'dinner', ${recipeId}, 2 from app.weeks where family_id = ${familyId} and starts_on = ${MONDAY}`;
		const input = { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, ingredientId: salt, varietyKey: '', addedBack: true };
		await call(shopping.setAddedBack, input, await as(user));
		const back = await call(shopping.setAddedBack, input, await as(user));
		expect(items(back.data).map((i) => i.name)).toContain('Sale');
		expect(back.data.excluded).toEqual([]);
		await call(shopping.setAddedBack, { ...input, addedBack: false }, await as(user));
		const off = await call(shopping.setAddedBack, { ...input, addedBack: false }, await as(user));
		expect(off.data.excluded.map((i) => i.name)).toEqual(['Sale']);
	});

	it('adds a free item once even when the request is repeated, with normalised text', async () => {
		const { user, familyId } = await setup();
		const input = { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, text: '  Detersivo   per i piatti ' };
		await call(shopping.addFreeItem, input, await as(user));
		const again = await call(shopping.addFreeItem, input, await as(user));
		expect(again.data.freeItems).toEqual([{ id: input.id, text: 'Detersivo per i piatti', checked: false }]);
	});

	it('refuses empty text and an id already used by another list', async () => {
		const { user, familyId } = await setup();
		const empty = await errorOf(call(shopping.addFreeItem, { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, text: '   ' }, await as(user)));
		expect(empty.code).toBe('invalid');
		expect(empty.data).toEqual({ issues: [{ path: ['text'], code: 'text' }] });
		const id = crypto.randomUUID();
		await call(shopping.addFreeItem, { id, familyId, weekStartsOn: MONDAY, text: 'Pile' }, await as(user));
		const taken = await errorOf(call(shopping.addFreeItem, { id, familyId, weekStartsOn: NEXT_MONDAY, text: 'Pile' }, await as(user)));
		expect(taken.code).toBe('invalid');
		expect(taken.data).toEqual({ issues: [{ path: ['id'], code: 'taken' }] });
	});

	it('recreates a free item another member removed when the addition is repeated (accepted case)', async () => {
		const { user, familyId } = await setup();
		const input = { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, text: 'Pane' };
		await call(shopping.addFreeItem, input, await as(user));
		await call(shopping.removeFreeItem, { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, itemId: input.id }, await as(user));
		const repeated = await call(shopping.addFreeItem, input, await as(user));
		expect(repeated.data.freeItems.map((i) => i.id)).toEqual([input.id]);
	});

	it('ticks and removes free items; removing twice or an unknown id is fine, ticking an unknown one is not_found', async () => {
		const { user, familyId } = await setup();
		const itemId = crypto.randomUUID();
		await call(shopping.addFreeItem, { id: itemId, familyId, weekStartsOn: MONDAY, text: 'Latte' }, await as(user));
		const ticked = await call(shopping.setFreeItemChecked, { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, itemId, checked: true }, await as(user));
		expect(ticked.data.freeItems[0]!.checked).toBe(true);
		const remove = { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, itemId };
		await call(shopping.removeFreeItem, remove, await as(user));
		expect((await call(shopping.removeFreeItem, remove, await as(user))).data.freeItems).toEqual([]);
		await call(shopping.removeFreeItem, { ...remove, itemId: crypto.randomUUID() }, await as(user));
		const unknown = await errorOf(
			call(shopping.setFreeItemChecked, { id: crypto.randomUUID(), familyId, weekStartsOn: MONDAY, itemId: crypto.randomUUID(), checked: true }, await as(user)),
		);
		expect(unknown.code).toBe('not_found');
	});

	it('never touches a free item of another list, even one the user can access (review, finding 9)', async () => {
		const { user, familyId } = await setup();
		const otherFamily = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		await seedWeek(db, otherFamily, MONDAY, []);
		const itemId = crypto.randomUUID();
		await call(shopping.addFreeItem, { id: itemId, familyId, weekStartsOn: MONDAY, text: 'Caffè' }, await as(user));
		for (const target of [
			{ familyId, weekStartsOn: NEXT_MONDAY },
			{ familyId: otherFamily, weekStartsOn: MONDAY },
		]) {
			await call(shopping.removeFreeItem, { id: crypto.randomUUID(), ...target, itemId }, await as(user));
			const tick = await errorOf(call(shopping.setFreeItemChecked, { id: crypto.randomUUID(), ...target, itemId, checked: true }, await as(user)));
			expect(tick.code).toBe('not_found');
		}
		const view = { data: await readView(user, familyId) };
		expect(view.data.freeItems).toEqual([{ id: itemId, text: 'Caffè', checked: false }]);
	});

	it('records the last change and moves the version', async () => {
		const { user, familyId, flour } = await setup();
		const before = await call(shopping.getWeekList, { familyId, weekStartsOn: MONDAY }, await as(user));
		const after = await tick(user, familyId, flour, g(200));
		expect(after.version).not.toBe(before.version);
		const [{ display_name: name }] = await db.admin<{ display_name: string }[]>`select display_name from app.profiles where user_id = ${user.userId}`;
		expect(after.data.lastChange).toEqual({ name, at: expect.any(String) });
		const read = await call(shopping.getWeekList, { familyId, weekStartsOn: MONDAY, knownVersion: after.version }, callOptions(await asUser(user)));
		expect(read).toEqual({ unchanged: true, version: after.version });
	});

	it('refuses a member of another family', async () => {
		const { familyId, flour } = await setup();
		const stranger = await db.createUser();
		await db.createFamily([{ userId: stranger.userId, role: 'family_admin' }]);
		expect((await errorOf(tick(stranger, familyId, flour, g(200)))).code).toBe('forbidden');
	});
});

import type { CombinedQuantity } from '@app/domain/units';
import { call } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { asUserFor, callOptions, errorOf, readList, shopping } from './support/shopping.ts';
import { grams, seedIngredient, seedPublishedRecipe, seedWeek } from './support/shopping-fixtures.ts';

const MONDAY = '2026-10-12';
const g = (mass_g: number): CombinedQuantity => ({ mass_g, volume_ml: null, counts: {}, texts: [], to_taste: false });
type User = { userId: string; sessionId: string };

describe.skipIf(!hasDatabase)('shopping exports', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let asUser: ReturnType<typeof asUserFor>;

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		asUser = asUserFor(keys, db);
	});
	afterAll(() => db?.close());

	const as = async (user: User) => callOptions(await asUser(user));

	/** Flour (ticked) and sugar (not), two free items of which one ticked. */
	async function setup(locale: 'it-IT' | 'en-GB' = 'it-IT') {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const flour = await seedIngredient(db, { name: 'Farina', department: 'pasta_grains' });
		const sugar = await seedIngredient(db, { name: 'Zucchero', department: 'pasta_grains' });
		const { recipeId } = await seedPublishedRecipe(db, {
			name: 'Torta',
			baseServings: 2,
			lines: [
				{ ingredientId: flour, quantity: grams(200) },
				{ ingredientId: sugar, quantity: grams(100) },
			],
		});
		await seedWeek(db, familyId, MONDAY, [{ date: '2026-10-13', mealType: 'lunch', recipeId, servings: 2 }]);
		const week = { familyId, weekStartsOn: MONDAY };
		await call(shopping.setItemChecked, { ...week, id: crypto.randomUUID(), ingredientId: flour, varietyKey: '', checked: true, quantityAtCheck: g(200) }, await as(user));
		await call(shopping.addFreeItem, { ...week, id: crypto.randomUUID(), text: 'Detersivo' }, await as(user));
		const bought = crypto.randomUUID();
		await call(shopping.addFreeItem, { ...week, id: bought, text: 'Pile' }, await as(user));
		await call(shopping.setFreeItemChecked, { ...week, id: crypto.randomUUID(), itemId: bought, checked: true }, await as(user));
		return { user, familyId, flour, sugar };
	}

	it('exports the text without ticked items, free items under «Altro»', async () => {
		const { user, familyId } = await setup();
		const { text, lines } = await call(shopping.exportList, { familyId, weekStartsOn: MONDAY }, await as(user));
		expect(lines).toEqual(['100 g Zucchero', 'Detersivo']);
		expect(text).toContain('Lista della spesa');
		expect(text).toContain('• 100 g Zucchero');
		expect(text).toMatch(/Altro\n• Detersivo/);
		expect(text).not.toContain('Farina');
		expect(text).not.toContain('Pile');
	});

	it('exports in the language of who asks', async () => {
		const { user, familyId } = await setup('en-GB');
		const { text } = await call(shopping.exportList, { familyId, weekStartsOn: MONDAY }, await as(user));
		expect(text).toContain('Shopping list');
		expect(text).toContain('Zucchero (en)');
	});

	it('creates a Bring! link to a temporary list valid for 30 minutes', async () => {
		const { user, familyId } = await setup();
		const { url, expiresAt } = await call(shopping.createBringLink, { familyId, weekStartsOn: MONDAY }, await as(user));
		const prefix = 'https://api.getbring.com/rest/bringrecipes/deeplink?url=';
		expect(url.startsWith(prefix)).toBe(true);
		expect(url.endsWith('&source=web')).toBe(true);
		const page = decodeURIComponent(url.slice(prefix.length, -'&source=web'.length));
		const token = page.replace('https://app.test/shopping-lists/', '');
		expect(token).toMatch(/^[0-9a-f]{48}$/);
		const [row] = await db.admin<{ items: string[]; minutes: number }[]>`
			select items, (extract(epoch from expires_at - now()) / 60)::float8 as minutes from app.temporary_lists where token = ${token}`;
		expect(row!.items).toEqual(['100 g Zucchero', 'Detersivo']);
		expect(row!.minutes).toBeGreaterThan(29);
		expect(row!.minutes).toBeLessThanOrEqual(30);
		expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
	});

	it('refuses a Bring! link for a list with nothing left to buy', async () => {
		const { user, familyId, sugar } = await setup();
		const week = { familyId, weekStartsOn: MONDAY };
		await call(shopping.setItemChecked, { ...week, id: crypto.randomUUID(), ingredientId: sugar, varietyKey: '', checked: true, quantityAtCheck: g(100) }, await as(user));
		const view = await readList(week, await as(user));
		if (view.unchanged) throw new Error('expected a view');
		for (const item of view.data.freeItems.filter((i) => !i.checked)) {
			await call(shopping.removeFreeItem, { ...week, id: crypto.randomUUID(), itemId: item.id }, await as(user));
		}
		const error = await errorOf(call(shopping.createBringLink, week, await as(user)));
		expect(error.code).toBe('invalid');
		expect(error.data).toEqual({ issues: [{ path: [], code: 'empty_list' }] });
	});
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb } from '../../src/db.ts';
import { ingredientLines, ratingSummaries, recipeSummaries, recipeViewKey, type RecipeRef } from '../../src/recipes/views.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture } from './fixtures.ts';

/** The shared views as the menu (W1) composes a week with them. */
describe.skipIf(!hasDatabase)('recipe views as the menu uses them', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('composes a week: older version, never-published recipe, different servings, zero servings', async () => {
		const cat = catalogueFixture(db);
		const user = await db.createUser({ locale: 'en-GB' });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo nuovo', 'en-GB': 'New sauce' } });
		const draftId = await cat.draft({ 'it-IT': 'Solo italiano' }, null);
		await cat.meal(familyId, draftId, '2026-09-22', 'lunch');
		// What mealRecipeVersions (W1) gives for the meals of a week.
		const refs: RecipeRef[] = [
			{ recipeId, version: 1, servings: 2 }, // past meal, eaten with version 1
			{ recipeId, version: 2, servings: 4 }, // future meal, current version, more servings
			{ recipeId: draftId, version: null, servings: 2 }, // never published
			{ recipeId, version: 2, servings: 0 }, // a slot with zero servings: lines at the base
		];
		const claims = { sub: user.userId, role: 'authenticated' as const, session_id: user.sessionId, exp: Math.floor(Date.now() / 1000) + 3600 };
		const { summaries, lines, ratings } = await withDb(db.appServerUrl, { kind: 'user', claims }, async (tx) => ({
			summaries: await recipeSummaries(tx, refs, 'en-GB'),
			lines: await ingredientLines(tx, refs, { familyId, locale: 'en-GB' }),
			ratings: await ratingSummaries(tx, familyId, user.userId, [recipeId]),
		}));
		expect(summaries.get(recipeViewKey(refs[0]))?.name).toBe('Sauce');
		expect(summaries.get(recipeViewKey(refs[1]))?.name).toBe('New sauce');
		expect(summaries.get(recipeViewKey(refs[2]))).toMatchObject({ name: 'Solo italiano', description: null });
		expect(lines.get(recipeViewKey(refs[0]))?.[0].amount).toBe('200 g');
		expect(lines.get(recipeViewKey(refs[1]))?.[0].amount).toBe('400 g');
		expect(lines.get(recipeViewKey(refs[2]))).toBeNull();
		expect(lines.get(recipeViewKey(refs[3]))?.[0].amount).toBe('200 g');
		expect(ratings.get(recipeId)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { grams, seedIngredient, seedPublishedRecipe, seedWeek } from './support/shopping-fixtures.ts';

describe.skipIf(!hasDatabase)('shopping fixtures', () => {
	let db: TestDatabase;
	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('seed a published recipe and a week that uses it', async () => {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const flour = await seedIngredient(db, { name: 'Farina', department: 'pasta_grains' });
		const { recipeId, version } = await seedPublishedRecipe(db, { name: 'Pane', baseServings: 2, lines: [{ ingredientId: flour, quantity: grams(500) }] });
		const { slotIds } = await seedWeek(db, familyId, '2026-10-12', [{ date: '2026-10-13', mealType: 'dinner', recipeId, servings: 4 }]);
		const [row] = await db.admin<{ content: { ingredients: { ingredientId: string }[] } }[]>`
			select content from app.recipe_versions where recipe_id = ${recipeId} and version = ${version}`;
		expect(row!.content.ingredients[0]!.ingredientId).toBe(flour);
		expect(slotIds).toHaveLength(1);
	});
});

import type { TestDatabase } from './db.ts';
import { menuFixtures } from './menu.ts';
import { seedShoppingEquivalence } from './shopping-fixtures.ts';

export interface BackupFixtures {
	userId: string;
	familyId: string;
	listId: string;
}

/** Rows in every area, plus the values a backup most easily corrupts. */
export async function seedBackupFixtures(db: TestDatabase): Promise<BackupFixtures> {
	const fx = menuFixtures(db);
	const { userId, familyId } = await fx.member();
	await fx.book();
	const ingredientId = await fx.ingredient();
	const recipeId = await fx.publishRecipe({ ingredientIds: [ingredientId] });
	await fx.publishVersion(recipeId, '2026-02-01T00:00:00Z');
	const weekId = await fx.insertWeek(familyId, '2026-10-12');
	await fx.insertSlot(weekId, { date: '2026-10-12', mealType: 'lunch', recipeId, updatedBy: userId });
	await db.admin`insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${recipeId}, 4)`;
	// Generated column from_dimension.
	await seedShoppingEquivalence(db, { ingredientId, fromUnit: 'piece', toUnit: 'g', factor: 120 });
	const [{ id: listId }] = await db.admin<{ id: string }[]>`
		insert into app.shopping_lists (family_id, week_id, updated_by) values (${familyId}, ${weekId}, ${userId}) returning id`;
	// Adjacent numbers beyond the precision of a JavaScript number.
	await db.admin.unsafe(`insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check) values
		('${listId}', '${ingredientId}', 'a', '{"mass_g": 9007199254740993}'),
		('${listId}', '${ingredientId}', 'b', '{"mass_g": 9007199254740992.000000001}')`);
	// Nested metadata in Auth, and a sign-in identity.
	await db.admin.unsafe(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"tags": [1, [2, 3]], "nested": {"a": {"b": null}}}'
		where id = '${userId}'`);
	await db.admin`insert into auth.identities (provider_id, user_id, identity_data, provider)
		values (${userId}, ${userId}, ${db.admin.json({ sub: userId, email: `${userId}@test.local` })}, 'email')`;
	return { userId, familyId, listId };
}

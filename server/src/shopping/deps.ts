import type { Tx } from '../db.ts';

/** Shape of W1's mealRecipeVersions (W1 spec, section 3): slots with a recipe only. */
export interface MealRecipeVersion {
	slotId: string;
	recipeId: string;
	/** Version shown by the meal; null when the recipe was never published. */
	version: number | null;
	isPast: boolean;
}

export type MealRecipeVersions = (tx: Tx, familyId: string, weekId: string) => Promise<MealRecipeVersion[]>;

export interface ShoppingDeps {
	mealRecipeVersions: MealRecipeVersions;
}

/**
 * Provisional, until W1's `server/src/menu/versions.ts` is merged (plan, task 8): the same rule
 * (spec section 5, R1) on W2's SQL functions. The version in force when the meal became past,
 * the current one for today and future meals, the first one for meals older than it.
 */
export const mealRecipeVersions: MealRecipeVersions = async (tx, familyId, weekId) =>
	tx<MealRecipeVersion[]>`
		select s.id as "slotId", s.recipe_id as "recipeId",
			app.recipe_version_at(s.recipe_id, least(now(), app.meal_passed_at(s.date, s.meal_type, f.time_zone))) as version,
			app.meal_passed_at(s.date, s.meal_type, f.time_zone) <= now() as "isPast"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		where s.week_id = ${weekId} and w.family_id = ${familyId} and s.recipe_id is not null`;

import type { Tx } from '../db.ts';

export interface MealRecipeVersion {
	slotId: string;
	recipeId: string;
	/** Version shown by the meal; null when the recipe was never published. */
	version: number | null;
	/** True when the meal is past at the time of the call. */
	isPast: boolean;
}

/**
 * Slots with a recipe of one week and the version each meal uses (spec section 5, R1): a past
 * meal the version in force when it passed (the first one if older than the first
 * publication), today's open and future meals the current one, never-published recipes null.
 * Runs in the caller's role: members see the drafts their family's meals cite, app_job does
 * not. Also used by the shopping list (W4).
 */
export function mealRecipeVersions(tx: Tx, familyId: string, weekId: string): Promise<MealRecipeVersion[]> {
	return mealRecipeVersionsAt(tx, familyId, weekId, null);
}

/** As mealRecipeVersions, at a given instant instead of the transaction's now(): for tests. */
export async function mealRecipeVersionsAt(tx: Tx, familyId: string, weekId: string, at: Date | null): Promise<MealRecipeVersion[]> {
	return tx<MealRecipeVersion[]>`
		select s.id as "slotId", s.recipe_id as "recipeId",
			case when p.passed_at <= c.instant then app.recipe_version_at(s.recipe_id, p.passed_at)
				when r.version > 0 then r.version end as version,
			p.passed_at <= c.instant as "isPast"
		from app.meal_slots s
		join app.weeks w on w.id = s.week_id
		join app.families f on f.id = w.family_id
		join app.recipes r on r.id = s.recipe_id
		cross join (select coalesce(${at}::timestamptz, now()) as instant) c
		cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as passed_at) p
		where s.week_id = ${weekId} and w.family_id = ${familyId}
		order by s.date, s.meal_type desc`;
}

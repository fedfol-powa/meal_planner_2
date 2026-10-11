import { shoppingContract } from '@app/contract';
import { ORPCError } from '@orpc/server';
import { mapErrors } from '../../src/errors.ts';
import type { RequestContext } from '../../src/pipeline.ts';
import { createImplementer } from '../../src/pipeline.ts';
import type { MealRecipeVersions } from '../../src/shopping/deps.ts';
import { createShoppingRouter } from '../../src/shopping/router.ts';
import { contextFor } from './context.ts';
import type { TestDatabase } from './db.ts';
import type { TestKeys } from './keys.ts';

/**
 * Stand-in for W1's mealRecipeVersions (same shape as its spec, section 3), on the same SQL
 * functions of W2: replaced by the real one when W1 is merged.
 */
export const testMealRecipeVersions: MealRecipeVersions = async (tx, _familyId, weekId) =>
	tx`select s.id as "slotId", s.recipe_id as "recipeId",
	          app.recipe_version_at(s.recipe_id, least(now(), app.meal_passed_at(s.date, s.meal_type, f.time_zone))) as version,
	          app.meal_passed_at(s.date, s.meal_type, f.time_zone) <= now() as "isPast"
	   from app.meal_slots s join app.weeks w on w.id = s.week_id join app.families f on f.id = w.family_id
	   where s.week_id = ${weekId} and s.recipe_id is not null`;

export const shopping = createShoppingRouter(createImplementer(shoppingContract), { mealRecipeVersions: testMealRecipeVersions });

export const callOptions = (context: RequestContext) => ({ context, interceptors: [mapErrors] });

export async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

export function asUserFor(keys: TestKeys, db: TestDatabase) {
	return async (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		contextFor(keys, await keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra }), db.appServerUrl);
}

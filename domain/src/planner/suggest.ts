import { candidatesFor, slotRefOf } from './constraints.ts';
import { prepared } from './prepared.ts';
import { compareIds } from './random.ts';
import { withSortedCatalogue } from './repair.ts';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import type { PastMeal, PlannerInput, PlannerSlotRef } from './types.ts';

/**
 * Recipe ids for one slot, best first (spec section 3, «Riuso durante la revisione»): the
 * generation's candidates and score with the other meals of the week fixed (archived ones
 * included through fixedRecipes), the current recipe left out before the fallback on low
 * ratings. Deterministic: score, then id.
 */
export function rankSuggestions(rawInput: PlannerInput, slot: PlannerSlotRef, otherMeals: PastMeal[], currentRecipeId: string | null): string[] {
	const input = withSortedCatalogue(rawInput);
	const { byId } = prepared(input);
	const placed: Placed[] = otherMeals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
	});
	const exclude = new Set(currentRecipeId ? [currentRecipeId] : []);
	const ctx = buildContext(input, placed);
	return candidatesFor(slotRefOf(slot, input.settings), input, placed.map((p) => p.recipe), exclude)
		.map((recipe) => ({ id: recipe.id, score: scoreCandidate(recipe, slot, ctx) }))
		.sort((a, b) => b.score - a.score || compareIds(a.id, b.id))
		.map((r) => r.id);
}

import { addDays } from './calendar.ts';
import { FULL_RECENCY_DAYS, KNOWN_WINDOW_WEEKS, RECENT_DAYS } from './settings.ts';
import type { IsoDate, MealType, PlannerInput, PlannerRecipe } from './types.ts';

/**
 * What every step derives from the history and the catalogue, computed once per input instead of once per
 * candidate, slot and repair alternative. The input is treated as immutable while a week is generated.
 */
export interface Prepared {
	byId: Map<string, PlannerRecipe>;
	/** Recipes used in the RECENT_DAYS before the week: never proposed again. */
	recentIds: Set<string>;
	/** Recipes cooked within KNOWN_WINDOW_WEEKS: "known" for the quota. */
	knownIds: Set<string>;
	/** Different recipes ever cooked: the quota starts at KNOWN_NEW_MIN_COOKED. */
	cookedCount: number;
	/** Past meals of catalogue recipes that can still weigh on recency and similarity. */
	past: { date: IsoDate; mealType: MealType; recipe: PlannerRecipe }[];
}

const cache = new WeakMap<PlannerInput, Prepared>();

export function prepared(input: PlannerInput): Prepared {
	const cached = cache.get(input);
	if (cached) return cached;
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const before = input.history.filter((m) => m.date < input.weekStart);
	const since = (days: number) => addDays(input.weekStart, -days);
	const recentFrom = since(RECENT_DAYS);
	const knownFrom = since(7 * KNOWN_WINDOW_WEEKS);
	const pastFrom = since(FULL_RECENCY_DAYS);
	const result: Prepared = {
		byId,
		recentIds: new Set(before.filter((m) => m.date >= recentFrom).map((m) => m.recipeId)),
		knownIds: new Set(before.filter((m) => m.date >= knownFrom).map((m) => m.recipeId)),
		cookedCount: new Set(input.history.map((m) => m.recipeId)).size,
		past: before.flatMap((m) => {
			const recipe = byId.get(m.recipeId);
			return recipe && m.date >= pastFrom ? [{ date: m.date, mealType: m.mealType, recipe }] : [];
		})
	};
	cache.set(input, result);
	return result;
}

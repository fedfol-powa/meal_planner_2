import { addDays } from './calendar.ts';
import { KNOWN_NEW_MIN_COOKED, KNOWN_WINDOW_WEEKS } from './settings.ts';
import type { PlannerInput } from './types.ts';

/**
 * "Known" recipes for the known/new quota: cooked by the family within the last KNOWN_WINDOW_WEEKS
 * before the week. A recipe not cooked for longer counts as new again (decided 8 October 2026).
 */
export function knownRecipeIds(input: PlannerInput): Set<string> {
	const from = addDays(input.weekStart, -7 * KNOWN_WINDOW_WEEKS);
	return new Set(input.history.filter((m) => m.date >= from && m.date < input.weekStart).map((m) => m.recipeId));
}

/** The quota applies once the family has cooked enough different recipes, at any time (spec section 3). */
export function knownNewApplies(input: PlannerInput): boolean {
	return new Set(input.history.map((m) => m.recipeId)).size >= KNOWN_NEW_MIN_COOKED;
}

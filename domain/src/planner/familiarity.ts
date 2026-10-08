import { prepared } from './prepared.ts';
import { KNOWN_NEW_MIN_COOKED } from './settings.ts';
import type { PlannerInput } from './types.ts';

/**
 * "Known" recipes for the known/new quota: cooked by the family within the last KNOWN_WINDOW_WEEKS
 * before the week. A recipe not cooked for longer counts as new again (decided 8 October 2026).
 */
export function knownRecipeIds(input: PlannerInput): Set<string> {
	return prepared(input).knownIds;
}

/** The quota applies once the family has cooked enough different recipes, at any time (spec section 3). */
export function knownNewApplies(input: PlannerInput): boolean {
	return prepared(input).cookedCount >= KNOWN_NEW_MIN_COOKED;
}

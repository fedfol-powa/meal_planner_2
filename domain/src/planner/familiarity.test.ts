import { describe, expect, it } from 'vitest';
import { addDays } from './calendar.ts';
import { knownNewApplies, knownRecipeIds } from './familiarity.ts';
import { KNOWN_WINDOW_WEEKS } from './settings.ts';
import { baseInput } from './test-fixtures.ts';

describe('familiarity', () => {
	it('counts as known only recipes cooked within the window; older ones are new again', () => {
		const weekStart = '2026-10-12';
		const input = baseInput({
			weekStart,
			history: [
				{ date: addDays(weekStart, -7 * KNOWN_WINDOW_WEEKS), mealType: 'lunch', recipeId: 'edge' },
				{ date: addDays(weekStart, -7 * KNOWN_WINDOW_WEEKS - 1), mealType: 'dinner', recipeId: 'forgotten' },
				{ date: addDays(weekStart, -3), mealType: 'dinner', recipeId: 'recent' }
			]
		});
		expect([...knownRecipeIds(input)].sort()).toEqual(['edge', 'recent']);
	});

	it('applies the quota once the family has cooked 10 different recipes, however long ago', () => {
		const history = Array.from({ length: 10 }, (_, i) => ({ date: addDays('2025-01-06', i), mealType: 'lunch' as const, recipeId: `r${i}` }));
		expect(knownNewApplies(baseInput({ history: history.slice(0, 9) }))).toBe(false);
		expect(knownNewApplies(baseInput({ history }))).toBe(true);
	});
});

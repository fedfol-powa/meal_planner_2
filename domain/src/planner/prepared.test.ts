import { describe, expect, it } from 'vitest';
import { addDays } from './calendar.ts';
import { prepared } from './prepared.ts';
import { KNOWN_WINDOW_WEEKS, RECENT_DAYS } from './settings.ts';
import { baseInput, recipe } from './test-fixtures.ts';

describe('prepared', () => {
	const weekStart = '2026-10-12';
	const input = baseInput({
		weekStart,
		recipes: [recipe('a'), recipe('b'), recipe('c')],
		history: [
			{ date: addDays(weekStart, -RECENT_DAYS - 1), mealType: 'lunch', recipeId: 'a' },
			{ date: addDays(weekStart, -RECENT_DAYS), mealType: 'lunch', recipeId: 'b' },
			{ date: addDays(weekStart, -7 * KNOWN_WINDOW_WEEKS - 7), mealType: 'dinner', recipeId: 'c' },
			{ date: addDays(weekStart, -2), mealType: 'dinner', recipeId: 'gone' }
		]
	});

	it('is computed once per input', () => {
		expect(prepared(input)).toBe(prepared(input));
	});

	it('holds the recent and known recipes, and the past meals that can still weigh (catalogue recipes, within the recency span)', () => {
		const p = prepared(input);
		expect([...p.recentIds].sort()).toEqual(['b', 'gone']);
		expect([...p.knownIds].sort()).toEqual(['a', 'b', 'gone']);
		expect(p.cookedCount).toBe(4);
		expect(p.past.map((m) => m.recipe.id)).toEqual(['a', 'b']);
		expect(p.byId.get('a')?.id).toBe('a');
	});
});

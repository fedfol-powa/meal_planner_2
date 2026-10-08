import { describe, expect, it } from 'vitest';
import { weekMetrics } from './metrics.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { PlannedWeek } from './types.ts';

describe('out of season', () => {
	it('counts meals whose recipe is not in season on that date', () => {
		const summer = recipe('summer', { seasons: ['summer'] });
		const autumn = recipe('autumn', { seasons: ['autumn', 'winter'] });
		const always = recipe('always');
		const input = baseInput({ recipes: [summer, autumn, always] });
		const week: PlannedWeek = {
			weekStart: '2026-10-12',
			slots: [
				{ date: '2026-10-12', mealType: 'lunch', servings: 2, content: { kind: 'recipe', recipeId: 'summer' } },
				{ date: '2026-10-12', mealType: 'dinner', servings: 2, content: { kind: 'recipe', recipeId: 'autumn' } },
				{ date: '2026-10-13', mealType: 'lunch', servings: 3, content: { kind: 'recipe', recipeId: 'always' } }
			]
		};
		expect(weekMetrics(week, input).outOfSeason).toBe(1);
	});
});

describe('weekMetrics', () => {
	it('counts groups, known recipes, empty slots and close similar pairs across weeks', () => {
		const salmon = recipe('salmon', { proteinGroup: 'fish', primaryIngredientId: 'salmone' });
		const trout = recipe('trout', { proteinGroup: 'fish' });
		const input = baseInput({ recipes: [salmon, trout], history: [{ date: '2026-10-11', mealType: 'dinner', recipeId: 'trout' }] });
		const week: PlannedWeek = {
			weekStart: '2026-10-12',
			slots: [
				{ date: '2026-10-12', mealType: 'lunch', servings: 2, content: { kind: 'recipe', recipeId: 'salmon' } },
				{ date: '2026-10-12', mealType: 'dinner', servings: 2, content: { kind: 'no_match' } }
			]
		};
		const metrics = weekMetrics(week, input);
		expect(metrics.groupCounts.fish).toBe(1);
		expect(metrics.noMatch).toBe(1);
		expect(metrics.known).toBe(0);
		expect(metrics.fresh).toBe(1);
		expect(metrics.knownNewApplies).toBe(false);
		expect(metrics.closePairs).toEqual([
			{
				first: { date: '2026-10-11', mealType: 'dinner', recipeId: 'trout' },
				second: { date: '2026-10-12', mealType: 'lunch', recipeId: 'salmon' },
				distance: 1,
				shared: ['protein']
			}
		]);
	});
});

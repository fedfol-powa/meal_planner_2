import { describe, expect, it } from 'vitest';
import { candidatesFor, hardViolations, slotRefOf } from './constraints.ts';
import { generateWeek } from './generate.ts';
import { rankSuggestions } from './suggest.ts';
import { baseInput, recipe } from './test-fixtures.ts';

const monday = '2026-10-12';
const slot = { date: '2026-10-14', mealType: 'lunch' as const };

describe('rankSuggestions', () => {
	it('gives the generation candidates of the slot, without the current recipe and the other meals of the week', () => {
		const input = baseInput({ weekStart: monday });
		const ranked = rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'dinner', recipeId: 'r01' }], 'r02');
		const expected = candidatesFor(slotRefOf(slot, input.settings), input, [input.recipes.find((r) => r.id === 'r01')!], new Set(['r02'])).map((r) => r.id);
		expect([...ranked].sort()).toEqual([...expected].sort());
		expect(ranked).not.toContain('r02');
		expect(ranked).not.toContain('r01');
	});

	it('falls back to low-rated alternatives when the current recipe was the only liked one', () => {
		const recipes = [recipe('liked'), recipe('low1'), recipe('low2')];
		const input = baseInput({ weekStart: monday, recipes, familyScores: { liked: 5, low1: 2, low2: 1 } });
		expect(rankSuggestions(input, slot, [], 'liked').sort()).toEqual(['low1', 'low2']);
	});

	it('counts an archived recipe already in the week against a weekly maximum', () => {
		const salmon = [{ ingredientId: 'salmon', isOptional: false }];
		const input = baseInput({
			weekStart: monday,
			recipes: [recipe('salmon-new', { ingredients: salmon }), recipe('plain')],
			fixedRecipes: [recipe('salmon-archived', { ingredients: salmon })],
			restrictions: [{ ingredientId: 'salmon', restriction: 'limit', weeklyMax: 1 }]
		});
		expect(rankSuggestions(input, slot, [{ date: '2026-10-13', mealType: 'lunch', recipeId: 'salmon-archived' }], null)).toEqual(['plain']);
	});

	it('drops excluded recipes and respects the time limit of the slot', () => {
		const input = baseInput({ weekStart: monday, exclusions: ['r03'] });
		const ranked = rankSuggestions(input, { date: monday, mealType: 'dinner' }, [], null); // 20-minute limit
		expect(ranked).not.toContain('r03');
		for (const id of ranked) expect(input.recipes.find((r) => r.id === id)!.durationMinutes).toBeLessThanOrEqual(20);
	});

	it('orders by score, then id, the same every time', () => {
		const make = () => baseInput({ weekStart: monday, familyScores: { r05: 5 } });
		const first = rankSuggestions(make(), slot, [], null);
		expect(rankSuggestions(make(), slot, [], null)).toEqual(first);
		expect(first[0]).toBe('r05');
	});
});

describe('generation with fixed recipes', () => {
	it('stays valid and never plans a fixed recipe', () => {
		const input = baseInput({ weekStart: monday, fixedRecipes: [recipe('archived-1')], history: [{ date: '2026-10-08', mealType: 'dinner', recipeId: 'archived-1' }] });
		const week = generateWeek(input);
		expect(hardViolations(week, input)).toEqual([]);
		expect(week.slots.some((s) => s.content.kind === 'recipe' && s.content.recipeId === 'archived-1')).toBe(false);
	});
});

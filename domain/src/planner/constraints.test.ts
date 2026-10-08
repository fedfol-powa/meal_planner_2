import { describe, expect, it } from 'vitest';
import { candidatesFor, fitsSlot, hardViolations, isAvailable, recentlyUsed, withinLimits } from './constraints.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { MealRule, PlannedWeek } from './types.ts';

const rules: MealRule[] = [
	{ kind: 'only_lunch', dish: 'pasta' },
	{ kind: 'never_on', group: 'fish', weekday: 0 }
];

describe('fitsSlot', () => {
	it('respects the time limit and excludes recipes without a duration', () => {
		const slot = { date: '2026-10-12', mealType: 'dinner' as const, maxMinutes: 20 };
		expect(fitsSlot(recipe('a', { durationMinutes: 20 }), slot, [])).toBe(true);
		expect(fitsSlot(recipe('b', { durationMinutes: 25 }), slot, [])).toBe(false);
		expect(fitsSlot(recipe('c', { durationMinutes: null }), slot, [])).toBe(false);
		expect(fitsSlot(recipe('d', { durationMinutes: null }), { ...slot, maxMinutes: null }, [])).toBe(true);
	});
	it('respects the meal type', () => {
		expect(fitsSlot(recipe('a', { mealType: 'lunch' }), { date: '2026-10-13', mealType: 'dinner', maxMinutes: null }, [])).toBe(false);
	});
	it('applies pasta only at lunch and never fish on Monday', () => {
		const pasta = recipe('p', { carbohydrateGroup: 'pasta' });
		const fish = recipe('f', { proteinGroup: 'fish' });
		expect(fitsSlot(pasta, { date: '2026-10-13', mealType: 'dinner', maxMinutes: null }, rules)).toBe(false);
		expect(fitsSlot(pasta, { date: '2026-10-13', mealType: 'lunch', maxMinutes: null }, rules)).toBe(true);
		expect(fitsSlot(fish, { date: '2026-10-12', mealType: 'lunch', maxMinutes: null }, rules)).toBe(false);
		expect(fitsSlot(fish, { date: '2026-10-13', mealType: 'lunch', maxMinutes: null }, rules)).toBe(true);
	});
});

describe('fresh fish', () => {
	it('keeps fishmonger fish off the day of the rule, canned fish allowed', () => {
		const fresh = recipe('orata', { proteinGroup: 'fish', isFreshFish: true });
		const canned = recipe('tonno', { proteinGroup: 'fish', isFreshFish: false });
		const monday = { date: '2026-10-12', mealType: 'lunch' as const, maxMinutes: null };
		const rule: MealRule[] = [{ kind: 'never_fresh_fish', weekday: 0 }];
		expect(fitsSlot(fresh, monday, rule)).toBe(false);
		expect(fitsSlot(canned, monday, rule)).toBe(true);
		expect(fitsSlot(fresh, { ...monday, date: '2026-10-13' }, rule)).toBe(true);
	});
});

describe('isAvailable', () => {
	it('drops exclusions, books not owned and avoided ingredients that are not optional', () => {
		const input = baseInput({ exclusions: ['x'], ownedBookIds: ['owned'], restrictions: [{ ingredientId: 'peperoncino', restriction: 'avoid', weeklyMax: null }] });
		expect(isAvailable(recipe('x'), input)).toBe(false);
		expect(isAvailable(recipe('b', { bookId: 'other' }), input)).toBe(false);
		expect(isAvailable(recipe('c', { bookId: 'owned' }), input)).toBe(true);
		expect(isAvailable(recipe('d', { ingredients: [{ ingredientId: 'peperoncino', isOptional: false }] }), input)).toBe(false);
		expect(isAvailable(recipe('e', { ingredients: [{ ingredientId: 'peperoncino', isOptional: true }] }), input)).toBe(true);
	});
});

describe('recentlyUsed', () => {
	it('looks at the 14 days before the week, across the week boundary', () => {
		const history = [{ date: '2026-09-28', mealType: 'lunch' as const, recipeId: 'old' }, { date: '2026-10-11', mealType: 'dinner' as const, recipeId: 'sunday' }];
		expect(recentlyUsed('sunday', '2026-10-12', history)).toBe(true);
		expect(recentlyUsed('old', '2026-10-12', history)).toBe(true);
		expect(recentlyUsed('old', '2026-10-19', history)).toBe(false);
	});
});

describe('withinLimits', () => {
	it('stops a limited ingredient at its weekly maximum', () => {
		const limited = [{ ingredientId: 'cetrioli', restriction: 'limit' as const, weeklyMax: 1 }];
		const withCucumber = recipe('a', { ingredients: [{ ingredientId: 'cetrioli', isOptional: false }] });
		expect(withinLimits(withCucumber, [], limited)).toBe(true);
		expect(withinLimits(withCucumber, [recipe('b', { ingredients: [{ ingredientId: 'cetrioli', isOptional: false }] })], limited)).toBe(false);
		expect(withinLimits(recipe('c'), [withCucumber], limited)).toBe(true);
	});
});

describe('candidatesFor', () => {
	const slot = { date: '2026-10-13', mealType: 'lunch' as const, maxMinutes: null };
	it('excludes recipes already in the week', () => {
		const input = baseInput({ recipes: [recipe('a'), recipe('b')] });
		expect(candidatesFor(slot, input, [recipe('a')]).map((r) => r.id)).toEqual(['b']);
	});
	it('drops low-rated recipes when others exist, and keeps them when nothing else fits', () => {
		const scored = baseInput({ recipes: [recipe('low'), recipe('good')], familyScores: { low: 2, good: 4 } });
		expect(candidatesFor(slot, scored, []).map((r) => r.id)).toEqual(['good']);
		const onlyLow = baseInput({ recipes: [recipe('low'), recipe('lower')], familyScores: { low: 2, lower: 1 } });
		expect(candidatesFor(slot, onlyLow, []).map((r) => r.id)).toEqual(['low', 'lower']);
	});
});

describe('hardViolations', () => {
	it('reports missing slots, changed fixed meals and invalid recipes', () => {
		const input = baseInput({ recipes: [recipe('long', { durationMinutes: 40 })] });
		const week: PlannedWeek = {
			weekStart: '2026-10-12',
			slots: [
				{ date: '2026-10-12', mealType: 'dinner', servings: 2, content: { kind: 'recipe', recipeId: 'long' } },
				{ date: '2026-10-18', mealType: 'lunch', servings: 4, content: { kind: 'no_match' } }
			]
		};
		const problems = hardViolations(week, input);
		expect(problems).toContain('2026-10-12 dinner: does not fit the slot');
		expect(problems).toContain('2026-10-18 lunch: fixed meal changed');
		expect(problems).toContain('2026-10-12 lunch: missing');
	});
});

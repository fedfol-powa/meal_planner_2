import { describe, expect, it } from 'vitest';
import { addDays } from './calendar.ts';
import { hardViolations } from './constraints.ts';
import { fillWeek, generateWeek } from './generate.ts';
import { repairWeek } from './repair.ts';
import { baseInput, recipe, syntheticCatalogue } from './test-fixtures.ts';
import type { PastMeal } from './types.ts';

const recipeIds = (week: ReturnType<typeof generateWeek>) => week.slots.map((s) => (s.content.kind === 'recipe' ? s.content.recipeId : s.content.kind));

describe('generateWeek', () => {
	it('fills the 12 planned meals, keeps the fixed ones and breaks no hard constraint', () => {
		const input = baseInput();
		const week = generateWeek(input);
		expect(week.slots).toHaveLength(14);
		expect(week.slots.filter((s) => s.content.kind === 'recipe')).toHaveLength(12);
		expect(week.slots.find((s) => s.date === '2026-10-18' && s.mealType === 'lunch')?.content).toEqual({ kind: 'free', text: 'Pizza' });
		expect(hardViolations(week, input)).toEqual([]);
	});

	it('gives the same week for the same input and a different one for another week', () => {
		const input = baseInput();
		expect(generateWeek(input)).toEqual(generateWeek(baseInput()));
		expect(recipeIds(generateWeek(baseInput({ weekStart: '2026-10-19' })))).not.toEqual(recipeIds(generateWeek(input)));
	});

	it('is the greedy fill followed by the repair', () => {
		const input = baseInput();
		expect(generateWeek(input)).toEqual(repairWeek(fillWeek(input), input));
	});

	it('marks slots without candidates instead of failing', () => {
		const input = baseInput({ recipes: [recipe('a'), recipe('b'), recipe('c')] });
		const week = generateWeek(input);
		expect(week.slots.filter((s) => s.content.kind === 'recipe')).toHaveLength(3);
		expect(week.slots.filter((s) => s.content.kind === 'no_match')).toHaveLength(9);
		expect(hardViolations(week, input)).toEqual([]);
	});

	it('uses low-rated recipes when nothing else fits', () => {
		const catalogue = syntheticCatalogue();
		const input = baseInput({ familyScores: Object.fromEntries(catalogue.map((r) => [r.id, 1])) });
		expect(generateWeek(input).slots.filter((s) => s.content.kind === 'no_match')).toHaveLength(0);
	});
});

describe('properties over many seeds', () => {
	it('never breaks a hard constraint, across 300 family and week combinations', () => {
		for (let i = 0; i < 300; i++) {
			const input = baseInput({ familyId: `family-${i}`, weekStart: addDays('2026-01-05', 7 * (i % 40)) });
			const week = generateWeek(input);
			expect(hardViolations(week, input)).toEqual([]);
			for (const slot of week.slots) expect(['recipe', 'free', 'no_match']).toContain(slot.content.kind);
		}
	});

	it('respects the last two weeks when weeks follow one another', () => {
		let history: PastMeal[] = [];
		for (let i = 0; i < 10; i++) {
			const input = baseInput({ weekStart: addDays('2026-10-12', 7 * i), history });
			const week = generateWeek(input);
			expect(hardViolations(week, input)).toEqual([]);
			history = [...history, ...week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []))];
		}
	});
});

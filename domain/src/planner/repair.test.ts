import { describe, expect, it } from 'vitest';
import { addDays } from './calendar.ts';
import { hardViolations } from './constraints.ts';
import { repairWeek, weekRuleProblems } from './repair.ts';
import { baseInput, recipe } from './test-fixtures.ts';
import type { PlannedWeek, PlannerInput } from './types.ts';

/** Fills the planned slots in order with the given recipe ids (fixed meals stay free). */
function weekWith(input: PlannerInput, ids: string[]): PlannedWeek {
	const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
	const slots: PlannedWeek['slots'] = [];
	let next = 0;
	days.forEach((date, day) => {
		for (const mealType of ['lunch', 'dinner'] as const) {
			const setting = input.settings.slots[mealType][day];
			if (setting.servings === 0) continue;
			const content = setting.fixedText !== null ? { kind: 'free' as const, text: setting.fixedText } : { kind: 'recipe' as const, recipeId: ids[next++] };
			slots.push({ date, mealType, servings: setting.servings, content });
		}
	});
	return { weekStart: '2026-10-12', slots };
}

const veg = (n: number) => Array.from({ length: n }, (_, i) => recipe(`v${i}`, { proteinGroup: 'vegetarian' }));

describe('weekRuleProblems', () => {
	it('reports Friday without fish and groups below their minimum', () => {
		const input = baseInput({ recipes: veg(12) });
		const problems = weekRuleProblems(weekWith(input, veg(12).map((r) => r.id)), input);
		expect(problems.some((p) => p.kind === 'rule')).toBe(true);
		expect(problems.find((p) => p.kind === 'group_below' && p.detail === 'fish')?.amount).toBe(2);
	});
});

describe('known/new quota', () => {
	it('counts recipes not cooked for longer than the window as new', () => {
		const recipes = veg(12);
		const longAgo = recipes.map((r, i) => ({ date: addDays('2026-06-01', i), mealType: 'lunch' as const, recipeId: r.id }));
		const input = baseInput({ recipes, history: longAgo });
		const problem = weekRuleProblems(weekWith(input, recipes.map((r) => r.id)), input).find((p) => p.kind === 'known_new');
		expect(problem).toEqual({ kind: 'known_new', detail: '0 known', amount: 6 });
	});
});

describe('repairWeek', () => {
	it('brings fish to Friday without breaking hard constraints', () => {
		const recipes = [...veg(12), recipe('fish1', { proteinGroup: 'fish' }), recipe('fish2', { proteinGroup: 'fish' })];
		const input = baseInput({ recipes });
		const repaired = repairWeek(weekWith(input, veg(12).map((r) => r.id)), input);
		expect(weekRuleProblems(repaired, input).some((p) => p.kind === 'rule')).toBe(false);
		expect(hardViolations(repaired, input)).toEqual([]);
	});

	it('among equal fixes, keeps Friday fish away from Thursday dinner fish', () => {
		const recipes = [...veg(11), recipe('fish1', { proteinGroup: 'fish' }), recipe('fish2', { proteinGroup: 'fish' })];
		const input = baseInput({ recipes });
		const ids = veg(11).map((r) => r.id);
		ids.splice(7, 0, 'fish1'); // eighth planned meal: Thursday dinner
		const repaired = repairWeek(weekWith(input, ids), input);
		const fridayLunch = repaired.slots.find((s) => s.date === '2026-10-16' && s.mealType === 'lunch')!;
		const fridayDinner = repaired.slots.find((s) => s.date === '2026-10-16' && s.mealType === 'dinner')!;
		expect(fridayLunch.content).not.toEqual({ kind: 'recipe', recipeId: 'fish2' });
		expect(fridayDinner.content).toEqual({ kind: 'recipe', recipeId: 'fish2' });
		expect(hardViolations(repaired, input)).toEqual([]);
	});

	it('among equal fixes, prefers the recipe in season', () => {
		const recipes = [...veg(12), recipe('fishSummer', { proteinGroup: 'fish', seasons: ['summer'] }), recipe('fishAnytime', { proteinGroup: 'fish' })];
		const input = baseInput({ recipes });
		input.settings.groupRanges.fish = { min: 0, max: 3 }; // only the Friday rule asks for one fish
		const repaired = repairWeek(weekWith(input, veg(12).map((r) => r.id)), input);
		const used = repaired.slots.flatMap((s) => (s.content.kind === 'recipe' ? [s.content.recipeId] : []));
		expect(used).toContain('fishAnytime');
		expect(used).not.toContain('fishSummer');
		expect(hardViolations(repaired, input)).toEqual([]);
	});

	it('stops when nothing can fix the week', () => {
		const input = baseInput({ recipes: veg(12) });
		const week = weekWith(input, veg(12).map((r) => r.id));
		const repaired = repairWeek(week, input);
		expect(hardViolations(repaired, input)).toEqual([]);
		expect(weekRuleProblems(repaired, input).length).toBeGreaterThan(0);
	});
});

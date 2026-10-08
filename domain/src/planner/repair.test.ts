import { describe, expect, it } from 'vitest';
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

describe('repairWeek', () => {
	it('brings fish to Friday without breaking hard constraints', () => {
		const recipes = [...veg(12), recipe('fish1', { proteinGroup: 'fish' }), recipe('fish2', { proteinGroup: 'fish' })];
		const input = baseInput({ recipes });
		const repaired = repairWeek(weekWith(input, veg(12).map((r) => r.id)), input);
		expect(weekRuleProblems(repaired, input).some((p) => p.kind === 'rule')).toBe(false);
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

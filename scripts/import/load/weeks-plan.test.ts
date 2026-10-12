import { describe, expect, it } from 'vitest';
import { curatorFamilySettings } from '../../planner-data/family.ts';
import { parseOriginMenu } from './menus.ts';
import { plannedWeeks } from './weeks-plan.ts';

const MENU = `
settimana: {inizio: 2026-10-12, fine: 2026-10-18}
giorni:
  - giorno: lun
    data: 2026-10-12
    pranzo: {ricetta: fusilli-ricotta, porzioni: 2, note: "x2"}
    cena: {ricetta: piadine, porzioni: 2}
  - giorno: dom
    data: 2026-10-18
    pranzo: {libero: Pizza da asporto}
`;

describe('plannedWeeks', () => {
	const settings = curatorFamilySettings();
	const menus = [parseOriginMenu(MENU)];

	it('turns a not concluded menu into a current week, free text with the settings servings', () => {
		const plan = plannedWeeks({ meals: [], menus, settings, today: '2026-10-13' });
		expect(plan.weeks).toHaveLength(1);
		expect(plan.weeks[0]).toMatchObject({ weekStart: '2026-10-12', source: 'current' });
		expect(plan.weeks[0]!.slots.find((s) => s.freeText)).toEqual({ date: '2026-10-18', mealType: 'lunch', originSlug: null, freeText: 'Pizza da asporto', servings: 4 });
		expect(plan.notes).toEqual([{ date: '2026-10-12', mealType: 'lunch', note: 'x2' }]);
	});
	it('ignores a menu of a concluded week: history comes from the recipe book', () => {
		expect(plannedWeeks({ meals: [], menus, settings, today: '2026-10-19' }).weeks).toEqual([]);
	});
	it('takes servings of history from the menu of that week, else from the settings', () => {
		const meals = [
			{ date: '2026-10-12', mealType: 'lunch' as const, originSlug: 'fusilli-ricotta' },
			{ date: '2026-10-13', mealType: 'dinner' as const, originSlug: 'other' },
		];
		expect(plannedWeeks({ meals, menus, settings, today: '2026-10-19' }).weeks[0]!.slots).toEqual([
			{ date: '2026-10-12', mealType: 'lunch', originSlug: 'fusilli-ricotta', freeText: null, servings: 2 },
			{ date: '2026-10-13', mealType: 'dinner', originSlug: 'other', freeText: null, servings: 4 }, // Tuesday dinner: 4
		]);
	});
	it('lets the current menu win over history in the same week', () => {
		const meals = [{ date: '2026-10-12', mealType: 'lunch' as const, originSlug: 'fusilli-ricotta' }];
		const plan = plannedWeeks({ meals, menus, settings, today: '2026-10-13' });
		expect(plan.weeks).toHaveLength(1);
		expect(plan.weeks[0]!.source).toBe('current');
	});
	it('keeps the first recipe by slug when two share a meal, and hands the other over as tried', () => {
		const meals = [
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'b' },
			{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'a' },
		];
		const plan = plannedWeeks({ meals, menus: [], settings, today: '2026-10-13' });
		expect(plan.weeks[0]!.slots.map((s) => s.originSlug)).toEqual(['a']);
		expect(plan.duplicates).toEqual([{ date: '2026-09-01', mealType: 'lunch', originSlug: 'b' }]);
	});
});

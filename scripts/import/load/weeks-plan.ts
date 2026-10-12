import { addDays, type IsoDate, type MealType, type PlannerSettings } from '../../../domain/src/planner/index.ts';
import type { FamilyData } from '../family.ts';
import type { OriginMenu } from './menus.ts';

// Weeks the load writes (detail spec, section 6): history from buildFamilyData (R4 unchanged) and the
// "menu in corso" from the origin menus of weeks not concluded at the import date. The current menu
// wins over history in its week; servings come from the week's menu, else from the settings. Two
// recipes in one past meal: the first by slug takes the meal, the other becomes a tried recipe.
export interface PlannedSlot { date: IsoDate; mealType: MealType; originSlug: string | null; freeText: string | null; servings: number }
export interface PlannedWeek { weekStart: IsoDate; source: 'history' | 'current'; slots: PlannedSlot[] }
export interface WeeksPlan {
	weeks: PlannedWeek[];
	duplicates: { date: IsoDate; mealType: MealType; originSlug: string }[];
	notes: { date: IsoDate; mealType: MealType; note: string }[];
}

const weekdayIndex = (date: IsoDate) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const mondayOf = (date: IsoDate) => addDays(date, -weekdayIndex(date));
const settingsServings = (s: PlannerSettings, date: IsoDate, mealType: MealType) => s.slots[mealType][weekdayIndex(date)]!.servings;

export function plannedWeeks(args: { meals: FamilyData['meals']; menus: OriginMenu[]; settings: PlannerSettings; today: IsoDate }): WeeksPlan {
	const { settings, today } = args;
	const current = args.menus.filter((m) => addDays(m.weekStart, 6) >= today);
	const currentStarts = new Set(current.map((m) => m.weekStart));
	const menuByWeek = new Map(args.menus.map((m) => [m.weekStart, m]));
	const weeks = new Map<IsoDate, PlannedWeek>();
	const duplicates: WeeksPlan['duplicates'] = [];
	const notes: WeeksPlan['notes'] = [];

	for (const menu of current) {
		weeks.set(menu.weekStart, {
			weekStart: menu.weekStart, source: 'current',
			slots: menu.slots.map((s) => {
				if (s.note) notes.push({ date: s.date, mealType: s.mealType, note: s.note });
				return { date: s.date, mealType: s.mealType, originSlug: s.originSlug, freeText: s.freeText, servings: s.servings ?? settingsServings(settings, s.date, s.mealType) };
			}),
		});
	}
	const sorted = [...args.meals].sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType) || a.originSlug.localeCompare(b.originSlug));
	for (const meal of sorted) {
		const weekStart = mondayOf(meal.date);
		if (currentStarts.has(weekStart)) continue;
		const week = weeks.get(weekStart) ?? { weekStart, source: 'history' as const, slots: [] };
		weeks.set(weekStart, week);
		if (week.slots.some((s) => s.date === meal.date && s.mealType === meal.mealType)) {
			duplicates.push(meal);
			continue;
		}
		const fromMenu = menuByWeek.get(weekStart)?.slots.find((s) => s.date === meal.date && s.mealType === meal.mealType && s.originSlug === meal.originSlug);
		week.slots.push({ ...meal, freeText: null, servings: fromMenu?.servings ?? settingsServings(settings, meal.date, meal.mealType) });
	}
	return { weeks: [...weeks.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)), duplicates, notes };
}

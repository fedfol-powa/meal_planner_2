import { addDays, type IsoDate, type MealType } from '../../domain/src/planner/index.ts';
import { familyScoresOf, type OriginRecipe } from '../planner-data/origin.ts';

// Data of the curator's family from the origin (spec section 8), with the R4 rules of 11 October 2026.
// triedUndated goes to W2's family_tried_recipes (source 'import'); the planner does not use it yet.

export interface FamilyData {
	ratings: { originSlug: string; stars: number }[];
	meals: { date: IsoDate; mealType: MealType; originSlug: string }[];
	/** Tried in the origin ("collaudata") with no meal imported: no meal is invented (R4a). */
	triedUndated: string[];
}
export type HistoryFindingKind = 'not_cooked' | 'outcome_not_recorded' | 'week_not_concluded' | 'unrecognised_slot' | 'invalid_week';
export interface HistoryFinding {
	kind: HistoryFindingKind;
	originSlug: string;
	week: string;
	slot: string;
}

const DAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const MEALS: Record<string, MealType> = { pranzo: 'lunch', cena: 'dinner' };

/** An existing calendar date written YYYY-MM-DD: 2026-02-30 is not normalised to March. */
export function isValidIsoDate(text: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
	const [year, month, day] = text.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const isMonday = (date: IsoDate) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

export function buildFamilyData(recipes: OriginRecipe[], importDate: IsoDate): { family: FamilyData; findings: HistoryFinding[] } {
	if (!isValidIsoDate(importDate)) throw new Error(`Invalid import date: ${importDate}`);
	const meals: FamilyData['meals'] = [];
	const findings: HistoryFinding[] = [];
	for (const recipe of recipes) {
		for (const entry of recipe.storico ?? []) {
			const week = String(entry.settimana);
			const report = (kind: HistoryFindingKind) => findings.push({ kind, originSlug: recipe.id, week, slot: entry.pasto });
			if (!isValidIsoDate(week) || !isMonday(week)) {
				report('invalid_week');
				continue;
			}
			const [day, meal, ...extra] = entry.pasto.split('-');
			const dayIndex = DAYS.indexOf(day);
			if (dayIndex < 0 || !MEALS[meal] || extra.length) {
				report('unrecognised_slot');
				continue;
			}
			if (entry.cucinata === false) {
				report('not_cooked');
				continue;
			}
			if (entry.cucinata === null) {
				if (addDays(week, 6) >= importDate) {
					report('week_not_concluded');
					continue;
				}
				report('outcome_not_recorded');
			}
			meals.push({ date: addDays(week, dayIndex), mealType: MEALS[meal], originSlug: recipe.id });
		}
	}
	meals.sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType) || a.originSlug.localeCompare(b.originSlug));
	const withMeals = new Set(meals.map((m) => m.originSlug));
	const ratings = Object.entries(familyScoresOf(recipes)).map(([originSlug, stars]) => ({ originSlug, stars }));
	const triedUndated = recipes.filter((r) => r.collaudata && !withMeals.has(r.id)).map((r) => r.id);
	return { family: { ratings, meals, triedUndated }, findings };
}

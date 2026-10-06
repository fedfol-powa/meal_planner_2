import type { IsoDate, LocalDateTime, MealType, Week } from './types';

/** True for a real YYYY-MM-DD calendar date; used to validate dates coming from URLs. */
export function isIsoDate(value: string | null | undefined): value is IsoDate {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export function mondayOf(date: IsoDate): IsoDate {
	const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
	return addDays(date, -weekday);
}

export function weekDates(startsOn: IsoDate): IsoDate[] {
	return Array.from({ length: 7 }, (_, i) => addDays(startsOn, i));
}

/** Confirmed 2026-10-06 (spec section 5), family local time. Decides "cooked" defaults only, never blocks edits. */
export const MEAL_PAST_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
	return now >= `${date}T${MEAL_PAST_AT[mealType]}`;
}

export function isWeekVisible(week: Pick<Week, 'generatedAt'>, now: LocalDateTime): boolean {
	return week.generatedAt <= now;
}

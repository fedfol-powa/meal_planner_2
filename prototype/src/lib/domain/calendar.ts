import type { IsoDate, LocalDateTime, MealType, Week, WeekStatus } from './types';

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

/** Confirmed 2026-10-06 (spec section 5), family local time. */
export const MEAL_PAST_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
	return now >= `${date}T${MEAL_PAST_AT[mealType]}`;
}

/** The Wednesday job after the week closes it (spec section 4); simulated by the clock. */
export function automaticCloseAt(startsOn: IsoDate): LocalDateTime {
	return `${addDays(startsOn, 9)}T20:00`;
}

export function weekStatus(week: Pick<Week, 'startsOn' | 'closedAt'>, now: LocalDateTime): WeekStatus {
	if (week.closedAt !== null && week.closedAt <= now) return 'closed';
	if (now >= automaticCloseAt(week.startsOn)) return 'closed';
	const today = now.slice(0, 10);
	if (today < week.startsOn) return 'draft';
	if (today <= addDays(week.startsOn, 6)) return 'in_progress';
	return 'pending_close';
}

export function isWeekVisible(week: Pick<Week, 'generatedAt'>, now: LocalDateTime): boolean {
	return week.generatedAt <= now;
}

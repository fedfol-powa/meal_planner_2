import { addDays, weekdayOf } from './calendar.ts';
import type { IsoDate, MealType, PlannerSlotRef } from './types.ts';

/** Wall-clock date and time of a family, HH:mm in 24 hours. */
export interface LocalDateTime {
	date: IsoDate;
	time: string;
}

/** When a meal becomes past, in the family's local time (spec section 5). */
export const MEAL_PASSES_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };
/** The weekly job generates next week from this local time on Wednesday (spec section 4). */
export const GENERATION_TIME = '20:00';
/** Twelve hours after Wednesday 20:00: Thursday 08:00. */
export const OVERDUE_TIME = '08:00';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		// Throws RangeError for an unknown time zone.
		formatter = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			calendar: 'gregory',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

export function localDateTime(instant: Date, timeZone: string): LocalDateTime {
	const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const isAtOrAfter = (now: LocalDateTime, date: IsoDate, time: string) => now.date > date || (now.date === date && now.time >= time);

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
	return isAtOrAfter(now, date, MEAL_PASSES_AT[mealType]);
}

export function firstOpenMeal(now: LocalDateTime): PlannerSlotRef {
	if (!isMealPast(now.date, 'lunch', now)) return { date: now.date, mealType: 'lunch' };
	if (!isMealPast(now.date, 'dinner', now)) return { date: now.date, mealType: 'dinner' };
	return { date: addDays(now.date, 1), mealType: 'lunch' };
}

export function mondayOf(date: IsoDate): IsoDate {
	return addDays(date, -weekdayOf(date));
}

export function nextWeekStart(now: LocalDateTime): IsoDate {
	return addDays(mondayOf(now.date), 7);
}

export function isNextWeekDue(now: LocalDateTime): boolean {
	return isAtOrAfter(now, addDays(mondayOf(now.date), 2), GENERATION_TIME);
}

/** Overdue from the Thursday 08:00 before the job's week: 12 hours after its Wednesday 20:00. */
export function isJobOverdue(now: LocalDateTime, targetWeek: IsoDate): boolean {
	return isAtOrAfter(now, addDays(targetWeek, -4), OVERDUE_TIME);
}

export interface GenerationTarget {
	weekStart: IsoDate;
	from?: PlannerSlotRef;
}

/** A week not started is generated whole, a started one from its open meals; a finished one gives null. */
export function catchUpTarget(now: LocalDateTime, weekStart: IsoDate): GenerationTarget | null {
	if (now.date < weekStart) return { weekStart };
	const from = firstOpenMeal(now);
	return from.date <= addDays(weekStart, 6) ? { weekStart, from } : null;
}

/**
 * The one generation rule (spec section 4): the current week from its first open meal if it
 * is missing, and next week whole if it is missing and Wednesday 20:00 has passed.
 */
export function generationTargets(now: LocalDateTime, existingWeekStarts: readonly IsoDate[]): GenerationTarget[] {
	const targets: GenerationTarget[] = [];
	const current = mondayOf(now.date);
	if (!existingWeekStarts.includes(current)) {
		const target = catchUpTarget(now, current);
		if (target) targets.push(target);
	}
	const next = nextWeekStart(now);
	if (isNextWeekDue(now) && !existingWeekStarts.includes(next)) targets.push({ weekStart: next });
	return targets;
}

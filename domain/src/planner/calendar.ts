import type { IsoDate, MealType, Season } from './types.ts';

const DAY_MS = 86_400_000;
const timeOf = (date: IsoDate) => Date.parse(`${date}T00:00:00Z`);

export function addDays(date: IsoDate, days: number): IsoDate {
	return new Date(timeOf(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
	return Math.round((timeOf(to) - timeOf(from)) / DAY_MS);
}

/** Monday = 0 … Sunday = 6. */
export function weekdayOf(date: IsoDate): number {
	return (new Date(timeOf(date)).getUTCDay() + 6) % 7;
}

export function seasonOf(date: IsoDate): Season {
	const month = Number(date.slice(5, 7));
	if (month >= 3 && month <= 5) return 'spring';
	if (month >= 6 && month <= 8) return 'summer';
	if (month >= 9 && month <= 11) return 'autumn';
	return 'winter';
}

/** Position of a meal on one timeline with two meals a day: the difference is the distance in meals. */
export function mealIndex(date: IsoDate, mealType: MealType): number {
	return daysBetween('2000-01-03', date) * 2 + (mealType === 'dinner' ? 1 : 0);
}

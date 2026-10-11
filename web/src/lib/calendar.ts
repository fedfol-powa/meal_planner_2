// Calendar days are handled as UTC dates so the host time zone never shifts them.
export type IsoDate = string;
export type LocalDateTime = string;
export type MealType = 'lunch' | 'dinner';

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Spec section 5, family local time: a past meal counts as eaten. */
export const MEAL_PAST_AT: Record<MealType, string> = { lunch: '15:30', dinner: '23:00' };

export function isMealPast(date: IsoDate, mealType: MealType, now: LocalDateTime): boolean {
  return now >= `${date}T${MEAL_PAST_AT[mealType]}`;
}

/** Wall-clock time of `at` in the given IANA time zone, as YYYY-MM-DDTHH:mm. */
export function localNow(timeZone: string, at: Date = new Date()): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

import type { IsoDate, Locale, LocalDateTime } from '#lib/domain/types.ts';
import { addDays } from '#lib/domain/calendar.ts';

// Dates are calendar days: format them in UTC so the host time zone never shifts them.
function asUtc(date: IsoDate): Date {
	return new Date(`${date}T00:00:00Z`);
}

export function formatDayShort(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
		.format(asUtc(date))
		.replace('.', '')
		.toLocaleUpperCase(locale);
}

export function formatDayNumber(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatDayLong(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		timeZone: 'UTC'
	}).format(asUtc(date));
}

export function formatDayMonth(locale: Locale, date: IsoDate): string {
	return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatWeekRange(locale: Locale, startsOn: IsoDate): string {
	// Built by hand: Intl formatRange pads days in it-IT ("05–11 ott").
	const end = addDays(startsOn, 6);
	const day = (date: IsoDate) => String(Number(date.slice(8, 10)));
	const month = (date: IsoDate) =>
		new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(asUtc(date)).replace('.', '');
	return startsOn.slice(0, 7) === end.slice(0, 7)
		? `${day(startsOn)}–${day(end)} ${month(end)}`
		: `${day(startsOn)} ${month(startsOn)}–${day(end)} ${month(end)}`;
}

export function formatChangeTime(locale: Locale, at: LocalDateTime): string {
	const [date, time] = at.split('T');
	const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
		asUtc(date)
	);
	return `${weekday} ${time}`;
}

/** "5 ott, 21:40": day, month and time (curation, round 5). */
export function formatDateTime(locale: Locale, at: LocalDateTime): string {
	const [date, time] = at.split('T');
	return `${formatDayMonth(locale, date)}, ${time}`;
}

export function formatAverage(locale: Locale, value: number): string {
	return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
		value
	);
}

/** "6–11 ottobre", "28 settembre – 4 ottobre" or a single "7 ottobre" (shopping list names). */
export function formatDateRange(locale: Locale, from: IsoDate, to: IsoDate): string {
	const day = (date: IsoDate) => String(Number(date.slice(8, 10)));
	const month = (date: IsoDate) => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(asUtc(date));
	if (from === to) return `${day(from)} ${month(from)}`;
	return from.slice(0, 7) === to.slice(0, 7)
		? `${day(from)}–${day(to)} ${month(to)}`
		: `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
}

/** Weekday name, Monday = 0 (family settings, round 4). */
export function formatWeekday(locale: Locale, weekday: number, width: 'long' | 'short' = 'long'): string {
	return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 5 + weekday)));
}

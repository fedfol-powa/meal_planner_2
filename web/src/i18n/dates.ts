import type { IsoDate, LocalDateTime } from '../lib/calendar';
import type { Locale } from './translate';

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
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatDayMonth(locale: Locale, date: IsoDate): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatMonthYear(locale: Locale, date: IsoDate): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(asUtc(date));
}

export function formatChangeTime(locale: Locale, at: LocalDateTime): string {
  const [date = '', time = ''] = at.split('T');
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(asUtc(date));
  return `${weekday} ${time}`;
}

export function formatAverage(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

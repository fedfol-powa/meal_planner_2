import type { Locale } from '../i18n/translate';

// 5 October 2026 is a Monday: weekday 0 of the settings.
const MONDAY = Date.UTC(2026, 9, 5);

/** Name of a weekday of the settings (0 = Monday), in the person's language. */
export function weekdayName(locale: Locale, weekday: number, width: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(new Date(MONDAY + weekday * 86_400_000));
}

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

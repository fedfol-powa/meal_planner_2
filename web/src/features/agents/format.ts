import type { Locale } from '../../i18n/translate';

/** «oggi alle 14:05», else «9 ottobre, 09:30», on the device clock (the instant comes from the server). */
export function formatRenewal(locale: Locale, iso: string, now = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(at);
  if (day.format(at) === day.format(now)) return locale === 'it-IT' ? `oggi alle ${time}` : `today at ${time}`;
  const date = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric', month: 'long' }).format(at);
  return `${date}, ${time}`;
}

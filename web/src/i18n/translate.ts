import { messages, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey } from './messages';
export { LOCALES } from './messages';
export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  const dict = messages[locale];
  let template = dict[key];
  if (template === undefined && typeof params.count === 'number') {
    const category = new Intl.PluralRules(locale).select(params.count);
    template = dict[`${key}.${category}`] ?? dict[`${key}.other`];
  }
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Before sign-in: English if the browser prefers English, Italian otherwise. */
export function initialLocale(languages: readonly string[]): Locale {
  const first = languages[0]?.toLowerCase() ?? '';
  return first.startsWith('en') ? 'en-GB' : 'it-IT';
}

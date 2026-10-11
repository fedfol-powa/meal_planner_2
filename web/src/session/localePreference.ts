import { LOCALES, type Locale } from '../i18n/translate';

/** device: fake mode only. user:<id>: temporary choice of a signed-in person until the profile can be saved. */
export type PreferenceScope = 'device' | `user:${string}`;

export const userScope = (id: string): PreferenceScope => `user:${id}`;
const keyOf = (scope: PreferenceScope) => `locale:${scope}`;

// Storage may be unavailable (private mode): the choice then lasts only for the page.
export function readPreference(scope: PreferenceScope): Locale | null {
  try {
    const value = localStorage.getItem(keyOf(scope));
    return LOCALES.includes(value as Locale) ? (value as Locale) : null;
  } catch {
    return null;
  }
}

export function writePreference(scope: PreferenceScope, locale: Locale): void {
  try {
    localStorage.setItem(keyOf(scope), locale);
  } catch {
    // Not stored; still applied.
  }
}

export function clearPreference(scope: PreferenceScope): void {
  try {
    localStorage.removeItem(keyOf(scope));
  } catch {
    // Nothing stored.
  }
}

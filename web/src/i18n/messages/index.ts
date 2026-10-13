import * as agents from './agents';
import * as auth from './auth';
import * as catalogue from './catalogue';
import * as common from './common';
import * as errors from './errors';
import * as family from './family';
import * as meals from './meals';
import * as menu from './menu';
import * as password from './password';
import * as profile from './profile';
import * as recipes from './recipes';
import * as shopping from './shopping';

// One file per area, so parallel work in wave 2 adds files instead of editing the same one.
const it = { ...common.it, ...menu.it, ...recipes.it, ...profile.it, ...family.it, ...shopping.it, ...catalogue.it, ...meals.it, ...auth.it, ...agents.it, ...errors.it, ...password.it };
const en: Record<keyof typeof it, string> = { ...common.en, ...menu.en, ...recipes.en, ...profile.en, ...family.en, ...shopping.en, ...catalogue.en, ...meals.en, ...auth.en, ...agents.en, ...errors.en, ...password.en };

export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];

type RawKey = keyof typeof it;
type PluralBase<K> = K extends `${infer Base}.other` ? Base : never;
/** Plain keys, plus the base of plural keys (`meal.servings` for `meal.servings.one|other`). */
export type MessageKey = Exclude<RawKey, `${string}.one` | `${string}.other`> | PluralBase<RawKey>;

export const messages: Record<Locale, Record<string, string>> = { 'it-IT': it, 'en-GB': en };

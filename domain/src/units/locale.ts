import { z } from 'zod';

export const LOCALES = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof LOCALES)[number];
/** A text required in both languages (owned here; the recipe document builds its drafts on it). */
export type Localized = Record<Locale, string>;

export const localizedSchema = z.object({
	'it-IT': z.string().trim().min(1),
	'en-GB': z.string().trim().min(1)
});

/** Words of a text as compared in keys: lower case, no accents, punctuation or extra spaces. */
export const plainWords = (text: string): string[] =>
	text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

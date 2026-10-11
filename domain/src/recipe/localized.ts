import * as z from 'zod';
import type { Locale } from '../units/index.ts';

// Complete texts are W4's Localized; a draft may miss either language (decision B, 11 October 2026).

export type DraftTranslated = Partial<Record<Locale, string | null>>;

export const draftTranslatedSchema = z.strictObject({
	'it-IT': z.string().nullable().optional(),
	'en-GB': z.string().nullable().optional()
});

export const filled = (text: string | null | undefined): text is string => !!text && text.trim().length > 0;

/** A text that counts as absent (blank or missing) becomes null, with the same test as the checks. */
export const textOrNull = (text: string | null | undefined): string | null => (filled(text) ? text : null);

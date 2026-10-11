import { VARIETY_FILLER_WORDS, varietyKey } from '../shopping/index.ts';
import type { Locale, Localized } from '../units/index.ts';
import { filled, type DraftTranslated } from './localized.ts';

// Variety of an ingredient on a recipe line (spec section 8): free text, compared through W4's varietyKey.

const PREPARATION = [
	'tritat', 'a dadini', 'a cubetti', 'a fette', 'affettat', 'grattugiat', 'succo', 'scorza', 'schiacciat', 'tagliat', 'a pezzi',
	'sminuzzat', 'frullat', 'spezzettat', 'a julienne', 'a rondelle', 'chopped', 'diced', 'sliced', 'grated', 'juice', 'zest',
	'minced', 'crushed', 'shredded', 'cubed'
];

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Stored as written, only trimmed and with single spaces (proper names keep their capitals). */
export const cleanVariety = (text: string) => text.trim().replace(/\s+/g, ' ');

/** The same ingredient may appear twice in a recipe only with different varieties. */
export const lineKey = (line: { ingredientId: string; variety?: DraftTranslated | null }) =>
	`${line.ingredientId}~${varietyKey(line.variety?.['it-IT'] ?? '')}`;

/**
 * A variety can be compared with others when its identity is known: no variety in any language, or the
 * Italian text. One written only in English is not compared yet (review of 11 October 2026).
 */
export const comparableVariety = (variety: DraftTranslated | null | undefined) =>
	filled(variety?.['it-IT']) || !filled(variety?.['en-GB']);

export type VarietyHint =
	| { kind: 'existing_spelling'; suggestion: Localized }
	| { kind: 'repeats_ingredient'; suggestion: string }
	| { kind: 'preparation' };

/** Advice while writing a variety, never a refusal; known varieties come from the caller. */
export function varietyHints(input: { ingredientName: string; known: Localized[]; text: string; locale: Locale }): VarietyHint[] {
	const hints: VarietyHint[] = [];
	const cleaned = cleanVariety(input.text);
	if (!cleaned) return hints;
	// "Pomodoro tipo Roma" on Pomodori: drop the ingredient name (singular or plural stem) and filler words.
	const stem = plain(input.ingredientName).split(' ')[0]?.replace(/[aeio]$/, '') ?? '';
	const words = cleaned.split(' ');
	let start = stem.length >= 3 && words.length > 1 && plain(words[0]!).startsWith(stem) ? 1 : 0;
	const repeats = start === 1;
	while (start < words.length - 1 && VARIETY_FILLER_WORDS.has(plain(words[start]!))) start++;
	const core = words.slice(start).join(' ');
	const known = input.known.find((k) => varietyKey(k[input.locale]) === varietyKey(core));
	if (repeats) hints.push({ kind: 'repeats_ingredient', suggestion: known ? known[input.locale] : core });
	else if (known && known[input.locale] !== cleaned) hints.push({ kind: 'existing_spelling', suggestion: known });
	if (PREPARATION.some((p) => ` ${plain(cleaned)} `.includes(p))) hints.push({ kind: 'preparation' });
	return hints;
}

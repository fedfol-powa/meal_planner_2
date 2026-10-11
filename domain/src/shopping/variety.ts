import { plainWords } from '../units/locale.ts';

/** Words that do not change the product: "tipo Roma" is "Roma". */
const FILLER = new Set(['tipo', 'varieta', 'var', 'qualita', 'type', 'variety']);

/**
 * Comparison key of a variety, from its Italian text (spec sections 2 and 6): the `variety_key` of
 * checks and of ingredients put back on the list. Empty without a variety.
 */
export function varietyKey(text: string | null | undefined): string {
	return plainWords(text ?? '').filter((word) => !FILLER.has(word)).join(' ');
}

/** Identity of a shopping list item: ingredient and variety. */
export const itemKey = (ingredientId: string, variety: string): string => `${ingredientId}~${variety}`;

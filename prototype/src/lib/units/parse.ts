import type { Quantity, UnitCode } from '../domain/types';

// Italian unit words used by the origin recipe book. Anything else stays as free text.
const UNIT_WORDS: Record<string, UnitCode> = {
	g: 'g',
	kg: 'kg',
	ml: 'ml',
	l: 'l',
	oz: 'oz',
	cucchiaio: 'tbsp',
	cucchiai: 'tbsp',
	cucchiaino: 'tsp',
	cucchiaini: 'tsp',
	spicchio: 'clove',
	spicchi: 'clove',
	fetta: 'slice',
	fette: 'slice',
	pizzico: 'pinch',
	pizzichi: 'pinch'
};

const TO_TASTE = new Set(['q.b.', 'qb', 'a piacere']);

function parseNumber(token: string): number | null {
	if (/^\d+\/\d+$/.test(token)) {
		const [numerator, denominator] = token.split('/').map(Number);
		return denominator > 0 ? numerator / denominator : null;
	}
	if (/^\d+(?:[.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
	return null;
}

export function parseQuantity(raw: string): Quantity {
	const text = raw.trim().toLowerCase();
	if (TO_TASTE.has(text)) return { kind: 'to_taste' };
	const parts = text.split(/\s+/);
	const value = parseNumber(parts[0]);
	if (value === null) return { kind: 'text' };
	if (parts.length === 1) return { kind: 'amount', value, unit: 'piece' };
	const unit = UNIT_WORDS[parts[1]];
	if (!unit) return { kind: 'text' };
	const rest = parts.slice(2);
	if (rest.length > 1 || (rest.length === 1 && rest[0] !== 'circa')) return { kind: 'text' };
	return { kind: 'amount', value, unit };
}

import type { UnitCode } from '../../domain/src/units/index.ts';

// Quantities of the origin recipe book, written in Italian. Anything not clearly an amount stays text
// (ranges and packages are text), so nothing is guessed; notes are reported either way.

export type OriginQuantity = { kind: 'amount'; value: number; unit: UnitCode } | { kind: 'to_taste' } | { kind: 'text' };
export type QuantityNote = 'approximate' | 'bracket_note' | null;

const UNIT_WORDS: Record<string, UnitCode> = {
	g: 'g', kg: 'kg', ml: 'ml', l: 'l', oz: 'oz', cup: 'us_cup', cups: 'us_cup',
	cucchiaio: 'tbsp', cucchiai: 'tbsp', cucchiaino: 'tsp', cucchiaini: 'tsp',
	spicchio: 'clove', spicchi: 'clove', fetta: 'slice', fette: 'slice', pizzico: 'pinch', pizzichi: 'pinch',
	rametto: 'sprig', rametti: 'sprig', mazzetto: 'bunch', mazzetti: 'bunch', foglia: 'leaf', foglie: 'leaf'
};
const TO_TASTE = new Set(['q.b.', 'qb', 'a piacere']);

function parseNumber(token: string): number | null {
	if (/^\d+\/\d+$/.test(token)) {
		const [numerator, denominator] = token.split('/').map(Number);
		return denominator > 0 ? numerator / denominator : null;
	}
	return /^\d+(?:[.,]\d+)?$/.test(token) ? Number(token.replace(',', '.')) : null;
}

export function parseOriginQuantity(raw: string | number): { quantity: OriginQuantity; note: QuantityNote } {
	const lower = String(raw).trim().toLowerCase();
	const withoutBracket = lower.replace(/\s*\([^)]*\)$/, '');
	const bracket: QuantityNote = withoutBracket !== lower ? 'bracket_note' : null;
	const text = { quantity: { kind: 'text' } as OriginQuantity, note: bracket };
	if (TO_TASTE.has(withoutBracket)) return { quantity: { kind: 'to_taste' }, note: bracket };
	const parts = withoutBracket.split(/\s+/);
	const value = parseNumber(parts[0]);
	if (value === null || value <= 0) return text;
	let unit: UnitCode = 'piece';
	let rest = parts.slice(1);
	if (rest.length && UNIT_WORDS[rest[0]]) {
		unit = UNIT_WORDS[rest[0]];
		rest = rest.slice(1);
	}
	let note: QuantityNote = bracket;
	if (rest.length === 1 && rest[0] === 'circa') note ??= 'approximate';
	else if (rest.length) return text;
	return { quantity: { kind: 'amount', value, unit }, note };
}

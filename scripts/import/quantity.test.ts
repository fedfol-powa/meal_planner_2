import { describe, expect, it } from 'vitest';
import { parseOriginQuantity } from './quantity.ts';

const q = (raw: string | number) => parseOriginQuantity(raw);

describe('origin quantities', () => {
	it('reads amounts, fractions, decimals and bare numbers, also as YAML numbers', () => {
		expect(q('300 g')).toEqual({ quantity: { kind: 'amount', value: 300, unit: 'g' }, note: null });
		expect(q('1/2')).toEqual({ quantity: { kind: 'amount', value: 0.5, unit: 'piece' }, note: null });
		expect(q('1,5 kg').quantity).toEqual({ kind: 'amount', value: 1.5, unit: 'kg' });
		expect(q(2).quantity).toEqual({ kind: 'amount', value: 2, unit: 'piece' });
	});
	it('maps Italian unit words', () => {
		expect(q('3 cucchiai').quantity).toEqual({ kind: 'amount', value: 3, unit: 'tbsp' });
		expect(q('1 cucchiaino').quantity).toEqual({ kind: 'amount', value: 1, unit: 'tsp' });
		expect(q('2 spicchi').quantity).toEqual({ kind: 'amount', value: 2, unit: 'clove' });
		expect(q('1 pizzico').quantity).toEqual({ kind: 'amount', value: 1, unit: 'pinch' });
		expect(q('3 rametti').quantity).toEqual({ kind: 'amount', value: 3, unit: 'sprig' });
		expect(q('1 mazzetto').quantity).toEqual({ kind: 'amount', value: 1, unit: 'bunch' });
		expect(q('1 foglia').quantity).toEqual({ kind: 'amount', value: 1, unit: 'leaf' });
		expect(q('8 fette').quantity).toEqual({ kind: 'amount', value: 8, unit: 'slice' });
		expect(q('1/2 cup').quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
	});
	it('keeps notes and approximations as findings, also when falling back to text', () => {
		expect(q('3 cucchiai circa')).toEqual({ quantity: { kind: 'amount', value: 3, unit: 'tbsp' }, note: 'approximate' });
		expect(q('1/2 cup (circa 1/2 cipolla media)')).toEqual({ quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' }, note: 'bracket_note' });
		// Real case of the origin: raw and cooked weights differ, so it stays text and is reported.
		expect(q('145 g crudo (330 g cotto)')).toEqual({ quantity: { kind: 'text' }, note: 'bracket_note' });
	});
	it('never chooses between 1 and 1000: thousands separators and mixed forms stay text and are reported', () => {
		for (const raw of ['1.000 g', '1.500 ml', '2.000', '1.000,5 g', '1,000.5 g'])
			expect(q(raw)).toEqual({ quantity: { kind: 'text' }, note: 'ambiguous_number' });
		expect(q('1,5 kg')).toEqual({ quantity: { kind: 'amount', value: 1.5, unit: 'kg' }, note: null });
		expect(q('62,5 g')).toEqual({ quantity: { kind: 'amount', value: 62.5, unit: 'g' }, note: null });
	});
	it('reads to taste and leaves everything else as text', () => {
		expect(q('q.b.').quantity).toEqual({ kind: 'to_taste' });
		expect(q('a piacere').quantity).toEqual({ kind: 'to_taste' });
		for (const raw of ['1-2 foglie', '1 vaschetta da 250 g', 'un piccolo pezzo', '1 bicchiere', '1 cucchiaino abbondante', 'per servire, facoltativo'])
			expect(q(raw)).toEqual({ quantity: { kind: 'text' }, note: null });
	});
});

import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined, exceeds, formatCombined } from './combine';
import type { Quantity } from '#lib/domain/types.ts';

const amount = (value: number, unit: Extract<Quantity, { kind: 'amount' }>['unit']): Quantity => ({ kind: 'amount', value, unit });
const combine = (...items: [Quantity, string?][]) =>
	items.reduce((c, [q, text]) => addQuantity(c, q, text ?? ''), emptyCombined());

describe('combine quantities', () => {
	it('sums masses across g, kg and oz before rounding', () => {
		const c = combine([amount(320, 'g')], [amount(0.4, 'kg')], [amount(2, 'oz')]);
		expect(c.amounts).toEqual([{ value: 320 + 400 + 2 * 28.349523125, unit: 'g' }]);
		expect(formatCombined(c, 'metric', 'it-IT')).toBe('780 g');
	});

	it('rounds only after the sum', () => {
		// 3 × 13 g would round to 15 g each (45 g); the sum 39 g rounds to 40 g.
		const c = combine([amount(13, 'g')], [amount(13, 'g')], [amount(13, 'g')]);
		expect(formatCombined(c, 'metric', 'it-IT')).toBe('40 g');
	});

	it('shows a kilo or more in kilos and litres', () => {
		expect(formatCombined(combine([amount(800, 'g')], [amount(800, 'g')]), 'metric', 'it-IT')).toBe('1,6 kg');
		expect(formatCombined(combine([amount(1, 'l')], [amount(250, 'ml')]), 'metric', 'en-GB')).toBe('1.3 l');
	});

	it('keeps incompatible units on the same entry', () => {
		const c = combine([amount(100, 'ml')], [amount(50, 'g')], [amount(2, 'piece')]);
		expect(formatCombined(c, 'metric', 'it-IT')).toBe('100 ml + 50 g + 2');
	});

	it('sums counts of the same unit', () => {
		expect(formatCombined(combine([amount(1.5, 'clove')], [amount(3, 'clove')]), 'metric', 'it-IT')).toBe('4½ spicchi');
	});

	it('adds "to taste" once and keeps texts as written', () => {
		const c = combine([{ kind: 'to_taste' }], [amount(50, 'g')], [{ kind: 'to_taste' }], [{ kind: 'text' }, '3 matasse'], [{ kind: 'text' }, '3 matasse']);
		expect(formatCombined(c, 'metric', 'it-IT')).toBe('50 g + 3 matasse + q.b.');
		expect(formatCombined(combine([{ kind: 'to_taste' }]), 'metric', 'en-GB')).toBe('to taste');
	});

	it('presents the sum in UK imperial units', () => {
		expect(formatCombined(combine([amount(400, 'g')], [amount(400, 'g')]), 'uk_imperial', 'en-GB')).toBe('1¾ lb');
		expect(formatCombined(combine([amount(250, 'ml')]), 'uk_imperial', 'en-GB')).toBe('9 fl oz');
	});

	it('tells when a quantity grew since it was ticked', () => {
		const before = combine([amount(200, 'g')], [amount(1, 'piece')]);
		expect(exceeds(combine([amount(300, 'g')], [amount(1, 'piece')]), before)).toBe(true);
		expect(exceeds(combine([amount(0.1, 'kg')], [amount(1, 'piece')]), before)).toBe(false);
		expect(exceeds(combine([amount(200, 'g')], [amount(100, 'ml')]), before)).toBe(true);
		expect(exceeds(combine([amount(200, 'g')], [{ kind: 'to_taste' }]), before)).toBe(true);
		expect(exceeds(before, before)).toBe(false);
	});
});

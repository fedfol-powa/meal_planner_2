import { describe, expect, it } from 'vitest';
import { parseQuantity } from './parse';
import { scaleQuantity } from './scale';
import { presentAmount } from './present';
import { formatQuantity } from './format';

describe('parseQuantity', () => {
	it.each([
		['300 g', { kind: 'amount', value: 300, unit: 'g' }],
		['1/2', { kind: 'amount', value: 0.5, unit: 'piece' }],
		['2', { kind: 'amount', value: 2, unit: 'piece' }],
		['3 cucchiai circa', { kind: 'amount', value: 3, unit: 'tbsp' }],
		['1 spicchio', { kind: 'amount', value: 1, unit: 'clove' }],
		['6 fette', { kind: 'amount', value: 6, unit: 'slice' }],
		['500 ml', { kind: 'amount', value: 500, unit: 'ml' }],
		['1,5 kg', { kind: 'amount', value: 1.5, unit: 'kg' }],
		['q.b.', { kind: 'to_taste' }],
		['a piacere', { kind: 'to_taste' }],
		['circa 213 g', { kind: 'text' }],
		['1/2-1 cucchiaino', { kind: 'text' }],
		['1 g crudo (330 g cotto)', { kind: 'text' }],
		['1/4 cup', { kind: 'text' }]
	])('parses %s', (raw, expected) => {
		expect(parseQuantity(raw)).toEqual(expected);
	});
});

describe('scaleQuantity', () => {
	it('scales amounts and leaves other kinds unchanged', () => {
		expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 3, 6)).toEqual({
			kind: 'amount',
			value: 150,
			unit: 'g'
		});
		expect(scaleQuantity({ kind: 'to_taste' }, 3, 6)).toEqual({ kind: 'to_taste' });
	});
});

describe('presentAmount', () => {
	it('keeps metric values and converts ounces to grams', () => {
		expect(presentAmount(150, 'g', 'metric')).toEqual({ value: 150, unit: 'g' });
		expect(presentAmount(1, 'oz', 'metric').unit).toBe('g');
	});
	it('converts to UK imperial with pounds and pints above thresholds', () => {
		expect(presentAmount(100, 'g', 'uk_imperial')).toEqual({ value: 100 / 28.349523125, unit: 'oz' });
		expect(presentAmount(1, 'kg', 'uk_imperial').unit).toBe('lb');
		expect(presentAmount(100, 'ml', 'uk_imperial').unit).toBe('fl_oz');
		expect(presentAmount(1, 'l', 'uk_imperial').unit).toBe('pint');
		expect(presentAmount(2, 'clove', 'uk_imperial')).toEqual({ value: 2, unit: 'clove' });
	});
});

describe('formatQuantity', () => {
	const amount = (value: number, unit: 'g' | 'clove' | 'tbsp' | 'piece' | 'ml') =>
		({ kind: 'amount', value, unit }) as const;

	it('rounds grams to tens, and to fives below 50 g', () => {
		expect(formatQuantity(amount(243, 'g'), '', 'metric', 'it-IT')).toBe('240 g');
		expect(formatQuantity(amount(37, 'g'), '', 'metric', 'it-IT')).toBe('35 g');
	});
	it('never shows zero for small amounts', () => {
		expect(formatQuantity(amount(2, 'g'), '', 'metric', 'it-IT')).toBe('2 g');
		expect(formatQuantity(amount(0.2, 'g'), '', 'metric', 'it-IT')).toBe('1 g');
		expect(formatQuantity(amount(1 / 3, 'clove'), '', 'metric', 'it-IT')).toBe('0,5 spicchi');
		expect(formatQuantity(amount(0.1, 'tbsp'), '', 'metric', 'en-GB')).toBe('0.5 tbsp');
	});
	it('shows fractions of a kilo or litre in grams or millilitres', () => {
		expect(formatQuantity({ kind: 'amount', value: 0.25, unit: 'kg' }, '', 'metric', 'it-IT')).toBe('250 g');
		expect(formatQuantity({ kind: 'amount', value: 0.02, unit: 'kg' }, '', 'metric', 'it-IT')).toBe('20 g');
		expect(formatQuantity({ kind: 'amount', value: 0.25, unit: 'l' }, '', 'metric', 'it-IT')).toBe('250 ml');
		expect(formatQuantity({ kind: 'amount', value: 1.5, unit: 'kg' }, '', 'metric', 'it-IT')).toBe('1,5 kg');
	});
	it('rounds pieces and cloves up to the half', () => {
		expect(formatQuantity(amount(1.2, 'clove'), '', 'metric', 'it-IT')).toBe('1,5 spicchi');
		expect(formatQuantity(amount(1, 'clove'), '', 'metric', 'en-GB')).toBe('1 clove');
		expect(formatQuantity(amount(0.75, 'piece'), '', 'metric', 'it-IT')).toBe('1');
	});
	it('localises to taste and keeps free text', () => {
		expect(formatQuantity({ kind: 'to_taste' }, 'q.b.', 'metric', 'en-GB')).toBe('to taste');
		expect(formatQuantity({ kind: 'text' }, 'circa 213 g', 'metric', 'en-GB')).toBe('circa 213 g');
	});
	it('formats UK imperial', () => {
		expect(formatQuantity(amount(300, 'g'), '', 'uk_imperial', 'en-GB')).toBe('11 oz');
		expect(formatQuantity(amount(500, 'ml'), '', 'uk_imperial', 'en-GB')).toBe('18 fl oz');
	});
});

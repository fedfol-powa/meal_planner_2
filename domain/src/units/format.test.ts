import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined, type CombinedQuantity } from './combined.ts';
import type { UnitCode } from './codes.ts';
import { formatCombined, formatQuantity } from './format.ts';
import type { Quantity } from './quantity.ts';

const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const skeinsText = { 'it-IT': '3 matasse', 'en-GB': '3 nests' };
const skeins: Quantity = { kind: 'text', text: skeinsText };
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());

describe('formatQuantity', () => {
	it('formats metric amounts with the number style of the language', () => {
		expect(formatQuantity(amount(243, 'g'), 'metric', 'it-IT')).toBe('240 g');
		expect(formatQuantity(amount(0.25, 'kg'), 'metric', 'it-IT')).toBe('250 g');
		expect(formatQuantity(amount(1.5, 'kg'), 'metric', 'it-IT')).toBe('1,5 kg');
		expect(formatQuantity(amount(1.5, 'kg'), 'metric', 'en-GB')).toBe('1.5 kg');
	});
	it('writes halves and quarters of counted units, with singular and plural labels', () => {
		expect(formatQuantity(amount(1 / 3, 'clove'), 'metric', 'it-IT')).toBe('½ spicchio');
		expect(formatQuantity(amount(1.2, 'clove'), 'metric', 'it-IT')).toBe('1½ spicchi');
		expect(formatQuantity(amount(1, 'clove'), 'metric', 'en-GB')).toBe('1 clove');
		expect(formatQuantity(amount(0.5, 'piece'), 'metric', 'en-GB')).toBe('½');
		expect(formatQuantity(amount(2.5, 'tbsp'), 'metric', 'it-IT')).toBe('2½ cucchiai');
		expect(formatQuantity(amount(2, 'leaf'), 'metric', 'en-GB')).toBe('2 leaves');
	});
	it('localises to taste and text quantities', () => {
		expect(formatQuantity({ kind: 'to_taste' }, 'metric', 'it-IT')).toBe('q.b.');
		expect(formatQuantity({ kind: 'to_taste' }, 'metric', 'en-GB')).toBe('to taste');
		expect(formatQuantity(skeins, 'metric', 'en-GB')).toBe('3 nests');
	});
	it('formats UK imperial, small amounts included', () => {
		expect(formatQuantity(amount(300, 'g'), 'uk_imperial', 'en-GB')).toBe('11 oz');
		expect(formatQuantity(amount(100, 'g'), 'uk_imperial', 'en-GB')).toBe('3½ oz');
		expect(formatQuantity(amount(3, 'g'), 'uk_imperial', 'en-GB')).toBe('3 g');
		expect(formatQuantity(amount(500, 'ml'), 'uk_imperial', 'en-GB')).toBe('18 fl oz');
		expect(formatQuantity(amount(10, 'ml'), 'uk_imperial', 'it-IT')).toBe('2 cucchiaini');
		expect(formatQuantity(amount(1, 'l'), 'uk_imperial', 'en-GB')).toBe('1¾ pints');
		expect(formatQuantity(amount(19.8, 'uk_fl_oz'), 'uk_imperial', 'en-GB')).toBe('1 pint');
	});
});

describe('formatCombined', () => {
	it('rounds only after the sum', () => {
		expect(formatCombined(combine(amount(320, 'g'), amount(0.4, 'kg'), amount(2, 'oz')), { system: 'metric', locale: 'it-IT' })).toBe('780 g');
		expect(formatCombined(combine(amount(13, 'g'), amount(13, 'g'), amount(13, 'g')), { system: 'metric', locale: 'it-IT' })).toBe('40 g');
		expect(formatCombined(combine(amount(800, 'g'), amount(800, 'g')), { system: 'metric', locale: 'it-IT' })).toBe('1,6 kg');
		expect(formatCombined(combine(amount(1, 'l'), amount(250, 'ml')), { system: 'metric', locale: 'en-GB' })).toBe('1.3 l');
	});
	it('lists incompatible parts in a fixed order: mass, volume, counted units, texts, to taste', () => {
		const c = combine(amount(2, 'piece'), amount(100, 'ml'), { kind: 'to_taste' }, skeins, amount(50, 'g'));
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT' })).toBe('50 g + 100 ml + 2 + 3 matasse + q.b.');
		expect(formatCombined(c, { system: 'metric', locale: 'en-GB' })).toBe('50 g + 100 ml + 2 + 3 nests + to taste');
	});
	it('presents the sum in UK imperial', () => {
		expect(formatCombined(combine(amount(400, 'g'), amount(400, 'g')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('1¾ lb');
		expect(formatCombined(combine(amount(250, 'ml')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('9 fl oz');
	});
	it('rounds pieces up to whole ones only for shopping', () => {
		const c = combine(amount(0.5, 'piece'), amount(1.25, 'clove'));
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT' })).toBe('½ + 1½ spicchi');
		expect(formatCombined(c, { system: 'metric', locale: 'it-IT', rounding: 'shopping' })).toBe('1 + 1½ spicchi');
		expect(formatCombined(combine(amount(2.06, 'piece')), { system: 'metric', locale: 'it-IT', rounding: 'shopping' })).toBe('2');
	});
	it('shows measuring spoons and household spoons of the same kind as one sum, in UK imperial only', () => {
		expect(formatCombined(combine(amount(30, 'ml'), amount(1, 'tbsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('3 tbsp');
		expect(formatCombined(combine(amount(5, 'ml'), amount(0.5, 'tsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('1½ tsp');
		expect(formatCombined(combine(amount(10, 'ml'), amount(1, 'tbsp')), { system: 'uk_imperial', locale: 'en-GB' })).toBe('2 tsp + 1 tbsp');
		expect(formatCombined(combine(amount(30, 'ml'), amount(1, 'tbsp')), { system: 'metric', locale: 'it-IT' })).toBe('30 ml + 1 cucchiaio');
		const c = combine(amount(30, 'ml'), amount(1, 'tbsp'));
		expect(c.volume_ml).toBe(30);
		expect(c.counts.tbsp).toBe(1);
	});
	it('labels a US cup left in a draft and returns an empty text for an empty sum', () => {
		expect(formatCombined(combine(amount(0.5, 'us_cup')), { system: 'metric', locale: 'it-IT' })).toBe('½ tazza USA');
		expect(formatCombined(emptyCombined(), { system: 'metric', locale: 'it-IT' })).toBe('');
	});
});

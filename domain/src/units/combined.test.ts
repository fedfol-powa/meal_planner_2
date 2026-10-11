import { describe, expect, it } from 'vitest';
import { addQuantity, combinedQuantitySchema, emptyCombined, exceeds, textKey, type CombinedQuantity } from './combined.ts';
import type { Quantity } from './quantity.ts';
import type { UnitCode } from './codes.ts';

const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const bunchText = { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' };
const bunch: Quantity = { kind: 'text', text: bunchText };
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());

describe('addQuantity', () => {
	it('sums masses in grams and volumes in millilitres', () => {
		const c = combine(amount(320, 'g'), amount(0.4, 'kg'), amount(2, 'oz'), amount(1, 'l'), amount(250, 'ml'));
		expect(c.mass_g).toBeCloseTo(720 + 2 * 28.349523125, 9);
		expect(c.volume_ml).toBe(1250);
	});
	it('keeps spoons, counts and cups per code', () => {
		const c = combine(amount(1.5, 'clove'), amount(3, 'clove'), amount(2, 'tbsp'), amount(30, 'ml'), amount(1, 'piece'));
		expect(c.counts).toEqual({ clove: 4.5, tbsp: 2, piece: 1 });
		expect(c.volume_ml).toBe(30);
	});
	it('keeps texts once by their normalised Italian key, with both languages, and notes to taste', () => {
		const c = combine(bunch, { kind: 'to_taste' }, bunch, { kind: 'text', text: { 'it-IT': '1  Mazzetto', 'en-GB': '1 Bunch' } });
		expect(c.texts).toEqual([{ key: '1 mazzetto', text: bunchText }]);
		expect(textKey(' 1 Mazzétto ')).toBe('1 mazzetto');
		expect(c.to_taste).toBe(true);
		expect(c.mass_g).toBeNull();
	});
});

describe('exceeds', () => {
	const before = combine(amount(200, 'g'), amount(1, 'piece'));
	it('is true when any part grows or appears', () => {
		expect(exceeds(combine(amount(300, 'g'), amount(1, 'piece')), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), amount(100, 'ml')), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), { kind: 'to_taste' }), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), bunch), before)).toBe(true);
		expect(exceeds(combine(amount(200, 'g'), amount(1, 'piece'), amount(1, 'clove')), before)).toBe(true);
	});
	it('is false when nothing grows, despite floating point noise', () => {
		expect(exceeds(before, before)).toBe(false);
		expect(exceeds(combine(amount(0.1, 'kg'), amount(1, 'piece')), before)).toBe(false);
		expect(exceeds(combine(amount(200 / 3, 'g'), amount(200 / 3, 'g'), amount(200 / 3, 'g'), amount(1, 'piece')), before)).toBe(false);
	});
});

describe('combinedQuantitySchema', () => {
	it('round-trips the stored shape and rejects unknown codes', () => {
		const stored = { mass_g: 340, volume_ml: null, counts: { piece: 2, tbsp: 1.5 }, texts: [{ key: '1 mazzetto', text: bunchText }], to_taste: true };
		expect(combinedQuantitySchema.parse(stored)).toEqual(stored);
		expect(combinedQuantitySchema.safeParse({ ...stored, texts: ['1 mazzetto'] }).success).toBe(false);
		expect(combinedQuantitySchema.safeParse({ ...stored, counts: { cup: 1 } }).success).toBe(false);
		expect(combinedQuantitySchema.safeParse({ ...stored, mass_g: -1 }).success).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { plainWords } from './locale.ts';
import { publishableQuantitySchema, quantitySchema } from './quantity.ts';

describe('plainWords', () => {
	it('drops case, accents, punctuation and extra spaces', () => {
		expect(plainWords('  Scòrza   GRATTUGIATA, fine! ')).toEqual(['scorza', 'grattugiata', 'fine']);
		expect(plainWords(' ... ')).toEqual([]);
	});
});

describe('quantity schema', () => {
	it('accepts the three kinds', () => {
		expect(quantitySchema.parse({ kind: 'amount', value: 300, unit: 'g' })).toEqual({ kind: 'amount', value: 300, unit: 'g' });
		expect(quantitySchema.parse({ kind: 'to_taste' })).toEqual({ kind: 'to_taste' });
		const text = { kind: 'text', text: { 'it-IT': '1 vaschetta da 250 g', 'en-GB': '1 punnet (250 g)' } };
		expect(quantitySchema.parse(text)).toEqual(text);
	});
	it('rejects non-positive amounts, unknown units and missing translations', () => {
		expect(quantitySchema.safeParse({ kind: 'amount', value: 0, unit: 'g' }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'amount', value: 1, unit: 'cup' }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'text', text: { 'it-IT': '1 bicchiere' } }).success).toBe(false);
		expect(quantitySchema.safeParse({ kind: 'text', text: { 'it-IT': '1 bicchiere', 'en-GB': ' ' } }).success).toBe(false);
	});
	it('keeps US cups out of published recipes', () => {
		const cup = publishableQuantitySchema.safeParse({ kind: 'amount', value: 0.5, unit: 'us_cup' });
		expect(cup.success).toBe(false);
		expect(cup.error?.issues[0].message).toBe('draft_only_unit');
		expect(publishableQuantitySchema.safeParse({ kind: 'amount', value: 2, unit: 'tbsp' }).success).toBe(true);
	});
});

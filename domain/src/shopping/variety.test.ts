import { describe, expect, it } from 'vitest';
import { itemKey, varietyKey } from './variety.ts';

describe('varietyKey', () => {
	it('ignores case, accents, punctuation, spaces and filler words', () => {
		expect(varietyKey('tipo Roma')).toBe('roma');
		expect(varietyKey('ROMA')).toBe('roma');
		expect(varietyKey('Gialla, senza semi!')).toBe('gialla senza semi');
		expect(varietyKey('Perìni')).toBe('perini');
		expect(varietyKey('  Varietà   San Marzano ')).toBe('san marzano');
	});
	it('is empty without a variety', () => {
		expect(varietyKey(null)).toBe('');
		expect(varietyKey(undefined)).toBe('');
		expect(varietyKey('')).toBe('');
		expect(varietyKey('tipo')).toBe('');
	});
});

describe('itemKey', () => {
	it('joins ingredient and variety', () => {
		expect(itemKey('tomato', 'roma')).toBe('tomato~roma');
		expect(itemKey('tomato', '')).toBe('tomato~');
	});
});

import { describe, expect, it } from 'vitest';
import type { Quantity } from './quantity.ts';
import { scaleQuantity } from './scale.ts';

describe('scaleQuantity', () => {
	it('scales amounts without rounding', () => {
		expect(scaleQuantity({ kind: 'amount', value: 300, unit: 'g' }, 3, 6)).toEqual({ kind: 'amount', value: 150, unit: 'g' });
		expect(scaleQuantity({ kind: 'amount', value: 1, unit: 'piece' }, 1, 3)).toEqual({ kind: 'amount', value: 1 / 3, unit: 'piece' });
	});
	it('leaves to taste and text quantities unchanged', () => {
		const text: Quantity = { kind: 'text', text: { 'it-IT': '1 mazzetto', 'en-GB': '1 bunch' } };
		expect(scaleQuantity({ kind: 'to_taste' }, 3, 6)).toEqual({ kind: 'to_taste' });
		expect(scaleQuantity(text, 4, 2)).toBe(text);
	});
	it('rejects non-positive servings', () => {
		expect(() => scaleQuantity({ kind: 'amount', value: 1, unit: 'g' }, 0, 2)).toThrow(RangeError);
		expect(() => scaleQuantity({ kind: 'amount', value: 1, unit: 'g' }, 2, 0)).toThrow(RangeError);
	});
});

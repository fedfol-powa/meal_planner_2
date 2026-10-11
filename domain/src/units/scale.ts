import type { Quantity } from './quantity.ts';

/** Quantity × servings ÷ base servings (spec section 6), never rounded here. */
export function scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity {
	if (!(servings > 0) || !(baseServings > 0)) throw new RangeError('Servings must be positive');
	return q.kind === 'amount' ? { ...q, value: (q.value * servings) / baseServings } : q;
}

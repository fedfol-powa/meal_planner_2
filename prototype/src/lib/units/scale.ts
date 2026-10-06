import type { Quantity } from '#lib/domain/types.ts';

export function scaleQuantity(q: Quantity, servings: number, baseServings: number): Quantity {
	if (q.kind !== 'amount') return q;
	return { ...q, value: (q.value * servings) / baseServings };
}

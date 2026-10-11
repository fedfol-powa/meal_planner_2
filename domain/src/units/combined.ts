import { z } from 'zod';
import { BASE_FACTOR, COUNTED_UNITS, isMassUnit, isVolumeUnit } from './codes.ts';
import { localizedSchema } from './locale.ts';
import type { Quantity } from './quantity.ts';

/**
 * Sum of an ingredient's quantities, never rounded (spec section 6). Also the stored shape of
 * `shopping_list_checks.quantity_at_check`.
 */
export const combinedQuantitySchema = z.object({
	mass_g: z.number().nonnegative().nullable(),
	volume_ml: z.number().nonnegative().nullable(),
	counts: z.partialRecord(z.enum(COUNTED_UNITS), z.number().nonnegative()),
	/**
	 * Non-numeric quantities in both languages as they were: a tick shows its old quantity in the
	 * viewer's language even after the lines changed. `key` (normalised Italian) is what `exceeds` compares.
	 */
	texts: z.array(z.object({ key: z.string().min(1), text: localizedSchema })),
	to_taste: z.boolean()
});
export type CombinedQuantity = z.infer<typeof combinedQuantitySchema>;

export const emptyCombined = (): CombinedQuantity => ({ mass_g: null, volume_ml: null, counts: {}, texts: [], to_taste: false });

/** Comparison key of a non-numeric quantity: case, accents and spacing ignored. */
export const textKey = (text: string): string =>
	text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function addQuantity(c: CombinedQuantity, q: Quantity): CombinedQuantity {
	if (q.kind === 'to_taste') return { ...c, to_taste: true };
	if (q.kind === 'text') {
		const key = textKey(q.text['it-IT']);
		return c.texts.some((t) => t.key === key) ? c : { ...c, texts: [...c.texts, { key, text: q.text }] };
	}
	const { value, unit } = q;
	if (isMassUnit(unit)) return { ...c, mass_g: (c.mass_g ?? 0) + value * BASE_FACTOR[unit] };
	if (isVolumeUnit(unit)) return { ...c, volume_ml: (c.volume_ml ?? 0) + value * BASE_FACTOR[unit] };
	return { ...c, counts: { ...c.counts, [unit]: (c.counts[unit] ?? 0) + value } };
}

const EPSILON = 1e-9;
const grew = (now: number | null | undefined, before: number | null | undefined) => (now ?? 0) > (before ?? 0) * (1 + EPSILON) + EPSILON;

/** True when `now` asks for more than `before`: a ticked item needs ticking again (spec section 6). */
export function exceeds(now: CombinedQuantity, before: CombinedQuantity): boolean {
	return (
		grew(now.mass_g, before.mass_g) ||
		grew(now.volume_ml, before.volume_ml) ||
		COUNTED_UNITS.some((unit) => grew(now.counts[unit], before.counts[unit])) ||
		now.texts.some((t) => !before.texts.some((b) => b.key === t.key)) ||
		(now.to_taste && !before.to_taste)
	);
}

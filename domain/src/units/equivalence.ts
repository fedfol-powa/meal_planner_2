import { z } from 'zod';
import { BASE_FACTOR, UNIT_DIMENSION, isMassUnit, isVolumeUnit, type MeasuredUnit, type UnitCode } from './codes.ts';
import { plainWords } from './locale.ts';
import { unitCodeSchema, type Amount, type Quantity } from './quantity.ts';

/** `recipe`: applied when curating or importing (US cups); `shopping`: how the ingredient is bought. */
export type EquivalenceScope = 'recipe' | 'shopping';

/**
 * Comparison key of a line preparation, from its Italian text: normalised like a variety but
 * keeping every word ("succo", "scorza grattugiata"). null without a preparation.
 */
export function preparationKey(text: string | null | undefined): string | null {
	return plainWords(text ?? '').join(' ') || null;
}

export const unitEquivalenceSchema = z.object({
	ingredientId: z.string().min(1),
	fromUnit: unitCodeSchema,
	toUnit: unitCodeSchema,
	/** Amount of `toUnit` for one `fromUnit`. */
	factor: z.number().positive(),
	scope: z.enum(['recipe', 'shopping']),
	/** Only for lines with this preparation (a `preparationKey`); null for any line. */
	preparation: z.string().refine((p) => preparationKey(p) === p, { message: 'not_normalised' }).nullable(),
	/** The verified source of the factor. */
	source: z.string().trim().min(1)
});
export type UnitEquivalence = z.infer<typeof unitEquivalenceSchema>;

/** How many `from` units one `unit` is, when both measure the same thing; null otherwise. */
function ratio(unit: UnitCode, from: UnitCode): number | null {
	if (unit === from) return 1;
	if (UNIT_DIMENSION[unit] !== UNIT_DIMENSION[from] || !(unit in BASE_FACTOR) || !(from in BASE_FACTOR)) return null;
	return BASE_FACTOR[unit as MeasuredUnit] / BASE_FACTOR[from as MeasuredUnit];
}

/** For curation and import: the published line keeps the converted amount, the source text keeps the cup. */
export function applyRecipeEquivalence(q: Quantity, eq: UnitEquivalence): Amount {
	if (eq.scope !== 'recipe') throw new Error('Not a recipe equivalence');
	const r = q.kind === 'amount' ? ratio(q.unit, eq.fromUnit) : null;
	if (q.kind !== 'amount' || r === null) throw new Error(`The equivalence applies to ${eq.fromUnit} only`);
	return { kind: 'amount', value: q.value * r * eq.factor, unit: eq.toUnit };
}

/** Masses and volumes convert within their dimension; spoons, counts and cups only per code. */
const sourceKey = (unit: UnitCode): string => (isMassUnit(unit) || isVolumeUnit(unit) ? UNIT_DIMENSION[unit] : unit);

/**
 * At most one equivalence per ingredient, scope, source dimension and preparation (or none),
 * agreed with the schema, which enforces it too: otherwise the result would depend on the order.
 */
export function assertUnambiguousEquivalences(equivalences: readonly UnitEquivalence[]): void {
	const seen = new Set<string>();
	for (const eq of equivalences) {
		const key = `${eq.ingredientId}|${eq.scope}|${sourceKey(eq.fromUnit)}|${eq.preparation ?? ''}`;
		if (seen.has(key)) throw new Error(`Ambiguous ${eq.scope} equivalences for ${eq.ingredientId} from ${sourceKey(eq.fromUnit)}`);
		seen.add(key);
	}
}

/**
 * The equivalence for a line of the ingredient: the one of the line's preparation (Italian text)
 * if any, otherwise the one without a preparation; an equivalence of another preparation never
 * applies (lemon juice in lemons is not lemon zest). `equivalences` are those of the ingredient.
 */
export function findEquivalence(
	equivalences: readonly UnitEquivalence[], scope: EquivalenceScope, unit: UnitCode, preparation: string | null | undefined
): UnitEquivalence | null {
	const key = preparationKey(preparation);
	const candidates = equivalences.filter((eq) => eq.scope === scope && ratio(unit, eq.fromUnit) !== null);
	return candidates.find((eq) => key !== null && eq.preparation === key) ?? candidates.find((eq) => eq.preparation === null) ?? null;
}

/**
 * Shopping lists buy as shops sell: 50 g of lemon juice become 50/47 lemons (spec section 6).
 * `equivalences` are those of the line's ingredient, `preparation` its Italian text.
 */
export function toPurchaseUnit(q: Quantity, equivalences: readonly UnitEquivalence[], preparation: string | null | undefined): Quantity {
	assertUnambiguousEquivalences(equivalences);
	if (q.kind !== 'amount') return q;
	const eq = findEquivalence(equivalences, 'shopping', q.unit, preparation);
	return eq ? { kind: 'amount', value: q.value * (ratio(q.unit, eq.fromUnit) ?? 1) * eq.factor, unit: eq.toUnit } : q;
}

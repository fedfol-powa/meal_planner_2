import type { RecipeDraftDocument } from '@app/domain/recipe';
import { applyRecipeEquivalence, findEquivalence, type Amount, type Quantity, type UnitEquivalence } from '@app/domain/units';

export interface UnitEquivalenceRow extends UnitEquivalence {
	id: string;
}

export interface Conversion {
	line: number;
	from: Quantity;
	to: Amount;
	equivalence: { id: string; factor: number; source: string; preparation: string | null };
}

/**
 * US cups become publishable amounts through the ingredient's recipe equivalence: the draft
 * keeps what the source says, the check and the published document get the conversion.
 */
export function applyRecipeConversions(
	document: RecipeDraftDocument,
	equivalences: ReadonlyMap<string, readonly UnitEquivalenceRow[]>,
): { document: RecipeDraftDocument; conversions: Conversion[] } {
	const conversions: Conversion[] = [];
	const ingredients = document.ingredients?.map((line, index) => {
		const q = line.quantity;
		if (q.kind !== 'amount' || q.unit !== 'us_cup' || q.value === null || !line.ingredientId) return line;
		const found = findEquivalence(equivalences.get(line.ingredientId) ?? [], 'recipe', 'us_cup', line.preparation?.['it-IT']) as UnitEquivalenceRow | null;
		if (!found) return line;
		const from: Quantity = { kind: 'amount', value: q.value, unit: 'us_cup' };
		const to = applyRecipeEquivalence(from, found);
		conversions.push({ line: index, from, to, equivalence: { id: found.id, factor: found.factor, source: found.source, preparation: found.preparation } });
		return { ...line, quantity: to };
	});
	return { document: ingredients ? { ...document, ingredients } : document, conversions };
}

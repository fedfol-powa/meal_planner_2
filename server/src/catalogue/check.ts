import { checkPublishable, type RecipeDraftDocument, type ValidationIssue } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { applyRecipeConversions, type Conversion } from './convert.ts';
import { loadLookup, loadRecipeEquivalences } from './load.ts';

/** The publication check after the US-cup conversions, as checkDraft, the views and publish run it. */
export async function publicationCheck(
	tx: Tx,
	content: RecipeDraftDocument,
): Promise<{ document: RecipeDraftDocument; issues: ValidationIssue[]; conversions: Conversion[] }> {
	const lines = Array.isArray(content.ingredients) ? content.ingredients : [];
	const equivalences = await loadRecipeEquivalences(tx, lines.map((l) => l?.ingredientId));
	let converted: { document: RecipeDraftDocument; conversions: Conversion[] };
	try {
		converted = applyRecipeConversions(content, equivalences);
	} catch {
		// A document of the wrong shape: no conversion, the check reports why.
		converted = { document: content, conversions: [] };
	}
	return { ...converted, issues: checkPublishable(converted.document, await loadLookup(tx, converted.document)) };
}

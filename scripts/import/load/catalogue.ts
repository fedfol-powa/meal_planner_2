import { randomUUID } from 'node:crypto';
import { resolveReferences } from '../../../domain/src/recipe/index.ts';
import { preparationKey, type UnitEquivalence } from '../../../domain/src/units/equivalence.ts';
import type { Tx } from '../../../server/src/db.ts';
import { createBook, createDraft, createIngredient, publishDraft, type Actor } from '../../../server/src/catalogue/write.ts';
import { setEquivalence } from '../../../server/src/catalogue/ingredients.ts';
import type { ImportBundle } from '../bundle.ts';

// Catalogue writes of the production load (detail spec, section 6), through the curators' module with
// channel 'import'; slugs and origin slugs of the bundle are kept, so a rerun finds them again. What is
// already in the database is never overwritten: the database is the source of truth after the import.
export interface Counted { created: number; present: number }
export interface CatalogueResult {
	books: Counted; ingredients: Counted; equivalences: Counted & { diverging: string[] };
	recipes: { published: number; drafts: number; present: number };
	publicationBlocked: string[];
}

export async function existingCatalogue(tx: Tx) {
	const recipes = await tx<{ s: string }[]>`select origin_slug as s from app.recipes where origin_slug is not null`;
	const ingredients = await tx<{ s: string }[]>`select slug as s from app.ingredients`;
	const books = await tx<{ s: string }[]>`select slug as s from app.books`;
	return { recipes: recipes.map((r) => r.s), ingredients: ingredients.map((r) => r.s), books: books.map((r) => r.s) };
}

export async function loadCatalogue(tx: Tx, actor: Actor, bundle: ImportBundle, equivalences: UnitEquivalence[]): Promise<CatalogueResult> {
	const result: CatalogueResult = {
		books: { created: 0, present: 0 }, ingredients: { created: 0, present: 0 }, equivalences: { created: 0, present: 0, diverging: [] },
		recipes: { published: 0, drafts: 0, present: 0 }, publicationBlocked: bundle.pendingReview,
	};
	for (const b of bundle.books) {
		const r = await createBook(tx, actor, { bookId: randomUUID(), slug: b.slug, title: b.title });
		result.books[r.created ? 'created' : 'present']++;
	}
	for (const i of bundle.ingredients) {
		const r = await createIngredient(tx, actor, {
			ingredientId: randomUUID(), slug: i.slug,
			name: { 'it-IT': i.name['it-IT'], 'en-GB': i.name['en-GB']?.trim() ? i.name['en-GB'] : null },
			department: i.department, isPantry: i.isPantry, synonyms: i.synonyms,
		});
		result.ingredients[r.created ? 'created' : 'present']++;
	}
	const ingredientIds = new Map((await tx<{ slug: string; id: string }[]>`select slug, id from app.ingredients`).map((r) => [r.slug, r.id]));
	const bookIds = new Map((await tx<{ slug: string; id: string }[]>`select slug, id from app.books`).map((r) => [r.slug, r.id]));
	for (const e of equivalences) {
		const ingredientId = ingredientIds.get(e.ingredientId);
		if (!ingredientId) throw new Error(`Equivalence for unknown ingredient: ${e.ingredientId}`);
		// The logical key of setEquivalence: an existing row is kept whatever its values.
		const [existing] = await tx<{ to_unit: string; factor: string; from_unit: string; source: string }[]>`
			select from_unit, to_unit, factor::text, source from app.ingredient_unit_equivalences
			where ingredient_id = ${ingredientId} and scope = 'recipe' and from_dimension = app.unit_dimension(${e.fromUnit})
				and preparation is not distinct from ${preparationKey(e.preparation)}`;
		if (existing) {
			result.equivalences.present++;
			if (existing.from_unit !== e.fromUnit || existing.to_unit !== e.toUnit || Number(existing.factor) !== e.factor || existing.source !== e.source.trim())
				result.equivalences.diverging.push(`${e.ingredientId}: ${e.fromUnit}→${e.toUnit} ${e.factor} (in the database ${existing.from_unit}→${existing.to_unit} ${existing.factor})`);
			continue;
		}
		await setEquivalence(tx, actor, { ingredientId, fromUnit: e.fromUnit, toUnit: e.toUnit, factor: e.factor, preparation: e.preparation, source: e.source });
		result.equivalences.created++;
	}
	const lookup = { ingredientId: (s: string) => ingredientIds.get(s), bookId: (s: string) => bookIds.get(s) };
	const publish = bundle.pendingReview.length === 0;
	for (const r of bundle.recipes) {
		const draft = await createDraft(tx, actor, { draftId: randomUUID(), content: resolveReferences(r.document, lookup), originSlug: r.origin.slug, originType: r.origin.type });
		if (!draft.created) { result.recipes.present++; continue; }
		if (publish && r.status === 'publishable') {
			await publishDraft(tx, actor, { draftId: draft.draftId });
			result.recipes.published++;
		} else result.recipes.drafts++;
	}
	return result;
}

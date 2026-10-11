import { blocksDraft, checkDraft, checkPublishable, type CatalogueIngredient, type CatalogueLookup, type RecipeDraftDocument, type ValidationIssue } from '../../domain/src/recipe/index.ts';
import type { IsoDate } from '../../domain/src/planner/index.ts';
import type { RecipeAttributes } from '../planner-data/attributes.ts';
import { slug, type OriginRecipe } from '../planner-data/origin.ts';
import { buildFamilyData, type FamilyData, type HistoryFinding } from './family.ts';
import type { ImportInputs } from './inputs.ts';
import { buildRecipe, type OriginType, type RecipeFinding } from './recipes.ts';

// The import's output (detail spec, section 4): only what the database does not have yet. The status of a
// recipe depends only on its document, so a draft keeps its obstacles after bundle.json and the save.

export interface ExistingCatalogue {
	recipes: string[];
	ingredients: string[];
	books: string[];
}

export interface BundleRecipe {
	origin: { slug: string; type: OriginType };
	status: 'publishable' | 'draft';
	document: RecipeDraftDocument;
	issues: ValidationIssue[];
}

export interface ImportBundle {
	generatedAt: string;
	importDate: IsoDate;
	pendingReview: string[];
	books: { slug: string; title: string }[];
	ingredients: CatalogueIngredient[];
	recipes: BundleRecipe[];
	family: FamilyData;
}

export interface BundleResult {
	bundle: ImportBundle;
	recipeFindings: Map<string, RecipeFinding[]>;
	historyFindings: HistoryFinding[];
	skipped: string[];
}

/** Cards already in the database are set aside before anything reads their content (rerun, section 11). */
export function selectFresh(origin: OriginRecipe[], existing: ExistingCatalogue) {
	const known = new Set(existing.recipes);
	return { fresh: origin.filter((r) => !known.has(r.id)), skipped: origin.filter((r) => known.has(r.id)).map((r) => r.id) };
}

export function buildBundle(args: {
	origin: OriginRecipe[];
	attributes: Map<string, RecipeAttributes>;
	inputs: ImportInputs;
	existing: ExistingCatalogue;
	importDate: IsoDate;
	generatedAt: string;
}): BundleResult {
	const { inputs, existing } = args;
	const { fresh, skipped } = selectFresh(args.origin, existing);

	const books = new Map<string, string>();
	for (const r of fresh) if (r.libro && !existing.books.includes(slug(r.libro.titolo))) books.set(slug(r.libro.titolo), r.libro.titolo);
	const english = new Map(inputs.ingredients.map((i) => [i.slug, !!i.name['en-GB'].trim()]));
	const lookup: CatalogueLookup = {
		hasIngredient: (id) => english.has(id) || existing.ingredients.includes(id),
		ingredientHasEnglishName: (id) => english.get(id) ?? existing.ingredients.includes(id),
		hasBook: (id) => books.has(id) || existing.books.includes(id)
	};

	const recipeFindings = new Map<string, RecipeFinding[]>();
	const recipes: BundleRecipe[] = fresh.map((origin) => {
		const built = buildRecipe(origin, args.attributes.get(origin.id), inputs);
		recipeFindings.set(origin.id, built.findings);
		const draftProblems = checkDraft(built.document, lookup).filter(blocksDraft);
		if (draftProblems.length) throw new Error(`${origin.id}: the import produced invalid data: ${JSON.stringify(draftProblems)}`);
		const issues = checkPublishable(built.document, lookup);
		return { origin: built.origin, status: issues.length ? 'draft' : 'publishable', document: built.document, issues };
	});

	const { family, findings: historyFindings } = buildFamilyData(fresh, args.importDate);
	return {
		bundle: {
			generatedAt: args.generatedAt,
			importDate: args.importDate,
			pendingReview: inputs.pendingReview,
			books: [...books].map(([s, title]) => ({ slug: s, title })).sort((a, b) => a.slug.localeCompare(b.slug)),
			ingredients: inputs.ingredients.filter((i) => !existing.ingredients.includes(i.slug)).sort((a, b) => a.slug.localeCompare(b.slug)),
			recipes,
			family
		},
		recipeFindings,
		historyFindings,
		skipped
	};
}

import type { PlannerRecipe } from '../planner/index.ts';
import { varietyKey } from '../shopping/index.ts';
import type { Localized, UnitCode } from '../units/index.ts';
import type { RecipeDocument, RecipeDraftDocument } from './document.ts';
import { filled, type DraftTranslated } from './localized.ts';

// Projections of the current published version (spec section 2): columns of recipes and rows of
// recipe_ingredients, recomputed in the transaction that publishes or restores. camelCase here, snake_case
// in the database (interface for W2 in the detail spec).

export type RecipeProjection = Omit<RecipeDocument, 'schemaVersion' | 'ingredients'>;

export interface RecipeIngredientProjection {
	position: number;
	ingredientId: string;
	variety: Localized | null;
	varietyKey: string;
	quantityKind: 'amount' | 'to_taste' | 'text';
	quantity: number | null;
	unit: UnitCode | null;
	quantityText: Localized | null;
	sourceText: string;
	preparation: Localized | null;
	isOptional: boolean;
	isPrimary: boolean;
}

export function projectRecipe(d: RecipeDocument): { recipe: RecipeProjection; ingredients: RecipeIngredientProjection[] } {
	const { schemaVersion: _version, ingredients, ...recipe } = d;
	return {
		recipe,
		ingredients: ingredients.map((line, position) => ({
			position,
			ingredientId: line.ingredientId,
			variety: line.variety,
			varietyKey: varietyKey(line.variety?.['it-IT'] ?? ''),
			quantityKind: line.quantity.kind,
			quantity: line.quantity.kind === 'amount' ? line.quantity.value : null,
			unit: line.quantity.kind === 'amount' ? line.quantity.unit : null,
			quantityText: line.quantity.kind === 'text' ? line.quantity.text : null,
			sourceText: line.sourceText,
			preparation: line.preparation,
			isOptional: line.isOptional,
			isPrimary: line.isPrimary
		}))
	};
}

/**
 * Name and description of a recipe never published, written to recipes by the import and at every save of
 * its draft, so that members see the name of the meals citing it (coordinator, 11 October 2026).
 */
export function projectDraftNames(d: RecipeDraftDocument): { name: Localized; description: Localized } {
	const full = (v: DraftTranslated | null | undefined): Localized => ({ 'it-IT': v?.['it-IT']?.trim() ?? '', 'en-GB': v?.['en-GB']?.trim() ?? '' });
	return { name: full(d.name), description: full(d.description) };
}

/** What the planner reads (domain/src/planner/types.ts), from a published document. */
export function toPlannerRecipe(id: string, d: RecipeDocument): PlannerRecipe {
	return {
		id,
		durationMinutes: d.durationMinutes,
		mealType: d.mealType,
		proteinGroup: d.proteinGroup,
		isFreshFish: d.isFreshFish,
		carbohydrateGroup: d.carbohydrateGroup,
		category: d.category,
		hasVegetables: d.hasVegetables,
		isHeavy: d.isHeavy,
		seasons: d.seasons,
		primaryIngredientId: d.ingredients.find((l) => l.isPrimary)?.ingredientId ?? null,
		ingredients: d.ingredients.map((l) => ({ ingredientId: l.ingredientId, isOptional: l.isOptional })),
		bookId: d.bookId
	};
}

export interface ReferenceLookup {
	ingredientId(slug: string): string | undefined;
	bookId(slug: string): string | undefined;
}

/** The import refers to ingredients and books by slug; writing to the database needs their ids. */
export function resolveReferences<T extends RecipeDraftDocument>(d: T, lookup: ReferenceLookup): T {
	const resolve = (kind: 'ingredient' | 'book', slug: string) => {
		const id = kind === 'ingredient' ? lookup.ingredientId(slug) : lookup.bookId(slug);
		if (!id) throw new Error(`Unknown ${kind} slug: ${slug}`);
		return id;
	};
	return {
		...d,
		bookId: filled(d.bookId) ? resolve('book', d.bookId) : null,
		ingredients: d.ingredients?.map((l) => ({ ...l, ingredientId: l.ingredientId === null ? null : resolve('ingredient', l.ingredientId) }))
	};
}

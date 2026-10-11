import { addQuantity, emptyCombined, type CombinedQuantity } from '../units/combined.ts';
import { assertUnambiguousEquivalences, toPurchaseUnit, type UnitEquivalence } from '../units/equivalence.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import { scaleQuantity } from '../units/scale.ts';
import type { Department } from './departments.ts';
import { itemKey, varietyKey } from './variety.ts';

/** What the list needs from a recipe line (structurally compatible with the recipe document). */
export interface ShoppingRecipeLine {
	ingredientId: string;
	variety: Localized | null;
	/** Does not change the item; chooses the shopping equivalence (lemon juice, not zest). */
	preparation: Localized | null;
	quantity: Quantity;
	isOptional: boolean;
}

/** The recipe version in force for the meal (review R1), chosen by the caller. */
export interface ShoppingRecipe {
	id: string;
	name: Localized;
	baseServings: number | null;
	lines: readonly ShoppingRecipeLine[];
}

export type MealType = 'lunch' | 'dinner';

export interface ShoppingMeal {
	slotId: string;
	date: string;
	mealType: MealType;
	servings: number;
	/** null for free and empty meals. */
	recipe: ShoppingRecipe | null;
}

export interface ShoppingIngredient {
	name: Localized;
	department: Department;
	isPantry: boolean;
}

export interface ShoppingListInput {
	meals: readonly ShoppingMeal[];
	ingredients: ReadonlyMap<string, ShoppingIngredient>;
	/** Shopping-scope equivalences (how ingredients are bought). */
	equivalences: readonly UnitEquivalence[];
	/** Ingredients the family avoids: every variety leaves the list. */
	avoided: ReadonlySet<string>;
}

export interface ShoppingSource {
	slotId: string;
	date: string;
	mealType: MealType;
	recipeId: string;
	recipeName: Localized;
	/** Scaled line, in the recipe's unit (not converted to the purchase unit). */
	quantity: Quantity;
	/** Servings other than the recipe's: shown with the rounding of scaled lines. */
	scaled: boolean;
}

export type Exclusion = 'avoid' | 'pantry';

export interface ConsolidatedItem {
	key: string;
	ingredientId: string;
	varietyKey: string;
	name: Localized;
	variety: Localized | null;
	department: Department;
	combined: CombinedQuantity;
	isOptional: boolean;
	sources: ShoppingSource[];
	excluded: Exclusion | null;
}

export interface SkippedMeal {
	slotId: string;
	recipeId: string;
	recipeName: Localized;
}

export interface ConsolidatedList {
	mealCount: number;
	items: ConsolidatedItem[];
	skipped: SkippedMeal[];
}

interface Entry {
	ingredientId: string;
	varietyKey: string;
	combined: CombinedQuantity;
	isOptional: boolean;
	spellings: Map<string, { variety: Localized; uses: number }>;
	sources: ShoppingSource[];
}

const MEAL_ORDER: Record<MealType, number> = { lunch: 0, dinner: 1 };

/** The most used spelling among the list's lines; the first one met wins a tie. */
function mostUsed(spellings: Entry['spellings']): Localized | null {
	let best: { variety: Localized; uses: number } | null = null;
	for (const spelling of spellings.values()) if (!best || spelling.uses > best.uses) best = spelling;
	return best?.variety ?? null;
}

/** Steps 1-6 of the shopping list generation (spec section 6); presentation is in arrange.ts. */
export function consolidateShoppingList(input: ShoppingListInput): ConsolidatedList {
	assertUnambiguousEquivalences(input.equivalences);
	const meals = [...input.meals].sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType]);
	const entries = new Map<string, Entry>();
	const skipped: SkippedMeal[] = [];
	let mealCount = 0;

	for (const meal of meals) {
		const recipe = meal.recipe;
		if (!recipe) continue;
		if (!recipe.baseServings || recipe.lines.length === 0) {
			skipped.push({ slotId: meal.slotId, recipeId: recipe.id, recipeName: recipe.name });
			continue;
		}
		mealCount++;
		for (const line of recipe.lines) {
			if (!input.ingredients.has(line.ingredientId)) throw new Error(`Unknown ingredient ${line.ingredientId}`);
			const variety = varietyKey(line.variety?.['it-IT']);
			const key = itemKey(line.ingredientId, variety);
			const entry: Entry = entries.get(key) ?? {
				ingredientId: line.ingredientId, varietyKey: variety, combined: emptyCombined(),
				isOptional: true, spellings: new Map(), sources: []
			};
			const scaled = scaleQuantity(line.quantity, meal.servings, recipe.baseServings);
			const equivalences = input.equivalences.filter((e) => e.ingredientId === line.ingredientId);
			entry.combined = addQuantity(entry.combined, toPurchaseUnit(scaled, equivalences, line.preparation?.['it-IT']));
			entry.isOptional &&= line.isOptional;
			if (variety && line.variety) {
				const spelling = JSON.stringify([line.variety['it-IT'], line.variety['en-GB']]);
				const found = entry.spellings.get(spelling) ?? { variety: line.variety, uses: 0 };
				found.uses++;
				entry.spellings.set(spelling, found);
			}
			entry.sources.push({ slotId: meal.slotId, date: meal.date, mealType: meal.mealType, recipeId: recipe.id, recipeName: recipe.name, quantity: scaled, scaled: meal.servings !== recipe.baseServings });
			entries.set(key, entry);
		}
	}

	const items = [...entries.entries()].map(([key, entry]): ConsolidatedItem => {
		const ingredient = input.ingredients.get(entry.ingredientId)!;
		return {
			key,
			ingredientId: entry.ingredientId,
			varietyKey: entry.varietyKey,
			name: ingredient.name,
			variety: mostUsed(entry.spellings),
			department: ingredient.department,
			combined: entry.combined,
			isOptional: entry.isOptional,
			sources: entry.sources,
			excluded: input.avoided.has(entry.ingredientId) ? 'avoid' : ingredient.isPantry ? 'pantry' : null
		};
	});
	return { mealCount, items, skipped };
}

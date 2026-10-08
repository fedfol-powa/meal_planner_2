// Recipe attributes for the planner: proposed by the agent from verified data, reviewed by the user.
import { parse } from 'yaml';
import { CARBOHYDRATE_GROUPS, CATEGORIES, PROTEIN_GROUPS, SEASONS, type CarbohydrateGroup, type Category, type PlannerRecipe, type ProteinGroup, type RecipeMealType, type Season } from '../../domain/src/planner/index.ts';
import { durationOf, slug, type OriginRecipe } from './origin.ts';

export interface RecipeAttributes {
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup;
	freshFish: boolean;
	carbohydrateGroup: CarbohydrateGroup;
	category: Category;
	hasVegetables: boolean;
	isHeavy: boolean;
	seasons: Season[];
	primaryIngredient: string | null;
	durationMinutes: number | null;
	uncertain: string[];
	note: string | null;
}

const MEAL_TYPES = ['lunch', 'dinner', 'both'] as const;

export function parseAttributes(text: string, recipes: OriginRecipe[]): { attributes: Map<string, RecipeAttributes>; errors: string[] } {
	const raw = ((parse(text) as { recipes?: Record<string, Record<string, unknown>> } | null)?.recipes ?? {}) as Record<string, Record<string, unknown>>;
	const errors: string[] = [];
	const attributes = new Map<string, RecipeAttributes>();
	const known = new Set(recipes.map((r) => r.id));
	for (const id of Object.keys(raw)) if (!known.has(id)) errors.push(`${id}: not a recipe of the catalogue`);

	for (const recipe of recipes) {
		const entry = raw[recipe.id];
		if (!entry) {
			errors.push(`${recipe.id}: missing`);
			continue;
		}
		const oneOf = <T extends string>(field: string, allowed: readonly T[]): T => {
			const value = entry[field];
			if (typeof value !== 'string' || !allowed.includes(value as T)) errors.push(`${recipe.id}: ${field} "${String(value)}" is not allowed`);
			return value as T;
		};
		const flag = (field: string): boolean => {
			if (typeof entry[field] !== 'boolean') errors.push(`${recipe.id}: ${field} must be true or false`);
			return entry[field] === true;
		};
		const seasons = Array.isArray(entry.seasons) ? (entry.seasons as string[]) : [];
		if (!Array.isArray(entry.seasons) || seasons.some((s) => !(SEASONS as readonly string[]).includes(s))) errors.push(`${recipe.id}: seasons must be a list of ${SEASONS.join(', ')}`);
		const primary = entry.primary_ingredient ?? null;
		const lines = (recipe.ingredienti ?? []).map((l) => slug(l.nome));
		if (primary !== null && (typeof primary !== 'string' || !lines.includes(primary))) errors.push(`${recipe.id}: primary_ingredient "${String(primary)}" is not one of its ingredients`);
		const duration = entry.duration_minutes ?? null;
		if (duration !== null && (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0)) errors.push(`${recipe.id}: duration_minutes must be a positive whole number`);
		const proteinGroup = oneOf('protein_group', PROTEIN_GROUPS);
		const freshFish = flag('fresh_fish');
		if (freshFish && proteinGroup !== 'fish') errors.push(`${recipe.id}: fresh_fish is only for fish recipes`);
		attributes.set(recipe.id, {
			mealType: oneOf('meal_type', MEAL_TYPES),
			proteinGroup,
			freshFish,
			carbohydrateGroup: oneOf('carbohydrate_group', CARBOHYDRATE_GROUPS),
			category: oneOf('category', CATEGORIES),
			hasVegetables: flag('has_vegetables'),
			isHeavy: flag('is_heavy'),
			seasons: seasons as Season[],
			primaryIngredient: primary as string | null,
			durationMinutes: duration as number | null,
			uncertain: Array.isArray(entry.uncertain) ? (entry.uncertain as string[]) : [],
			note: typeof entry.note === 'string' ? entry.note : null
		});
	}
	return { attributes, errors };
}

export function toPlannerRecipes(recipes: OriginRecipe[], attributes: Map<string, RecipeAttributes>): PlannerRecipe[] {
	return recipes.map((recipe) => {
		const a = attributes.get(recipe.id);
		if (!a) throw new Error(`No attributes for ${recipe.id}`);
		return {
			id: recipe.id,
			durationMinutes: a.durationMinutes ?? durationOf(recipe.tempo),
			mealType: a.mealType,
			proteinGroup: a.proteinGroup,
			isFreshFish: a.freshFish,
			carbohydrateGroup: a.carbohydrateGroup,
			category: a.category,
			hasVegetables: a.hasVegetables,
			isHeavy: a.isHeavy,
			seasons: a.seasons,
			primaryIngredientId: a.primaryIngredient,
			ingredients: (recipe.ingredienti ?? []).map((line) => ({ ingredientId: slug(line.nome), isOptional: /facoltativ|opzional/i.test(line.nome) })),
			bookId: recipe.libro ? slug(recipe.libro.titolo) : null
		};
	});
}

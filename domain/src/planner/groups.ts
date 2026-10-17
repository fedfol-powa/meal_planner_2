import { FOOD_GROUPS, type DishKind, type FoodGroup, type PlannerRecipe } from './types.ts';

export function foodGroupsOf(recipe: PlannerRecipe): FoodGroup[] {
	const groups: FoodGroup[] = [];
	if ((FOOD_GROUPS as readonly string[]).includes(recipe.proteinGroup)) groups.push(recipe.proteinGroup as FoodGroup);
	if (recipe.carbohydrateGroup === 'potatoes') groups.push('potatoes');
	if (recipe.isHeavy) groups.push('heavy');
	return groups;
}

export function dishKindsOf(recipe: PlannerRecipe): DishKind[] {
	const kinds: DishKind[] = [];
	if (recipe.carbohydrateGroup === 'pasta') kinds.push('pasta');
	if (recipe.carbohydrateGroup === 'rice') kinds.push('rice');
	if (recipe.carbohydrateGroup === 'bread') kinds.push('bread_wrap');
	if (recipe.category === 'skottle') kinds.push('skottle');
	return kinds;
}

/**
 * What two recipes have in common for the similarity penalty (spec section 3). The primary ingredient
 * of one among the required lines of the other counts too, unless the primary ingredient is the same.
 */
export function sharedFeatures(a: PlannerRecipe, b: PlannerRecipe): string[] {
	const shared: string[] = [];
	if (a.proteinGroup === b.proteinGroup && a.proteinGroup !== 'vegetarian') shared.push('protein');
	if (a.carbohydrateGroup === b.carbohydrateGroup && a.carbohydrateGroup !== 'none') shared.push('carbohydrate');
	if (a.primaryIngredientId !== null && a.primaryIngredientId === b.primaryIngredientId) shared.push('primary_ingredient');
	else if ((a.primaryIngredientId !== null && uses(b, a.primaryIngredientId)) || (b.primaryIngredientId !== null && uses(a, b.primaryIngredientId))) shared.push('primary_ingredient_line');
	if (a.category === b.category && a.category !== 'other') shared.push('category');
	return shared;
}

/** True when the recipe needs the ingredient (optional lines do not count). */
export function uses(recipe: PlannerRecipe, ingredientId: string): boolean {
	return recipe.ingredients.some((line) => !line.isOptional && line.ingredientId === ingredientId);
}

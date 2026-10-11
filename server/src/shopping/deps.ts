import type { MealRecipeVersion, mealRecipeVersionsAt } from '../menu/versions.ts';

export type { MealRecipeVersion };

/** The R1 versions of a week's meals at an instant: W1's implementation, shared by Menu and Shopping. */
export type MealRecipeVersions = typeof mealRecipeVersionsAt;

export interface ShoppingDeps {
	mealRecipeVersions: MealRecipeVersions;
}

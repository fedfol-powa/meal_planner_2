import { RECIPE_CONTENT_FIELDS, type RecipeContent, type RecipeContentField } from './types';

/** Deep copy through JSON: structuredClone cannot copy the reactive proxies of the app store. */
export const plainCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A detached copy of the editable part of a recipe (round 5). */
export const contentOf = (recipe: RecipeContent): RecipeContent =>
	plainCopy(Object.fromEntries(RECIPE_CONTENT_FIELDS.map((f) => [f, recipe[f]]))) as RecipeContent;

/** Fields whose value differs between two contents. */
export function changedFields(a: RecipeContent, b: RecipeContent): RecipeContentField[] {
	return RECIPE_CONTENT_FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

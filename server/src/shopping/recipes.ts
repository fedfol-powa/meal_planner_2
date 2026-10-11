import type { ShoppingRecipe } from '@app/domain/shopping';
import { localizedSchema, quantitySchema } from '@app/domain/units';
import { z } from 'zod';
import type { Tx } from '../db.ts';

/**
 * What the list reads from a published RecipeDocument. Structural until W3's
 * `publishedRecipeSchema` is on main (plan, task 3): extra fields are allowed, the lines have
 * the shape of W3's document.
 */
const recipeContentSchema = z.object({
	name: localizedSchema,
	baseServings: z.number().int().positive(),
	ingredients: z
		.array(
			z.object({
				ingredientId: z.uuid(),
				variety: localizedSchema.nullable(),
				preparation: localizedSchema.nullable(),
				quantity: quantitySchema,
				isOptional: z.boolean(),
			}),
		)
		.min(1),
});

export const versionKey = (recipeId: string, version: number) => `${recipeId}:${version}`;

/** The published versions used by the meals, in one query; invalid content is an error, never skipped. */
export async function loadRecipes(tx: Tx, pairs: { recipeId: string; version: number }[]): Promise<Map<string, ShoppingRecipe>> {
	const recipes = new Map<string, ShoppingRecipe>();
	if (pairs.length === 0) return recipes;
	const rows = await tx<{ recipeId: string; version: number; content: unknown }[]>`
		select v.recipe_id as "recipeId", v.version, v.content
		from app.recipe_versions v
		join jsonb_to_recordset(${tx.json(pairs)}) as wanted("recipeId" uuid, version int)
			on wanted."recipeId" = v.recipe_id and wanted.version = v.version`;
	for (const row of rows) {
		const content = recipeContentSchema.parse(row.content);
		recipes.set(versionKey(row.recipeId, row.version), {
			id: row.recipeId,
			name: content.name,
			baseServings: content.baseServings,
			lines: content.ingredients,
		});
	}
	return recipes;
}

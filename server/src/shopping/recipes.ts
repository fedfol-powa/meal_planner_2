import { publishedRecipeSchema } from '@app/domain/recipe';
import type { ShoppingRecipe } from '@app/domain/shopping';
import type { Tx } from '../db.ts';

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
		const content = publishedRecipeSchema.parse(row.content);
		recipes.set(versionKey(row.recipeId, row.version), {
			id: row.recipeId,
			name: content.name,
			baseServings: content.baseServings,
			lines: content.ingredients,
		});
	}
	return recipes;
}

import { appError } from '../errors.ts';
import { fresh, type Implementer } from '../pipeline.ts';
import { canSeeRecipe } from './access.ts';
import { readRecipe, readRecipeBook } from './read.ts';
import { ratingSummaries } from './views.ts';

export function recipesRouter(os: Implementer) {
	return {
		search: os.recipes.search.handler(async ({ context, input }) =>
			fresh(context, await readRecipeBook(context.tx, { familyId: input.familyId, userId: context.userId, locale: context.locale }, input.query)),
		),

		get: os.recipes.get.handler(async ({ context, input }) =>
			fresh(context, await readRecipe(context.tx, { familyId: input.familyId, userId: context.userId, locale: context.locale }, input)),
		),
	};
}

export function ratingsRouter(os: Implementer) {
	return {
		/** Absolute state, so repeating it is harmless; null removes the caller's stars. */
		set: os.ratings.set.handler(async ({ context, input }) => {
			const { tx, userId } = context;
			if (!(await canSeeRecipe(tx, input.familyId, input.recipeId))) throw appError('not_found');
			if (input.stars === null) {
				await tx`delete from app.ratings where user_id = ${userId} and recipe_id = ${input.recipeId}`;
			} else {
				await tx`
					insert into app.ratings (user_id, recipe_id, stars) values (${userId}, ${input.recipeId}, ${input.stars})
					on conflict (user_id, recipe_id) do update set stars = excluded.stars, updated_at = now()`;
			}
			return (await ratingSummaries(tx, input.familyId, userId, [input.recipeId])).get(input.recipeId)!;
		}),
	};
}

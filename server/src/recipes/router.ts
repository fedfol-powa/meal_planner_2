import type { Localized } from '@app/domain/units';
import { appError } from '../errors.ts';
import { fresh, type Implementer } from '../pipeline.ts';
import { canSeeRecipe } from './access.ts';
import { loadAddedOn, loadCandidateIds, loadMealOccurrences, loadSynonyms, upcomingOf } from './load.ts';
import { searchRecipes, type SearchCandidate } from './search.ts';
import {
	contentKey,
	ingredientLinesView,
	loadBookTitlesById,
	loadContents,
	loadFamily,
	loadIngredientNamesById,
	ratingSummaries,
	recipeViewKey,
	recipeViews,
	summaryOf,
	type Content,
} from './views.ts';

export function recipesRouter(os: Implementer) {
	return {
		search: os.recipes.search.handler(async ({ context, input }) => {
			const { tx, userId, locale } = context;
			const { familyId } = input;
			const ids = await loadCandidateIds(tx, familyId);
			const [{ system }, contents, ratings, addedOn, meals] = await Promise.all([
				loadFamily(tx, familyId),
				loadContents(tx, ids.map((recipeId) => ({ recipeId, version: null }))),
				ratingSummaries(tx, familyId, userId, ids),
				loadAddedOn(tx, familyId, ids),
				loadMealOccurrences(tx, familyId, ids),
			]);
			// The current version's document of each candidate; one archived meanwhile drops out.
			const shown = ids.flatMap((recipeId) => {
				const content = contents.get(contentKey({ recipeId, version: null }));
				return content?.status === 'published' && content.lines ? [content as Content & { lines: NonNullable<Content['lines']> }] : [];
			});
			const ingredientIds = [...new Set(shown.flatMap((c) => c.lines.map((line) => line.ingredientId)))];
			const [names, synonyms, titles] = await Promise.all([
				loadIngredientNamesById(tx, ingredientIds),
				loadSynonyms(tx, ingredientIds),
				loadBookTitlesById(tx, shown.map((c) => c.bookId)),
			]);
			const byId = new Map(shown.map((c) => [c.recipeId, c]));
			const candidates: SearchCandidate[] = shown.map((c) => ({
				id: c.recipeId,
				// Published documents have both languages and every planner attribute.
				name: c.name as Localized,
				description: c.description as Localized,
				mealType: c.mealType!,
				durationMinutes: c.durationMinutes!,
				proteinGroup: c.proteinGroup!,
				familyAverage: ratings.get(c.recipeId)!.familyAverage,
				addedOn: addedOn.get(c.recipeId)!,
				lastEatenOn: meals.find((meal) => meal.recipeId === c.recipeId && meal.past)?.date ?? null,
				ingredientTexts: c.lines.flatMap((line) => [
					names.get(line.ingredientId)![locale],
					line.variety?.[locale] ?? '',
					...(synonyms.get(line.ingredientId)?.[locale] ?? []),
				]),
			}));
			const items = searchRecipes(candidates, input.query, locale).map((candidate) => {
				const c = byId.get(candidate.id)!;
				const base = c.baseServings!;
				return {
					recipe: summaryOf(c, titles, locale),
					rating: ratings.get(c.recipeId)!,
					baseServings: base,
					ingredients: ingredientLinesView(c.lines, names, { servings: base, baseServings: base, system, locale }),
					addedOn: candidate.addedOn,
					lastEatenOn: candidate.lastEatenOn,
					upcoming: upcomingOf(meals, c.recipeId),
				};
			});
			return fresh(context, { items });
		}),

		get: os.recipes.get.handler(async ({ context, input }) => {
			const { tx, userId, locale } = context;
			const { familyId, recipeId } = input;
			const status = await canSeeRecipe(tx, familyId, recipeId);
			if (!status) throw appError('not_found');
			// Opened from a meal: a past one shows the version in force when it passed (R1).
			let version: number | null = null;
			if (input.slotId) {
				const [slot] = await tx<{ version: number | null }[]>`
					select case when p.at <= now() then app.recipe_version_at(s.recipe_id, p.at) end as version
					from app.meal_slots s
					join app.weeks w on w.id = s.week_id
					join app.families f on f.id = w.family_id
					cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
					where s.id = ${input.slotId} and w.family_id = ${familyId} and s.recipe_id = ${recipeId}`;
				if (!slot) throw appError('not_found');
				version = slot.version;
			}
			// Without servings, 0: the lines come at the base of the version shown.
			const ref = { recipeId, version, servings: input.servings ?? 0 };
			const view = (await recipeViews(tx, { familyId, userId, locale }, [ref])).get(recipeViewKey(ref));
			if (!view?.ingredients || !view.rating || !view.baseServings) throw appError('not_found');
			const meals = await loadMealOccurrences(tx, familyId, [recipeId]);
			return fresh(context, {
				recipe: view.summary,
				status,
				baseServings: view.baseServings,
				servings: input.servings ?? view.baseServings,
				ingredients: view.ingredients,
				rating: view.rating,
				history: meals
					.filter((meal) => meal.past)
					.slice(0, 5)
					.map(({ date, mealType }) => ({ date, mealType })),
				upcoming: upcomingOf(meals, recipeId),
			});
		}),
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

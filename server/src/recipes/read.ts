import type { Locale, RecipeDetailView, RecipeListItemView } from '@app/contract';
import type { Localized } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { loadAddedOn, loadCandidateIds, loadMealOccurrences, loadSynonyms, upcomingOf } from './load.ts';
import { searchRecipes, type RecipeQuery, type SearchCandidate } from './search.ts';
import {
	contentKey,
	ingredientLinesView,
	loadBookTitlesById,
	loadContents,
	loadFamily,
	loadIngredientNamesById,
	ratingSummaries,
	summaryOf,
	type Content,
	type Viewer,
} from './views.ts';

/** The recipe book of the family (recipes.search), inside the caller's transaction. */
export async function readRecipeBook(tx: Tx, viewer: Viewer, query: RecipeQuery): Promise<{ items: RecipeListItemView[] }> {
	const { familyId, userId, locale } = viewer;
	const ids = await loadCandidateIds(tx, familyId);
	const [{ system }, contents, ratings, addedOn, meals] = await Promise.all([
		loadFamily(tx, familyId),
		// Book ownership judged again on the documents themselves (one snapshot with them).
		loadContents(tx, ids.map((recipeId) => ({ recipeId, version: null })), { familyId, viaMeals: false }),
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
	const items = searchRecipes(candidates, query, locale).map((candidate) => {
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
	return { items };
}

/** One recipe as the family may see it (recipes.get), inside the caller's transaction. */
export async function readRecipe(
	tx: Tx,
	viewer: Viewer,
	input: { recipeId: string; servings?: number; slotId?: string },
): Promise<RecipeDetailView> {
	const { familyId, userId, locale } = viewer;
	const { recipeId } = input;
	// Opened from a meal: a past one shows the version in force when it passed (R1), and the meal's
	// servings are the default (user's decision, 11 October 2026); a meal of zero servings keeps the base.
	let version: number | null = null;
	let mealServings: number | null = null;
	if (input.slotId) {
		const [slot] = await tx<{ version: number | null; servings: number }[]>`
			select case when p.at <= now() then app.recipe_version_at(s.recipe_id, p.at) end as version, s.servings
			from app.meal_slots s
			join app.weeks w on w.id = s.week_id
			join app.families f on f.id = w.family_id
			cross join lateral (select app.meal_passed_at(s.date, s.meal_type, f.time_zone) as at) p
			where s.id = ${input.slotId} and w.family_id = ${familyId} and s.recipe_id = ${recipeId}`;
		if (!slot) throw appError('not_found');
		version = slot.version;
		mealServings = slot.servings > 0 ? slot.servings : null;
	}
	// Who may see it and what it shows come from one statement: published or archived; from a
	// book only if the family owns that version's book or one of its meals cites the recipe.
	const content = (await loadContents(tx, [{ recipeId, version }], { familyId, viaMeals: true })).get(contentKey({ recipeId, version }));
	if (!content || content.status === 'draft' || !content.lines || !content.baseServings) throw appError('not_found');
	const base = content.baseServings;
	const servings = input.servings ?? mealServings ?? base;
	const [{ system }, ratings, titles, names, meals] = await Promise.all([
		loadFamily(tx, familyId),
		ratingSummaries(tx, familyId, userId, [recipeId]),
		loadBookTitlesById(tx, [content.bookId]),
		loadIngredientNamesById(tx, content.lines.map((line) => line.ingredientId)),
		loadMealOccurrences(tx, familyId, [recipeId]),
	]);
	return {
		recipe: summaryOf(content, titles, locale),
		status: content.status,
		baseServings: base,
		servings,
		ingredients: ingredientLinesView(content.lines, names, { servings, baseServings: base, system, locale }),
		rating: ratings.get(recipeId)!,
		history: meals
			.filter((meal) => meal.past)
			.slice(0, 5)
			.map(({ date, mealType }) => ({ date, mealType })),
		upcoming: upcomingOf(meals, recipeId),
	};
}

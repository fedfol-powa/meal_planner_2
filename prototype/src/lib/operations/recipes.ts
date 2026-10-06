import { isMealPast, isWeekVisible } from '#lib/domain/calendar.ts';
import type { DemoDatabase, IsoDate, Locale, MealType, MeasurementSystem, ProteinGroup, Recipe } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, isCurator, localeOf, localized, missingData, ratingSummary, recipeSummary, scaledIngredients, visibleRecipe, type MissingData } from './access';
import type { RatingSummary, RecipeSummary, ScaledIngredient } from './views';

export interface RecipeQuery {
	text?: string;
	mealType?: MealType;
	maxMinutes?: number;
	proteinGroup?: ProteinGroup;
	minStars?: number;
	sort?: RecipeSort;
	/** Inverts the chosen order (arrow next to the sort menu). */
	reversed?: boolean;
}

export type RecipeSort = 'name' | 'rating' | 'added' | 'lastEaten';

export interface RecipeListItem {
	recipe: RecipeSummary;
	rating: RatingSummary;
	/** Source servings, used for the ingredients shown in the catalogue card. */
	servings: number;
	ingredients: ScaledIngredient[];
	addedOn: IsoDate;
	lastEaten: IsoDate | null;
}

/** Most recent past meal of the family with this recipe, excluding meals marked not cooked. */
function lastEatenOf(db: DemoDatabase, familyId: string, ctx: OperationContext, recipeId: string): IsoDate | null {
	const dates = db.weeks
		.filter((w) => w.familyId === familyId && isWeekVisible(w, ctx.now))
		.flatMap((w) => w.slots)
		.filter((s) => s.recipeId === recipeId && isMealPast(s.date, s.mealType, ctx.now) && s.cooked !== false)
		.map((s) => s.date)
		.sort();
	return dates.at(-1) ?? null;
}

// Descending order with missing values last.
const desc = <T extends string | number>(a: T | null, b: T | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);

export interface DraftListItem {
	recipe: RecipeSummary;
	missing: MissingData[];
	servings: number | null;
	ingredients: ScaledIngredient[] | null;
}

export interface RecipeDetail {
	recipe: RecipeSummary;
	isDraft: boolean;
	missing: MissingData[];
	baseServings: number | null;
	servings: number;
	ingredients: ScaledIngredient[];
	rating: RatingSummary;
	history: { date: IsoDate; mealType: MealType }[];
	measurementSystem: MeasurementSystem;
}

export function normalizeForSearch(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function matchesText(db: DemoDatabase, recipe: Recipe, locale: Locale, needle: string): boolean {
	if (!needle) return true;
	const ingredientNames = recipe.ingredients.map((line) => {
		const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
		return ingredient ? localized(ingredient.name, locale).text : '';
	});
	const haystack = [localized(recipe.name, locale).text, localized(recipe.description, locale).text, ...ingredientNames];
	return haystack.some((value) => normalizeForSearch(value).includes(needle));
}

/** Drafts for the curators' section at the top of the catalogue (spec section 8). */
export function listDraftRecipes(db: DemoDatabase, ctx: OperationContext, query: Pick<RecipeQuery, 'text'>): OpResult<DraftListItem[]> {
	if (!familyFor(db, ctx) || !isCurator(db, ctx)) return fail('forbidden');
	const locale = localeOf(db, ctx);
	const needle = normalizeForSearch(query.text ?? '');
	return ok(
		db.recipes
			.filter((r) => r.status === 'draft' && matchesText(db, r, locale, needle))
			.map((r) => ({
				recipe: recipeSummary(db, r, locale),
				missing: missingData(db, r),
				servings: r.baseServings,
				ingredients: r.baseServings ? scaledIngredients(db, r, r.baseServings, locale) : null
			}))
			.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name, locale))
	);
}

export function searchRecipes(db: DemoDatabase, ctx: OperationContext, query: RecipeQuery): OpResult<RecipeListItem[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	const needle = normalizeForSearch(query.text ?? '');
	const items = db.recipes
		.filter((r) => visibleRecipe(db, family, r.id))
		.filter((r) => !query.mealType || r.mealType === query.mealType || r.mealType === 'both')
		.filter((r) => !query.maxMinutes || (r.durationMinutes !== null && r.durationMinutes <= query.maxMinutes))
		.filter((r) => !query.proteinGroup || r.proteinGroup === query.proteinGroup)
		.filter((r) => matchesText(db, r, locale, needle))
		.map((r) => ({
			recipe: recipeSummary(db, r, locale),
			rating: ratingSummary(db, family, ctx.userId, r.id),
			servings: r.baseServings ?? 1,
			ingredients: scaledIngredients(db, r, r.baseServings ?? 1, locale) ?? [],
			addedOn: r.addedOn,
			lastEaten: lastEatenOf(db, family.id, ctx, r.id)
		}))
		.filter((item) => !query.minStars || (item.rating.familyAverage ?? 0) >= query.minStars)
		.sort((a, b) => {
			const byName = a.recipe.name.localeCompare(b.recipe.name, locale);
			const primary =
				query.sort === 'rating' ? desc(a.rating.familyAverage, b.rating.familyAverage)
				: query.sort === 'added' ? desc(a.addedOn, b.addedOn)
				: query.sort === 'lastEaten' ? desc(a.lastEaten, b.lastEaten)
				: 0;
			return primary || byName;
		});
	return ok(query.reversed ? items.reverse() : items);
}

export function getRecipeDetail(db: DemoDatabase, ctx: OperationContext, recipeId: string, servings?: number): OpResult<RecipeDetail> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const draft = db.recipes.find((r) => r.id === recipeId && r.status === 'draft');
	const recipe = visibleRecipe(db, family, recipeId) ?? (draft && isCurator(db, ctx) ? draft : null);
	if (!recipe) return fail('not_found');
	const locale = localeOf(db, ctx);
	const base = recipe.baseServings;
	const chosen = servings && Number.isInteger(servings) && servings > 0 ? servings : (base ?? 1);
	const history = db.weeks
		.filter((w) => w.familyId === family.id && isWeekVisible(w, ctx.now))
		.flatMap((w) => w.slots)
		.filter((s) => s.recipeId === recipeId && isMealPast(s.date, s.mealType, ctx.now) && s.cooked !== false)
		.map((s) => ({ date: s.date, mealType: s.mealType }))
		.sort((a, b) => b.date.localeCompare(a.date))
		.slice(0, 5);
	return ok({
		recipe: recipeSummary(db, recipe, locale),
		isDraft: recipe.status === 'draft',
		missing: recipe.status === 'draft' ? missingData(db, recipe) : [],
		baseServings: base,
		servings: chosen,
		ingredients: scaledIngredients(db, recipe, chosen, locale) ?? [],
		rating: ratingSummary(db, family, ctx.userId, recipeId),
		history,
		measurementSystem: family.measurementSystem
	});
}

export function rateRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string, stars: number | null): OpResult<RatingSummary> {
	if (ctx.offline) return fail('offline');
	if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) return fail('invalid');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (!visibleRecipe(db, family, recipeId)) return fail('not_found');
	const index = db.ratings.findIndex((r) => r.userId === ctx.userId && r.recipeId === recipeId);
	if (stars === null) {
		if (index !== -1) db.ratings.splice(index, 1);
	} else if (index === -1) {
		db.ratings.push({ userId: ctx.userId, recipeId, stars });
	} else {
		db.ratings[index].stars = stars;
	}
	return ok(ratingSummary(db, family, ctx.userId, recipeId));
}

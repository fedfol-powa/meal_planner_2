import { plainCopy } from '#lib/domain/recipe-content.ts';
import { MEAL_PAST_AT, isMealPast } from '#lib/domain/calendar.ts';
import { withVariety } from '#lib/domain/ingredient-variety.ts';
import { summarize, validateForPublish, type MissingData } from '#lib/domain/recipe-validation.ts';
import type { DemoDatabase, Family, LocalDateTime, Locale, MealSlot, Recipe, RecipeVersion, Translated } from '#lib/domain/types.ts';
import { scaleQuantity } from '#lib/units/scale.ts';
import type { OperationContext } from './context';
import type { RatingSummary, RecipeSummary, ScaledIngredient } from './views';

export function familyFor(db: DemoDatabase, ctx: OperationContext): Family | null {
	const family = db.families.find((f) => f.id === ctx.familyId);
	return family && family.members.some((m) => m.userId === ctx.userId) ? family : null;
}

export function localeOf(db: DemoDatabase, ctx: OperationContext): Locale {
	return db.users.find((u) => u.id === ctx.userId)?.locale ?? 'it-IT';
}

export function isCurator(db: DemoDatabase, ctx: OperationContext): boolean {
	return db.users.find((u) => u.id === ctx.userId)?.globalRoles.includes('recipe_curator') ?? false;
}

export type { MissingData };

/** What keeps a recipe in draft (spec section 8): the publication check, in short. */
export function missingData(db: DemoDatabase, recipe: Recipe): MissingData[] {
	return summarize(validateForPublish(db, recipe));
}

export function localized(text: Translated, locale: Locale): { text: string; missing: boolean } {
	const value = text[locale];
	return value ? { text: value, missing: false } : { text: text['it-IT'], missing: true };
}

/**
 * Published or archived recipes, excluding books the family does not own (spec section 3): what meals can
 * open and rate. Archived recipes stay readable from meals (round 5).
 */
export function visibleRecipe(db: DemoDatabase, family: Family, recipeId: string): Recipe | null {
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe || recipe.status === 'draft') return null;
	if (recipe.bookId && !family.bookIds.includes(recipe.bookId)) return null;
	return recipe;
}

/** Visible and in the catalogue: what search, suggestions and recipe changes may offer. */
export function catalogueRecipe(db: DemoDatabase, family: Family, recipeId: string): Recipe | null {
	const recipe = visibleRecipe(db, family, recipeId);
	return recipe?.status === 'published' ? recipe : null;
}

/** The version published at that moment (review R1); the first one for earlier moments, null without versions. */
export function versionAt(db: DemoDatabase, recipeId: string, at: LocalDateTime): RecipeVersion | null {
	const versions = db.recipeVersions.filter((v) => v.recipeId === recipeId).sort((a, b) => a.version - b.version);
	return versions.filter((v) => v.publishedAt <= at).at(-1) ?? versions[0] ?? null;
}

/** Version of a past meal (review R1, round 5): the one in force when it became past; null for other meals. */
export function versionForSlot(db: DemoDatabase, slot: Pick<MealSlot, 'date' | 'mealType' | 'recipeId'>, now: LocalDateTime): RecipeVersion | null {
	if (!slot.recipeId || !isMealPast(slot.date, slot.mealType, now)) return null;
	return versionAt(db, slot.recipeId, `${slot.date}T${MEAL_PAST_AT[slot.mealType]}`);
}

/** The recipe as a meal shows it: past meals keep their version, the others follow the current one. */
export function recipeForSlot(db: DemoDatabase, slot: Pick<MealSlot, 'date' | 'mealType' | 'recipeId'>, now: LocalDateTime): Recipe | null {
	const recipe = slot.recipeId ? db.recipes.find((r) => r.id === slot.recipeId) ?? null : null;
	const inForce = recipe && versionForSlot(db, slot, now);
	return recipe && inForce && inForce.version !== recipe.version ? { ...recipe, ...plainCopy(inForce.content) } : recipe;
}

export function ratingSummary(db: DemoDatabase, family: Family, userId: string, recipeId: string): RatingSummary {
	const memberIds = new Set(family.members.map((m) => m.userId));
	const ratings = db.ratings.filter((r) => r.recipeId === recipeId && memberIds.has(r.userId));
	const total = ratings.reduce((sum, r) => sum + r.stars, 0);
	return {
		familyAverage: ratings.length ? total / ratings.length : null,
		familyCount: ratings.length,
		myStars: ratings.find((r) => r.userId === userId)?.stars ?? null
	};
}

export function recipeSummary(db: DemoDatabase, recipe: Recipe, locale: Locale): RecipeSummary {
	const name = localized(recipe.name, locale);
	const description = localized(recipe.description, locale);
	return {
		id: recipe.id,
		name: name.text,
		description: description.text,
		translationMissing: name.missing || description.missing,
		photo: recipe.photo,
		durationMinutes: recipe.durationMinutes,
		sourceType: recipe.sourceType,
		sourceUrl: recipe.sourceUrl,
		bookTitle: db.books.find((b) => b.id === recipe.bookId)?.title ?? null,
		bookPages: recipe.bookPages,
		mealType: recipe.mealType,
		proteinGroup: recipe.proteinGroup
	};
}

export function scaledIngredients(db: DemoDatabase, recipe: Recipe, servings: number, locale: Locale): ScaledIngredient[] | null {
	if (!recipe.baseServings || recipe.ingredients.length === 0) return null;
	const base = recipe.baseServings;
	return recipe.ingredients.map((line) => {
		const ingredient = db.ingredients.find((i) => i.id === line.ingredientId);
		return {
			ingredientId: line.ingredientId,
			name: withVariety(ingredient ? localized(ingredient.name, locale).text : line.ingredientId, line.variety ? localized(line.variety, locale).text : null),
			quantity: scaleQuantity(line.quantity, servings, base),
			sourceText: line.text ? localized(line.text, locale).text : line.sourceText
		};
	});
}

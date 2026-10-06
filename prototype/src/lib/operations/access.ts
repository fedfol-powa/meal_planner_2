import type { DemoDatabase, Family, Locale, Recipe, Translated } from '#lib/domain/types.ts';
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

export function localized(text: Translated, locale: Locale): { text: string; missing: boolean } {
	const value = text[locale];
	return value ? { text: value, missing: false } : { text: text['it-IT'], missing: true };
}

/** Published recipes, excluding books the family does not own (spec section 3). */
export function visibleRecipe(db: DemoDatabase, family: Family, recipeId: string): Recipe | null {
	const recipe = db.recipes.find((r) => r.id === recipeId);
	if (!recipe || recipe.status !== 'published') return null;
	if (recipe.bookId && !family.bookIds.includes(recipe.bookId)) return null;
	return recipe;
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
			name: ingredient ? localized(ingredient.name, locale).text : line.ingredientId,
			quantity: scaleQuantity(line.quantity, servings, base),
			sourceText: line.text ? localized(line.text, locale).text : line.sourceText
		};
	});
}

import { isDishKind, slotSetting, weekdayOf } from '#lib/domain/settings.ts';
import type { DemoDatabase, Family, MealSlot, Recipe } from '#lib/domain/types.ts';

/** Ingredient ids a recipe uses, with the canonical id of demo duplicates. */
function ingredientIdsOf(db: DemoDatabase, recipe: Recipe): Set<string> {
	const ids = new Set<string>();
	for (const line of recipe.ingredients) {
		ids.add(line.ingredientId);
		const canonical = db.ingredients.find((i) => i.id === line.ingredientId)?.canonicalId;
		if (canonical) ids.add(canonical);
	}
	return ids;
}

/**
 * Hard constraints of the family settings for one slot (spec section 3), used by the simulated first
 * generation and by suggestions: time limit, meal rules, avoided ingredients and weekly maximums of
 * limited ones. `weekSlots` are the other slots of the same week.
 */
export function fitsSettings(db: DemoDatabase, family: Family, recipe: Recipe, slot: Pick<MealSlot, 'id' | 'date' | 'mealType'>, weekSlots: MealSlot[]): boolean {
	const setting = slotSetting(family.settings, slot.date, slot.mealType);
	if (setting.maxMinutes !== null && (recipe.durationMinutes === null || recipe.durationMinutes > setting.maxMinutes)) return false;
	const weekday = weekdayOf(slot.date);
	for (const rule of family.settings.rules) {
		if (rule.kind === 'only_lunch' && slot.mealType === 'dinner' && isDishKind(recipe, rule.dish)) return false;
		if (rule.kind === 'never_on' && rule.weekday === weekday && recipe.proteinGroup === rule.group) return false;
	}
	const restrictions = db.familyIngredients.filter((f) => f.familyId === family.id);
	if (restrictions.length === 0) return true;
	const ids = ingredientIdsOf(db, recipe);
	for (const r of restrictions) {
		if (!ids.has(r.ingredientId)) continue;
		if (r.restriction === 'avoid') return false;
		const used = weekSlots
			.filter((s) => s.id !== slot.id && s.recipeId)
			.filter((s) => ingredientIdsOf(db, db.recipes.find((x) => x.id === s.recipeId)!).has(r.ingredientId)).length;
		if (r.weeklyMax !== null && used >= r.weeklyMax) return false;
	}
	return true;
}

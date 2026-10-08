import { addDays, weekdayOf } from './calendar.ts';
import { dishKindsOf, uses } from './groups.ts';
import { LOW_SCORE, RECENT_DAYS } from './settings.ts';
import { MEAL_TYPES, type IngredientRestriction, type IsoDate, type MealRule, type MealType, type PastMeal, type PlannedSlot, type PlannedWeek, type PlannerInput, type PlannerRecipe, type PlannerSettings, type SlotSetting } from './types.ts';

export interface SlotRef {
	date: IsoDate;
	mealType: MealType;
	maxMinutes: number | null;
}

export function slotSettingOf(settings: PlannerSettings, date: IsoDate, mealType: MealType): SlotSetting {
	return settings.slots[mealType][weekdayOf(date)];
}

export function slotRefOf(slot: Pick<PlannedSlot, 'date' | 'mealType'>, settings: PlannerSettings): SlotRef {
	return { date: slot.date, mealType: slot.mealType, maxMinutes: slotSettingOf(settings, slot.date, slot.mealType).maxMinutes };
}

/** Time limit, meal type and meal rules of the slot. A recipe without a duration never fits a time limit. */
export function fitsSlot(recipe: PlannerRecipe, slot: SlotRef, rules: MealRule[]): boolean {
	if (slot.maxMinutes !== null && (recipe.durationMinutes === null || recipe.durationMinutes > slot.maxMinutes)) return false;
	if (recipe.mealType !== 'both' && recipe.mealType !== slot.mealType) return false;
	const weekday = weekdayOf(slot.date);
	const kinds = dishKindsOf(recipe);
	for (const rule of rules) {
		if (rule.kind === 'only_lunch' && slot.mealType === 'dinner' && kinds.includes(rule.dish)) return false;
		if (rule.kind === 'never_on' && rule.weekday === weekday && recipe.proteinGroup === rule.group) return false;
	}
	return true;
}

/** Exclusions, books the family does not own and avoided ingredients (optional lines allowed). */
export function isAvailable(recipe: PlannerRecipe, input: PlannerInput): boolean {
	if (input.exclusions.includes(recipe.id)) return false;
	if (recipe.bookId !== null && !input.ownedBookIds.includes(recipe.bookId)) return false;
	return !input.restrictions.some((r) => r.restriction === 'avoid' && uses(recipe, r.ingredientId));
}

export function recentlyUsed(recipeId: string, weekStart: IsoDate, history: PastMeal[]): boolean {
	const from = addDays(weekStart, -RECENT_DAYS);
	return history.some((meal) => meal.recipeId === recipeId && meal.date >= from && meal.date < weekStart);
}

export function withinLimits(candidate: PlannerRecipe, weekRecipes: PlannerRecipe[], restrictions: IngredientRestriction[]): boolean {
	return restrictions.every(
		(r) =>
			r.restriction !== 'limit' ||
			r.weeklyMax === null ||
			!uses(candidate, r.ingredientId) ||
			weekRecipes.filter((w) => uses(w, r.ingredientId)).length < r.weeklyMax
	);
}

/** Recipes that can go in the slot given the rest of the week; low-rated ones only if nothing else fits. */
export function candidatesFor(slot: SlotRef, input: PlannerInput, weekRecipes: PlannerRecipe[]): PlannerRecipe[] {
	const used = new Set(weekRecipes.map((r) => r.id));
	const valid = input.recipes.filter(
		(r) =>
			!used.has(r.id) &&
			isAvailable(r, input) &&
			fitsSlot(r, slot, input.settings.rules) &&
			!recentlyUsed(r.id, input.weekStart, input.history) &&
			withinLimits(r, weekRecipes, input.restrictions)
	);
	const liked = valid.filter((r) => (input.familyScores[r.id] ?? Infinity) > LOW_SCORE);
	return liked.length > 0 ? liked : valid;
}

/** Every broken hard constraint of a generated week, as readable lines; empty when the week is valid. */
export function hardViolations(week: PlannedWeek, input: PlannerInput): string[] {
	const problems: string[] = [];
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	let expected = 0;
	for (let day = 0; day < 7; day++) {
		for (const mealType of MEAL_TYPES) {
			const date = addDays(input.weekStart, day);
			const setting = slotSettingOf(input.settings, date, mealType);
			if (setting.servings === 0) continue;
			expected++;
			const key = `${date} ${mealType}`;
			const slot = week.slots.find((s) => s.date === date && s.mealType === mealType);
			if (!slot) {
				problems.push(`${key}: missing`);
				continue;
			}
			if (slot.servings !== setting.servings) problems.push(`${key}: servings`);
			if (setting.fixedText !== null && (slot.content.kind !== 'free' || slot.content.text !== setting.fixedText)) problems.push(`${key}: fixed meal changed`);
			if (setting.fixedText === null && slot.content.kind === 'free') problems.push(`${key}: unexpected free meal`);
		}
	}
	if (week.slots.length !== expected) problems.push('slot count');
	const placed: PlannerRecipe[] = [];
	for (const slot of week.slots) {
		if (slot.content.kind !== 'recipe') continue;
		const key = `${slot.date} ${slot.mealType}`;
		const recipe = byId.get(slot.content.recipeId);
		if (!recipe) {
			problems.push(`${key}: unknown recipe`);
			continue;
		}
		if (placed.some((r) => r.id === recipe.id)) problems.push(`${key}: repeated in the week`);
		if (!isAvailable(recipe, input)) problems.push(`${key}: not available`);
		if (!fitsSlot(recipe, slotRefOf(slot, input.settings), input.settings.rules)) problems.push(`${key}: does not fit the slot`);
		if (recentlyUsed(recipe.id, input.weekStart, input.history)) problems.push(`${key}: used in the last two weeks`);
		placed.push(recipe);
	}
	for (const r of input.restrictions) {
		if (r.restriction !== 'limit' || r.weeklyMax === null) continue;
		if (placed.filter((p) => uses(p, r.ingredientId)).length > r.weeklyMax) problems.push(`${r.ingredientId}: over the weekly maximum`);
	}
	return problems;
}

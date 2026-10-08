import { mealIndex, seasonOf } from './calendar.ts';
import { foodGroupsOf, sharedFeatures } from './groups.ts';
import { knownNewApplies, knownRecipeIds } from './familiarity.ts';
import { weekRuleProblems, type RuleProblem } from './repair.ts';
import { FOOD_GROUPS, type FoodGroup, type IsoDate, type PastMeal, type PlannedWeek, type PlannerInput, type PlannerRecipe } from './types.ts';

export interface ClosePair {
	first: PastMeal;
	second: PastMeal;
	distance: number;
	shared: string[];
}

export interface WeekMetrics {
	groupCounts: Record<FoodGroup, number>;
	problems: RuleProblem[];
	known: number;
	fresh: number;
	knownNewApplies: boolean;
	noMatch: number;
	/** Meals whose recipe is not in season on that date. */
	outOfSeason: number;
	closePairs: ClosePair[];
}

/** True when the recipe has seasons and the date falls in none of them. */
export function isOutOfSeason(recipe: PlannerRecipe, date: IsoDate): boolean {
	return recipe.seasons.length > 0 && !recipe.seasons.includes(seasonOf(date));
}

const CLOSE_DISTANCE = 2;

export function weekMetrics(week: PlannedWeek, input: PlannerInput): WeekMetrics {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const meals: PastMeal[] = week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []));
	const recipes = meals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [recipe] : [];
	});
	const groupCounts = Object.fromEntries(FOOD_GROUPS.map((g) => [g, recipes.filter((r) => foodGroupsOf(r).includes(g)).length])) as Record<FoodGroup, number>;
	const knownIds = knownRecipeIds(input);
	const known = recipes.filter((r) => knownIds.has(r.id)).length;

	const timeline = [...input.history.filter((m) => m.date < week.weekStart), ...meals].sort((a, b) => mealIndex(a.date, a.mealType) - mealIndex(b.date, b.mealType));
	const closePairs: ClosePair[] = [];
	timeline.forEach((first, i) => {
		for (const second of timeline.slice(i + 1)) {
			const distance = mealIndex(second.date, second.mealType) - mealIndex(first.date, first.mealType);
			if (distance > CLOSE_DISTANCE) break;
			if (second.date < week.weekStart) continue;
			const a = byId.get(first.recipeId);
			const b = byId.get(second.recipeId);
			if (!a || !b) continue;
			const shared = sharedFeatures(a, b);
			if (shared.length > 0) closePairs.push({ first, second, distance, shared });
		}
	});

	return {
		groupCounts,
		problems: weekRuleProblems(week, input),
		known,
		fresh: recipes.length - known,
		knownNewApplies: knownNewApplies(input),
		noMatch: week.slots.filter((s) => s.content.kind === 'no_match').length,
		outOfSeason: meals.filter((m) => {
			const recipe = byId.get(m.recipeId);
			return recipe !== undefined && isOutOfSeason(recipe, m.date);
		}).length,
		closePairs
	};
}

import { mealIndex } from './calendar.ts';
import { foodGroupsOf, sharedFeatures } from './groups.ts';
import { weekRuleProblems, type RuleProblem } from './repair.ts';
import { KNOWN_NEW_MIN_COOKED } from './settings.ts';
import { FOOD_GROUPS, type FoodGroup, type PastMeal, type PlannedWeek, type PlannerInput } from './types.ts';

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
	closePairs: ClosePair[];
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
	const cooked = new Set(input.history.map((m) => m.recipeId));
	const known = recipes.filter((r) => cooked.has(r.id)).length;

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
		knownNewApplies: cooked.size >= KNOWN_NEW_MIN_COOKED,
		noMatch: week.slots.filter((s) => s.content.kind === 'no_match').length,
		closePairs
	};
}

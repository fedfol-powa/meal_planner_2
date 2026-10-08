import { daysBetween, mealIndex, seasonOf, weekdayOf } from './calendar.ts';
import { knownNewApplies, knownRecipeIds } from './familiarity.ts';
import { foodGroupsOf, sharedFeatures, uses } from './groups.ts';
import { prepared } from './prepared.ts';
import { FULL_RECENCY_DAYS, SIMILARITY_WINDOW } from './settings.ts';
import type { IsoDate, MealType, PlannerInput, PlannerRecipe } from './types.ts';

export interface Placed {
	date: IsoDate;
	mealType: MealType;
	recipe: PlannerRecipe;
}

export interface ScoreContext {
	input: PlannerInput;
	/** Recipes already placed in the week being generated. */
	week: Placed[];
	/** Past meals whose recipe is in the catalogue. */
	past: Placed[];
	/** Recipes cooked within the known window ("known"); the others count as new. */
	knownIds: Set<string>;
	knownNewApplies: boolean;
}

export function buildContext(input: PlannerInput, week: Placed[]): ScoreContext {
	return { input, week, past: prepared(input).past, knownIds: knownRecipeIds(input), knownNewApplies: knownNewApplies(input) };
}

const NEUTRAL_STARS = 3;

export function scoreCandidate(recipe: PlannerRecipe, slot: { date: IsoDate; mealType: MealType }, ctx: ScoreContext): number {
	const { settings, familyScores, globalScores, restrictions } = ctx.input;
	const w = settings.weights;

	const stars = familyScores[recipe.id] ?? globalScores[recipe.id] ?? NEUTRAL_STARS;
	const liking = (stars - 1) / 4;

	const lastDates = ctx.past.filter((p) => p.recipe.id === recipe.id).map((p) => p.date).sort();
	const last = lastDates.at(-1);
	const recency = last === undefined ? 1 : Math.min(daysBetween(last, slot.date) / FULL_RECENCY_DAYS, 1);

	const season = recipe.seasons.length === 0 || recipe.seasons.includes(seasonOf(slot.date)) ? 1 : 0;

	let balance = 0;
	for (const group of foodGroupsOf(recipe)) {
		const count = ctx.week.filter((p) => foodGroupsOf(p.recipe).includes(group)).length;
		const range = settings.groupRanges[group];
		if (count + 1 > range.max) balance -= 1;
		else if (count < range.min) balance += 1;
	}

	const here = mealIndex(slot.date, slot.mealType);
	let similarity = 0;
	for (const near of [...ctx.past, ...ctx.week]) {
		const distance = Math.abs(mealIndex(near.date, near.mealType) - here);
		if (distance > 0 && distance <= SIMILARITY_WINDOW) similarity += sharedFeatures(recipe, near.recipe).length / distance;
	}

	const vegetables = recipe.hasVegetables ? 1 : 0;

	let knownNew = 0;
	if (ctx.knownNewApplies) {
		const target = settings.knownNew;
		const known = ctx.week.filter((p) => ctx.knownIds.has(p.recipe.id)).length;
		const fresh = ctx.week.length - known;
		if (ctx.knownIds.has(recipe.id)) knownNew = known < target.known ? 1 : known >= target.known + target.tolerance ? -1 : 0;
		else knownNew = fresh < target.new ? 1 : fresh >= target.new + target.tolerance ? -1 : 0;
	}

	const limit = -restrictions.filter((r) => r.restriction === 'limit' && uses(recipe, r.ingredientId)).length;

	const weekday = weekdayOf(slot.date);
	const rules = settings.rules.filter(
		(rule) =>
			rule.kind === 'at_least_one' &&
			rule.weekday === weekday &&
			recipe.proteinGroup === rule.group &&
			!ctx.week.some((p) => weekdayOf(p.date) === weekday && p.recipe.proteinGroup === rule.group)
	).length;

	return (
		w.liking * liking +
		w.recency * recency +
		w.season * season +
		w.balance * balance -
		w.similarity * similarity +
		w.vegetables * vegetables +
		w.knownNew * knownNew +
		w.limit * limit +
		w.rules * rules
	);
}

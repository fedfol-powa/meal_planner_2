import { mealIndex, weekdayOf } from './calendar.ts';
import { candidatesFor, fitsSlot, slotRefOf } from './constraints.ts';
import { knownNewApplies, knownRecipeIds } from './familiarity.ts';
import { foodGroupsOf, sharedFeatures } from './groups.ts';
import { MAX_REPAIR_ROUNDS, SIMILARITY_WINDOW } from './settings.ts';
import { FOOD_GROUPS, type PlannedSlot, type PlannedWeek, type PlannerInput, type PlannerRecipe } from './types.ts';

export interface RuleProblem {
	kind: 'rule' | 'group_above' | 'group_below' | 'known_new';
	detail: string;
	amount: number;
}

function recipesOf(week: PlannedWeek, input: PlannerInput): { slot: PlannedSlot; recipe: PlannerRecipe }[] {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	return week.slots.flatMap((slot) => {
		if (slot.content.kind !== 'recipe') return [];
		const recipe = byId.get(slot.content.recipeId);
		return recipe ? [{ slot, recipe }] : [];
	});
}

/** Week-level rules of spec section 3: "at least one" rules, group ranges, known/new quota. */
export function weekRuleProblems(week: PlannedWeek, input: PlannerInput): RuleProblem[] {
	const { settings } = input;
	const placed = recipesOf(week, input);
	const problems: RuleProblem[] = [];
	for (const rule of settings.rules) {
		if (rule.kind !== 'at_least_one') continue;
		const planned = week.slots.some((s) => weekdayOf(s.date) === rule.weekday && s.content.kind !== 'free');
		const met = placed.some((p) => weekdayOf(p.slot.date) === rule.weekday && p.recipe.proteinGroup === rule.group);
		if (planned && !met) problems.push({ kind: 'rule', detail: `${rule.group} on weekday ${rule.weekday}`, amount: 1 });
	}
	for (const group of FOOD_GROUPS) {
		const count = placed.filter((p) => foodGroupsOf(p.recipe).includes(group)).length;
		const range = settings.groupRanges[group];
		if (count > range.max) problems.push({ kind: 'group_above', detail: group, amount: count - range.max });
		if (count < range.min) problems.push({ kind: 'group_below', detail: group, amount: range.min - count });
	}
	if (knownNewApplies(input)) {
		const knownIds = knownRecipeIds(input);
		const known = placed.filter((p) => knownIds.has(p.recipe.id)).length;
		const off = Math.abs(known - settings.knownNew.known) - settings.knownNew.tolerance;
		if (off > 0) problems.push({ kind: 'known_new', detail: `${known} known`, amount: off });
	}
	return problems;
}

export function problemScore(problems: RuleProblem[]): number {
	return problems.reduce((sum, p) => sum + p.amount, 0);
}

const withContent = (week: PlannedWeek, index: number, recipeId: string): PlannedWeek => ({
	...week,
	slots: week.slots.map((s, i) => (i === index ? { ...s, content: { kind: 'recipe', recipeId } } : s))
});

/** Single-slot replacements and two-slot swaps that keep every hard constraint. */
function alternatives(week: PlannedWeek, input: PlannerInput): PlannedWeek[] {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const idOf = (slot: PlannedSlot) => (slot.content.kind === 'recipe' ? slot.content.recipeId : null);
	const result: PlannedWeek[] = [];
	week.slots.forEach((slot, i) => {
		if (slot.content.kind === 'free') return;
		const others = week.slots.flatMap((s, j) => {
			const id = j === i ? null : idOf(s);
			const recipe = id === null ? undefined : byId.get(id);
			return recipe ? [recipe] : [];
		});
		for (const candidate of candidatesFor(slotRefOf(slot, input.settings), input, others)) {
			if (candidate.id !== idOf(slot)) result.push(withContent(week, i, candidate.id));
		}
	});
	week.slots.forEach((a, i) => {
		week.slots.forEach((b, j) => {
			if (j <= i) return;
			const first = idOf(a) === null ? undefined : byId.get(idOf(a) as string);
			const second = idOf(b) === null ? undefined : byId.get(idOf(b) as string);
			if (!first || !second) return;
			if (!fitsSlot(first, slotRefOf(b, input.settings), input.settings.rules)) return;
			if (!fitsSlot(second, slotRefOf(a, input.settings), input.settings.rules)) return;
			result.push(withContent(withContent(week, i, second.id), j, first.id));
		});
	});
	return result;
}

/** How repetitive the week is: shared features of nearby meals, weighted by closeness, previous week included. */
export function weekSimilarity(week: PlannedWeek, input: PlannerInput): number {
	const byId = new Map(input.recipes.map((r) => [r.id, r]));
	const meals = [...input.history.filter((m) => m.date < week.weekStart), ...week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []))];
	const placed = meals.flatMap((m) => {
		const recipe = byId.get(m.recipeId);
		return recipe ? [{ index: mealIndex(m.date, m.mealType), inWeek: m.date >= week.weekStart, recipe }] : [];
	});
	let total = 0;
	for (const a of placed) {
		if (!a.inWeek) continue;
		for (const b of placed) {
			const distance = a.index - b.index;
			if (distance > 0 && distance <= SIMILARITY_WINDOW) total += sharedFeatures(a.recipe, b.recipe).length / distance;
		}
	}
	return total;
}

/** Local repair: each round keeps the change that fixes most; among equal fixes, the least repetitive week. */
export function repairWeek(week: PlannedWeek, input: PlannerInput): PlannedWeek {
	let current = week;
	for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
		const currentScore = problemScore(weekRuleProblems(current, input));
		if (currentScore === 0) break;
		let best: { week: PlannedWeek; score: number; similarity: number } | null = null;
		for (const alternative of alternatives(current, input)) {
			const score = problemScore(weekRuleProblems(alternative, input));
			if (score >= currentScore) continue;
			const similarity = weekSimilarity(alternative, input);
			if (!best || score < best.score || (score === best.score && similarity < best.similarity)) best = { week: alternative, score, similarity };
		}
		if (!best) break;
		current = best.week;
	}
	return current;
}

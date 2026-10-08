import { addDays } from './calendar.ts';
import { candidatesFor, slotRefOf, slotSettingOf } from './constraints.ts';
import { compareIds, createRandom, seedFrom, weightedPick } from './random.ts';
import { repairWeek, withSortedCatalogue } from './repair.ts';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import { TOP_K } from './settings.ts';
import { MEAL_TYPES, type PlannedSlot, type PlannedWeek, type PlannerInput } from './types.ts';

/** Step 1: the week's slots from the diners matrix, with servings and fixed free meals. */
export function plannedSlots(input: PlannerInput): PlannedSlot[] {
	const slots: PlannedSlot[] = [];
	for (let day = 0; day < 7; day++) {
		for (const mealType of MEAL_TYPES) {
			const date = addDays(input.weekStart, day);
			const setting = slotSettingOf(input.settings, date, mealType);
			if (setting.servings === 0) continue;
			const content: PlannedSlot['content'] = setting.fixedText !== null ? { kind: 'free', text: setting.fixedText } : { kind: 'no_match' };
			slots.push({ date, mealType, servings: setting.servings, content });
		}
	}
	return slots;
}

/** Generates the week (spec section 3). Same input, same week: the seed comes from family and week. */
export function generateWeek(rawInput: PlannerInput): PlannedWeek {
	const input = withSortedCatalogue(rawInput);
	const random = createRandom(seedFrom(`${input.familyId}:${input.weekStart}`));
	const slots = plannedSlots(input);
	const open = slots.filter((s) => s.content.kind !== 'free');
	const placed: Placed[] = [];
	while (open.length > 0) {
		const options = open.map((slot, order) => ({ slot, order, candidates: candidatesFor(slotRefOf(slot, input.settings), input, placed.map((p) => p.recipe)) }));
		options.sort((a, b) => a.candidates.length - b.candidates.length || a.order - b.order);
		const { slot, candidates } = options[0];
		open.splice(open.indexOf(slot), 1);
		if (candidates.length === 0) continue;
		const ctx = buildContext(input, placed);
		const ranked = candidates
			.map((recipe) => ({ recipe, score: scoreCandidate(recipe, slot, ctx) }))
			.sort((a, b) => b.score - a.score || compareIds(a.recipe.id, b.recipe.id))
			.slice(0, TOP_K);
		const floor = ranked[ranked.length - 1].score;
		const choice = weightedPick(ranked.map((r) => ({ item: r.recipe, weight: r.score - floor + 1 })), random);
		slot.content = { kind: 'recipe', recipeId: choice.id };
		placed.push({ date: slot.date, mealType: slot.mealType, recipe: choice });
	}
	return repairWeek({ weekStart: input.weekStart, slots }, input);
}

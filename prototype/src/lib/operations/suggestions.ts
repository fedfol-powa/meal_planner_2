import { addDays, isMealPast } from '#lib/domain/calendar.ts';
import type { DemoDatabase, Family, MealSlot, Week } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, localeOf, localized, ratingSummary, recipeSummary, visibleRecipe } from './access';
import type { SuggestionView } from './views';

/**
 * Simulated stand-in for the planner score (spec section 3, "Riuso durante la revisione"),
 * declared in the interface. Documented in design/percorsi.md, round 2.
 */
export interface RankedCandidate {
	recipeId: string;
	name: string;
	score: number;
	neighbourPenalty: number;
}

const SUGGESTION_COUNT = 5;
const UNRATED_AVERAGE = 3;
const BONUS_PER_WEEK = 0.1;
const MAX_FRESHNESS_BONUS = 1;
const MEAL_ORDER = { lunch: 0, dinner: 1 } as const;

const slotKey = (s: MealSlot) => `${s.date}-${MEAL_ORDER[s.mealType]}`;

export function findSlot(db: DemoDatabase, family: Family, slotId: string): { week: Week; slot: MealSlot } | null {
	for (const week of db.weeks) {
		if (week.familyId !== family.id) continue;
		const slot = week.slots.find((s) => s.id === slotId);
		if (slot) return { week, slot };
	}
	return null;
}

export function rankCandidates(db: DemoDatabase, ctx: OperationContext, slot: MealSlot): RankedCandidate[] {
	const family = familyFor(db, ctx);
	if (!family) return [];
	const locale = localeOf(db, ctx);
	const familyWeeks = db.weeks.filter((w) => w.familyId === family.id);
	const week = familyWeeks.find((w) => w.slots.some((s) => s.id === slot.id));
	if (!week) return [];

	// Other slots of the same week and every slot of the two weeks before.
	const earliest = addDays(week.startsOn, -14);
	const taken = new Set(
		familyWeeks
			.filter((w) => w.startsOn >= earliest && w.startsOn <= week.startsOn)
			.flatMap((w) => w.slots)
			.filter((s) => s.id !== slot.id && s.recipeId)
			.map((s) => s.recipeId)
	);
	const excluded = new Set(db.exclusions.filter((e) => e.familyId === family.id).map((e) => e.recipeId));

	const ordered = familyWeeks.flatMap((w) => w.slots).sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
	const index = ordered.findIndex((s) => s.id === slot.id);
	const neighbourGroups = [ordered[index - 1], ordered[index + 1]]
		.map((s) => (s?.recipeId ? db.recipes.find((r) => r.id === s.recipeId)?.proteinGroup ?? null : null))
		.filter((g) => g !== null);

	return db.recipes
		.filter((r) => visibleRecipe(db, family, r.id))
		.filter((r) => r.mealType === slot.mealType || r.mealType === 'both')
		.filter((r) => !taken.has(r.id) && !excluded.has(r.id))
		.map((r) => {
			const average = ratingSummary(db, family, ctx.userId, r.id).familyAverage ?? UNRATED_AVERAGE;
			const lastEaten = familyWeeks
				.flatMap((w) => w.slots)
				.filter((s) => s.recipeId === r.id && s.date < slot.date && s.cooked !== false && isMealPast(s.date, s.mealType, ctx.now))
				.map((s) => s.date)
				.sort()
				.at(-1);
			const weeksSince = lastEaten ? (Date.parse(slot.date) - Date.parse(lastEaten)) / (7 * 86_400_000) : Infinity;
			const freshness = Math.min(MAX_FRESHNESS_BONUS, BONUS_PER_WEEK * Math.floor(weeksSince));
			const neighbourPenalty = r.proteinGroup && neighbourGroups.includes(r.proteinGroup) ? 1 : 0;
			return { recipeId: r.id, name: localized(r.name, locale).text, score: average + freshness - neighbourPenalty, neighbourPenalty };
		})
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, locale));
}

export function getSuggestions(db: DemoDatabase, ctx: OperationContext, slotId: string): OpResult<SuggestionView[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const found = findSlot(db, family, slotId);
	if (!found) return fail('not_found');
	const locale = localeOf(db, ctx);
	return ok(
		rankCandidates(db, ctx, found.slot)
			.filter((c) => c.recipeId !== found.slot.recipeId)
			.slice(0, SUGGESTION_COUNT)
			.map((c) => {
				const recipe = db.recipes.find((r) => r.id === c.recipeId)!;
				return { recipe: recipeSummary(db, recipe, locale), rating: ratingSummary(db, family, ctx.userId, recipe.id) };
			})
	);
}

/** "Proponimene un altro": the candidate after the current dish, wrapping to the first. */
export function nextSuggestion(db: DemoDatabase, ctx: OperationContext, slotId: string): OpResult<string | null> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const found = findSlot(db, family, slotId);
	if (!found) return fail('not_found');
	const ranked = rankCandidates(db, ctx, found.slot).map((c) => c.recipeId);
	if (ranked.length === 0) return ok(null);
	const position = found.slot.recipeId ? ranked.indexOf(found.slot.recipeId) : -1;
	const next = ranked[(position + 1) % ranked.length];
	return ok(next === found.slot.recipeId ? null : next);
}

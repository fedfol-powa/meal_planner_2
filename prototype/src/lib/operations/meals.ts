import { isIsoDate, isMealPast, isWeekVisible, mondayOf, weekDates } from '#lib/domain/calendar.ts';
import type { DemoDatabase, Family, IsoDate, Locale, MealSlot, Week } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, isCurator, localeOf, ratingSummary, recipeSummary, scaledIngredients, visibleRecipe } from './access';
import type { DayView, MealView, OpeningTarget, WeekView } from './views';

const MEAL_ORDER = { lunch: 0, dinner: 1 } as const;

export function visibleWeeks(db: DemoDatabase, family: Family, ctx: OperationContext): Week[] {
	return db.weeks
		.filter((w) => w.familyId === family.id && isWeekVisible(w, ctx.now))
		.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

const hasContent = (slot: MealSlot) => slot.recipeId !== null || slot.freeText !== null;

export function getOpeningTarget(db: DemoDatabase, ctx: OperationContext): OpResult<OpeningTarget> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const weeks = visibleWeeks(db, family, ctx);
	if (weeks.length === 0) return ok({ kind: 'no_weeks' });
	const today = ctx.now.slice(0, 10);
	const dates = weeks
		.flatMap((w) => w.slots.filter(hasContent).map((s) => ({ date: s.date, weekStartsOn: w.startsOn })))
		.filter((d) => d.date >= today)
		.sort((a, b) => a.date.localeCompare(b.date));
	if (dates.length > 0) return ok({ kind: 'day', ...dates[0] });
	const last = weeks[weeks.length - 1];
	return ok({ kind: 'day', date: last.startsOn, weekStartsOn: last.startsOn });
}

export function mealView(db: DemoDatabase, family: Family, ctx: OperationContext, locale: Locale, slot: MealSlot): MealView {
	const recipe = slot.recipeId ? db.recipes.find((r) => r.id === slot.recipeId) ?? null : null;
	const isPast = isMealPast(slot.date, slot.mealType, ctx.now);
	const kind = recipe ? 'recipe' : slot.freeText ? 'free' : 'empty';
	const author = slot.updatedBy && family.members.some((m) => m.userId === slot.updatedBy)
		? db.users.find((u) => u.id === slot.updatedBy)?.displayName ?? null
		: null;
	return {
		slotId: slot.id,
		date: slot.date,
		mealType: slot.mealType,
		kind,
		recipe: recipe ? recipeSummary(db, recipe, locale) : null,
		freeText: slot.freeText,
		servings: slot.servings,
		ingredients: recipe ? scaledIngredients(db, recipe, slot.servings, locale) : null,
		note: slot.note,
		isPast,
		canRate: recipe ? visibleRecipe(db, family, recipe.id) !== null : false,
		canOpenRecipe: recipe ? visibleRecipe(db, family, recipe.id) !== null || (recipe.status === 'draft' && isCurator(db, ctx)) : false,
		rating: recipe ? ratingSummary(db, family, ctx.userId, recipe.id) : null,
		lastChange: slot.updatedBy && slot.updatedAt ? { userName: author, at: slot.updatedAt } : null
	};
}

export function getWeekView(db: DemoDatabase, ctx: OperationContext, startsOn: IsoDate): OpResult<WeekView> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (!isIsoDate(startsOn)) return fail('not_found');
	const weeks = visibleWeeks(db, family, ctx);
	const index = weeks.findIndex((w) => w.startsOn === mondayOf(startsOn));
	if (index === -1) return fail('not_found');
	const week = weeks[index];
	const locale = localeOf(db, ctx);
	const days: DayView[] = weekDates(week.startsOn).map((date) => ({
		date,
		meals: week.slots
			.filter((s) => s.date === date)
			.sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])
			.map((s) => mealView(db, family, ctx, locale, s))
	}));
	return ok({
		startsOn: week.startsOn,
		days,
		measurementSystem: family.measurementSystem
	});
}

/** Days that have at least one meal, for the date picker (only these are selectable). */
export function getMenuDates(db: DemoDatabase, ctx: OperationContext): OpResult<IsoDate[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const dates = new Set(visibleWeeks(db, family, ctx).flatMap((w) => w.slots.map((s) => s.date)));
	return ok([...dates].sort());
}

/** First candidate day whose week is visible to the family, otherwise the fallback day. */
export function resolveWeekStart(db: DemoDatabase, ctx: OperationContext, candidates: (string | null)[], fallback: IsoDate): IsoDate {
	const family = familyFor(db, ctx);
	if (!family) return fallback;
	const starts = new Set(visibleWeeks(db, family, ctx).map((w) => w.startsOn));
	const found = candidates.find((c): c is IsoDate => isIsoDate(c) && starts.has(mondayOf(c)));
	return found ? mondayOf(found) : fallback;
}

export function pickSelectedDate(week: WeekView, preferred: IsoDate | null, opening: IsoDate | null): IsoDate {
	const dates = week.days.map((d) => d.date);
	if (preferred && dates.includes(preferred)) return preferred;
	if (opening && dates.includes(opening)) return opening;
	return week.startsOn;
}

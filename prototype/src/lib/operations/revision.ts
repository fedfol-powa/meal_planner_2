import type { DemoDatabase, Family, MealSlot, SlotContent, Week } from '#lib/domain/types.ts';
import { fail, ok, type OpErrorCode, type OperationContext, type OpResult } from './context';
import { familyFor, localeOf, visibleRecipe } from './access';
import { sameContent, slotContent, writeSlot } from './change-log';
import { mealView, visibleWeeks } from './meals';
import type { MealView } from './views';

/** Meal actions of spec section 5. The last save wins (round 2, provisional decision 4). */
export interface RevisionResult {
	meal: MealView;
	/** Rows written to the change log, used by "Annulla". */
	changeIds: string[];
}

export const MAX_SERVINGS = 20;
export const MAX_FREE_TEXT = 60;
export const MAX_NOTE = 200;

type Target = { family: Family; week: Week; slot: MealSlot };

function target(db: DemoDatabase, ctx: OperationContext, slotId: string): OpResult<Target> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	for (const week of visibleWeeks(db, family, ctx)) {
		const slot = week.slots.find((s) => s.id === slotId);
		if (slot) return ok({ family, week, slot });
	}
	return fail('not_found');
}

function edit(
	db: DemoDatabase,
	ctx: OperationContext,
	slotId: string,
	change: (slot: MealSlot, family: Family) => SlotContent | OpErrorCode
): OpResult<RevisionResult> {
	const found = target(db, ctx, slotId);
	if (!found.ok) return found;
	const { family, slot } = found.value;
	const after = change(slot, family);
	if (typeof after === 'string') return fail(after);
	const row = writeSlot(db, ctx, slot, after);
	return ok({ meal: mealView(db, family, ctx, localeOf(db, ctx), slot), changeIds: [row.id] });
}

const withRecipe = (slot: MealSlot, recipeId: string): SlotContent => ({ ...slotContent(slot), recipeId, freeText: null, cooked: null });

export function replaceMealRecipe(db: DemoDatabase, ctx: OperationContext, slotId: string, recipeId: string): OpResult<RevisionResult> {
	return edit(db, ctx, slotId, (slot, family) => (visibleRecipe(db, family, recipeId) ? withRecipe(slot, recipeId) : 'not_found'));
}

export function setMealServings(db: DemoDatabase, ctx: OperationContext, slotId: string, servings: number): OpResult<RevisionResult> {
	return edit(db, ctx, slotId, (slot) =>
		Number.isInteger(servings) && servings >= 1 && servings <= MAX_SERVINGS ? { ...slotContent(slot), servings } : 'invalid'
	);
}

export function setMealFree(db: DemoDatabase, ctx: OperationContext, slotId: string, text: string): OpResult<RevisionResult> {
	const freeText = text.trim();
	return edit(db, ctx, slotId, (slot) =>
		freeText.length >= 1 && freeText.length <= MAX_FREE_TEXT ? { ...slotContent(slot), recipeId: null, freeText, cooked: null } : 'invalid'
	);
}

export function setMealNote(db: DemoDatabase, ctx: OperationContext, slotId: string, note: string | null): OpResult<RevisionResult> {
	const text = note?.trim() ?? '';
	return edit(db, ctx, slotId, (slot) => (text.length <= MAX_NOTE ? { ...slotContent(slot), note: text || null } : 'invalid'));
}

/** Swaps dish (or free text) and note within the same week; servings stay with the slot, "not cooked" is reset. */
export function swapMeals(db: DemoDatabase, ctx: OperationContext, slotId: string, otherSlotId: string): OpResult<RevisionResult> {
	const found = target(db, ctx, slotId);
	if (!found.ok) return found;
	const { family, week, slot } = found.value;
	const other = week.slots.find((s) => s.id === otherSlotId);
	if (!other || other.id === slot.id) return fail('invalid');
	const [a, b] = [slotContent(slot), slotContent(other)];
	const rows = [
		writeSlot(db, ctx, slot, { ...a, recipeId: b.recipeId, freeText: b.freeText, note: b.note, cooked: null }),
		writeSlot(db, ctx, other, { ...b, recipeId: a.recipeId, freeText: a.freeText, note: a.note, cooked: null })
	];
	return ok({ meal: mealView(db, family, ctx, localeOf(db, ctx), slot), changeIds: rows.map((r) => r.id) });
}

/** "Annulla": restores the previous content only if every slot is still as this user left it. */
export function undoMealChanges(db: DemoDatabase, ctx: OperationContext, changeIds: string[]): OpResult<MealView[]> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const changes = changeIds.map((id) => db.mealChanges.find((c) => c.id === id));
	const targets = [];
	for (const change of changes) {
		if (!change || change.actorId !== ctx.userId) return fail('not_allowed');
		const found = target(db, ctx, change.slotId);
		if (!found.ok) return found;
		if (!sameContent(slotContent(found.value.slot), change.after)) return fail('not_allowed');
		targets.push({ slot: found.value.slot, before: change.before });
	}
	for (const { slot, before } of targets) writeSlot(db, ctx, slot, before);
	return ok(targets.map(({ slot }) => mealView(db, family, ctx, localeOf(db, ctx), slot)));
}

/** "Non proporre più" (recipe_exclusions); meals already planned stay as they are. */
export function excludeRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<null> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (!visibleRecipe(db, family, recipeId)) return fail('not_found');
	if (!db.exclusions.some((e) => e.familyId === family.id && e.recipeId === recipeId)) {
		db.exclusions.push({ familyId: family.id, recipeId, createdBy: ctx.userId, createdAt: ctx.now });
	}
	return ok(null);
}

/** Undo of an exclusion; the full list of exclusions belongs to route 5. */
export function includeRecipe(db: DemoDatabase, ctx: OperationContext, recipeId: string): OpResult<null> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	db.exclusions = db.exclusions.filter((e) => !(e.familyId === family.id && e.recipeId === recipeId));
	return ok(null);
}

/** Quick picks for a free meal: texts the family already used, most frequent first. */
export function getFreeTextSuggestions(db: DemoDatabase, ctx: OperationContext): OpResult<string[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const counts = new Map<string, number>();
	for (const slot of visibleWeeks(db, family, ctx).flatMap((w) => w.slots)) {
		if (slot.freeText) counts.set(slot.freeText, (counts.get(slot.freeText) ?? 0) + 1);
	}
	return ok([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([text]) => text));
}

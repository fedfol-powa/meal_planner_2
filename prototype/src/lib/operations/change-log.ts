import type { DemoDatabase, MealChange, MealSlot, SlotContent } from '#lib/domain/types.ts';
import type { OperationContext } from './context';

export const slotContent = (slot: MealSlot): SlotContent => ({
	recipeId: slot.recipeId,
	freeText: slot.freeText,
	servings: slot.servings,
	note: slot.note,
	cooked: slot.cooked
});

export const sameContent = (a: SlotContent, b: SlotContent) =>
	a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note && a.cooked === b.cooked;

/** Applies a write to a slot: author, time and an append-only change row (spec section 5, traceability). */
export function writeSlot(db: DemoDatabase, ctx: OperationContext, slot: MealSlot, after: SlotContent): MealChange {
	const change: MealChange = {
		id: `change-${db.mealChanges.length + 1}`,
		slotId: slot.id,
		actorId: ctx.userId,
		channel: ctx.channel,
		before: slotContent(slot),
		after: { ...after },
		createdAt: ctx.now
	};
	Object.assign(slot, after, { updatedBy: ctx.userId, updatedAt: ctx.now });
	db.mealChanges.push(change);
	return change;
}

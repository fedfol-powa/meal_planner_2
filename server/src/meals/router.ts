import { appError } from '../errors.ts';
import type { Implementer, OperationContext } from '../pipeline.ts';
import { perform, replay, type ActionKind } from './actions.ts';
import { contentOf, lockSlots, type SlotContent, type SlotRow } from './slots.ts';

/** One-slot write: lock, replay before any content check, check, perform. */
async function oneSlot(
	context: OperationContext,
	input: { familyId: string; slotId: string; id: string },
	kind: ActionKind,
	next: (slot: SlotRow) => Promise<SlotContent> | SlotContent,
) {
	const [slot] = await lockSlots(context.tx, input.familyId, [input.slotId]);
	const request = { id: input.id, kind, slots: [slot!] };
	const replayed = await replay(context, input.familyId, request);
	if (replayed) return replayed;
	return perform(context, input.familyId, request, [{ slot: slot!, after: await next(slot!) }]);
}

export function mealsRouter(os: Implementer) {
	return {
		setServings: os.meals.setServings.handler(({ context, input }) =>
			oneSlot(context, input, 'set_servings', (slot) => ({ ...contentOf(slot), servings: input.servings })),
		),
		/** Only published recipes: drafts and archived ones are not offered (spec section 5). */
		setRecipe: os.meals.setRecipe.handler(({ context, input }) =>
			oneSlot(context, input, 'set_recipe', async (slot) => {
				const [recipe] = await context.tx`select 1 from app.recipes where id = ${input.recipeId} and status = 'published'`;
				if (!recipe) throw appError('not_found');
				return { ...contentOf(slot), recipeId: input.recipeId, freeText: null };
			}),
		),
		setFree: os.meals.setFree.handler(({ context, input }) =>
			oneSlot(context, input, 'set_free', (slot) => ({ ...contentOf(slot), recipeId: null, freeText: input.text })),
		),
		setNote: os.meals.setNote.handler(({ context, input }) =>
			oneSlot(context, input, 'set_note', (slot) => ({ ...contentOf(slot), note: input.note || null })),
		),
	};
}

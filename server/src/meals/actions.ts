import type { MealActionResult } from '@app/contract';
import { appError } from '../errors.ts';
import { weekViewOf } from '../menu/week-view.ts';
import type { OperationContext } from '../pipeline.ts';
import { contentOf, sameContent, type SlotContent, type SlotRow } from './slots.ts';

export type ActionKind = 'set_servings' | 'set_recipe' | 'set_free' | 'set_note' | 'swap' | 'undo';

export interface ActionRequest {
	/** Client id of the action. */
	id: string;
	kind: ActionKind;
	/** Locked slots of the request, in the request's order. */
	slots: SlotRow[];
	/** The undone action (kind undo). */
	undoes?: string;
}

export interface Edit {
	slot: SlotRow;
	after: SlotContent;
	/** The meal_changes row this edit undoes (kind undo). */
	undoes?: string;
}

const invalidId = () => appError('invalid', { issues: [{ path: ['id'], code: 'already_used' }] });

async function answer(context: OperationContext, familyId: string, request: ActionRequest, changed: boolean): Promise<MealActionResult> {
	return { week: await weekViewOf(context, familyId, request.slots[0]!.startsOn), actionId: request.id, changed };
}

/**
 * A request already recorded (spec of the revision, section 4): same id, user, kind, slots and
 * undone action answer the current week; any other reuse of the id is invalid. Called after the
 * slots are locked and before any check on the new content.
 */
export async function replay(context: OperationContext, familyId: string, request: ActionRequest): Promise<MealActionResult | null> {
	const [row] = await context.tx<{ actorId: string | null; kind: string; slotIds: string[]; undoes: string | null; changed: boolean }[]>`
		-- jsonb, not an array: the client runs without fetch_types and would get array text.
		select actor_id as "actorId", kind, to_jsonb(slot_ids) as "slotIds", undoes,
			exists (select 1 from app.meal_changes c where c.action_id = a.id) as changed
		from app.meal_actions a where id = ${request.id}`;
	if (!row) return null;
	const sameSlots = row.slotIds.length === request.slots.length && row.slotIds.every((id, i) => id === request.slots[i]!.id);
	if (row.actorId !== context.userId || row.kind !== request.kind || !sameSlots || (row.undoes ?? undefined) !== request.undoes) throw invalidId();
	return answer(context, familyId, request, row.changed);
}

/**
 * Writes an action in the order the database checks need: the action, the truthful change rows
 * of every changed slot, then the slots with their pointer and the moment after the lock.
 */
export async function perform(context: OperationContext, familyId: string, request: ActionRequest, edits: Edit[]): Promise<MealActionResult> {
	const { tx } = context;
	try {
		await tx`
			insert into app.meal_actions (id, week_id, actor_id, channel, kind, slot_ids, undoes)
			values (${request.id}, ${request.slots[0]!.weekId}, auth.uid(), ${context.channel}, ${request.kind},
				array(select jsonb_array_elements_text(${tx.json(request.slots.map((s) => s.id))})::uuid), ${request.undoes ?? null})`;
	} catch (error) {
		// An id of another family is invisible to replay: the primary key tells.
		if ((error as { code?: string }).code === '23505') throw invalidId();
		throw error;
	}
	const changed = edits.filter((e) => !sameContent(contentOf(e.slot), e.after));
	for (const edit of changed) {
		await tx`
			insert into app.meal_changes (meal_slot_id, actor_id, channel, before, after, undoes, action_id)
			values (${edit.slot.id}, auth.uid(), ${context.channel}, ${tx.json({ ...contentOf(edit.slot) })}, ${tx.json({ ...edit.after })},
				${edit.undoes ?? null}, ${request.id})`;
	}
	for (const edit of changed) {
		await tx`
			update app.meal_slots
			set recipe_id = ${edit.after.recipeId}, free_text = ${edit.after.freeText}, servings = ${edit.after.servings},
				note = ${edit.after.note}, updated_by = auth.uid(), updated_at = clock_timestamp(), last_action_id = ${request.id}
			where id = ${edit.slot.id}`;
	}
	return answer(context, familyId, request, changed.length > 0);
}

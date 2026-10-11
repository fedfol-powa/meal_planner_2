import type { MealActionResult } from '@app/contract';
import { appError } from '../errors.ts';
import { weekViewOf } from '../menu/week-view.ts';
import type { OperationContext } from '../pipeline.ts';
import { contentOf, lockSlots, sameContent, type SlotContent, type SlotRow } from './slots.ts';

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

const notAllowed = (reason: 'not_own_change' | 'changed_since' | 'draft_closed') => appError('not_allowed', { reason });

/**
 * meals.undo (spec section 5): own actions only, only while every slot it changed still has it
 * as last action; all its slots together; a draft comes back only while open.
 */
export async function undoAction(context: OperationContext, familyId: string, input: { actionId: string; id: string }): Promise<MealActionResult> {
	const { tx } = context;
	const [action] = await tx<{ actorId: string | null; slotIds: string[] }[]>`
		select a.actor_id as "actorId", to_jsonb(a.slot_ids) as "slotIds"
		from app.meal_actions a join app.weeks w on w.id = a.week_id
		where a.id = ${input.actionId} and w.family_id = ${familyId}`;
	if (!action) throw appError('not_found');
	const rows = await tx<{ id: string; slotId: string; before: SlotContent }[]>`
		select id, meal_slot_id as "slotId", before from app.meal_changes where action_id = ${input.actionId} order by meal_slot_id`;
	// An action without rows has nothing to undo: the undo is recorded on its slots, without rows.
	const slots = await lockSlots(tx, familyId, rows.length > 0 ? rows.map((r) => r.slotId) : action.slotIds);
	const request = { id: input.id, kind: 'undo' as const, slots, undoes: input.actionId };
	const replayed = await replay(context, familyId, request);
	if (replayed) return replayed;
	if (rows.length === 0) return perform(context, familyId, request, []);
	if (action.actorId !== context.userId) throw notAllowed('not_own_change');
	if (slots.some((s) => s.lastActionId !== input.actionId)) throw notAllowed('changed_since');
	// Not from app.recipes: after the last citation went away the member no longer sees the draft.
	const [{ closed }] = await tx<{ closed: boolean }[]>`select app.meal_action_restores_closed_draft(${input.actionId}) as closed`;
	if (closed) throw notAllowed('draft_closed');
	return perform(context, familyId, request, rows.map((row) => ({ slot: slots.find((s) => s.id === row.slotId)!, after: row.before, undoes: row.id })));
}

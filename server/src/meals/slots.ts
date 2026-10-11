import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

export interface SlotRow {
	id: string;
	weekId: string;
	startsOn: string;
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
	lastActionId: string | null;
}

/** What meal_changes keeps of a slot: exactly these keys (the database compares `before` with them). */
export interface SlotContent {
	recipeId: string | null;
	freeText: string | null;
	servings: number;
	note: string | null;
}

export const contentOf = (s: SlotContent): SlotContent => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });

export const sameContent = (a: SlotContent, b: SlotContent) =>
	a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

/**
 * The slots of the family, locked for the transaction in id order (two crossed swaps never
 * deadlock), returned in the order asked. Under RLS: another family's or a missing slot is not_found.
 */
export async function lockSlots(tx: Tx, familyId: string, slotIds: string[]): Promise<SlotRow[]> {
	const sorted = [...new Set(slotIds)].sort();
	const rows = await tx<SlotRow[]>`
		select s.id, s.week_id as "weekId", w.starts_on::text as "startsOn", s.date::text as date, s.meal_type as "mealType",
			s.recipe_id as "recipeId", s.free_text as "freeText", s.servings, s.note, s.last_action_id as "lastActionId"
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id in (select jsonb_array_elements_text(${tx.json(sorted)})::uuid) and w.family_id = ${familyId}
		order by s.id
		for update of s`;
	if (rows.length !== sorted.length) throw appError('not_found');
	return slotIds.map((id) => rows.find((r) => r.id === id)!);
}

export async function readSlot(tx: Tx, familyId: string, slotId: string): Promise<SlotRow> {
	const [row] = await tx<SlotRow[]>`
		select s.id, s.week_id as "weekId", w.starts_on::text as "startsOn", s.date::text as date, s.meal_type as "mealType",
			s.recipe_id as "recipeId", s.free_text as "freeText", s.servings, s.note, s.last_action_id as "lastActionId"
		from app.meal_slots s join app.weeks w on w.id = s.week_id
		where s.id = ${slotId} and w.family_id = ${familyId}`;
	if (!row) throw appError('not_found');
	return row;
}

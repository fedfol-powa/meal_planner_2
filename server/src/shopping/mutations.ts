import { normalizeFreeItemText, SHOPPING_LIST_READS, type ShoppingListView } from '@app/contract';
import type { CombinedQuantity } from '@app/domain/units';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import { readVersion } from '../versions.ts';
import type { ShoppingDeps } from './deps.ts';
import { findWeek, readListView } from './read.ts';

interface WeekInput {
	familyId: string;
	weekStartsOn: string;
}

interface ItemInput extends WeekInput {
	ingredientId: string;
	varietyKey: string;
}

/**
 * The list of the week, created at the first change (spec section 6). Every change records
 * its author, also a change without effects: one more invalidation is admitted (W2 review).
 */
export async function ensureList(tx: Tx, familyId: string, weekId: string, userId: string): Promise<string> {
	const rows = await tx<{ id: string }[]>`
		insert into app.shopping_lists (family_id, week_id, updated_by, updated_at)
		values (${familyId}, ${weekId}, ${userId}, now())
		on conflict (family_id, week_id) do update set updated_by = excluded.updated_by, updated_at = excluded.updated_at
		returning id`;
	return rows[0]!.id;
}

/** Runs `write` on the list of the week, then answers with the view and its version, read after the write. */
async function change(
	context: OperationContext,
	deps: ShoppingDeps,
	input: WeekInput,
	write: (tx: Tx, listId: string) => Promise<void>,
): Promise<{ version: string; data: ShoppingListView }> {
	const { tx } = context;
	const { weekId } = await findWeek(tx, input.familyId, input.weekStartsOn);
	await write(tx, await ensureList(tx, input.familyId, weekId, context.userId));
	const version = await readVersion(tx, [...SHOPPING_LIST_READS], input, context.locale, context.deployId);
	const data = await readListView(tx, deps, { familyId: input.familyId, weekStartsOn: input.weekStartsOn, locale: context.locale });
	return { version, data };
}

/** Absolute state; the quantity is always the one the client saw (never derived here). */
export const setItemChecked = (context: OperationContext, deps: ShoppingDeps, input: ItemInput & { checked: boolean; quantityAtCheck?: CombinedQuantity }) =>
	change(context, deps, input, async (tx, listId) => {
		if (input.checked) {
			await tx`
				insert into app.shopping_list_checks (shopping_list_id, ingredient_id, variety_key, quantity_at_check, checked_by, checked_at)
				values (${listId}, ${input.ingredientId}, ${input.varietyKey}, ${tx.json(input.quantityAtCheck!)}, ${context.userId}, now())
				on conflict (shopping_list_id, ingredient_id, variety_key) do update
				set quantity_at_check = excluded.quantity_at_check, checked_by = excluded.checked_by, checked_at = excluded.checked_at`;
		} else {
			await tx`
				delete from app.shopping_list_checks
				where shopping_list_id = ${listId} and ingredient_id = ${input.ingredientId} and variety_key = ${input.varietyKey}`;
		}
	});

export const setAddedBack = (context: OperationContext, deps: ShoppingDeps, input: ItemInput & { addedBack: boolean }) =>
	change(context, deps, input, async (tx, listId) => {
		if (input.addedBack) {
			await tx`
				insert into app.shopping_list_added_back (shopping_list_id, ingredient_id, variety_key, added_by)
				values (${listId}, ${input.ingredientId}, ${input.varietyKey}, ${context.userId})
				on conflict do nothing`;
		} else {
			await tx`
				delete from app.shopping_list_added_back
				where shopping_list_id = ${listId} and ingredient_id = ${input.ingredientId} and variety_key = ${input.varietyKey}`;
		}
	});

/**
 * Idempotent through the client id. A repetition after another member removed the item
 * creates it again: accepted (coordinator, 11 October 2026), no receipts.
 */
export const addFreeItem = (context: OperationContext, deps: ShoppingDeps, input: WeekInput & { id: string; text: string }) =>
	change(context, deps, input, async (tx, listId) => {
		const text = normalizeFreeItemText(input.text);
		if (text === null) throw appError('invalid', { issues: [{ path: ['text'], code: 'text' }] });
		const inserted = await tx`
			insert into app.shopping_list_items (id, shopping_list_id, text, created_by, updated_by)
			values (${input.id}, ${listId}, ${text}, ${context.userId}, ${context.userId})
			on conflict (id) do nothing
			returning id`;
		if (inserted.length > 0) return;
		const existing = await tx<{ listId: string }[]>`select shopping_list_id as "listId" from app.shopping_list_items where id = ${input.id}`;
		// Same list: a repetition. Another list, or one the user cannot see: the id is taken.
		if (existing[0]?.listId !== listId) throw appError('invalid', { issues: [{ path: ['id'], code: 'taken' }] });
	});

export const setFreeItemChecked = (context: OperationContext, deps: ShoppingDeps, input: WeekInput & { itemId: string; checked: boolean }) =>
	change(context, deps, input, async (tx, listId) => {
		const rows = await tx`
			update app.shopping_list_items set checked = ${input.checked}, updated_by = ${context.userId}, updated_at = now()
			where id = ${input.itemId} and shopping_list_id = ${listId}
			returning id`;
		if (rows.length === 0) throw appError('not_found');
	});

/** Only on the list of the request: an item of another week or family is never touched. */
export const removeFreeItem = (context: OperationContext, deps: ShoppingDeps, input: WeekInput & { itemId: string }) =>
	change(context, deps, input, async (tx, listId) => {
		await tx`delete from app.shopping_list_items where id = ${input.itemId} and shopping_list_id = ${listId}`;
	});

import type { DemoDatabase, Department, Family, LocalDateTime, ShoppingList, ShoppingListSlot } from '#lib/domain/types.ts';
import { formatDateRange } from '#lib/i18n/dates.ts';
import { translate } from '#lib/i18n/translate.ts';
import { exceeds, formatCombined } from '#lib/units/combine.ts';
import { familyFor, localeOf } from './access';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { arrangeShoppingList, computeShoppingList, familySlotMap, type ShoppingItem, type ShoppingListView } from './shopping';

/**
 * Saved family shopping lists (round 3 revision, provisional): every member sees and edits them,
 * quantities follow the meals while the list is open, the last save wins per item.
 */

export const MAX_MANUAL_TEXT = 60;

export interface ShoppingListItemView extends ShoppingItem {
	checked: boolean;
	/** Quantity ticked before it grew; the item needs ticking again. */
	previousQuantity: string | null;
}

export interface ManualItemView {
	id: string;
	text: string;
	checked: boolean;
}

export interface ShoppingListDetail {
	id: string;
	name: string;
	status: ShoppingList['status'];
	slotIds: string[];
	mealCount: number;
	departments: { department: Department; items: ShoppingListItemView[]; manual: ManualItemView[] }[];
	excluded: ShoppingItem[];
	skipped: ShoppingListView['skipped'];
	checked: number;
	total: number;
	/** userName is null when the author is no longer a member. */
	lastChange: { userName: string | null; at: LocalDateTime };
	closedAt: LocalDateTime | null;
	/** Plain view used by the exports. */
	view: ReturnType<typeof arrangeShoppingList>;
}

export type ShoppingListSummary = Pick<ShoppingListDetail, 'id' | 'name' | 'status' | 'mealCount' | 'checked' | 'total' | 'lastChange' | 'closedAt'>;

type Found = { family: Family; list: ShoppingList };

function find(db: DemoDatabase, ctx: OperationContext, listId: string): OpResult<Found> {
	const family = familyFor(db, ctx);
	const list = family ? db.shoppingLists.find((l) => l.id === listId && l.familyId === family.id) : undefined;
	return family && list ? ok({ family, list }) : fail('not_found');
}

/** Writes need a connection and, except reopening and deleting, an open list. */
function editable(db: DemoDatabase, ctx: OperationContext, listId: string, needsOpen = true): OpResult<Found> {
	if (ctx.offline) return fail('offline');
	const found = find(db, ctx, listId);
	if (!found.ok) return found;
	if (needsOpen && found.value.list.status !== 'open') return fail('not_allowed');
	return found;
}

function touch(list: ShoppingList, ctx: OperationContext) {
	list.updatedBy = ctx.userId;
	list.updatedAt = ctx.now;
}

function slotsOf(db: DemoDatabase, ctx: OperationContext, family: Family, list: ShoppingList): ShoppingListSlot[] {
	if (list.frozenSlots) return list.frozenSlots;
	const slots = familySlotMap(db, ctx, family);
	return list.slotIds.flatMap((id) => {
		const slot = slots.get(id);
		return slot ? [{ id: slot.id, date: slot.date, mealType: slot.mealType, recipeId: slot.recipeId, servings: slot.servings }] : [];
	});
}

function validSlots(db: DemoDatabase, ctx: OperationContext, family: Family, slotIds: string[]): OpResult<string[]> {
	const ids = [...new Set(slotIds)];
	if (ids.length === 0) return fail('invalid');
	const slots = familySlotMap(db, ctx, family);
	if (ids.some((id) => !slots.has(id))) return fail('not_found');
	return ok(ids.sort((a, b) => a.localeCompare(b)));
}

function detail(db: DemoDatabase, ctx: OperationContext, family: Family, list: ShoppingList): ShoppingListDetail {
	const locale = localeOf(db, ctx);
	const slots = slotsOf(db, ctx, family, list);
	const view = arrangeShoppingList(computeShoppingList(db, family, locale, slots), new Set(list.addedBack));
	const closed = list.status === 'closed';
	const departments: ShoppingListDetail['departments'] = view.departments.map((group) => ({
		department: group.department,
		manual: [],
		items: group.items.map((item) => {
			const check = list.checks.find((c) => c.ingredientId === item.id);
			// A closed list shows the ticks as they were; an open one asks again when the quantity grew.
			const grew = !!check && !closed && exceeds(item.combined, check.quantity);
			return {
				...item,
				checked: !!check && !grew,
				previousQuantity: grew && check ? formatCombined(check.quantity, family.measurementSystem, locale) : null
			};
		})
	}));
	if (list.manualItems.length) {
		let other = departments.find((d) => d.department === 'other');
		if (!other) departments.push((other = { department: 'other', items: [], manual: [] }));
		other.manual = list.manualItems.map(({ id, text, checked }) => ({ id, text, checked }));
	}
	const all = departments.flatMap((d) => [...d.items, ...d.manual]);
	const dates = slots.map((s) => s.date).sort();
	const author = family.members.some((m) => m.userId === list.updatedBy) ? db.users.find((u) => u.id === list.updatedBy)?.displayName ?? null : null;
	return {
		id: list.id,
		name: dates.length
			? translate(locale, 'shopping.listName', { range: formatDateRange(locale, dates[0], dates[dates.length - 1]) })
			: translate(locale, 'shopping.listNameEmpty'),
		status: list.status,
		slotIds: [...list.slotIds],
		mealCount: view.mealCount,
		departments,
		excluded: view.excluded,
		skipped: view.skipped,
		checked: all.filter((i) => i.checked).length,
		total: all.length,
		lastChange: { userName: author, at: list.updatedAt },
		closedAt: list.closedAt,
		view
	};
}

export function getShoppingLists(db: DemoDatabase, ctx: OperationContext): OpResult<{ open: ShoppingListSummary[]; closed: ShoppingListSummary[] }> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const summaries = db.shoppingLists
		.filter((l) => l.familyId === family.id)
		.map((l) => {
			const { id, name, status, mealCount, checked, total, lastChange, closedAt } = detail(db, ctx, family, l);
			return { id, name, status, mealCount, checked, total, lastChange, closedAt };
		});
	const newest = (a: ShoppingListSummary, b: ShoppingListSummary) => (b.closedAt ?? b.lastChange.at).localeCompare(a.closedAt ?? a.lastChange.at);
	return ok({
		open: summaries.filter((s) => s.status === 'open').sort(newest),
		closed: summaries.filter((s) => s.status === 'closed').sort(newest)
	});
}

export function getShoppingListDetail(db: DemoDatabase, ctx: OperationContext, listId: string): OpResult<ShoppingListDetail> {
	const found = find(db, ctx, listId);
	return found.ok ? ok(detail(db, ctx, found.value.family, found.value.list)) : found;
}

export function createShoppingList(db: DemoDatabase, ctx: OperationContext, slotIds: string[]): OpResult<{ id: string }> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const ids = validSlots(db, ctx, family, slotIds);
	if (!ids.ok) return ids;
	const id = `list-${db.shoppingLists.reduce((max, l) => Math.max(max, Number(l.id.slice(5)) || 0), 0) + 1}`;
	db.shoppingLists.push({
		id,
		familyId: family.id,
		status: 'open',
		slotIds: ids.value,
		checks: [],
		addedBack: [],
		manualItems: [],
		frozenSlots: null,
		createdBy: ctx.userId,
		createdAt: ctx.now,
		updatedBy: ctx.userId,
		updatedAt: ctx.now,
		closedAt: null
	});
	return ok({ id });
}

export function setShoppingListMeals(db: DemoDatabase, ctx: OperationContext, listId: string, slotIds: string[]): OpResult<null> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const ids = validSlots(db, ctx, found.value.family, slotIds);
	if (!ids.ok) return ids;
	found.value.list.slotIds = ids.value;
	touch(found.value.list, ctx);
	return ok(null);
}

/** Closes the list when every item is ticked; returns whether that happened. */
function closeIfDone(db: DemoDatabase, ctx: OperationContext, found: Found): boolean {
	const d = detail(db, ctx, found.family, found.list);
	if (d.total === 0 || d.checked < d.total) return false;
	close(db, ctx, found);
	return true;
}

function close(db: DemoDatabase, ctx: OperationContext, { family, list }: Found) {
	list.frozenSlots = slotsOf(db, ctx, family, list);
	list.status = 'closed';
	list.closedAt = ctx.now;
	touch(list, ctx);
}

export function toggleShoppingItem(db: DemoDatabase, ctx: OperationContext, listId: string, ingredientId: string): OpResult<{ closed: boolean }> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const { family, list } = found.value;
	const item = detail(db, ctx, family, list).departments.flatMap((d) => d.items).find((i) => i.id === ingredientId);
	if (!item) return fail('not_found');
	list.checks = list.checks.filter((c) => c.ingredientId !== ingredientId);
	// Ticking again after the quantity grew stores the new quantity.
	if (!item.checked) list.checks.push({ ingredientId, quantity: item.combined, by: ctx.userId, at: ctx.now });
	touch(list, ctx);
	return ok({ closed: !item.checked && closeIfDone(db, ctx, found.value) });
}

export function addManualItem(db: DemoDatabase, ctx: OperationContext, listId: string, text: string): OpResult<{ itemId: string }> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const clean = text.trim().replace(/\s+/g, ' ');
	if (!clean || clean.length > MAX_MANUAL_TEXT) return fail('invalid');
	const { list } = found.value;
	const itemId = `${list.id}-item-${list.manualItems.reduce((max, i) => Math.max(max, Number(i.id.split('-').pop()) || 0), 0) + 1}`;
	list.manualItems.push({ id: itemId, text: clean, checked: false, createdBy: ctx.userId, createdAt: ctx.now });
	touch(list, ctx);
	return ok({ itemId });
}

export function toggleManualItem(db: DemoDatabase, ctx: OperationContext, listId: string, itemId: string): OpResult<{ closed: boolean }> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const item = found.value.list.manualItems.find((i) => i.id === itemId);
	if (!item) return fail('not_found');
	item.checked = !item.checked;
	touch(found.value.list, ctx);
	return ok({ closed: item.checked && closeIfDone(db, ctx, found.value) });
}

export function removeManualItem(db: DemoDatabase, ctx: OperationContext, listId: string, itemId: string): OpResult<null> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const { list } = found.value;
	if (!list.manualItems.some((i) => i.id === itemId)) return fail('not_found');
	list.manualItems = list.manualItems.filter((i) => i.id !== itemId);
	touch(list, ctx);
	return ok(null);
}

/** Pantry or avoided ingredient put back on the list, or taken off again. */
export function toggleAddedBack(db: DemoDatabase, ctx: OperationContext, listId: string, ingredientId: string): OpResult<null> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	const { list } = found.value;
	list.addedBack = list.addedBack.includes(ingredientId) ? list.addedBack.filter((id) => id !== ingredientId) : [...list.addedBack, ingredientId];
	touch(list, ctx);
	return ok(null);
}

/** "Spesa fatta": the list keeps the meals as they are now and goes to the history. */
export function closeShoppingList(db: DemoDatabase, ctx: OperationContext, listId: string): OpResult<null> {
	const found = editable(db, ctx, listId);
	if (!found.ok) return found;
	close(db, ctx, found.value);
	return ok(null);
}

export function reopenShoppingList(db: DemoDatabase, ctx: OperationContext, listId: string): OpResult<null> {
	const found = editable(db, ctx, listId, false);
	if (!found.ok) return found;
	const { list } = found.value;
	if (list.status === 'open') return ok(null);
	Object.assign(list, { status: 'open', frozenSlots: null, closedAt: null });
	touch(list, ctx);
	return ok(null);
}

/** Returns the removed list, so "Annulla" can put it back. */
export function deleteShoppingList(db: DemoDatabase, ctx: OperationContext, listId: string): OpResult<ShoppingList> {
	const found = editable(db, ctx, listId, false);
	if (!found.ok) return found;
	db.shoppingLists = db.shoppingLists.filter((l) => l !== found.value.list);
	return ok(found.value.list);
}

export function restoreShoppingList(db: DemoDatabase, ctx: OperationContext, list: ShoppingList): OpResult<null> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family || list.familyId !== family.id) return fail('forbidden');
	if (db.shoppingLists.some((l) => l.id === list.id)) return fail('not_allowed');
	db.shoppingLists.push(list);
	return ok(null);
}

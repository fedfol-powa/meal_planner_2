import { addDays, isIsoDate, mondayOf } from '#lib/domain/calendar.ts';
import type { DemoDatabase, Department, Family, LocalDateTime, ShoppingList, Week } from '#lib/domain/types.ts';
import { formatDateRange } from '#lib/i18n/dates.ts';
import { translate } from '#lib/i18n/translate.ts';
import { exceeds, formatCombined } from '#lib/units/combine.ts';
import { familyFor, localeOf } from './access';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { visibleWeeks } from './meals';
import { arrangeShoppingList, computeShoppingList, type ShoppingItem, type ShoppingListView } from './shopping';

/**
 * The shopping list of a week (round 3, third revision, provisional): one per week with every meal of it,
 * opened from the menu on the week being viewed. Every member sees and edits it; quantities follow the
 * meals; the last save wins per item. No other lists, no history: past weeks keep their list.
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
	weekStartsOn: string;
	name: string;
	mealCount: number;
	departments: { department: Department; items: ShoppingListItemView[]; manual: ManualItemView[] }[];
	excluded: ShoppingItem[];
	skipped: ShoppingListView['skipped'];
	checked: number;
	total: number;
	/** null until someone changes the list; userName is null when the author is no longer a member. */
	lastChange: { userName: string | null; at: LocalDateTime } | null;
	/** Plain view used by the exports. */
	view: ReturnType<typeof arrangeShoppingList>;
}

type Found = { family: Family; week: Week; list: ShoppingList | undefined };

function find(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string): OpResult<Found> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (!isIsoDate(weekStartsOn)) return fail('not_found');
	const week = visibleWeeks(db, family, ctx).find((w) => w.startsOn === mondayOf(weekStartsOn));
	if (!week) return fail('not_found');
	return ok({ family, week, list: db.shoppingLists.find((l) => l.familyId === family.id && l.weekId === week.id) });
}

/** The saved list of the week, created at the first change. */
function editable(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string): OpResult<{ found: Found; list: ShoppingList }> {
	if (ctx.offline) return fail('offline');
	const found = find(db, ctx, weekStartsOn);
	if (!found.ok) return found;
	let list = found.value.list;
	if (!list) {
		db.shoppingLists.push({ familyId: found.value.family.id, weekId: found.value.week.id, checks: [], addedBack: [], manualItems: [], updatedBy: ctx.userId, updatedAt: ctx.now });
		// Use the stored object: the store may wrap what was pushed.
		list = db.shoppingLists[db.shoppingLists.length - 1];
	}
	return ok({ found: { ...found.value, list }, list });
}

function touch(list: ShoppingList, ctx: OperationContext) {
	list.updatedBy = ctx.userId;
	list.updatedAt = ctx.now;
}

function detail(db: DemoDatabase, ctx: OperationContext, { family, week, list }: Found): ShoppingListDetail {
	const locale = localeOf(db, ctx);
	const view = arrangeShoppingList(computeShoppingList(db, family, locale, week.slots), new Set(list?.addedBack ?? []));
	const departments: ShoppingListDetail['departments'] = view.departments.map((group) => ({
		department: group.department,
		manual: [],
		items: group.items.map((item) => {
			const check = list?.checks.find((c) => c.ingredientId === item.id);
			const grew = !!check && exceeds(item.combined, check.quantity);
			return {
				...item,
				checked: !!check && !grew,
				previousQuantity: grew && check ? formatCombined(check.quantity, family.measurementSystem, locale, { wholePieces: true }) : null
			};
		})
	}));
	if (list?.manualItems.length) {
		let other = departments.find((d) => d.department === 'other');
		if (!other) departments.push((other = { department: 'other', items: [], manual: [] }));
		other.manual = list.manualItems.map(({ id, text, checked }) => ({ id, text, checked }));
	}
	const all = departments.flatMap((d) => [...d.items, ...d.manual]);
	const author = list && family.members.some((m) => m.userId === list.updatedBy) ? db.users.find((u) => u.id === list.updatedBy)?.displayName ?? null : null;
	return {
		weekStartsOn: week.startsOn,
		name: translate(locale, 'shopping.weekName', { range: formatDateRange(locale, week.startsOn, addDays(week.startsOn, 6)) }),
		mealCount: view.mealCount,
		departments,
		excluded: view.excluded,
		skipped: view.skipped,
		checked: all.filter((i) => i.checked).length,
		total: all.length,
		lastChange: list ? { userName: author, at: list.updatedAt } : null,
		view
	};
}

/** The list of the week that contains `weekStartsOn` (any day of it is accepted). */
export function getWeekShoppingList(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string): OpResult<ShoppingListDetail> {
	const found = find(db, ctx, weekStartsOn);
	return found.ok ? ok(detail(db, ctx, found.value)) : found;
}

export function toggleShoppingItem(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string, ingredientId: string): OpResult<null> {
	const result = editable(db, ctx, weekStartsOn);
	if (!result.ok) return result;
	const { found, list } = result.value;
	const item = detail(db, ctx, found).departments.flatMap((d) => d.items).find((i) => i.id === ingredientId);
	if (!item) return fail('not_found');
	list.checks = list.checks.filter((c) => c.ingredientId !== ingredientId);
	// Ticking again after the quantity grew stores the new quantity.
	if (!item.checked) list.checks.push({ ingredientId, quantity: item.combined, by: ctx.userId, at: ctx.now });
	touch(list, ctx);
	return ok(null);
}

export function addManualItem(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string, text: string): OpResult<{ itemId: string }> {
	const clean = text.trim().replace(/\s+/g, ' ');
	if (!clean || clean.length > MAX_MANUAL_TEXT) return fail('invalid');
	const result = editable(db, ctx, weekStartsOn);
	if (!result.ok) return result;
	const { list } = result.value;
	const itemId = `${list.weekId}-item-${list.manualItems.reduce((max, i) => Math.max(max, Number(i.id.split('-').pop()) || 0), 0) + 1}`;
	list.manualItems.push({ id: itemId, text: clean, checked: false, createdBy: ctx.userId, createdAt: ctx.now });
	touch(list, ctx);
	return ok({ itemId });
}

export function toggleManualItem(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string, itemId: string): OpResult<null> {
	const result = editable(db, ctx, weekStartsOn);
	if (!result.ok) return result;
	const item = result.value.list.manualItems.find((i) => i.id === itemId);
	if (!item) return fail('not_found');
	item.checked = !item.checked;
	touch(result.value.list, ctx);
	return ok(null);
}

export function removeManualItem(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string, itemId: string): OpResult<null> {
	const result = editable(db, ctx, weekStartsOn);
	if (!result.ok) return result;
	const { list } = result.value;
	if (!list.manualItems.some((i) => i.id === itemId)) return fail('not_found');
	list.manualItems = list.manualItems.filter((i) => i.id !== itemId);
	touch(list, ctx);
	return ok(null);
}

/** Pantry or avoided ingredient put back on the list, or taken off again. */
export function toggleAddedBack(db: DemoDatabase, ctx: OperationContext, weekStartsOn: string, ingredientId: string): OpResult<null> {
	const result = editable(db, ctx, weekStartsOn);
	if (!result.ok) return result;
	const { list } = result.value;
	list.addedBack = list.addedBack.includes(ingredientId) ? list.addedBack.filter((id) => id !== ingredientId) : [...list.addedBack, ingredientId];
	touch(list, ctx);
	return ok(null);
}

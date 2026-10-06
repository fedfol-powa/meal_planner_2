import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { replaceMealRecipe, setMealServings } from './revision';
import {
	addManualItem,
	closeShoppingList,
	createShoppingList,
	deleteShoppingList,
	getShoppingListDetail,
	getShoppingLists,
	removeManualItem,
	reopenShoppingList,
	runShoppingListJobs,
	MAX_HISTORY,
	restoreShoppingList,
	setShoppingListMeals,
	toggleAddedBack,
	toggleManualItem,
	toggleShoppingItem,
	type ShoppingListDetail
} from './shopping-lists';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};
const items = (d: ShoppingListDetail) => d.departments.flatMap((g) => g.items);
const item = (d: ShoppingListDetail, id: string) => items(d).find((i) => i.id === id);
const fresh = (slotIds: string[], over: Partial<OperationContext> = {}) => value(createShoppingList(db, ctx(over), slotIds)).id;

beforeEach(() => {
	db = createInitial().db;
});

describe('demo lists', () => {
	it('has the weekly list of this week first, then the list made by Anna, and a closed weekly list', () => {
		const lists = value(getShoppingLists(db, ctx()));
		expect(lists.open.map((l) => [l.name, l.weekly])).toEqual([['Settimana 5–11 ottobre', true], ['Pasti 7–11 ottobre', false]]);
		expect(lists.open[0].lastChange).toEqual({ userName: null, at: '2026-09-30T20:00', byApp: true });
		expect(lists.open[1]).toMatchObject({ lastChange: { userName: 'Anna', byApp: false } });
		expect(lists.open[1].checked).toBeGreaterThan(0);
		expect(lists.closed.map((l) => l.name)).toEqual(['Settimana 28 settembre – 4 ottobre']);
		expect(lists.closed[0].checked).toBe(lists.closed[0].total);
	});

	it('are not visible to another family', () => {
		const lists = value(getShoppingLists(db, ctx({ userId: 'user-lucia', familyId: 'family-grandparents' })));
		expect(lists).toEqual({ open: [], closed: [] });
	});
});

describe('createShoppingList and detail', () => {
	it('creates an open list named after its days, visible to every member', () => {
		const id = fresh(['2026-10-07-lunch', '2026-10-09-lunch']);
		const detail = value(getShoppingListDetail(db, ctx({ userId: 'user-tom' }), id));
		expect(detail).toMatchObject({ status: 'open', mealCount: 2, name: 'Meals 7–9 October', checked: 0 });
		expect(detail.lastChange).toEqual({ userName: 'Federico', at: '2026-10-06T12:00', byApp: false });
		expect(value(getShoppingLists(db, ctx())).open.map((l) => l.id)).toContain(id);
	});

	it('refuses empty, unknown or offline creations', () => {
		expect(createShoppingList(db, ctx(), [])).toEqual({ ok: false, error: 'invalid' });
		expect(createShoppingList(db, ctx(), ['nope'])).toEqual({ ok: false, error: 'not_found' });
		expect(createShoppingList(db, ctx({ offline: true }), ['2026-10-07-lunch'])).toEqual({ ok: false, error: 'offline' });
	});

	it('is not found from another family', () => {
		const id = fresh(['2026-10-07-lunch']);
		expect(getShoppingListDetail(db, ctx({ userId: 'user-lucia', familyId: 'family-grandparents' }), id)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('ticking items', () => {
	it('shares the tick with the family and records who changed the list', () => {
		const id = fresh(['2026-10-07-lunch']);
		value(toggleShoppingItem(db, ctx({ userId: 'user-anna', now: '2026-10-06T18:00' }), id, 'fusilloni'));
		const detail = value(getShoppingListDetail(db, ctx(), id));
		expect(item(detail, 'fusilloni')?.checked).toBe(true);
		expect(detail.lastChange).toEqual({ userName: 'Anna', at: '2026-10-06T18:00', byApp: false });
		value(toggleShoppingItem(db, ctx(), id, 'fusilloni'));
		expect(item(value(getShoppingListDetail(db, ctx(), id)), 'fusilloni')?.checked).toBe(false);
	});

	it('follows the meals: a tick drops when the quantity grows and shows the old one', () => {
		const id = fresh(['2026-10-07-lunch']);
		value(toggleShoppingItem(db, ctx(), id, 'fusilloni'));
		value(setMealServings(db, ctx(), '2026-10-07-lunch', 4));
		const detail = value(getShoppingListDetail(db, ctx(), id));
		expect(item(detail, 'fusilloni')).toMatchObject({ checked: false, quantity: '400 g', previousQuantity: '300 g' });
	});

	it('keeps the tick when the quantity shrinks', () => {
		const id = fresh(['2026-10-07-lunch']);
		value(toggleShoppingItem(db, ctx(), id, 'fusilloni'));
		value(setMealServings(db, ctx(), '2026-10-07-lunch', 2));
		expect(item(value(getShoppingListDetail(db, ctx(), id)), 'fusilloni')).toMatchObject({ checked: true, previousQuantity: null });
	});

	it('updates items when a meal changes recipe', () => {
		const id = fresh(['2026-10-07-dinner']);
		expect(item(value(getShoppingListDetail(db, ctx(), id)), 'hamburger-di-cavallo')).toBeDefined();
		value(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', 'pasta-ricotta-zafferano'));
		const detail = value(getShoppingListDetail(db, ctx(), id));
		expect(item(detail, 'hamburger-di-cavallo')).toBeUndefined();
		expect(item(detail, 'spaghettoni')).toBeDefined();
	});

	it('closes by itself at the last tick, freezing quantities, and can be reopened', () => {
		const id = fresh(['2026-10-07-dinner']);
		value(toggleShoppingItem(db, ctx(), id, 'hamburger-di-cavallo'));
		const last = value(toggleShoppingItem(db, ctx(), id, 'panini-per-hamburger'));
		expect(last.closed).toBe(true);
		value(setMealServings(db, ctx(), '2026-10-07-dinner', 6));
		const closed = value(getShoppingListDetail(db, ctx(), id));
		expect(closed).toMatchObject({ status: 'closed', closedAt: '2026-10-06T12:00' });
		expect(item(closed, 'hamburger-di-cavallo')).toMatchObject({ quantity: '2', checked: true });
		expect(toggleShoppingItem(db, ctx(), id, 'hamburger-di-cavallo')).toEqual({ ok: false, error: 'not_allowed' });
		value(reopenShoppingList(db, ctx(), id));
		const reopened = value(getShoppingListDetail(db, ctx(), id));
		expect(item(reopened, 'hamburger-di-cavallo')).toMatchObject({ quantity: '6', checked: false, previousQuantity: '2' });
	});

	it('is disabled offline', () => {
		const id = fresh(['2026-10-07-lunch']);
		expect(toggleShoppingItem(db, ctx({ offline: true }), id, 'fusilloni')).toEqual({ ok: false, error: 'offline' });
	});
});

describe('manual items, excluded items and meals', () => {
	it('adds free-text items under "other", ticks and removes them', () => {
		const id = fresh(['2026-10-07-dinner']);
		const added = value(addManualItem(db, ctx(), id, '  Detersivo piatti '));
		let detail = value(getShoppingListDetail(db, ctx(), id));
		const other = detail.departments.find((g) => g.department === 'other');
		expect(other?.manual).toEqual([{ id: added.itemId, text: 'Detersivo piatti', checked: false }]);
		expect(detail.total).toBe(3);
		value(toggleManualItem(db, ctx(), id, added.itemId));
		detail = value(getShoppingListDetail(db, ctx(), id));
		expect(detail.checked).toBe(1);
		value(removeManualItem(db, ctx(), id, added.itemId));
		expect(value(getShoppingListDetail(db, ctx(), id)).total).toBe(2);
		expect(addManualItem(db, ctx(), id, '   ')).toEqual({ ok: false, error: 'invalid' });
	});

	it('puts an excluded ingredient back on the list', () => {
		const id = fresh(['2026-10-06-dinner']);
		value(toggleAddedBack(db, ctx(), id, 'peperoncino-fresco'));
		const detail = value(getShoppingListDetail(db, ctx(), id));
		expect(item(detail, 'peperoncino-fresco')).toBeDefined();
		expect(detail.excluded.some((i) => i.id === 'peperoncino-fresco')).toBe(false);
	});

	it('changes the meals of a list', () => {
		const id = fresh(['2026-10-07-dinner']);
		value(setShoppingListMeals(db, ctx(), id, ['2026-10-07-dinner', '2026-10-09-dinner']));
		const detail = value(getShoppingListDetail(db, ctx(), id));
		expect(detail.slotIds).toEqual(['2026-10-07-dinner', '2026-10-09-dinner']);
		expect(item(detail, 'filetti-di-branzino')).toBeDefined();
	});
});

describe('closing and deleting', () => {
	it('closes with "Spesa fatta" and lists it in the history', () => {
		const id = fresh(['2026-10-07-dinner']);
		value(closeShoppingList(db, ctx(), id));
		const lists = value(getShoppingLists(db, ctx()));
		expect(lists.closed[0].id).toBe(id);
		expect(lists.open.some((l) => l.id === id)).toBe(false);
	});

	it('deletes and restores a list (undo)', () => {
		const id = fresh(['2026-10-07-dinner']);
		const removed = value(deleteShoppingList(db, ctx(), id));
		expect(getShoppingListDetail(db, ctx(), id)).toEqual({ ok: false, error: 'not_found' });
		value(restoreShoppingList(db, ctx(), removed));
		expect(value(getShoppingListDetail(db, ctx(), id)).id).toBe(id);
	});
});

describe('weekly lists (runShoppingListJobs)', () => {
	const weekly = (weekId: string) => db.shoppingLists.find((l) => l.weekId === weekId);

	it('creates the weekly list when the next week is generated, once', () => {
		expect(runShoppingListJobs(db, '2026-10-07T19:59')).toBe(false);
		expect(runShoppingListJobs(db, '2026-10-07T20:00')).toBe(true);
		const list = weekly('week-2026-10-12');
		expect(list).toMatchObject({ status: 'open', createdBy: null, createdAt: '2026-10-07T20:00' });
		expect(list?.slotIds).toHaveLength(14);
		expect(runShoppingListJobs(db, '2026-10-08T09:00')).toBe(false);
		// Two weekly lists open until Sunday night.
		expect(value(getShoppingLists(db, ctx({ now: '2026-10-08T09:00' }))).open.filter((l) => l.weekly)).toHaveLength(2);
	});

	it('does not create a deleted weekly list again', () => {
		runShoppingListJobs(db, '2026-10-07T20:00');
		value(deleteShoppingList(db, ctx({ now: '2026-10-07T21:00' }), weekly('week-2026-10-12')!.id));
		runShoppingListJobs(db, '2026-10-08T09:00');
		expect(weekly('week-2026-10-12')).toBeUndefined();
	});

	it('archives a used weekly list after Sunday dinner and deletes an untouched one', () => {
		const id = weekly('week-2026-10-05')!.id;
		value(toggleShoppingItem(db, ctx(), id, 'fusilloni'));
		runShoppingListJobs(db, '2026-10-11T22:59');
		expect(weekly('week-2026-10-05')?.status).toBe('open');
		runShoppingListJobs(db, '2026-10-11T23:00');
		expect(weekly('week-2026-10-05')).toMatchObject({ status: 'closed', closedAt: '2026-10-11T23:00', updatedBy: 'user-federico' });
		expect(weekly('week-2026-10-05')?.frozenSlots).not.toBeNull();

		const untouched = createInitial().db;
		runShoppingListJobs(untouched, '2026-10-11T23:00');
		expect(untouched.shoppingLists.some((l) => l.weekId === 'week-2026-10-05')).toBe(false);
	});

	it('keeps the follow-the-meals behaviour of a weekly list', () => {
		const id = weekly('week-2026-10-05')!.id;
		value(setMealServings(db, ctx(), '2026-10-09-dinner', 6));
		expect(item(value(getShoppingListDetail(db, ctx(), id)), 'filetti-di-branzino')?.quantity).toBe('1,2 kg');
	});

	it('keeps only the last lists in the history', () => {
		for (let i = 0; i < MAX_HISTORY + 2; i++) value(closeShoppingList(db, ctx({ now: `2026-10-06T13:${String(i).padStart(2, '0')}` }), fresh(['2026-10-07-dinner'])));
		runShoppingListJobs(db, '2026-10-06T14:00');
		const closed = value(getShoppingLists(db, ctx())).closed;
		expect(closed).toHaveLength(MAX_HISTORY);
		expect(closed.some((l) => l.name.startsWith('Settimana 28'))).toBe(false);
	});
});

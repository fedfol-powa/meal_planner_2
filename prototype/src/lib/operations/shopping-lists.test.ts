import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { replaceMealRecipe, setMealServings } from './revision';
import {
	addManualItem,
	getWeekShoppingList,
	removeManualItem,
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
const list = (week = '2026-10-05', over: Partial<OperationContext> = {}) => value(getWeekShoppingList(db, ctx(over), week));

beforeEach(() => {
	db = createInitial().db;
});

describe('the list of a week', () => {
	it('contains every meal of the week, named after the week, from any day of it', () => {
		const detail = list('2026-10-08');
		expect(detail).toMatchObject({ weekStartsOn: '2026-10-05', name: 'Settimana 5–11 ottobre', mealCount: 12 });
		expect(item(detail, 'rigatoni')).toBeDefined();
		expect(list('2026-10-05', { userId: 'user-tom' }).name).toBe('Week 5–11 October');
	});

	it('shows the demo ticks of Anna and the free item', () => {
		const detail = list();
		expect(detail.checked).toBe(3);
		expect(detail.lastChange).toEqual({ userName: 'Anna', at: '2026-10-05T19:10' });
		expect(detail.departments.find((d) => d.department === 'other')?.manual.map((m) => m.text)).toEqual(['Detersivo per i piatti']);
	});

	it('keeps the list of a past week, as ticked', () => {
		const detail = list('2026-09-28');
		expect(detail.checked).toBe(detail.total);
		expect(detail.lastChange?.userName).toBe('Federico');
	});

	it('exists for a week nobody touched, without a last change', () => {
		const detail = list('2026-09-21');
		expect(detail).toMatchObject({ checked: 0, lastChange: null });
		expect(db.shoppingLists.some((l) => l.weekId === 'week-2026-09-21')).toBe(false);
	});

	it('is not found for hidden weeks or other families', () => {
		expect(getWeekShoppingList(db, ctx(), '2026-10-12')).toEqual({ ok: false, error: 'not_found' });
		expect(getWeekShoppingList(db, ctx(), 'nope')).toEqual({ ok: false, error: 'not_found' });
		expect(getWeekShoppingList(db, ctx({ userId: 'user-lucia', familyId: 'family-grandparents' }), '2026-10-05')).toEqual({ ok: false, error: 'not_found' });
		expect(list('2026-10-12', { now: '2026-10-07T20:00' }).name).toBe('Settimana 12–18 ottobre');
	});
});

describe('ticking items', () => {
	it('shares the tick with the family, saving the list at the first change', () => {
		const first = items(list('2026-09-21'))[0].id;
		value(toggleShoppingItem(db, ctx({ userId: 'user-tom', now: '2026-10-06T18:00' }), '2026-09-21', first));
		expect(item(list('2026-09-21'), first)?.checked).toBe(true);
		expect(list('2026-09-21').lastChange).toEqual({ userName: 'Tom', at: '2026-10-06T18:00' });
		value(toggleShoppingItem(db, ctx(), '2026-09-21', first));
		expect(item(list('2026-09-21'), first)?.checked).toBe(false);
	});

	it('follows the meals: a tick drops when the quantity grows and shows the old one', () => {
		// fusilloni: ticked by Anna at 300 g (3 servings of 4).
		value(setMealServings(db, ctx(), '2026-10-07-lunch', 4));
		expect(item(list(), 'fusilloni')).toMatchObject({ checked: false, quantity: '400 g', previousQuantity: '300 g' });
	});

	it('keeps the tick when the quantity shrinks', () => {
		value(setMealServings(db, ctx(), '2026-10-07-lunch', 2));
		expect(item(list(), 'fusilloni')).toMatchObject({ checked: true, previousQuantity: null });
	});

	it('updates items when a meal changes recipe', () => {
		expect(item(list(), 'hamburger-di-cavallo')).toBeDefined();
		value(replaceMealRecipe(db, ctx(), '2026-10-07-dinner', 'pasta-ricotta-zafferano'));
		expect(item(list(), 'hamburger-di-cavallo')).toBeUndefined();
		expect(item(list(), 'spaghettoni')?.sources).toHaveLength(2);
	});

	it('is disabled offline', () => {
		expect(toggleShoppingItem(db, ctx({ offline: true }), '2026-10-05', 'rigatoni')).toEqual({ ok: false, error: 'offline' });
	});
});

describe('free items and excluded items', () => {
	it('adds free-text items under "other", ticks and removes them', () => {
		const added = value(addManualItem(db, ctx(), '2026-10-05', '  Caffè  in   grani '));
		let detail = list();
		expect(detail.departments.find((g) => g.department === 'other')?.manual.at(-1)).toEqual({ id: added.itemId, text: 'Caffè in grani', checked: false });
		value(toggleManualItem(db, ctx(), '2026-10-05', added.itemId));
		detail = list();
		expect(detail.checked).toBe(4);
		value(removeManualItem(db, ctx(), '2026-10-05', added.itemId));
		expect(list().total).toBe(detail.total - 1);
		expect(addManualItem(db, ctx(), '2026-10-05', '   ')).toEqual({ ok: false, error: 'invalid' });
	});

	it('puts an excluded ingredient back on the list', () => {
		value(toggleAddedBack(db, ctx(), '2026-10-05', 'peperoncino-fresco'));
		const detail = list();
		expect(item(detail, 'peperoncino-fresco')).toBeDefined();
		expect(detail.excluded.some((i) => i.id === 'peperoncino-fresco')).toBe(false);
	});
});

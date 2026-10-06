import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { arrangeShoppingList, buildShoppingList, shoppingExport } from './shopping';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};
const allItems = (list: ReturnType<typeof arrangeShoppingList>) => list.departments.flatMap((d) => d.items);

beforeEach(() => { db = createInitial().db; });

describe('buildShoppingList', () => {
	it('scales, consolidates canonical ingredients and keeps incompatible units together', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-08-dinner', '2026-10-10-lunch']));
		const items = allItems(arrangeShoppingList(list, new Set()));
		// latte-intero 50 g (4 servings) + latte 100 ml (4 servings) → one "Latte" entry.
		const milk = items.find((i) => i.id === 'latte');
		expect(milk?.quantity).toBe('50 g + 100 ml');
		expect(milk?.sources.map((s) => s.recipeName)).toHaveLength(2);
		expect(items.find((i) => i.id === 'latte-intero')).toBeUndefined();
		expect(list.mealCount).toBe(2);
	});

	it('scales on the servings of the slot', () => {
		// pasta-zucca-salsiccia-robiola: 320 g rigatoni for 4, slot has 3 servings.
		const list = value(buildShoppingList(db, ctx(), ['2026-10-06-lunch']));
		expect(allItems(arrangeShoppingList(list, new Set())).find((i) => i.id === 'rigatoni')?.quantity).toBe('240 g');
	});

	it('sums the same ingredient across meals and rounds after the sum', () => {
		// robiola: 100 g × 3/4 + 250 g × 3/4 = 262.5 g → 260 g.
		const list = value(buildShoppingList(db, ctx(), ['2026-10-06-lunch', '2026-10-07-lunch']));
		const robiola = allItems(arrangeShoppingList(list, new Set())).find((i) => i.id === 'robiola');
		expect(robiola?.quantity).toBe('260 g');
		expect(robiola?.sources.map((s) => s.quantity)).toEqual(['80 g', '190 g']);
	});

	it('leaves pantry and avoided ingredients out of the list, reported apart', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-06-dinner']));
		expect(allItems(arrangeShoppingList(list, new Set())).some((i) => i.id === 'cumino' || i.id === 'peperoncino-fresco')).toBe(false);
		expect(list.excluded.find((i) => i.id === 'cumino')).toMatchObject({ excluded: 'pantry', department: 'condiments' });
		expect(list.excluded.find((i) => i.id === 'peperoncino-fresco')).toMatchObject({ excluded: 'avoid', department: 'produce' });
	});

	it('puts an excluded ingredient added back into its department', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-06-dinner']));
		const arranged = arrangeShoppingList(list, new Set(['peperoncino-fresco']));
		expect(arranged.departments.find((d) => d.department === 'produce')?.items.some((i) => i.id === 'peperoncino-fresco')).toBe(true);
		expect(arranged.excluded.some((i) => i.id === 'peperoncino-fresco')).toBe(false);
	});

	it('orders departments as the standard sequence and items by name', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-06-lunch', '2026-10-06-dinner', '2026-10-07-lunch', '2026-10-07-dinner', '2026-10-08-lunch', '2026-10-08-dinner', '2026-10-09-lunch', '2026-10-09-dinner', '2026-10-10-lunch', '2026-10-11-dinner']));
		const departments = arrangeShoppingList(list, new Set()).departments;
		expect(departments.map((d) => d.department)).toEqual(['produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'condiments']);
		const produce = departments[0].items.map((i) => i.name);
		expect(produce).toEqual([...produce].sort((a, b) => a.localeCompare(b, 'it-IT')));
	});

	it('buys lemons for lemon juice, keeping grams in the meal sources', () => {
		// pollo-corn-flakes: 50 g juice (≈ 1.06 lemons) + zest of 1 lemon, 4 servings of 4.
		const list = value(buildShoppingList(db, ctx(), ['2026-10-08-dinner']));
		const lemon = allItems(arrangeShoppingList(list, new Set())).find((i) => i.id === 'limone');
		expect(lemon?.quantity).toBe('2');
		expect(lemon?.sources.map((s) => s.quantity)).toEqual(['50 g', '1']);
	});

	it('marks optional ingredients', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-08-lunch']));
		// Prezzemolo here only comes from an optional line.
		expect(allItems(arrangeShoppingList(list, new Set())).find((i) => i.id === 'prezzemolo')?.isOptional).toBe(true);
	});

	it('uses the language of the user and the system of the family', () => {
		db.families[0].measurementSystem = 'uk_imperial';
		const list = value(buildShoppingList(db, ctx({ userId: 'user-tom' }), ['2026-10-09-dinner']));
		expect(allItems(arrangeShoppingList(list, new Set()))[0]).toMatchObject({ name: 'Sea bass fillets', quantity: '1¾ lb' });
	});

	it('skips free meals and reports recipes without ingredients', () => {
		db.recipes.find((r) => r.id === 'branzino-barbecue')!.status = 'draft';
		db.recipes.find((r) => r.id === 'branzino-barbecue')!.ingredients = [];
		const list = value(buildShoppingList(db, ctx(), ['2026-10-09-dinner', '2026-10-11-lunch']));
		expect(list.mealCount).toBe(0);
		expect(list.skipped).toEqual([{ slotId: '2026-10-09-dinner', recipeName: 'Filetti di branzino al barbecue' }]);
	});

	it('rejects unknown slots and other families', () => {
		expect(buildShoppingList(db, ctx(), ['nope'])).toEqual({ ok: false, error: 'not_found' });
		expect(buildShoppingList(db, ctx({ userId: 'user-lucia', familyId: 'family-grandparents' }), ['2026-10-06-lunch'])).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('shoppingExport', () => {
	it('exports kept items as plain text and "quantity name" lines for Bring!', () => {
		const list = value(buildShoppingList(db, ctx(), ['2026-10-07-dinner', '2026-10-09-lunch']));
		const arranged = arrangeShoppingList(list, new Set());
		const out = shoppingExport(arranged, new Set(['panini-per-hamburger']), 'it-IT');
		expect(out.bringItems).toEqual(['1 Pomodori', 'q.b. Salvia', '2 Hamburger di cavallo', '190 g Ricotta vaccina', '240 g Spaghettoni']);
		expect(out.text.split('\n')[0]).toBe('Lista della spesa · 2 pasti');
		expect(out.text).toContain('Macelleria\n• 2 Hamburger di cavallo');
		expect(out.text).not.toContain('Panini');
	});
});

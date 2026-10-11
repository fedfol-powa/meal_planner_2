import { describe, expect, it } from 'vitest';
import type { UnitCode } from '../units/codes.ts';
import type { UnitEquivalence } from '../units/equivalence.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import {
	consolidateShoppingList, type ConsolidatedList, type MealType, type ShoppingIngredient, type ShoppingListInput,
	type ShoppingMeal, type ShoppingRecipe, type ShoppingRecipeLine
} from './consolidate.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['lemon', { name: t('Limone', 'Lemon'), department: 'produce', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }],
	['oil', { name: t('Olio', 'Oil'), department: 'condiments', isPantry: true }],
	['anchovy', { name: t('Acciughe', 'Anchovies'), department: 'tinned', isPantry: true }]
]);
const lemonJuice: UnitEquivalence = {
	ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo',
	source: 'USDA FoodData Central: juice of 1 lemon = 47 g'
};
const juice = t('succo', 'juice');
const line = (ingredientId: string, quantity: Quantity, extra: Partial<ShoppingRecipeLine> = {}): ShoppingRecipeLine => ({
	ingredientId, variety: null, preparation: null, quantity, isOptional: false, ...extra
});
const recipe = (id: string, lines: ShoppingRecipeLine[], baseServings: number | null = 2): ShoppingRecipe => ({
	id, name: t(`Ricetta ${id}`, `Recipe ${id}`), baseServings, lines
});
const meal = (slotId: string, date: string, mealType: MealType, servings: number, r: ShoppingRecipe | null): ShoppingMeal => ({
	slotId, date, mealType, servings, recipe: r
});
const input = (meals: ShoppingMeal[], extra: Partial<ShoppingListInput> = {}): ShoppingListInput => ({
	meals, ingredients, equivalences: [lemonJuice], avoided: new Set(), ...extra
});
const item = (list: ConsolidatedList, key: string) => {
	const found = list.items.find((i) => i.key === key);
	if (!found) throw new Error(`No item ${key}`);
	return found;
};

describe('consolidateShoppingList', () => {
	it('scales each line and sums the same ingredient across meals', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 4, recipe('a', [line('tomato', amount(200, 'g'))])),
			meal('s2', '2026-10-12', 'dinner', 2, recipe('b', [line('tomato', amount(0.1, 'kg'))]))
		]));
		expect(list.mealCount).toBe(2);
		expect(item(list, 'tomato~').combined.mass_g).toBe(500);
		expect(item(list, 'tomato~').sources.map((s) => s.quantity)).toEqual([amount(400, 'g'), amount(0.1, 'kg')]);
	});

	it('keeps varieties apart, sums spellings of the same one and shows the most used spelling', () => {
		const roma = t('Roma', 'Roma');
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('tomato', amount(100, 'g'), { variety: roma }), line('tomato', amount(200, 'g'))])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('tomato', amount(50, 'g'), { variety: t('tipo Roma', 'Roma type') })])),
			meal('s3', '2026-10-14', 'lunch', 2, recipe('c', [line('tomato', amount(100, 'g'), { variety: roma })]))
		]));
		expect(item(list, 'tomato~roma').combined.mass_g).toBe(250);
		expect(item(list, 'tomato~roma').variety).toEqual(roma);
		expect(item(list, 'tomato~roma').varietyKey).toBe('roma');
		expect(item(list, 'tomato~').combined.mass_g).toBe(200);
		expect(item(list, 'tomato~').variety).toBeNull();
	});

	it('excludes avoided ingredients in every variety, then pantry ones', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [
				line('tomato', amount(100, 'g'), { variety: t('Roma', 'Roma') }),
				line('tomato', amount(100, 'g')),
				line('anchovy', amount(20, 'g')),
				line('oil', { kind: 'to_taste' }),
				line('parsley', amount(1, 'bunch'))
			]))
		], { avoided: new Set(['tomato', 'anchovy']) }));
		expect(item(list, 'tomato~roma').excluded).toBe('avoid');
		expect(item(list, 'tomato~').excluded).toBe('avoid');
		expect(item(list, 'anchovy~').excluded).toBe('avoid');
		expect(item(list, 'oil~').excluded).toBe('pantry');
		expect(item(list, 'parsley~').excluded).toBeNull();
	});

	it('marks an item optional only when every line is optional', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('parsley', amount(1, 'bunch'), { isOptional: true }), line('lemon', amount(1, 'piece'), { isOptional: true })])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('parsley', amount(1, 'bunch'))]))
		]));
		expect(item(list, 'parsley~').isOptional).toBe(false);
		expect(item(list, 'lemon~').isOptional).toBe(true);
	});

	it('buys lemon juice as lemons and keeps zest in its units on the same item', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [
				line('lemon', amount(50, 'g'), { preparation: juice }),
				line('lemon', amount(1, 'tsp'), { preparation: t('scorza grattugiata', 'grated zest') }),
				line('lemon', amount(5, 'g'), { preparation: t('scorza', 'zest') })
			])),
			meal('s2', '2026-10-13', 'lunch', 2, recipe('b', [line('lemon', amount(1, 'piece'))]))
		]));
		const lemon = item(list, 'lemon~');
		expect(lemon.combined.mass_g).toBe(5);
		expect(lemon.combined.counts.piece).toBeCloseTo(1 + 50 / 47, 12);
		expect(lemon.combined.counts.tsp).toBe(1);
		expect(lemon.sources[0].quantity).toEqual(amount(50, 'g'));
	});

	it('prefers the equivalence of the line preparation over the generic one', () => {
		// Synthetic factor: a generic per-weight rule for the whole lemon.
		const wholeLemon: UnitEquivalence = { ...lemonJuice, factor: 1 / 120, preparation: null, source: 'synthetic' };
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('lemon', amount(94, 'g'), { preparation: t('Succo', 'Juice') }), line('lemon', amount(60, 'g'))]))
		], { equivalences: [wholeLemon, lemonJuice] }));
		expect(item(list, 'lemon~').combined.counts.piece).toBeCloseTo(2 + 0.5, 12);
		expect(item(list, 'lemon~').combined.mass_g).toBeNull();
	});

	it('collects translations of text quantities and notes to taste', () => {
		const bunch: Quantity = { kind: 'text', text: t('1 mazzetto abbondante', '1 large bunch') };
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('parsley', bunch), line('oil', { kind: 'to_taste' })]))
		]));
		expect(item(list, 'parsley~').combined.texts).toEqual([{ key: '1 mazzetto abbondante', text: t('1 mazzetto abbondante', '1 large bunch') }]);
		expect(item(list, 'oil~').combined.to_taste).toBe(true);
	});

	it('ignores meals without a recipe and reports recipes without data', () => {
		const list = consolidateShoppingList(input([
			meal('s1', '2026-10-12', 'lunch', 2, null),
			meal('s2', '2026-10-12', 'dinner', 2, recipe('a', [line('tomato', amount(100, 'g'))], null)),
			meal('s3', '2026-10-13', 'lunch', 2, recipe('b', [])),
			meal('s4', '2026-10-13', 'dinner', 2, recipe('c', [line('tomato', amount(100, 'g'))]))
		]));
		expect(list.mealCount).toBe(1);
		expect(list.skipped).toEqual([
			{ slotId: 's2', recipeId: 'a', recipeName: t('Ricetta a', 'Recipe a') },
			{ slotId: 's3', recipeId: 'b', recipeName: t('Ricetta b', 'Recipe b') }
		]);
	});

	it('returns an empty list for a week of free meals', () => {
		const list = consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, null), meal('s2', '2026-10-12', 'dinner', 2, null)]));
		expect(list).toEqual({ mealCount: 0, items: [], skipped: [] });
	});

	it('orders sources by date and meal', () => {
		const list = consolidateShoppingList(input([
			meal('dinner', '2026-10-12', 'dinner', 2, recipe('a', [line('tomato', amount(100, 'g'))])),
			meal('next', '2026-10-13', 'lunch', 2, recipe('b', [line('tomato', amount(100, 'g'))])),
			meal('lunch', '2026-10-12', 'lunch', 2, recipe('c', [line('tomato', amount(100, 'g'))]))
		]));
		expect(item(list, 'tomato~').sources.map((s) => s.slotId)).toEqual(['lunch', 'dinner', 'next']);
	});

	it('refuses ambiguous shopping equivalences before computing', () => {
		const perKilo: UnitEquivalence = { ...lemonJuice, fromUnit: 'kg', factor: 1000 / 47 };
		expect(() => consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, null)], { equivalences: [lemonJuice, perKilo] }))).toThrow(/Ambiguous/);
	});

	it('fails on an ingredient missing from the catalogue', () => {
		expect(() => consolidateShoppingList(input([meal('s1', '2026-10-12', 'lunch', 2, recipe('a', [line('ghost', amount(1, 'piece'))]))]))).toThrow(/ghost/);
	});
});

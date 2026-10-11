import { describe, expect, it } from 'vitest';
import type { UnitCode } from '../units/codes.ts';
import { addQuantity, emptyCombined, type CombinedQuantity } from '../units/combined.ts';
import type { Localized } from '../units/locale.ts';
import type { Quantity } from '../units/quantity.ts';
import { arrangeShoppingList, compareShoppingItems, displayName, type ArrangeOptions, type ArrangedShoppingList } from './arrange.ts';
import { consolidateShoppingList, type ShoppingIngredient, type ShoppingRecipeLine } from './consolidate.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const amount = (value: number, unit: UnitCode): Quantity => ({ kind: 'amount', value, unit });
const combine = (...quantities: Quantity[]): CombinedQuantity => quantities.reduce(addQuantity, emptyCombined());
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['pepper', { name: t('Peperone', 'Pepper'), department: 'produce', isPantry: false }],
	['lemon', { name: t('Limone', 'Lemon'), department: 'produce', isPantry: false }],
	['oil', { name: t('Olio', 'Oil'), department: 'condiments', isPantry: true }],
	['anchovy', { name: t('Acciughe', 'Anchovies'), department: 'tinned', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }]
]);
const line = (ingredientId: string, quantity: Quantity, variety: Localized | null = null, preparation: Localized | null = null): ShoppingRecipeLine => ({
	ingredientId, variety, preparation, quantity, isOptional: false
});
const list = consolidateShoppingList({
	meals: [
		{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
			line('tomato', amount(200, 'g'), t('Roma', 'Roma')), line('pepper', amount(0.5, 'piece')), line('oil', { kind: 'to_taste' }), line('anchovy', amount(20, 'g'))
		] } },
		{ slotId: 's2', date: '2026-10-12', mealType: 'dinner', servings: 2, recipe: { id: 'b', name: t('Ricetta b', 'Recipe b'), baseServings: 2, lines: [
			line('lemon', amount(50, 'g'), null, t('succo', 'juice')), line('tomato', amount(100, 'g'))
		] } },
		{ slotId: 's3', date: '2026-10-13', mealType: 'lunch', servings: 2, recipe: { id: 'c', name: t('Ricetta c', 'Recipe c'), baseServings: null, lines: [] } }
	],
	ingredients,
	equivalences: [{ ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo', source: 'USDA FoodData Central' }],
	avoided: new Set(['anchovy'])
});
const arrange = (options: Partial<ArrangeOptions> = {}) =>
	arrangeShoppingList(list, { checks: [], addedBack: [], system: 'metric', locale: 'it-IT', ...options });
const view = (arranged: ArrangedShoppingList, key: string) => {
	const found = [...arranged.departments.flatMap((d) => d.items), ...arranged.excluded].find((i) => i.key === key);
	if (!found) throw new Error(`No item ${key}`);
	return found;
};

describe('arrangeShoppingList', () => {
	it('groups by department in the standard order and sorts by name', () => {
		const arranged = arrange();
		expect(arranged.departments.map((d) => d.department)).toEqual(['produce']);
		expect(arranged.departments[0].items.map((i) => i.name)).toEqual(['Limone', 'Peperone', 'Pomodori', 'Pomodori (Roma)']);
		expect(arranged.excluded.map((i) => [i.name, i.excluded])).toEqual([['Acciughe', 'avoid'], ['Olio', 'pantry']]);
		expect(arranged.mealCount).toBe(2);
	});

	it('shows quantities to buy and sources in recipe units', () => {
		const arranged = arrange();
		expect(view(arranged, 'pepper~').quantity).toBe('1');
		expect(view(arranged, 'pepper~').sources).toEqual([{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', recipeName: 'Ricetta a', quantity: '½' }]);
		expect(view(arranged, 'lemon~').quantity).toBe('1');
		expect(view(arranged, 'lemon~').sources[0].quantity).toBe('50 g');
		expect(view(arranged, 'tomato~roma').quantity).toBe('200 g');
	});

	it('exposes the canonical quantity the client sends when ticking', () => {
		expect(view(arrange(), 'tomato~roma').combined).toEqual(combine(amount(200, 'g')));
		expect(view(arrange(), 'pepper~').combined).toEqual(combine(amount(0.5, 'piece')));
	});

	it('keeps an item ticked unless its quantity grew, and ignores ticks of items gone', () => {
		const arranged = arrange({ checks: [
			{ ingredientId: 'tomato', varietyKey: 'roma', quantityAtCheck: combine(amount(200, 'g')) },
			{ ingredientId: 'tomato', varietyKey: '', quantityAtCheck: combine(amount(50, 'g')) },
			{ ingredientId: 'pepper', varietyKey: '', quantityAtCheck: combine(amount(2, 'piece')) },
			{ ingredientId: 'ghost', varietyKey: '', quantityAtCheck: combine(amount(1, 'piece')) }
		] });
		expect(view(arranged, 'tomato~roma')).toMatchObject({ checked: true, previousQuantity: null });
		expect(view(arranged, 'tomato~')).toMatchObject({ checked: false, previousQuantity: '50 g' });
		expect(view(arranged, 'pepper~')).toMatchObject({ checked: true, previousQuantity: null });
		expect(view(arranged, 'lemon~').checked).toBe(false);
	});

	it('keeps a ticked item ticked when the family changes measurement system', () => {
		const checks = [{ ingredientId: 'tomato', varietyKey: 'roma', quantityAtCheck: combine(amount(200, 'g')) }];
		const arranged = arrange({ checks, system: 'uk_imperial', locale: 'en-GB' });
		expect(view(arranged, 'tomato~roma')).toMatchObject({ checked: true, quantity: '7 oz', name: 'Tomatoes (Roma)' });
	});

	it('shows the ticked quantity in the viewer language even after its text was replaced', () => {
		const changed = consolidateShoppingList({
			meals: [{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
				line('parsley', { kind: 'text', text: t('2 mazzetti abbondanti', '2 large bunches') })
			] } }],
			ingredients,
			equivalences: [],
			avoided: new Set()
		});
		const checks = [{ ingredientId: 'parsley', varietyKey: '', quantityAtCheck: combine({ kind: 'text', text: t('1 mazzetto abbondante', '1 large bunch') }) }];
		const english = arrangeShoppingList(changed, { checks, addedBack: [], system: 'metric', locale: 'en-GB' });
		expect(view(english, 'parsley~')).toMatchObject({ checked: false, quantity: '2 large bunches', previousQuantity: '1 large bunch' });
		const italian = arrangeShoppingList(changed, { checks, addedBack: [], system: 'metric', locale: 'it-IT' });
		expect(view(italian, 'parsley~')).toMatchObject({ quantity: '2 mazzetti abbondanti', previousQuantity: '1 mazzetto abbondante' });
	});

	it('puts excluded items back in their department when added back', () => {
		const arranged = arrange({ addedBack: [{ ingredientId: 'oil', varietyKey: '' }] });
		expect(arranged.departments.map((d) => d.department)).toEqual(['produce', 'condiments']);
		expect(view(arranged, 'oil~')).toMatchObject({ quantity: 'q.b.', excluded: 'pantry' });
		expect(arranged.excluded.map((i) => i.name)).toEqual(['Acciughe']);
	});

	it('names skipped recipes in the viewer language', () => {
		expect(arrange({ locale: 'en-GB' }).skipped).toEqual([{ slotId: 's3', recipeId: 'c', recipeName: 'Recipe c' }]);
	});
});

describe('displayName', () => {
	it('puts the variety in brackets after the name, in the viewer language', () => {
		expect(displayName(t('Uva', 'Grapes'), t('gialla senza semi', 'seedless white'), 'en-GB')).toBe('Grapes (seedless white)');
		expect(displayName(t('Cipolle', 'Onions'), t('rossa di Tropea', 'red Tropea'), 'it-IT')).toBe('Cipolle (rossa di Tropea)');
		expect(displayName(t('Cipolle', 'Onions'), t('rossa', 'red'), 'en-GB')).toBe('Onions (red)');
		expect(displayName(t('Uva', 'Grapes'), null, 'it-IT')).toBe('Uva');
	});
});

describe('order of the items (PR #24 review)', () => {
	const grains = new Map<string, ShoppingIngredient>([
		['flour', { name: t('Farina', 'Flour'), department: 'pasta_grains', isPantry: false }],
		['maize', { name: t('Farina di mais', 'Maize flour'), department: 'pasta_grains', isPantry: false }],
		['riceFlour', { name: t('Farina di riso', 'Rice flour'), department: 'pasta_grains', isPantry: false }],
		['rice', { name: t('Riso', 'Rice'), department: 'pasta_grains', isPantry: false }]
	]);
	const meals = [{ slotId: 's1', date: '2026-10-12', mealType: 'lunch' as const, servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
		line('rice', amount(100, 'g'), t('jasmine', 'jasmine')), line('riceFlour', amount(50, 'g')), line('flour', amount(100, 'g'), t('integrale', 'wholemeal')),
		line('maize', amount(100, 'g')), line('rice', amount(100, 'g')), line('flour', amount(100, 'g'))
	] } }];
	const names = (avoided: Set<string>, locale: 'it-IT' | 'en-GB') => {
		const arranged = arrangeShoppingList(consolidateShoppingList({ meals, ingredients: grains, equivalences: [], avoided }), { checks: [], addedBack: [], system: 'metric', locale });
		return { listed: arranged.departments.flatMap((d) => d.items.map((i) => i.name)), excluded: arranged.excluded.map((i) => i.name) };
	};
	const italian = ['Farina', 'Farina (integrale)', 'Farina di mais', 'Farina di riso', 'Riso', 'Riso (jasmine)'];
	const english = ['Flour', 'Flour (wholemeal)', 'Maize flour', 'Rice', 'Rice (jasmine)', 'Rice flour'];

	it('sorts by ingredient name, then variety, the item without variety first, in both languages', () => {
		expect(names(new Set(), 'it-IT').listed).toEqual(italian);
		expect(names(new Set(), 'en-GB').listed).toEqual(english);
	});

	it('compares ingredient name and variety, never the shown name with its brackets', () => {
		// Names that would sort the other way round: the comparator reads the parts only.
		const a = { ingredientName: 'Rice', variety: null, name: 'zzz' };
		const b = { ingredientName: 'Rice', variety: 'jasmine', name: 'aaa' };
		const c = { ingredientName: 'Rice flour', variety: null, name: '(' };
		expect([c, b, a].sort(compareShoppingItems('en-GB')).map((i) => i.name)).toEqual(['zzz', 'aaa', '(']);
		expect(names(new Set(), 'en-GB').listed).toEqual(english);
	});

	it('exposes ingredient name and variety in the view, in the viewer language', () => {
		const arranged = arrangeShoppingList(consolidateShoppingList({ meals, ingredients: grains, equivalences: [], avoided: new Set() }), { checks: [], addedBack: [], system: 'metric', locale: 'en-GB' });
		expect(arranged.departments[0].items.slice(0, 2).map((i) => [i.ingredientName, i.variety])).toEqual([['Flour', null], ['Flour', 'wholemeal']]);
	});

	it('sorts «Non in lista» the same way', () => {
		const all = new Set(grains.keys());
		expect(names(all, 'it-IT').excluded).toEqual(italian);
		expect(names(all, 'en-GB').excluded).toEqual(english);
	});
});

describe('counted units in the list (user decision, option 1)', () => {
	const pantryless = new Map<string, ShoppingIngredient>([
		['garlic', { name: t('Aglio', 'Garlic'), department: 'produce', isPantry: false }],
		['onion', { name: t('Cipolla', 'Onion'), department: 'produce', isPantry: false }]
	]);
	const meal = (slotId: string, servings: number) => ({ slotId, date: '2026-10-12', mealType: 'lunch' as const, servings, recipe: { id: 'r', name: t('Ricetta', 'Recipe'), baseServings: 4, lines: [
		line('garlic', amount(3, 'clove')), line('onion', amount(0.5, 'piece'))
	] } });
	const arranged = (servings: number) =>
		arrangeShoppingList(consolidateShoppingList({ meals: [meal('s1', servings)], ingredients: pantryless, equivalences: [], avoided: new Set() }), { checks: [], addedBack: [], system: 'metric', locale: 'it-IT' });

	it('buys whole cloves and pieces; sources scaled show whole cloves and halves of pieces', () => {
		const list = arranged(6);
		expect(view(list, 'garlic~')).toMatchObject({ quantity: '5 spicchi', sources: [{ quantity: '5 spicchi' }] });
		expect(view(list, 'onion~')).toMatchObject({ quantity: '1', sources: [{ quantity: '1' }] });
		expect(view(arranged(3), 'onion~').sources[0].quantity).toBe('½');
	});

	it('shows sources at the servings of the recipe as written', () => {
		const list = arranged(4);
		expect(view(list, 'garlic~').sources[0].quantity).toBe('3 spicchi');
		expect(view(list, 'onion~').sources[0].quantity).toBe('½');
	});

	it('buys as many cloves as the meal shows, even just over a whole (1 clove for 10, made for 11)', () => {
		for (const [servings, shown] of [[10, '1 spicchio'], [11, '2 spicchi']] as const) {
			const one = { slotId: 's1', date: '2026-10-12', mealType: 'lunch' as const, servings, recipe: { id: 'r', name: t('Ricetta', 'Recipe'), baseServings: 10, lines: [line('garlic', amount(1, 'clove'))] } };
			const list = arrangeShoppingList(consolidateShoppingList({ meals: [one], ingredients: pantryless, equivalences: [], avoided: new Set() }), { checks: [], addedBack: [], system: 'metric', locale: 'it-IT' });
			expect(view(list, 'garlic~')).toMatchObject({ quantity: shown, sources: [{ quantity: shown }] });
		}
	});
});

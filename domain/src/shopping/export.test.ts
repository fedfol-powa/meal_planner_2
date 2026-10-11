import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined } from '../units/combined.ts';
import type { Localized } from '../units/locale.ts';
import { arrangeShoppingList } from './arrange.ts';
import { consolidateShoppingList, type ShoppingIngredient } from './consolidate.ts';
import { shoppingExport } from './export.ts';

const t = (it: string, en: string): Localized => ({ 'it-IT': it, 'en-GB': en });
const ingredients = new Map<string, ShoppingIngredient>([
	['tomato', { name: t('Pomodori', 'Tomatoes'), department: 'produce', isPantry: false }],
	['parsley', { name: t('Prezzemolo', 'Parsley'), department: 'produce', isPantry: false }],
	['pepper', { name: t('Peperone', 'Pepper'), department: 'produce', isPantry: false }]
]);
const consolidated = consolidateShoppingList({
	meals: [{ slotId: 's1', date: '2026-10-12', mealType: 'lunch', servings: 2, recipe: { id: 'a', name: t('Ricetta a', 'Recipe a'), baseServings: 2, lines: [
		{ ingredientId: 'tomato', variety: null, preparation: null, quantity: { kind: 'amount', value: 200, unit: 'g' }, isOptional: false },
		{ ingredientId: 'parsley', variety: null, preparation: null, quantity: { kind: 'amount', value: 1, unit: 'bunch' }, isOptional: true },
		{ ingredientId: 'pepper', variety: null, preparation: null, quantity: { kind: 'amount', value: 1, unit: 'piece' }, isOptional: false }
	] } }],
	ingredients,
	equivalences: [],
	avoided: new Set()
});
const pepperTicked = addQuantity(emptyCombined(), { kind: 'amount', value: 1, unit: 'piece' });

describe('shoppingExport', () => {
	it('leaves ticked items out and puts unticked free items under "Altro"', () => {
		const arranged = arrangeShoppingList(consolidated, {
			checks: [{ ingredientId: 'pepper', varietyKey: '', quantityAtCheck: pepperTicked }], addedBack: [], system: 'metric', locale: 'it-IT'
		});
		const result = shoppingExport(arranged, [{ text: 'Detersivo per i piatti', checked: false }, { text: 'Sale grosso', checked: true }]);
		expect(result.text).toBe(
			'Lista della spesa · 1 pasto\n\nFrutta e verdura\n• 200 g Pomodori\n• 1 mazzetto Prezzemolo (facoltativo)\n\nAltro\n• Detersivo per i piatti'
		);
		expect(result.lines).toEqual(['200 g Pomodori', '1 mazzetto Prezzemolo (facoltativo)', 'Detersivo per i piatti']);
	});

	it('writes in the language of whoever exports', () => {
		const arranged = arrangeShoppingList({ ...consolidated, mealCount: 2 }, { checks: [], addedBack: [], system: 'metric', locale: 'en-GB' });
		const result = shoppingExport(arranged);
		expect(result.text.split('\n')[0]).toBe('Shopping list · 2 meals');
		expect(result.lines).toEqual(['1 bunch Parsley (optional)', '1 Pepper', '200 g Tomatoes']);
	});
});

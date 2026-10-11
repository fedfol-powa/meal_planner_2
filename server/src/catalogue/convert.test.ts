import { emptyDraft, type DraftIngredientLine, type RecipeDraftDocument } from '@app/domain/recipe';
import { describe, expect, it } from 'vitest';
import { applyRecipeConversions, type UnitEquivalenceRow } from './convert.ts';

const flour = '11111111-1111-4111-8111-111111111111';
const lemon = '22222222-2222-4222-8222-222222222222';
const cupLine = (ingredientId: string | null, value: number | null, preparation: DraftIngredientLine['preparation'] = null): DraftIngredientLine => ({
	ingredientId, variety: null, preparation, quantity: { kind: 'amount', value, unit: 'us_cup' },
	sourceText: '1 cup', isOptional: false, isPrimary: false,
});
const eq = (over: Partial<UnitEquivalenceRow>): UnitEquivalenceRow => ({
	id: crypto.randomUUID(), ingredientId: flour, fromUnit: 'us_cup', toUnit: 'g', factor: 120, scope: 'recipe', preparation: null, source: 'King Arthur', ...over,
});
const draft = (ingredients: DraftIngredientLine[]): RecipeDraftDocument => ({ ...emptyDraft(), ingredients });

describe('applyRecipeConversions', () => {
	it('converts a cup with the recipe equivalence and keeps the source text', () => {
		const e = eq({});
		const doc = draft([cupLine(flour, 2)]);
		const { document, conversions } = applyRecipeConversions(doc, new Map([[flour, [e]]]));
		expect(document.ingredients?.[0]?.quantity).toEqual({ kind: 'amount', value: 240, unit: 'g' });
		expect(document.ingredients?.[0]?.sourceText).toBe('1 cup');
		expect(conversions).toEqual([{ line: 0, from: { kind: 'amount', value: 2, unit: 'us_cup' }, to: { kind: 'amount', value: 240, unit: 'g' },
			equivalence: { id: e.id, factor: 120, source: 'King Arthur', preparation: null } }]);
		expect(doc.ingredients?.[0]?.quantity).toEqual({ kind: 'amount', value: 2, unit: 'us_cup' }); // input untouched
	});

	it('leaves cups without an equivalence, without a value or without an ingredient', () => {
		const doc = draft([cupLine(lemon, 1), cupLine(flour, null), cupLine(null, 1)]);
		const { document, conversions } = applyRecipeConversions(doc, new Map([[flour, [eq({})]]]));
		expect(conversions).toEqual([]);
		expect(document.ingredients?.map((l) => l.quantity)).toEqual(doc.ingredients?.map((l) => l.quantity));
	});

	it('prefers the equivalence of the line preparation and ignores shopping ones', () => {
		const juice = eq({ ingredientId: lemon, toUnit: 'ml', factor: 237, preparation: 'succo' });
		const shopping = eq({ ingredientId: lemon, scope: 'shopping', toUnit: 'piece', factor: 5 });
		const doc = draft([cupLine(lemon, 1, { 'it-IT': 'Succo', 'en-GB': 'juice' })]);
		const { conversions } = applyRecipeConversions(doc, new Map([[lemon, [juice, shopping]]]));
		expect(conversions[0]?.to).toEqual({ kind: 'amount', value: 237, unit: 'ml' });
	});

	it('never applies the equivalence of another preparation', () => {
		const zest = eq({ ingredientId: lemon, toUnit: 'g', factor: 96, preparation: 'scorza' });
		const { conversions } = applyRecipeConversions(draft([cupLine(lemon, 1, { 'it-IT': 'succo', 'en-GB': 'juice' })]), new Map([[lemon, [zest]]]));
		expect(conversions).toEqual([]);
	});
});

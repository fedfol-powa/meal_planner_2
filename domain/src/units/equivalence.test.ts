import { describe, expect, it } from 'vitest';
import {
	applyRecipeEquivalence, assertUnambiguousEquivalences, findEquivalence, preparationKey, toPurchaseUnit,
	unitEquivalenceSchema, type UnitEquivalence
} from './equivalence.ts';

const cheddar: UnitEquivalence = {
	ingredientId: 'cheddar', fromUnit: 'us_cup', toUnit: 'g', factor: 113, scope: 'recipe', preparation: null,
	source: 'King Arthur Baking, Ingredient Weight Chart: grated cheddar, 1 cup = 113 g'
};
const lemonJuice: UnitEquivalence = {
	ingredientId: 'lemon', fromUnit: 'g', toUnit: 'piece', factor: 1 / 47, scope: 'shopping', preparation: 'succo',
	source: 'USDA FoodData Central: juice of 1 lemon = 47 g'
};
// Synthetic factor: a generic per-weight rule next to the juice-specific one.
const wholeLemon: UnitEquivalence = { ...lemonJuice, factor: 1 / 120, preparation: null, source: 'synthetic' };

describe('preparationKey', () => {
	it('normalises the Italian preparation like a variety, without filler words', () => {
		expect(preparationKey(' Succo ')).toBe('succo');
		expect(preparationKey('Scòrza grattugiata!')).toBe('scorza grattugiata');
		expect(preparationKey('tipo fine')).toBe('tipo fine');
	});
	it('is null without a preparation', () => {
		expect(preparationKey(null)).toBeNull();
		expect(preparationKey(undefined)).toBeNull();
		expect(preparationKey(' , ')).toBeNull();
	});
});

describe('findEquivalence', () => {
	it('prefers the equivalence of the same preparation, then a generic one', () => {
		expect(findEquivalence([wholeLemon, lemonJuice], 'shopping', 'g', 'Succo')).toBe(lemonJuice);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'kg', 'succo')).toBe(lemonJuice);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'g', 'scorza')).toBe(wholeLemon);
		expect(findEquivalence([lemonJuice, wholeLemon], 'shopping', 'g', null)).toBe(wholeLemon);
	});
	it('never applies an equivalence of another preparation, scope or dimension', () => {
		expect(findEquivalence([lemonJuice], 'shopping', 'g', 'scorza')).toBeNull();
		expect(findEquivalence([lemonJuice], 'shopping', 'g', null)).toBeNull();
		expect(findEquivalence([lemonJuice], 'recipe', 'g', 'succo')).toBeNull();
		expect(findEquivalence([lemonJuice], 'shopping', 'ml', 'succo')).toBeNull();
	});
	it('refuses ambiguous recipe equivalences in either order, generic or of the same preparation', () => {
		// Synthetic factors: two cups of the same ingredient, scope and preparation.
		const a: UnitEquivalence = { ...cheddar, factor: 100, source: 'synthetic' };
		const b: UnitEquivalence = { ...cheddar, factor: 200, source: 'synthetic' };
		for (const preparation of [null, 'grattugiato']) {
			const [pa, pb] = [{ ...a, preparation }, { ...b, preparation }];
			expect(() => findEquivalence([pa, pb], 'recipe', 'us_cup', preparation)).toThrow(/Ambiguous/);
			expect(() => findEquivalence([pb, pa], 'recipe', 'us_cup', preparation)).toThrow(/Ambiguous/);
		}
	});
});

describe('applyRecipeEquivalence', () => {
	it('converts a draft cup with a verified per-ingredient factor', () => {
		expect(applyRecipeEquivalence({ kind: 'amount', value: 0.5, unit: 'us_cup' }, cheddar)).toEqual({ kind: 'amount', value: 56.5, unit: 'g' });
	});
	it('refuses another unit or a shopping equivalence', () => {
		expect(() => applyRecipeEquivalence({ kind: 'amount', value: 1, unit: 'tbsp' }, cheddar)).toThrow();
		expect(() => applyRecipeEquivalence({ kind: 'to_taste' }, cheddar)).toThrow();
		expect(() => applyRecipeEquivalence({ kind: 'amount', value: 50, unit: 'g' }, lemonJuice)).toThrow();
	});
	it('takes the cup of the line preparation when the import chooses with findEquivalence', () => {
		// Synthetic factors: chopped onion measured by the cup, any other onion as a generic rule.
		const onion: UnitEquivalence = { ingredientId: 'onion', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: null, source: 'synthetic' };
		const chopped: UnitEquivalence = { ...onion, factor: 0.5, preparation: 'tritata' };
		const cup = { kind: 'amount', value: 1, unit: 'us_cup' } as const;
		const eq = findEquivalence([onion, chopped], 'recipe', cup.unit, 'Tritata');
		expect(eq && applyRecipeEquivalence(cup, eq)).toEqual({ kind: 'amount', value: 0.5, unit: 'piece' });
	});
});

describe('toPurchaseUnit', () => {
	it('turns grams of juice into lemons, also from another mass unit', () => {
		const fromGrams = toPurchaseUnit({ kind: 'amount', value: 50, unit: 'g' }, [lemonJuice], 'succo');
		expect(fromGrams).toMatchObject({ kind: 'amount', unit: 'piece' });
		expect(fromGrams.kind === 'amount' && fromGrams.value).toBeCloseTo(50 / 47, 12);
		const fromKilos = toPurchaseUnit({ kind: 'amount', value: 0.1, unit: 'kg' }, [lemonJuice], 'succo');
		expect(fromKilos.kind === 'amount' && fromKilos.value).toBeCloseTo(100 / 47, 12);
	});
	it('keeps grams of zest in grams: the juice equivalence is not theirs', () => {
		expect(toPurchaseUnit({ kind: 'amount', value: 5, unit: 'g' }, [lemonJuice], 'scorza')).toEqual({ kind: 'amount', value: 5, unit: 'g' });
		expect(toPurchaseUnit({ kind: 'amount', value: 5, unit: 'g' }, [lemonJuice], null)).toEqual({ kind: 'amount', value: 5, unit: 'g' });
	});
	it('uses the specific equivalence over the generic one', () => {
		const juice = toPurchaseUnit({ kind: 'amount', value: 94, unit: 'g' }, [wholeLemon, lemonJuice], 'succo');
		expect(juice.kind === 'amount' && juice.value).toBeCloseTo(2, 12);
		const zest = toPurchaseUnit({ kind: 'amount', value: 60, unit: 'g' }, [wholeLemon, lemonJuice], 'scorza');
		expect(zest.kind === 'amount' && zest.value).toBeCloseTo(0.5, 12);
	});
	it('leaves other dimensions, other kinds and recipe equivalences alone', () => {
		expect(toPurchaseUnit({ kind: 'amount', value: 1, unit: 'piece' }, [lemonJuice], 'succo')).toEqual({ kind: 'amount', value: 1, unit: 'piece' });
		expect(toPurchaseUnit({ kind: 'amount', value: 20, unit: 'ml' }, [lemonJuice], 'succo')).toEqual({ kind: 'amount', value: 20, unit: 'ml' });
		expect(toPurchaseUnit({ kind: 'to_taste' }, [lemonJuice], 'succo')).toEqual({ kind: 'to_taste' });
		expect(toPurchaseUnit({ kind: 'amount', value: 1, unit: 'us_cup' }, [cheddar], null)).toEqual({ kind: 'amount', value: 1, unit: 'us_cup' });
	});
});

describe('ambiguous equivalences', () => {
	// Synthetic factors: two conversions from the same dimension that disagree.
	const perGram: UnitEquivalence = { ingredientId: 'x', fromUnit: 'g', toUnit: 'piece', factor: 0.01, scope: 'shopping', preparation: null, source: 'synthetic' };
	const perKilo: UnitEquivalence = { ...perGram, fromUnit: 'kg', factor: 20 };
	it('are refused whatever their order', () => {
		expect(() => toPurchaseUnit({ kind: 'amount', value: 100, unit: 'g' }, [perGram, perKilo], null)).toThrow(/Ambiguous/);
		expect(() => toPurchaseUnit({ kind: 'amount', value: 100, unit: 'g' }, [perKilo, perGram], null)).toThrow(/Ambiguous/);
		expect(() => assertUnambiguousEquivalences([perKilo, perGram])).toThrow(/Ambiguous/);
	});
	it('are refused for the same preparation too', () => {
		expect(() => assertUnambiguousEquivalences([{ ...perGram, preparation: 'succo' }, { ...perKilo, preparation: 'succo' }])).toThrow(/Ambiguous/);
	});
	it('are fine across dimensions, scopes, counted codes, preparations and ingredients', () => {
		expect(() =>
			assertUnambiguousEquivalences([
				perGram,
				{ ...perGram, fromUnit: 'ml' },
				{ ...perGram, fromUnit: 'kg', scope: 'recipe' },
				{ ...perGram, fromUnit: 'bunch' },
				{ ...perGram, fromUnit: 'slice' },
				{ ...perKilo, preparation: 'succo' },
				{ ...perKilo, preparation: 'scorza' },
				{ ...perGram, ingredientId: 'y', fromUnit: 'kg' }
			])
		).not.toThrow();
	});
});

describe('unitEquivalenceSchema', () => {
	it('requires a positive factor, a source and a normalised preparation', () => {
		expect(unitEquivalenceSchema.parse(cheddar)).toEqual(cheddar);
		expect(unitEquivalenceSchema.parse(lemonJuice)).toEqual(lemonJuice);
		expect(unitEquivalenceSchema.safeParse({ ...cheddar, factor: 0 }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...cheddar, source: '' }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...lemonJuice, preparation: 'Succo' }).success).toBe(false);
		expect(unitEquivalenceSchema.safeParse({ ...lemonJuice, preparation: '' }).success).toBe(false);
	});
});

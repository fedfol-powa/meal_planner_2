import { describe, expect, it } from 'vitest';
import { addQuantity, emptyCombined } from './combined.ts';
import { presentAmount, presentCount, presentMass, presentVolume } from './present.ts';

describe('metric presentation', () => {
	it('rounds grams and millilitres (spec section 6)', () => {
		expect(presentMass(243, 'metric')).toEqual({ value: 240, unit: 'g' });
		expect(presentMass(37, 'metric')).toEqual({ value: 35, unit: 'g' });
		expect(presentMass(2, 'metric')).toEqual({ value: 2, unit: 'g' });
		expect(presentMass(0.2, 'metric')).toEqual({ value: 1, unit: 'g' });
		expect(presentVolume(250, 'metric')).toEqual({ value: 250, unit: 'ml' });
	});
	it('switches to kilos and litres from 1000 after rounding', () => {
		expect(presentMass(1600, 'metric')).toEqual({ value: 1.6, unit: 'kg' });
		expect(presentMass(996, 'metric')).toEqual({ value: 1, unit: 'kg' });
		expect(presentVolume(1250, 'metric')).toEqual({ value: 1.3, unit: 'l' });
	});
});

describe('UK imperial presentation', () => {
	it('keeps grams below half an ounce', () => {
		expect(presentMass(3, 'uk_imperial')).toEqual({ value: 3, unit: 'g' });
		expect(presentMass(0.3, 'uk_imperial')).toEqual({ value: 1, unit: 'g' });
	});
	it('uses half ounces, whole ounces and quarter pounds', () => {
		expect(presentMass(100, 'uk_imperial')).toEqual({ value: 3.5, unit: 'oz' });
		expect(presentMass(300, 'uk_imperial')).toEqual({ value: 11, unit: 'oz' });
		expect(presentMass(800, 'uk_imperial')).toEqual({ value: 1.75, unit: 'lb' });
		expect(presentMass(15.8 * 28.349523125, 'uk_imperial')).toEqual({ value: 1, unit: 'lb' });
	});
	it('shows small volumes in measuring spoons', () => {
		expect(presentVolume(3, 'uk_imperial')).toEqual({ value: 0.5, unit: 'tsp' });
		expect(presentVolume(10, 'uk_imperial')).toEqual({ value: 2, unit: 'tsp' });
		expect(presentVolume(30, 'uk_imperial')).toEqual({ value: 2, unit: 'tbsp' });
		expect(presentVolume(45, 'uk_imperial')).toEqual({ value: 3, unit: 'tbsp' });
	});
	it('uses fluid ounces and quarter pints', () => {
		expect(presentVolume(100, 'uk_imperial')).toEqual({ value: 3.5, unit: 'uk_fl_oz' });
		expect(presentVolume(250, 'uk_imperial')).toEqual({ value: 9, unit: 'uk_fl_oz' });
		expect(presentVolume(500, 'uk_imperial')).toEqual({ value: 18, unit: 'uk_fl_oz' });
		expect(presentVolume(1000, 'uk_imperial')).toEqual({ value: 1.75, unit: 'uk_pint' });
		expect(presentVolume(19.8 * 28.4130625, 'uk_imperial')).toEqual({ value: 1, unit: 'uk_pint' });
	});
});

describe('counted units', () => {
	it('rounds spoons and US cups for recipes', () => {
		expect(presentCount(0.1, 'tbsp', 'recipe')).toEqual({ value: 0.5, unit: 'tbsp' });
		expect(presentCount(0.6, 'us_cup', 'recipe')).toEqual({ value: 0.5, unit: 'us_cup' });
	});
	it('buys whole pieces, ignoring 0.1 left by conversions', () => {
		expect(presentCount(0.5, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(2.06, 'piece', 'shopping')).toEqual({ value: 2, unit: 'piece' });
		expect(presentCount(2.2, 'piece', 'shopping')).toEqual({ value: 3, unit: 'piece' });
		expect(presentCount(0.05, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(0.3, 'bunch', 'shopping')).toEqual({ value: 1, unit: 'bunch' });
		expect(presentCount(1.25, 'clove', 'shopping')).toEqual({ value: 2, unit: 'clove' });
		expect(presentCount(1.09, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(1.1, 'piece', 'shopping')).toEqual({ value: 1, unit: 'piece' });
		expect(presentCount(1.11, 'piece', 'shopping')).toEqual({ value: 2, unit: 'piece' });
	});
});

describe('counted units scaled from the source (user decision, option 1)', () => {
	it('rounds cloves, pinches, sprigs, leaves, bunches and slices up to whole ones', () => {
		expect(presentCount(4.5, 'clove', 'scaled')).toEqual({ value: 5, unit: 'clove' });
		expect(presentCount(4.3, 'clove', 'scaled')).toEqual({ value: 5, unit: 'clove' });
		expect(presentCount(0.5, 'pinch', 'scaled')).toEqual({ value: 1, unit: 'pinch' });
		expect(presentCount(1.5, 'sprig', 'scaled')).toEqual({ value: 2, unit: 'sprig' });
		expect(presentCount(2.25, 'leaf', 'scaled')).toEqual({ value: 3, unit: 'leaf' });
		expect(presentCount(0.3, 'bunch', 'scaled')).toEqual({ value: 1, unit: 'bunch' });
		expect(presentCount(2.2, 'slice', 'scaled')).toEqual({ value: 3, unit: 'slice' });
		expect(presentCount(3, 'clove', 'scaled')).toEqual({ value: 3, unit: 'clove' });
	});
	it('keeps halves of pieces and spoons', () => {
		expect(presentCount(1 / 3, 'piece', 'scaled')).toEqual({ value: 0.5, unit: 'piece' });
		expect(presentCount(2.25, 'piece', 'scaled')).toEqual({ value: 2.5, unit: 'piece' });
		expect(presentCount(0.3, 'tsp', 'scaled')).toEqual({ value: 0.5, unit: 'tsp' });
		expect(presentCount(1.2, 'tbsp', 'scaled')).toEqual({ value: 1, unit: 'tbsp' });
	});
	it('leaves counts at the source servings exactly as written', () => {
		expect(presentCount(0.5, 'clove', 'recipe')).toEqual({ value: 0.5, unit: 'clove' });
		expect(presentCount(0.25, 'clove', 'recipe')).toEqual({ value: 0.25, unit: 'clove' });
		expect(presentCount(1 / 3, 'clove', 'recipe')).toEqual({ value: 1 / 3, unit: 'clove' });
		expect(presentCount(0.5, 'slice', 'recipe')).toEqual({ value: 0.5, unit: 'slice' });
		expect(presentCount(0.5, 'piece', 'recipe')).toEqual({ value: 0.5, unit: 'piece' });
		expect(presentCount(0.1, 'piece', 'recipe')).toEqual({ value: 0.1, unit: 'piece' });
		expect(presentCount(1.2, 'pinch', 'recipe')).toEqual({ value: 1.2, unit: 'pinch' });
		expect(presentCount(0.3, 'bunch', 'recipe')).toEqual({ value: 0.3, unit: 'bunch' });
		expect(presentCount(0.75, 'sprig', 'recipe')).toEqual({ value: 0.75, unit: 'sprig' });
		expect(presentCount(2.5, 'leaf', 'recipe')).toEqual({ value: 2.5, unit: 'leaf' });
	});
	it('buys every counted unit but spoons whole in the shopping list', () => {
		expect(presentCount(4.5, 'clove', 'shopping')).toEqual({ value: 5, unit: 'clove' });
		expect(presentCount(0.5, 'pinch', 'shopping')).toEqual({ value: 1, unit: 'pinch' });
		expect(presentCount(1.5, 'sprig', 'shopping')).toEqual({ value: 2, unit: 'sprig' });
		expect(presentCount(0.5, 'leaf', 'shopping')).toEqual({ value: 1, unit: 'leaf' });
		expect(presentCount(0.5, 'tsp', 'shopping')).toEqual({ value: 0.5, unit: 'tsp' });
	});
	it('buys them up to the next whole without the tolerance of pieces, as the meals show them', () => {
		for (const unit of ['clove', 'pinch', 'sprig', 'leaf', 'bunch', 'slice'] as const) {
			expect(presentCount(1, unit, 'shopping')).toEqual({ value: 1, unit });
			expect(presentCount(1.1, unit, 'shopping')).toEqual({ value: 2, unit });
			expect(presentCount(1.11, unit, 'shopping')).toEqual({ value: 2, unit });
			for (const value of [1, 1.1, 1.11]) expect(presentCount(value, unit, 'shopping')).toEqual(presentCount(value, unit, 'scaled'));
		}
		expect(presentCount(1 + 1e-12, 'clove', 'shopping')).toEqual({ value: 1, unit: 'clove' });
	});
});

describe('thresholds: below, at and above each one (the unit is chosen after rounding)', () => {
	const OZ = 28.349523125;
	const FL_OZ = 28.4130625;
	it.each([
		[4.4, 'metric', 4, 'g'], [5, 'metric', 5, 'g'],
		[49, 'metric', 50, 'g'], [50, 'metric', 50, 'g'], [54, 'metric', 50, 'g'], [55, 'metric', 60, 'g'],
		[994, 'metric', 990, 'g'], [995, 'metric', 1, 'kg'], [1005, 'metric', 1, 'kg'],
		[14, 'uk_imperial', 15, 'g'], [OZ / 2, 'uk_imperial', 0.5, 'oz'], [20, 'uk_imperial', 0.5, 'oz'],
		[3.7 * OZ, 'uk_imperial', 3.5, 'oz'], [4 * OZ, 'uk_imperial', 4, 'oz'], [4.3 * OZ, 'uk_imperial', 4, 'oz'],
		[15.4 * OZ, 'uk_imperial', 15, 'oz'], [15.6 * OZ, 'uk_imperial', 1, 'lb'], [16 * OZ, 'uk_imperial', 1, 'lb'], [17 * OZ, 'uk_imperial', 1, 'lb']
	] as const)('mass %d g in %s → %d %s', (grams, system, value, unit) => {
		expect(presentMass(grams, system)).toEqual({ value, unit });
	});
	it.each([
		[994, 'metric', 990, 'ml'], [995, 'metric', 1, 'l'], [1005, 'metric', 1, 'l'],
		[14, 'uk_imperial', 3, 'tsp'], [15, 'uk_imperial', 1, 'tbsp'], [16, 'uk_imperial', 1, 'tbsp'],
		[44, 'uk_imperial', 3, 'tbsp'], [45, 'uk_imperial', 3, 'tbsp'], [46, 'uk_imperial', 1.5, 'uk_fl_oz'],
		[3.9 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'], [4 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'], [4.3 * FL_OZ, 'uk_imperial', 4, 'uk_fl_oz'],
		[19.4 * FL_OZ, 'uk_imperial', 19, 'uk_fl_oz'], [19.6 * FL_OZ, 'uk_imperial', 1, 'uk_pint'], [20 * FL_OZ, 'uk_imperial', 1, 'uk_pint'], [21 * FL_OZ, 'uk_imperial', 1, 'uk_pint']
	] as const)('volume %d ml in %s → %d %s', (millilitres, system, value, unit) => {
		expect(presentVolume(millilitres, system)).toEqual({ value, unit });
	});
});

describe('presentAmount', () => {
	it('converts any mass or volume unit and keeps counted units', () => {
		expect(presentAmount(2, 'oz', 'metric')).toEqual({ value: 60, unit: 'g' });
		expect(presentAmount(0.25, 'kg', 'metric')).toEqual({ value: 250, unit: 'g' });
		expect(presentAmount(1, 'uk_pint', 'metric')).toEqual({ value: 570, unit: 'ml' });
		expect(presentAmount(2, 'clove', 'uk_imperial')).toEqual({ value: 2, unit: 'clove' });
		expect(presentAmount(0.5, 'piece', 'metric', 'shopping')).toEqual({ value: 1, unit: 'piece' });
	});
});

describe('rounding at halfway points, whatever the sum the amount came from', () => {
	const OZ = 28.349523125;
	const FL_OZ = 28.4130625;
	const grams = (...ounces: number[]) => ounces.reduce((c, value) => addQuantity(c, { kind: 'amount', value, unit: 'oz' }), emptyCombined()).mass_g ?? 0;
	it('shows 14.5 oz the same as 14 + 0.5 oz and 7.25 + 7.25 oz', () => {
		expect(presentAmount(14.5, 'oz', 'uk_imperial')).toEqual({ value: 15, unit: 'oz' });
		expect(presentMass(grams(14, 0.5), 'uk_imperial')).toEqual({ value: 15, unit: 'oz' });
		expect(presentMass(grams(7.25, 7.25), 'uk_imperial')).toEqual({ value: 15, unit: 'oz' });
		expect(presentAmount(10.5, 'uk_fl_oz', 'uk_imperial')).toEqual({ value: 11, unit: 'uk_fl_oz' });
	});
	it('still rounds amounts really below or above the halfway point', () => {
		expect(presentMass(14.49 * OZ, 'uk_imperial')).toEqual({ value: 14, unit: 'oz' });
		expect(presentMass(14.51 * OZ, 'uk_imperial')).toEqual({ value: 15, unit: 'oz' });
		expect(presentVolume(10.49 * FL_OZ, 'uk_imperial')).toEqual({ value: 10, unit: 'uk_fl_oz' });
		expect(presentVolume(10.51 * FL_OZ, 'uk_imperial')).toEqual({ value: 11, unit: 'uk_fl_oz' });
	});
});

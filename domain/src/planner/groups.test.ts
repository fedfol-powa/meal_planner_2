import { describe, expect, it } from 'vitest';
import { dishKindsOf, foodGroupsOf, sharedFeatures, uses } from './groups.ts';
import { recipe } from './test-fixtures.ts';

describe('food groups', () => {
	it('counts the main protein, potatoes and heavy dishes', () => {
		expect(foodGroupsOf(recipe('a', { proteinGroup: 'fish', carbohydrateGroup: 'potatoes', isHeavy: true }))).toEqual(['fish', 'potatoes', 'heavy']);
		expect(foodGroupsOf(recipe('b', { proteinGroup: 'vegetarian' }))).toEqual([]);
	});
});

describe('dish kinds', () => {
	it('derives rule dish kinds from carbohydrate and category', () => {
		expect(dishKindsOf(recipe('a', { carbohydrateGroup: 'pasta' }))).toEqual(['pasta']);
		expect(dishKindsOf(recipe('b', { carbohydrateGroup: 'bread', category: 'skottle' }))).toEqual(['bread_wrap', 'skottle']);
	});
});

describe('similarity features', () => {
	it('shares protein, carbohydrate, primary ingredient and category, ignoring the generic values', () => {
		const a = recipe('a', { proteinGroup: 'fish', carbohydrateGroup: 'rice', primaryIngredientId: 'salmone', category: 'wok' });
		const b = recipe('b', { proteinGroup: 'fish', carbohydrateGroup: 'rice', primaryIngredientId: 'salmone', category: 'wok' });
		expect(sharedFeatures(a, b)).toEqual(['protein', 'carbohydrate', 'primary_ingredient', 'category']);
		expect(sharedFeatures(recipe('c'), recipe('d'))).toEqual([]);
	});

	it('notices the primary ingredient of one recipe among the lines of the other (issue #48)', () => {
		const orecchiette = recipe('orecchiette', {
			proteinGroup: 'vegetarian',
			carbohydrateGroup: 'pasta',
			category: 'other',
			primaryIngredientId: 'broccoli',
			ingredients: [
				{ ingredientId: 'orecchiette', isOptional: false },
				{ ingredientId: 'broccoli', isOptional: false },
				{ ingredientId: 'aglio', isOptional: false }
			]
		});
		const wok = recipe('wok', {
			proteinGroup: 'fish',
			carbohydrateGroup: 'rice',
			category: 'wok',
			primaryIngredientId: 'gamberi',
			ingredients: [
				{ ingredientId: 'broccoli', isOptional: false },
				{ ingredientId: 'gamberi', isOptional: false },
				{ ingredientId: 'riso', isOptional: false }
			]
		});
		expect(sharedFeatures(orecchiette, wok)).toEqual(['primary_ingredient_line']);
		expect(sharedFeatures(wok, orecchiette)).toEqual(['primary_ingredient_line']);
	});

	it('ignores an optional line and does not count the same primary ingredient twice', () => {
		const a = recipe('a', { primaryIngredientId: 'broccoli', ingredients: [{ ingredientId: 'broccoli', isOptional: false }] });
		const optional = recipe('b', { primaryIngredientId: 'riso', ingredients: [{ ingredientId: 'broccoli', isOptional: true }, { ingredientId: 'riso', isOptional: false }] });
		const same = recipe('c', { primaryIngredientId: 'broccoli', ingredients: [{ ingredientId: 'broccoli', isOptional: false }] });
		expect(sharedFeatures(a, optional)).toEqual([]);
		expect(sharedFeatures(a, same)).toEqual(['primary_ingredient']);
	});

	it('looks only at the side that has a primary ingredient', () => {
		const withoutPrimary = recipe('x', { ingredients: [{ ingredientId: 'broccoli', isOptional: false }] });
		const broccoli = recipe('y', { primaryIngredientId: 'broccoli', ingredients: [{ ingredientId: 'broccoli', isOptional: false }] });
		expect(sharedFeatures(withoutPrimary, broccoli)).toEqual(['primary_ingredient_line']);
		expect(sharedFeatures(broccoli, withoutPrimary)).toEqual(['primary_ingredient_line']);
		expect(sharedFeatures(withoutPrimary, recipe('z', { ingredients: [{ ingredientId: 'broccoli', isOptional: false }] }))).toEqual([]);
	});
});

describe('ingredient use', () => {
	it('ignores optional lines', () => {
		const r = recipe('a', { ingredients: [{ ingredientId: 'cetrioli', isOptional: true }, { ingredientId: 'pomodori', isOptional: false }] });
		expect(uses(r, 'cetrioli')).toBe(false);
		expect(uses(r, 'pomodori')).toBe(true);
	});
});

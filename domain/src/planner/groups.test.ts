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
});

describe('ingredient use', () => {
	it('ignores optional lines', () => {
		const r = recipe('a', { ingredients: [{ ingredientId: 'cetrioli', isOptional: true }, { ingredientId: 'pomodori', isOptional: false }] });
		expect(uses(r, 'cetrioli')).toBe(false);
		expect(uses(r, 'pomodori')).toBe(true);
	});
});

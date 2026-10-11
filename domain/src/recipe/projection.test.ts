import { describe, expect, it } from 'vitest';
import { varietyKey } from '../shopping/index.ts';
import { publishedRecipeSchema } from './document.ts';
import { projectDraftNames, projectRecipe, resolveReferences, toPlannerRecipe } from './projection.ts';
import { publishedExample } from './test-fixtures.ts';

const doc = publishedRecipeSchema.parse({
	...publishedExample,
	ingredients: [
		...publishedExample.ingredients,
		{ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma', 'en-GB': 'Roma' }, preparation: null, quantity: { kind: 'text', text: { 'it-IT': '1 vaschetta', 'en-GB': '1 punnet' } }, sourceText: 'Pomodori Roma: 1 vaschetta', isOptional: true, isPrimary: false }
	]
});

describe('projections', () => {
	it('projects the recipe columns', () => {
		const { recipe } = projectRecipe(doc);
		expect(recipe).toMatchObject({ name: doc.name, sourceType: 'home', durationMinutes: 20, baseServings: 4, proteinGroup: 'fish', seasons: [] });
		expect(recipe).not.toHaveProperty('ingredients');
	});
	it('projects one row per line with position, variety key and quantity columns', () => {
		const { ingredients } = projectRecipe(doc);
		expect(ingredients.map((r) => r.position)).toEqual([0, 1, 2]);
		expect(ingredients[0]).toMatchObject({ quantityKind: 'amount', quantity: 320, unit: 'g', quantityText: null, varietyKey: '' });
		expect(ingredients[1]).toMatchObject({ quantityKind: 'to_taste', quantity: null, unit: null, isPrimary: true });
		expect(ingredients[2]).toMatchObject({ quantityKind: 'text', quantity: null, unit: null, quantityText: { 'it-IT': '1 vaschetta', 'en-GB': '1 punnet' }, varietyKey: varietyKey('tipo Roma'), isOptional: true });
	});
	it('fills name and description of a new draft, empty where a language is missing', () => {
		expect(projectDraftNames({ schemaVersion: 1, name: { 'it-IT': ' Zuppa ' } })).toEqual({ name: { 'it-IT': 'Zuppa', 'en-GB': '' }, description: { 'it-IT': '', 'en-GB': '' } });
	});
	it('gives the planner what it reads', () => {
		expect(toPlannerRecipe('r1', doc)).toEqual({
			id: 'r1', durationMinutes: 20, mealType: 'lunch', proteinGroup: 'fish', isFreshFish: false, carbohydrateGroup: 'pasta', category: 'other',
			hasVegetables: false, isHeavy: false, seasons: [], primaryIngredientId: 'tonno', bookId: null,
			ingredients: [{ ingredientId: 'pasta-corta', isOptional: false }, { ingredientId: 'tonno', isOptional: false }, { ingredientId: 'pomodori', isOptional: true }]
		});
	});
	it('replaces slugs with catalogue ids, keeps unresolved lines and refuses unknown slugs', () => {
		const ids: Record<string, string> = { 'pasta-corta': 'i1', tonno: 'i2', pomodori: 'i3' };
		const ref = { ingredientId: (s: string) => ids[s], bookId: () => undefined };
		expect(resolveReferences(doc, ref).ingredients?.map((l) => l.ingredientId)).toEqual(['i1', 'i2', 'i3']);
		const draft = { schemaVersion: 1 as const, name: { 'it-IT': 'Z' }, ingredients: [{ ...publishedExample.ingredients[0], ingredientId: null }] };
		expect(resolveReferences(draft, ref).ingredients?.[0].ingredientId).toBeNull();
		expect(() => resolveReferences(doc, { ingredientId: () => undefined, bookId: () => undefined })).toThrow(/pasta-corta/);
	});
});

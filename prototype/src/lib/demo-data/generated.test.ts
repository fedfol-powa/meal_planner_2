import { describe, expect, it } from 'vitest';
import data from './generated.json';
import type { Ingredient, Recipe, Week } from '../domain/types';

const recipes = data.recipes as Recipe[];
const ingredients = data.ingredients as Ingredient[];
const weeks = data.weeks as Week[];

describe('generated demo data', () => {
	it('has unique ids', () => {
		expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);
		expect(new Set(ingredients.map((i) => i.id)).size).toBe(ingredients.length);
	});
	it('publishes only complete, bilingual recipes', () => {
		const byId = new Map(ingredients.map((i) => [i.id, i]));
		for (const recipe of recipes.filter((r) => r.status === 'published')) {
			expect(recipe.name['en-GB'], recipe.id).toBeTruthy();
			expect(recipe.description['en-GB'], recipe.id).toBeTruthy();
			expect(recipe.baseServings, recipe.id).toBeGreaterThan(0);
			expect(recipe.ingredients.length, recipe.id).toBeGreaterThan(0);
			for (const line of recipe.ingredients) expect(byId.get(line.ingredientId)?.name['en-GB']).toBeTruthy();
		}
	});
	it('translates every non-numeric quantity of published recipes', () => {
		for (const recipe of recipes.filter((r) => r.status === 'published')) {
			for (const line of recipe.ingredients.filter((l) => l.quantity.kind === 'text')) {
				expect(line.text?.['en-GB'], `${recipe.id}: ${line.sourceText}`).toBeTruthy();
				expect(line.text?.['it-IT']).toBe(line.sourceText);
			}
		}
	});
	it('keeps drafts for recipes without ingredients', () => {
		expect(recipes.find((r) => r.id === 'polpettine-tacchino-skottle')?.status).toBe('draft');
	});
	it('references existing recipes from every slot', () => {
		const ids = new Set(recipes.map((r) => r.id));
		for (const week of weeks) for (const slot of week.slots) if (slot.recipeId) expect(ids.has(slot.recipeId)).toBe(true);
	});
	it('contains the four demo weeks', () => {
		expect(weeks.map((w) => w.startsOn)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
	});
	it('leaves one empty slot in the draft week', () => {
		const draft = weeks.find((w) => w.startsOn === '2026-10-12')!;
		expect(draft.slots.filter((s) => !s.recipeId && !s.freeText)).toHaveLength(1);
	});
	it('has no "not cooked" flag on slots: every past meal counts as eaten', () => {
		for (const week of data.weeks) for (const slot of week.slots) expect(slot).not.toHaveProperty('cooked');
	});
});

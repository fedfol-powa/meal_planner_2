import { describe, expect, it } from 'vitest';
import data from './generated.json';
import { DEPARTMENTS, type Ingredient, type Recipe, type Week } from '../domain/types';

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
	it('classifies every ingredient for the shopping list (demo classification)', () => {
		const byId = new Map(ingredients.map((i) => [i.id, i]));
		for (const ingredient of ingredients) {
			expect(DEPARTMENTS, ingredient.id).toContain(ingredient.department);
			if (ingredient.canonicalId) {
				const target = byId.get(ingredient.canonicalId);
				expect(target, ingredient.id).toBeDefined();
				expect(target?.canonicalId, `${ingredient.id} must point to a final ingredient`).toBeNull();
			}
		}
		expect(byId.get('sale')?.isPantry).toBe(true);
		expect(byId.get('uovo')?.canonicalId).toBe('uova');
	});
	it('converts US cups only through a per-ingredient equivalence, keeping the source text', () => {
		const wrap = recipes.find((r) => r.id === 'wrap-fagioli-neri-cheddar')!;
		const line = (id: string) => wrap.ingredients.find((l) => l.ingredientId === id)!;
		expect(line('cipolla-a-dadini')).toMatchObject({ quantity: { kind: 'amount', value: 0.5, unit: 'piece' }, sourceText: '1/2 cup (circa 1/2 cipolla media)' });
		expect(line('lattuga-tagliata-o-spezzettata').quantity).toEqual({ kind: 'amount', value: 36, unit: 'g' });
		expect(recipes.flatMap((r) => r.ingredients).some((l) => l.quantity.kind === 'amount' && l.quantity.unit === 'us_cup')).toBe(false);
	});
	it('marks optional lines from the source wording', () => {
		const line = recipes.flatMap((r) => r.ingredients).find((l) => l.ingredientId === 'prezzemolo-opzionale');
		expect(line?.isOptional).toBe(true);
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

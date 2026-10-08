import { describe, expect, it } from 'vitest';
import { parseAttributes, toPlannerRecipes } from './attributes.ts';
import type { OriginRecipe } from './origin.ts';

const wok: OriginRecipe = {
	id: 'wok', nome: 'Wok di pollo', tipo: 'web', tempo: '25 min', libro: null, porzioni_base: 6,
	ingredienti: [{ nome: 'Petto di pollo', quantita: '300 g' }, { nome: 'Peperoncino (facoltativo)', quantita: 'q.b.' }],
	feedback: 2, tag: ['pollo', 'wok'], storico: []
};

const valid = `
recipes:
  wok:
    meal_type: both
    protein_group: white_meat
    fresh_fish: false
    carbohydrate_group: rice
    category: wok
    has_vegetables: true
    is_heavy: false
    seasons: []
    primary_ingredient: petto-di-pollo
`;

describe('parseAttributes', () => {
	it('accepts a complete entry and builds the planner recipe', () => {
		const { attributes, errors } = parseAttributes(valid, [wok]);
		expect(errors).toEqual([]);
		const [recipe] = toPlannerRecipes([wok], attributes);
		expect(recipe).toMatchObject({ id: 'wok', durationMinutes: 25, proteinGroup: 'white_meat', primaryIngredientId: 'petto-di-pollo' });
		expect(recipe.ingredients).toEqual([
			{ ingredientId: 'petto-di-pollo', isOptional: false },
			{ ingredientId: 'peperoncino-facoltativo', isOptional: true }
		]);
	});
	it('reports missing recipes, unknown values and primary ingredients not in the recipe', () => {
		const bad = valid.replace('protein_group: white_meat', 'protein_group: chicken').replace('petto-di-pollo', 'salmone');
		const { errors } = parseAttributes(bad, [wok, { ...wok, id: 'other' }]);
		expect(errors).toContain('wok: protein_group "chicken" is not allowed');
		expect(errors).toContain('wok: primary_ingredient "salmone" is not one of its ingredients');
		expect(errors).toContain('other: missing');
	});
	it('reads fresh fish and refuses it on a recipe whose protein is not fish', () => {
		const { attributes, errors } = parseAttributes(valid, [wok]);
		expect(errors).toEqual([]);
		expect(toPlannerRecipes([wok], attributes)[0].isFreshFish).toBe(false);
		expect(parseAttributes(valid.replace('fresh_fish: false', 'fresh_fish: true'), [wok]).errors).toContain('wok: fresh_fish is only for fish recipes');
		expect(parseAttributes(valid.replace('    fresh_fish: false\n', ''), [wok]).errors).toContain('wok: fresh_fish must be true or false');
	});
	it('lets a duration override the origin text', () => {
		const { attributes } = parseAttributes(valid.replace('seasons: []', 'seasons: []\n    duration_minutes: 40'), [wok]);
		expect(toPlannerRecipes([wok], attributes)[0].durationMinutes).toBe(40);
	});
});

import { describe, expect, it } from 'vitest';
import { buildContext, scoreCandidate, type Placed } from './score.ts';
import { baseInput, recipe } from './test-fixtures.ts';

const monday = { date: '2026-10-12', mealType: 'lunch' as const };

describe('scoreCandidate', () => {
	it('prefers recipes the family likes', () => {
		const liked = recipe('liked');
		const plain = recipe('plain');
		const ctx = buildContext(baseInput({ recipes: [liked, plain], familyScores: { liked: 5, plain: 3 } }), []);
		expect(scoreCandidate(liked, monday, ctx)).toBeGreaterThan(scoreCandidate(plain, monday, ctx));
	});

	it('penalises a recipe similar to Sunday dinner of the week before', () => {
		const sunday = recipe('sunday', { proteinGroup: 'fish', category: 'wok', primaryIngredientId: 'salmone' });
		const similar = recipe('similar', { proteinGroup: 'fish', category: 'wok', primaryIngredientId: 'salmone' });
		const different = recipe('different', { proteinGroup: 'legumes', category: 'soup', primaryIngredientId: 'ceci' });
		const input = baseInput({ recipes: [sunday, similar, different], history: [{ date: '2026-10-11', mealType: 'dinner', recipeId: 'sunday' }] });
		const ctx = buildContext(input, []);
		expect(scoreCandidate(similar, monday, ctx)).toBeLessThan(scoreCandidate(different, monday, ctx));
	});

	it('penalises a group already at its weekly maximum', () => {
		const steak = recipe('steak', { proteinGroup: 'red_meat' });
		const burger = recipe('burger', { proteinGroup: 'red_meat' });
		const beans = recipe('beans', { proteinGroup: 'vegetarian' });
		const week: Placed[] = [{ date: '2026-10-13', mealType: 'dinner', recipe: steak }];
		const ctx = buildContext(baseInput({ recipes: [steak, burger, beans] }), week);
		expect(scoreCandidate(burger, monday, ctx)).toBeLessThan(scoreCandidate(beans, monday, ctx));
	});

	it('prefers recipes in season', () => {
		const summer = recipe('summer', { seasons: ['summer'] });
		const always = recipe('always');
		const ctx = buildContext(baseInput({ recipes: [summer, always] }), []);
		expect(scoreCandidate(summer, monday, ctx)).toBeLessThan(scoreCandidate(always, monday, ctx));
	});

	it('prefers recipes not cooked recently', () => {
		const recent = recipe('recent');
		const old = recipe('old');
		const input = baseInput({
			recipes: [recent, old],
			history: [
				{ date: '2026-09-01', mealType: 'lunch', recipeId: 'old' },
				{ date: '2026-09-25', mealType: 'lunch', recipeId: 'recent' }
			]
		});
		const ctx = buildContext(input, []);
		expect(scoreCandidate(recent, monday, ctx)).toBeLessThan(scoreCandidate(old, monday, ctx));
	});
});

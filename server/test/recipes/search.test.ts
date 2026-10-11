import { describe, expect, it } from 'vitest';
import { searchRecipes, type SearchCandidate } from '../../src/recipes/search.ts';

const t = (it: string, en = it) => ({ 'it-IT': it, 'en-GB': en });
const candidate = (id: string, over: Partial<SearchCandidate> = {}): SearchCandidate => ({
	id,
	name: t(id),
	description: t(''),
	mealType: 'both',
	durationMinutes: 30,
	proteinGroup: 'vegetarian',
	familyAverage: null,
	addedOn: '2026-01-01',
	lastEatenOn: null,
	ingredientTexts: [],
	...over,
});
const ids = (list: SearchCandidate[]) => list.map((c) => c.id);

describe('searchRecipes', () => {
	const pasta = candidate('Zucchine e pasta', { ingredientTexts: ['Zucchine', 'Pasta', 'zucchina'] });
	const risotto = candidate('Risotto', { description: t('Con lo zafferano'), ingredientTexts: ['Riso'] });

	it('matches every word, ignoring case, accents and order', () => {
		expect(ids(searchRecipes([pasta, risotto], { text: 'Pàsta  ZUCCHINE' }, 'it-IT'))).toEqual(['Zucchine e pasta']);
		expect(ids(searchRecipes([pasta, risotto], { text: 'zafferano' }, 'it-IT'))).toEqual(['Risotto']);
		expect(ids(searchRecipes([pasta, risotto], { text: 'pasta riso' }, 'it-IT'))).toEqual([]);
		expect(ids(searchRecipes([pasta, risotto], { text: ' ?! ' }, 'it-IT'))).toEqual(['Risotto', 'Zucchine e pasta']);
	});

	it('finds through synonyms, given in the caller language by the loader', () => {
		expect(ids(searchRecipes([pasta, risotto], { text: 'zucchina' }, 'it-IT'))).toEqual(['Zucchine e pasta']);
	});

	it('searches the texts of the caller language only', () => {
		const soup = candidate('s', { name: t('Zuppa', 'Soup') });
		expect(ids(searchRecipes([soup], { text: 'soup' }, 'it-IT'))).toEqual([]);
		expect(ids(searchRecipes([soup], { text: 'soup' }, 'en-GB'))).toEqual(['s']);
	});

	it('filters by meal, time, group and minimum stars', () => {
		const lunch = candidate('a', { mealType: 'lunch', durationMinutes: 15, proteinGroup: 'fish', familyAverage: 4 });
		const both = candidate('b', { mealType: 'both', durationMinutes: 45, familyAverage: 3.5 });
		const dinner = candidate('c', { mealType: 'dinner' });
		expect(ids(searchRecipes([lunch, both, dinner], { mealType: 'lunch' }, 'it-IT'))).toEqual(['a', 'b']);
		expect(ids(searchRecipes([lunch, both, dinner], { maxMinutes: 30 }, 'it-IT'))).toEqual(['a', 'c']);
		expect(ids(searchRecipes([lunch, both, dinner], { proteinGroup: 'fish' }, 'it-IT'))).toEqual(['a']);
		expect(ids(searchRecipes([lunch, both, dinner], { minStars: 4 }, 'it-IT'))).toEqual(['a']);
	});

	it('sorts by name in the language by default', () => {
		const list = [candidate('b', { name: t('Èrba') }), candidate('a', { name: t('Zuppa') }), candidate('c', { name: t('arrosto') })];
		expect(ids(searchRecipes(list, {}, 'it-IT'))).toEqual(['c', 'b', 'a']);
	});

	it('keeps missing values last in both directions, ties by name', () => {
		const list = [
			candidate('none', { familyAverage: null, lastEatenOn: null }),
			candidate('low', { familyAverage: 2, lastEatenOn: '2026-09-01' }),
			candidate('high', { familyAverage: 5, lastEatenOn: '2026-10-01' }),
			candidate('high2', { familyAverage: 5, lastEatenOn: '2026-10-01' }),
		];
		expect(ids(searchRecipes(list, { sort: 'rating' }, 'it-IT'))).toEqual(['high', 'high2', 'low', 'none']);
		expect(ids(searchRecipes(list, { sort: 'rating', reversed: true }, 'it-IT'))).toEqual(['low', 'high', 'high2', 'none']);
		expect(ids(searchRecipes(list, { sort: 'lastEaten', reversed: true }, 'it-IT'))).toEqual(['low', 'high', 'high2', 'none']);
		// Same date for everyone: the name decides.
		expect(ids(searchRecipes(list, { sort: 'added' }, 'it-IT'))).toEqual(['high', 'high2', 'low', 'none']);
		expect(ids(searchRecipes(list, { reversed: true }, 'it-IT'))).toEqual(['none', 'low', 'high2', 'high']);
	});
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { getRecipeDetail, normalizeForSearch, rateRecipe, searchRecipes } from './recipes';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const ids = (result: ReturnType<typeof searchRecipes>) => (result.ok ? result.value.map((i) => i.recipe.id) : []);

beforeEach(() => { db = createInitial().db; });

describe('normalizeForSearch', () => {
	it('ignores case and accents', () => {
		expect(normalizeForSearch('Perché POLLO')).toBe('perche pollo');
	});
});

describe('searchRecipes', () => {
	it('lists only published recipes, sorted by name', () => {
		const all = ids(searchRecipes(db, ctx(), {}));
		expect(all.length).toBe(db.recipes.filter((r) => r.status === 'published').length);
		expect(all).not.toContain('polpettine-tacchino-skottle');
	});
	it('matches names and ingredients without accents or case', () => {
		expect(ids(searchRecipes(db, ctx(), { text: 'POLLO' }))).toContain('wok-pollo-peperoni-riso-basmati');
		expect(ids(searchRecipes(db, ctx(), { text: 'basmati' }))).toContain('wok-pollo-peperoni-riso-basmati');
	});
	it('searches in the user language', () => {
		expect(ids(searchRecipes(db, ctx({ userId: 'user-tom' }), { text: 'chicken' }))).toContain('wok-pollo-peperoni-riso-basmati');
	});
	it('hides book recipes from families without the book', () => {
		const bookIds = db.recipes.filter((r) => r.bookId && r.status === 'published').map((r) => r.id);
		const grandparents = ids(searchRecipes(db, ctx({ familyId: 'family-grandparents' }), {}));
		for (const id of bookIds) expect(grandparents).not.toContain(id);
	});
	it('filters by meal, time, group and minimum stars', () => {
		const result = searchRecipes(db, ctx(), { mealType: 'dinner', maxMinutes: 30, proteinGroup: 'white_meat', minStars: 1 });
		if (!result.ok) throw new Error(result.error);
		for (const item of result.value) {
			expect(['dinner', 'both']).toContain(item.recipe.mealType);
			expect(item.recipe.durationMinutes ?? Infinity).toBeLessThanOrEqual(30);
			expect(item.recipe.proteinGroup).toBe('white_meat');
			expect(item.rating.familyAverage ?? 0).toBeGreaterThanOrEqual(1);
		}
	});
	it('returns an empty list when nothing matches', () => {
		expect(ids(searchRecipes(db, ctx(), { text: 'zzzz' }))).toEqual([]);
	});
});

describe('getRecipeDetail', () => {
	it('scales to the requested servings and lists recent meals', () => {
		const detail = getRecipeDetail(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 3);
		if (!detail.ok) throw new Error(detail.error);
		expect(detail.value.baseServings).toBe(6);
		expect(detail.value.ingredients[0].quantity).toEqual({ kind: 'amount', value: 150, unit: 'g' });
		expect(detail.value.history.every((h) => h.date <= '2026-10-06')).toBe(true);
	});
	it('does not list a meal of today that has not happened yet', () => {
		const detail = getRecipeDetail(db, ctx(), 'riso-ceci-spinaci-mandorle');
		expect(detail.ok && detail.value.history.some((h) => h.date === '2026-10-06')).toBe(false);
		const later = getRecipeDetail(db, ctx({ now: '2026-10-06T23:00' }), 'riso-ceci-spinaci-mandorle');
		expect(later.ok && later.value.history.some((h) => h.date === '2026-10-06')).toBe(true);
	});
	it('defaults to base servings and refuses drafts to members who are not curators', () => {
		const detail = getRecipeDetail(db, ctx(), 'wok-pollo-peperoni-riso-basmati');
		expect(detail.ok && detail.value.servings).toBe(6);
		expect(getRecipeDetail(db, ctx({ userId: 'user-tom' }), 'polpettine-tacchino-skottle')).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('rateRecipe', () => {
	it('sets, changes and removes the own rating, updating the family average', () => {
		const id = 'wok-pollo-peperoni-riso-basmati';
		const set = rateRecipe(db, ctx({ userId: 'user-tom' }), id, 2);
		expect(set.ok && set.value.myStars).toBe(2);
		const changed = rateRecipe(db, ctx({ userId: 'user-tom' }), id, 5);
		expect(changed.ok && changed.value.myStars).toBe(5);
		const removed = rateRecipe(db, ctx({ userId: 'user-tom' }), id, null);
		expect(removed.ok && removed.value.myStars).toBeNull();
		expect(db.ratings.filter((r) => r.userId === 'user-tom' && r.recipeId === id)).toHaveLength(0);
	});
	it('shows no ratings after the only rating is removed', () => {
		db.ratings = db.ratings.filter((r) => r.recipeId !== 'wok-pollo-peperoni-riso-basmati');
		rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 4);
		const removed = rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', null);
		expect(removed.ok && removed.value).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});
	it('rejects invalid stars and offline use', () => {
		expect(rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 6)).toEqual({ ok: false, error: 'invalid' });
		expect(rateRecipe(db, ctx(), 'wok-pollo-peperoni-riso-basmati', 2.5)).toEqual({ ok: false, error: 'invalid' });
		expect(rateRecipe(db, ctx({ offline: true }), 'wok-pollo-peperoni-riso-basmati', 3)).toEqual({ ok: false, error: 'offline' });
	});
});

describe('recipe list for cards and sorting', () => {
	const list = (over: Partial<OperationContext> = {}, sort?: 'name' | 'rating' | 'added' | 'lastEaten') => {
		const result = searchRecipes(db, ctx(over), sort ? { sort } : {});
		if (!result.ok) throw new Error(result.error);
		return result.value;
	};
	it('gives each item its base servings, scaled ingredients and last eaten day', () => {
		const wok = list().find((i) => i.recipe.id === 'wok-pollo-peperoni-riso-basmati')!;
		expect(wok.servings).toBe(6);
		expect(wok.ingredients[0].quantity).toEqual({ kind: 'amount', value: 300, unit: 'g' });
		expect(wok.lastEaten).toBe('2026-10-04');
		expect(wok.addedOn).toBe('2026-09-07');
	});
	it('ignores meals not yet eaten for last eaten', () => {
		expect(list().find((i) => i.recipe.id === 'riso-ceci-spinaci-mandorle')!.lastEaten).toBeNull();
		expect(list({ now: '2026-10-06T23:00' }).find((i) => i.recipe.id === 'riso-ceci-spinaci-mandorle')!.lastEaten).toBe('2026-10-06');
	});
	it('sorts by rating, best first, unrated last', () => {
		const averages = list({}, 'rating').map((i) => i.rating.familyAverage);
		const rated = averages.filter((a) => a !== null) as number[];
		expect(rated).toEqual([...rated].sort((a, b) => b - a));
		expect(averages.indexOf(null)).toBe(rated.length);
	});
	it('sorts by date added and by last eaten, most recent first, never eaten last', () => {
		const added = list({}, 'added').map((i) => i.addedOn);
		expect(added).toEqual([...added].sort().reverse());
		const eaten = list({}, 'lastEaten').map((i) => i.lastEaten);
		const dated = eaten.filter((d) => d !== null) as string[];
		expect(dated).toEqual([...dated].sort().reverse());
		expect(eaten.slice(dated.length).every((d) => d === null)).toBe(true);
	});
});

describe('localised non-numeric quantities and reversed sorting', () => {
	it('shows non-numeric quantities in the user language', () => {
		const it = getRecipeDetail(db, ctx(), 'spaghetti-riso-tofu-verdure-wok');
		const en = getRecipeDetail(db, ctx({ userId: 'user-tom' }), 'spaghetti-riso-tofu-verdure-wok');
		if (!it.ok || !en.ok) throw new Error('detail');
		const index = it.value.ingredients.findIndex((i) => i.quantity.kind === 'text');
		expect(it.value.ingredients[index].sourceText).toBe('3 matasse');
		expect(en.value.ingredients[index].sourceText).not.toBe('3 matasse');
		expect(en.value.ingredients[index].sourceText.length).toBeGreaterThan(0);
	});
	it('reverses the chosen order', () => {
		const forward = searchRecipes(db, ctx(), { sort: 'rating' });
		const backward = searchRecipes(db, ctx(), { sort: 'rating', reversed: true });
		if (!forward.ok || !backward.ok) throw new Error('search');
		expect(backward.value.map((i) => i.recipe.id)).toEqual([...forward.value.map((i) => i.recipe.id)].reverse());
		const byName = searchRecipes(db, ctx(), { reversed: true });
		expect(byName.ok && byName.value[0].recipe.name.localeCompare(byName.value.at(-1)!.recipe.name, 'it-IT')).toBeGreaterThan(0);
	});
});

describe('drafts for curators', () => {
	it('opens a draft detail for curators only, flagging missing data', () => {
		const detail = getRecipeDetail(db, ctx(), 'polpettine-tacchino-skottle');
		if (!detail.ok) throw new Error(detail.error);
		expect(detail.value.isDraft).toBe(true);
		expect(detail.value.missing).toEqual(expect.arrayContaining(['ingredients', 'baseServings']));
		expect(getRecipeDetail(db, ctx({ userId: 'user-anna' }), 'polpettine-tacchino-skottle')).toEqual({ ok: false, error: 'not_found' });
	});
});

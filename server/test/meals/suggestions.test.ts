import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealsSetup } from '../support/meals.ts';
import { rest } from '../support/requests.ts';

describe.skipIf(!hasDatabase)('meal suggestions', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	/**
	 * The catalogue is global and the files share the database (one file at a time): the family
	 * excludes every other published recipe, so its ranking holds only the recipes of the test.
	 */
	const onlyOurRecipes = (...extra: string[]) => actors.db.admin`
		insert into app.recipe_exclusions (family_id, recipe_id)
		select ${s.familyId}, id from app.recipes
		where status = 'published' and not (id = any(${[...s.recipes, ...extra]}::uuid[]))
		on conflict do nothing`;
	beforeEach(async () => {
		s = await mealsSetup(actors);
		await onlyOurRecipes();
	});
	afterAll(() => actors?.close());
	const read = (offset?: number, slotId = s.slots.tueLunch) =>
		s.anna.client.meals.getSuggestions({ familyId: s.familyId, slotId, ...(offset === undefined ? {} : { offset }) });
	const ranking = async (slotId = s.slots.tueLunch) => {
		const ids: string[] = [];
		let offset = 0;
		do {
			const page = await read(offset, slotId);
			ids.push(...page.recipes.map((r) => r.recipe.id));
			offset = page.nextOffset;
		} while (offset !== 0);
		return ids;
	};

	it('five recipes with their rating, without the other meals of the week', async () => {
		const page = await read();
		expect(page.recipes).toHaveLength(5);
		expect(page.recipes.map((r) => r.recipe.id)).not.toContain(s.recipes[0]);
		expect(page.recipes[0]!.rating).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(page.nextOffset).toBe(5);
	});

	it('pages through the ranking and starts again, also from an offset past the end', async () => {
		const first = (await read(0)).recipes.map((r) => r.recipe.id);
		const all = await ranking();
		expect(all.slice(0, 5)).toEqual(first);
		expect(new Set(all).size).toBe(all.length);
		expect((await read(999)).recipes.map((r) => r.recipe.id)).toEqual(first);
	});

	it('leaves out the current recipe and an exclusion added just now', async () => {
		expect(await ranking(s.slots.monLunch)).not.toContain(s.recipes[0]);
		const top = (await read()).recipes[0]!.recipe.id;
		await s.anna.client.family.addExclusion({ familyId: s.familyId, recipeId: top });
		expect(await ranking()).not.toContain(top);
	});

	it('a rating in another family changes the next read (not versioned)', async () => {
		const before = await ranking();
		const last = before.at(-1)!;
		const outsider = await actors.user();
		const otherFamily = await actors.db.createFamily([{ userId: outsider.userId, role: 'member' }]);
		await outsider.client.ratings.set({ familyId: otherFamily, recipeId: last, stars: 5 });
		const after = await ranking();
		expect(after.indexOf(last)).toBeLessThan(before.indexOf(last));
	});

	it('counts an archived recipe already in the week against the weekly maximum', async () => {
		const limited = await s.fx.ingredient();
		const archived = await s.fx.publishRecipe({ ingredientIds: [limited] });
		const sameIngredient = await s.fx.publishRecipe({ ingredientIds: [limited] });
		await catalogueFixture(actors.db).archive(archived);
		await onlyOurRecipes(sameIngredient);
		await actors.db.admin`insert into app.family_ingredients (family_id, ingredient_id, restriction, weekly_max) values (${s.familyId}, ${limited}, 'limit', 1)`;
		expect(await ranking()).toContain(sameIngredient);
		await actors.db.admin`update app.meal_slots set recipe_id = ${archived} where id = ${s.slots.monLunch}`;
		expect(await ranking()).not.toContain(sameIngredient);
	});

	it('the four free texts the family uses most, ties in alphabetical order', async () => {
		const texts = { '2026-10-13': 'Fuori', '2026-10-14': 'Fuori', '2026-10-15': 'Fuori', '2026-10-16': 'Avanzi', '2026-10-17': 'Sushi' };
		for (const [date, freeText] of Object.entries(texts)) await s.fx.insertSlot(s.weekId, { date, mealType: 'dinner', freeText });
		expect((await read()).freeTexts).toEqual(['Fuori', 'Avanzi', 'Pizza', 'Sushi']);
	});

	it('REST passes the offset in the query string; another family gets not_found', async () => {
		const response = await rest(actors.app, actors.env, 'GET', `/api/families/${s.familyId}/meals/${s.slots.tueLunch}/suggestions?offset=5`, s.anna.token);
		expect(response.status).toBe(200);
		expect(((await response.json()) as { nextOffset: number }).nextOffset).toBe(10);
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.getSuggestions({ familyId: family, slotId: s.slots.tueLunch }))).code).toBe('not_found');
	});
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { agentClient, mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal writes', () => {
	let actors: Actors;
	let s: Awaited<ReturnType<typeof mealsSetup>>;
	beforeAll(async () => {
		actors = await setupActors();
	});
	beforeEach(async () => {
		s = await mealsSetup(actors);
	});
	afterAll(() => actors?.close());
	const id = () => crypto.randomUUID();

	it('sets servings: action, truthful change, slot pointer and author', async () => {
		const actionId = id();
		const result = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 5 });
		expect(result).toMatchObject({ actionId, changed: true });
		const meal = mealOf(result.week, s.slots.monLunch);
		expect(meal.servings).toBe(5);
		expect(meal.lastChange).toMatchObject({ userName: 'Anna', actionId, undoable: true, slotIds: [s.slots.monLunch] });
		expect(await s.action(actionId)).toMatchObject({ kind: 'set_servings', slot_ids: [s.slots.monLunch], actor_id: s.anna.userId, channel: 'web' });
		const [row] = await s.changes(s.slots.monLunch);
		expect(row).toMatchObject({ action_id: actionId, channel: 'web', undoes: null, before: { recipeId: s.recipes[0], freeText: null, servings: 2, note: null } });
		expect(row!.after).toEqual({ recipeId: s.recipes[0], freeText: null, servings: 5, note: null });
		expect(await s.slotRow(s.slots.monLunch)).toMatchObject({ last_action_id: actionId, updated_by: s.anna.userId });
	});

	it('records channel mcp for the same person through an agent', async () => {
		const agent = await agentClient(actors, s.anna);
		const actionId = id();
		await agent.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: actionId, note: 'from the agent' });
		expect((await s.action(actionId))!.channel).toBe('mcp');
		expect((await s.changes(s.slots.tueLunch)).at(-1)!.channel).toBe('mcp');
	});

	it('sets a recipe on an empty slot and a free text kept as written, with the note', async () => {
		await s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'Senza glutine' });
		const withRecipe = await s.bruno.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), recipeId: s.recipes[3]! });
		expect(mealOf(withRecipe.week, s.slots.tueLunch)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[3] } });
		const free = await s.bruno.client.meals.setFree({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), text: '  Cena da Zia Pina  ' });
		expect(mealOf(free.week, s.slots.tueLunch)).toMatchObject({ kind: 'free', freeText: 'Cena da Zia Pina', recipe: null, note: 'Senza glutine' });
	});

	it('turns an empty note into null', async () => {
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: 'x' });
		const result = await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: id(), note: '   ' });
		expect(mealOf(result.week, s.slots.tueLunch).note).toBeNull();
	});

	it('remembers a request without effect; its retry after another change does not overwrite', async () => {
		const actionId = id();
		const first = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 2 });
		expect(first).toMatchObject({ actionId, changed: false });
		expect(await s.changes(s.slots.monLunch)).toHaveLength(0);
		expect(mealOf(first.week, s.slots.monLunch).lastChange).toBeNull();
		await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 6 });
		const retry = await s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, servings: 2 });
		expect(retry.changed).toBe(false);
		expect((await s.slotRow(s.slots.monLunch)).servings).toBe(6);
	});

	it('two identical requests at once write one action', async () => {
		const input = { familyId: s.familyId, slotId: s.slots.monDinner, id: id(), note: 'twice' };
		const [a, b] = await Promise.all([s.anna.client.meals.setNote(input), s.anna.client.meals.setNote(input)]);
		expect([a.changed, b.changed]).toEqual([true, true]);
		expect((await s.changes(s.slots.monDinner)).filter((r) => r.action_id === input.id)).toHaveLength(1);
	});

	it('repeats a completed setRecipe after the recipe was archived', async () => {
		const input = { familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId: s.recipes[5]! };
		await s.anna.client.meals.setRecipe(input);
		await catalogueFixture(actors.db).archive(s.recipes[5]!);
		expect(await s.anna.client.meals.setRecipe(input)).toMatchObject({ actionId: input.id, changed: true });
	});

	it('refuses an id reused by someone else, on another slot or for another kind, without writing', async () => {
		const actionId = id();
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, note: 'a' });
		const cases = [
			() => s.bruno.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, note: 'a' }),
			() => s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.tueLunch, id: actionId, note: 'a' }),
			() => s.anna.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monDinner, id: actionId, servings: 3 }),
		];
		for (const call of cases) {
			const error = await errorOf(call());
			expect(error.code).toBe('invalid');
			expect(error.data.issues[0].path).toEqual(['id']);
		}
		expect(await s.changes(s.slots.tueLunch)).toHaveLength(0);
		expect((await s.slotRow(s.slots.monDinner)).servings).toBe(2);
	});

	it('refuses an id used in another family as invalid, without writing', async () => {
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		const week = await s.fx.insertWeek(family, '2026-10-12');
		const slot = await s.fx.insertSlot(week, { date: '2026-10-12', mealType: 'lunch', freeText: 'x' });
		const shared = id();
		await stranger.client.meals.setNote({ familyId: family, slotId: slot, id: shared, note: 'mine' });
		expect((await errorOf(s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monDinner, id: shared, note: 'x' }))).code).toBe('invalid');
		expect((await s.slotRow(s.slots.monDinner)).note).toBeNull();
	});

	it('not_found for a slot of another family, forbidden for a stranger, nothing written', async () => {
		const stranger = await actors.user();
		const family = await actors.db.createFamily([{ userId: stranger.userId, role: 'member' }]);
		expect((await errorOf(stranger.client.meals.setServings({ familyId: family, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('not_found');
		expect((await errorOf(stranger.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 3 }))).code).toBe('forbidden');
		expect((await s.slotRow(s.slots.monLunch)).servings).toBe(2);
	});

	it('refuses drafts, archived and unknown recipes with not_found', async () => {
		const archived = await s.fx.publishRecipe();
		await catalogueFixture(actors.db).archive(archived);
		const draft = await s.fx.draftRecipe('Bozza');
		for (const recipeId of [archived, draft, crypto.randomUUID()]) {
			expect((await errorOf(s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), recipeId }))).code).toBe('not_found');
		}
		expect((await s.slotRow(s.slots.monLunch)).recipe_id).toBe(s.recipes[0]);
	});

	it('a past meal changed shows the version in force when it passed (R1)', async () => {
		const recipe = await s.fx.publishRecipe({ name: 'Zuppa', publishedAt: '2025-12-01T00:00:00Z' });
		await s.fx.publishVersion(recipe, '2026-02-01T00:00:00Z'); // current version: «Zuppa v2»
		const pastWeek = await s.fx.insertWeek(s.familyId, '2026-01-05');
		const past = await s.fx.insertSlot(pastWeek, { date: '2026-01-05', mealType: 'lunch', freeText: 'x' });
		const result = await s.anna.client.meals.setRecipe({ familyId: s.familyId, slotId: past, id: id(), recipeId: recipe });
		expect(mealOf(result.week, past).recipe?.name).toBe('Zuppa');
	});

	it('the week and the shopping list read as changed after a write', async () => {
		const week = await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		const list = await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn });
		await s.bruno.client.meals.setServings({ familyId: s.familyId, slotId: s.slots.monLunch, id: id(), servings: 7 });
		expect((await s.anna.client.menu.getWeek({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: week.version })).unchanged).toBe(false);
		expect((await s.anna.client.shopping.getWeekList({ familyId: s.familyId, weekStartsOn: s.weekStartsOn, knownVersion: list.version })).unchanged).toBe(false);
	});
});

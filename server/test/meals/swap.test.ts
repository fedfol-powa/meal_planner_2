import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { catalogueFixture } from '../recipes/fixtures.ts';
import { errorOf, setupActors, type Actors } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { mealOf, mealsSetup } from '../support/meals.ts';

describe.skipIf(!hasDatabase)('meal swap', () => {
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

	it('moves dish and note, servings stay; one action, one row per slot', async () => {
		await actors.db.admin`update app.meal_slots set note = 'n1', servings = 3 where id = ${s.slots.monLunch}`;
		const actionId = id();
		const result = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: actionId });
		expect(mealOf(result.week, s.slots.monLunch)).toMatchObject({ kind: 'free', freeText: 'Pizza', note: null, servings: 3 });
		expect(mealOf(result.week, s.slots.monDinner)).toMatchObject({ kind: 'recipe', recipe: { id: s.recipes[0] }, note: 'n1', servings: 2 });
		expect(await s.action(actionId)).toMatchObject({ kind: 'swap', slot_ids: [s.slots.monLunch, s.slots.monDinner] });
		expect([...mealOf(result.week, s.slots.monLunch).lastChange!.slotIds].sort()).toEqual([s.slots.monLunch, s.slots.monDinner].sort());
	});

	for (const order of ['draft first', 'draft second'] as const) {
		it(`moves an imported draft and an archived recipe (${order} in id order)`, async () => {
			const archived = await s.fx.publishRecipe();
			await catalogueFixture(actors.db).archive(archived);
			const draft = await s.importedDraft('Bozza importata');
			const [a, b] = [s.slots.monLunch, s.slots.tueLunch].sort();
			const [draftSlot, otherSlot] = order === 'draft first' ? [a!, b!] : [b!, a!];
			await actors.db.admin`update app.meal_slots set recipe_id = ${draft}, free_text = null where id = ${draftSlot}`;
			await actors.db.admin`update app.meal_slots set recipe_id = ${archived}, free_text = null where id = ${otherSlot}`;
			const result = await s.bruno.client.meals.swap({ familyId: s.familyId, slotId: draftSlot, otherSlotId: otherSlot, id: id() });
			expect(mealOf(result.week, otherSlot).recipe?.id).toBe(draft);
			expect(mealOf(result.week, draftSlot).recipe?.id).toBe(archived);
		});
	}

	it('swaps two imported drafts', async () => {
		const [d1, d2] = [await s.importedDraft('Bozza uno'), await s.importedDraft('Bozza due')];
		await actors.db.admin`update app.meal_slots set recipe_id = ${d1}, free_text = null where id = ${s.slots.monLunch}`;
		await actors.db.admin`update app.meal_slots set recipe_id = ${d2}, free_text = null where id = ${s.slots.tueLunch}`;
		const result = await s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.tueLunch, id: id() });
		expect(mealOf(result.week, s.slots.monLunch).recipe?.id).toBe(d2);
		expect(mealOf(result.week, s.slots.tueLunch).recipe?.id).toBe(d1);
	});

	it('refuses the same slot and a slot of another week, not_found for an unknown slot, nothing written', async () => {
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monLunch, id: id() }))).code).toBe('invalid');
		const nextWeek = await s.fx.insertWeek(s.familyId, '2026-10-19');
		const far = await s.fx.insertSlot(nextWeek, { date: '2026-10-19', mealType: 'lunch', freeText: 'x' });
		const week = await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: far, id: id() }));
		expect(week.code).toBe('invalid');
		expect(week.data.issues[0].path).toEqual(['otherSlotId']);
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: crypto.randomUUID(), id: id() }))).code).toBe('not_found');
		expect(await s.changes(s.slots.monLunch)).toHaveLength(0);
	});

	it('a swap id already used for a note of the first slot is invalid, and nothing moves', async () => {
		const actionId = id();
		await s.anna.client.meals.setNote({ familyId: s.familyId, slotId: s.slots.monLunch, id: actionId, note: 'x' });
		expect((await errorOf(s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.monDinner, id: actionId }))).code).toBe('invalid');
		expect(mealOf(await s.week(s.anna), s.slots.monDinner).freeText).toBe('Pizza');
	});

	it('two crossed swaps at once both finish', async () => {
		await Promise.all([
			s.anna.client.meals.swap({ familyId: s.familyId, slotId: s.slots.monLunch, otherSlotId: s.slots.tueLunch, id: id() }),
			s.bruno.client.meals.swap({ familyId: s.familyId, slotId: s.slots.tueLunch, otherSlotId: s.slots.monLunch, id: id() }),
		]);
	});
});

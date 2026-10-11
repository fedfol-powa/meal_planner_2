import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogueFixture, type CatalogueFixture } from './recipes/fixtures.ts';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family exclusions', () => {
	let actors: Actors;
	let catalogue: CatalogueFixture;
	let member: Actor;
	let other: Actor;
	let stranger: Actor;
	let familyId: string;
	let recipeId: string;
	let secondId: string;
	let draftId: string;
	beforeAll(async () => {
		actors = await setupActors();
		catalogue = catalogueFixture(actors.db);
		member = await actors.user();
		other = await actors.user({ locale: 'en-GB' });
		stranger = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: member.userId, role: 'member' },
			{ userId: other.userId, role: 'family_admin' },
		]);
		await actors.db.admin`update app.profiles set display_name = 'Bruno' where user_id = ${member.userId}`;
		recipeId = await catalogue.recipe({ name: { 'it-IT': 'Pasta al pomodoro', 'en-GB': 'Tomato pasta' } });
		secondId = await catalogue.recipe({ name: { 'it-IT': 'Zuppa', 'en-GB': 'Soup' } });
		draftId = await catalogue.draft({ 'it-IT': 'Bozza', 'en-GB': 'Draft' });
	});
	afterAll(() => actors?.close());

	it('adds once, keeping the first author, reason and date; newest first', async () => {
		const first = await member.client.family.addExclusion({ familyId, recipeId, reason: '  Troppo piccante  ' });
		expect(first).toEqual([
			{ recipe: { id: recipeId, name: 'Pasta al pomodoro' }, reason: 'Troppo piccante', createdByName: 'Bruno', createdAt: expect.any(String) },
		]);
		const again = await other.client.family.addExclusion({ familyId, recipeId, reason: 'Other' });
		expect(again).toEqual([{ ...first[0], recipe: { id: recipeId, name: 'Tomato pasta' } }]);
		await other.client.family.addExclusion({ familyId, recipeId: secondId });
		const listed = await member.client.family.listExclusions({ familyId });
		if (listed.unchanged) throw new Error('expected data');
		expect(listed.data.map((e) => [e.recipe.id, e.reason])).toEqual([
			[secondId, null],
			[recipeId, 'Troppo piccante'],
		]);
	});

	it('removes, idempotently', async () => {
		const after = await member.client.family.removeExclusion({ familyId, recipeId: secondId });
		expect(after.map((e) => e.recipe.id)).toEqual([recipeId]);
		expect((await member.client.family.removeExclusion({ familyId, recipeId: secondId })).map((e) => e.recipe.id)).toEqual([recipeId]);
	});

	it('refuses drafts and unknown recipes with not_found, strangers with forbidden', async () => {
		for (const id of [draftId, crypto.randomUUID()]) {
			const error = await errorOf(member.client.family.addExclusion({ familyId, recipeId: id }));
			expect(error.code).toBe('not_found');
			expect(error.status).toBe(404);
		}
		expect((await errorOf(stranger.client.family.addExclusion({ familyId, recipeId }))).code).toBe('forbidden');
		expect((await errorOf(stranger.client.family.listExclusions({ familyId }))).code).toBe('forbidden');
	});

	it('accepts an archived recipe', async () => {
		const archived = await catalogue.recipe({ name: { 'it-IT': 'Vecchia', 'en-GB': 'Old' } });
		await catalogue.archive(archived);
		expect((await member.client.family.addExclusion({ familyId, recipeId: archived })).map((e) => e.recipe.id)).toContain(archived);
	});

	it('shows a former member as null', async () => {
		const leaving = await actors.user();
		await actors.db.addMember(familyId, leaving.userId, 'member');
		const recipe = await catalogue.recipe({ name: { 'it-IT': 'Frittata', 'en-GB': 'Omelette' } });
		await leaving.client.family.addExclusion({ familyId, recipeId: recipe });
		await actors.db.admin`delete from app.family_members where family_id = ${familyId} and user_id = ${leaving.userId}`;
		const listed = await member.client.family.listExclusions({ familyId });
		if (listed.unchanged) throw new Error('expected data');
		expect(listed.data.find((e) => e.recipe.id === recipe)?.createdByName).toBeNull();
	});

	it('bumps the family version', async () => {
		const before = await member.client.family.listExclusions({ familyId });
		await member.client.family.addExclusion({ familyId, recipeId: secondId });
		expect((await member.client.family.listExclusions({ familyId, knownVersion: before.version })).unchanged).toBe(false);
	});
});

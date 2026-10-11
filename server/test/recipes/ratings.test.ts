import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { testApp } from './app.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

describe.skipIf(!hasDatabase)('ratings.set', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	let t: Awaited<ReturnType<typeof testApp>>;
	beforeAll(async () => {
		db = await setupDatabase();
		cat = catalogueFixture(db);
		t = await testApp(db);
	});
	afterAll(() => db?.close());

	it('sets, changes and removes my stars, answering the family summary; repeating is harmless', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'A', 'en-GB': 'A' } });
		const set = (stars: number | null) => m.client.ratings.set({ familyId: m.familyId, recipeId, stars });
		expect(await set(4)).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
		expect(await set(2)).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await set(2)).toEqual({ familyAverage: 2, familyCount: 1, myStars: 2 });
		expect(await set(null)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
		expect(await set(null)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('drops a removed member from the average and refuses the same token afterwards', async () => {
		const admin = await t.member();
		const other = await db.createUser();
		await db.addMember(admin.familyId, other.userId, 'member');
		const { client: otherClient } = await t.clientFor(other);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'B', 'en-GB': 'B' } });
		await otherClient.ratings.set({ familyId: admin.familyId, recipeId, stars: 5 });
		expect(await admin.client.ratings.set({ familyId: admin.familyId, recipeId, stars: 3 })).toEqual({ familyAverage: 4, familyCount: 2, myStars: 3 });
		await db.admin`delete from app.family_members where family_id = ${admin.familyId} and user_id = ${other.userId}`;
		expect(await admin.client.ratings.set({ familyId: admin.familyId, recipeId, stars: 3 })).toEqual({ familyAverage: 3, familyCount: 1, myStars: 3 });
		await expect(otherClient.ratings.set({ familyId: admin.familyId, recipeId, stars: 1 })).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('rates an archived recipe', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'C', 'en-GB': 'C' } });
		await cat.archive(recipeId);
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 })).myStars).toBe(5);
	});

	it('refuses drafts, unknown recipes and books the family does not own unless a meal cites them', async () => {
		const m = await t.member();
		const draftId = await cat.draft({ 'it-IT': 'D', 'en-GB': 'D' });
		await cat.meal(m.familyId, draftId, '2026-09-21', 'lunch');
		const bookId = await cat.book('book', 'Il libro');
		const fromBook = await cat.recipe({ name: { 'it-IT': 'E', 'en-GB': 'E' }, bookId });
		for (const recipeId of [draftId, crypto.randomUUID(), fromBook]) {
			await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'not_found' });
		}
		await cat.meal(m.familyId, fromBook, '2026-09-21', 'dinner');
		expect((await m.client.ratings.set({ familyId: m.familyId, recipeId: fromBook, stars: 3 })).myStars).toBe(3);
	});

	it('is forbidden outside my families and rejects stars out of range', async () => {
		const m = await t.member();
		const other = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'F', 'en-GB': 'F' } });
		await expect(m.client.ratings.set({ familyId: other.familyId, recipeId, stars: 3 })).rejects.toMatchObject({ code: 'forbidden' });
		await expect(m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 6 })).rejects.toMatchObject({ code: 'invalid' });
	});

	it('is an MCP tool that writes', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'G', 'en-GB': 'G' } });
		const list = await mcp(t.app, t.env, m.token, 'tools/list');
		expect(list.body.result.tools.find((tool: any) => tool.name === 'ratings_set').annotations.readOnlyHint).toBe(false);
		const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'ratings_set', arguments: { familyId: m.familyId, recipeId, stars: 4 } });
		expect(toolBody(call)).toEqual({ familyAverage: 4, familyCount: 1, myStars: 4 });
	});
});

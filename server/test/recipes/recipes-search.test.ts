import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { testApp, type TestMember } from './app.ts';
import { catalogueFixture, marker, type CatalogueFixture } from './fixtures.ts';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

describe.skipIf(!hasDatabase)('recipes.search', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	let t: Awaited<ReturnType<typeof testApp>>;
	beforeAll(async () => {
		db = await setupDatabase();
		cat = catalogueFixture(db);
		t = await testApp(db);
	});
	afterAll(() => db?.close());

	async function search(m: TestMember, query: object) {
		const result = await m.client.recipes.search({ familyId: m.familyId, query });
		if (result.unchanged) throw new Error('fresh read expected');
		return result.data.items;
	}

	it('lists published recipes visible to the family, with lines for the base servings', async () => {
		const m = await t.member();
		const k = marker();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const visible = await cat.recipe({
			name: { 'it-IT': `Sugo ${k}`, 'en-GB': `Sauce ${k}` },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		const archived = await cat.recipe({ name: { 'it-IT': `Vecchio ${k}`, 'en-GB': `Old ${k}` } });
		await cat.archive(archived);
		await cat.draft({ 'it-IT': `Bozza ${k}`, 'en-GB': `Draft ${k}` });
		const bookId = await cat.book('b', 'Libro');
		const fromBook = await cat.recipe({ name: { 'it-IT': `Dal libro ${k}`, 'en-GB': `From book ${k}` }, bookId });
		const items = await search(m, { text: k });
		expect(items.map((i) => i.recipe.id)).toEqual([visible]);
		expect(items[0]).toMatchObject({
			baseServings: 2,
			ingredients: [{ name: 'Pomodori', amount: '200 g' }],
			rating: { familyCount: 0 },
			lastEatenOn: null,
			upcoming: [],
		});
		await db.admin`insert into app.family_books (family_id, book_id) values (${m.familyId}, ${bookId})`;
		const withBook = await search(m, { text: k });
		expect(withBook.map((i) => i.recipe.id).sort()).toEqual([visible, fromBook].sort());
		expect(withBook.find((i) => i.recipe.id === fromBook)?.recipe).toMatchObject({ bookTitle: 'Libro', bookPages: '12' });
	});

	it('searches the synonyms of the caller language only', async () => {
		const m = await t.member('it-IT');
		const k = marker();
		const leek = await cat.ingredient('leek', { 'it-IT': 'Porri', 'en-GB': 'Leeks' }, { 'it-IT': [`porro${k}`], 'en-GB': [`leek${k}`] });
		const soup = await cat.recipe({
			name: { 'it-IT': 'Zuppa', 'en-GB': 'Soup' },
			lines: [{ ingredientId: leek, quantity: { kind: 'amount', value: 2, unit: 'piece' } }],
		});
		expect((await search(m, { text: `porro${k}` })).map((i) => i.recipe.id)).toEqual([soup]);
		expect(await search(m, { text: `leek${k}` })).toEqual([]);
	});

	it('gives lastEatenOn and every upcoming meal, in time order (lunch before dinner)', async () => {
		const m = await t.member();
		const k = marker();
		const recipeId = await cat.recipe({ name: { 'it-IT': `Pasto ${k}`, 'en-GB': `Meal ${k}` } });
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
		const future = [
			[day(2), 'lunch'],
			[day(2), 'dinner'],
			[day(3), 'lunch'],
			[day(4), 'dinner'],
		] as const;
		for (const [date, mealType] of future) await cat.meal(m.familyId, recipeId, date, mealType);
		const [item] = await search(m, { text: k });
		expect(item.lastEatenOn).toBe('2026-09-21');
		expect(item.upcoming.map((u) => [u.date, u.mealType])).toEqual(future.map(([d, mt]) => [d, mt]));
		const [{ at }] = await db.admin<{ at: Date }[]>`
			select app.meal_passed_at(${day(2)}::date, 'lunch', time_zone) as at from app.families where id = ${m.familyId}`;
		expect(item.upcoming[0].passesAt).toBe(at.toISOString());
	});

	it('sorts by the family rating with unrated recipes last', async () => {
		const m = await t.member();
		const k = marker();
		const low = await cat.recipe({ name: { 'it-IT': `A ${k}`, 'en-GB': `A ${k}` } });
		const high = await cat.recipe({ name: { 'it-IT': `B ${k}`, 'en-GB': `B ${k}` } });
		const none = await cat.recipe({ name: { 'it-IT': `C ${k}`, 'en-GB': `C ${k}` } });
		await m.client.ratings.set({ familyId: m.familyId, recipeId: low, stars: 2 });
		await m.client.ratings.set({ familyId: m.familyId, recipeId: high, stars: 5 });
		expect((await search(m, { text: k, sort: 'rating' })).map((i) => i.recipe.id)).toEqual([high, low, none]);
		expect((await search(m, { text: k, sort: 'rating', reversed: true })).map((i) => i.recipe.id)).toEqual([low, high, none]);
		expect((await search(m, { text: k, minStars: 4 })).map((i) => i.recipe.id)).toEqual([high]);
	});

	it('answers unchanged with the same version, fresh after a rating', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Invariato', 'en-GB': 'Unchanged' } });
		const first = await m.client.recipes.search({ familyId: m.familyId, query: {} });
		expect(await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version })).toEqual({
			unchanged: true,
			version: first.version,
		});
		await m.client.ratings.set({ familyId: m.familyId, recipeId, stars: 5 });
		expect((await m.client.recipes.search({ familyId: m.familyId, query: {}, knownVersion: first.version })).unchanged).toBe(false);
	});

	it('refuses a removed member with the same token, even holding a version read before', async () => {
		const admin = await t.member();
		const other = await db.createUser();
		await db.addMember(admin.familyId, other.userId, 'member');
		const { client } = await t.clientFor(other);
		await cat.recipe({ name: { 'it-IT': 'Ex', 'en-GB': 'Ex' } });
		const before = await client.recipes.search({ familyId: admin.familyId, query: {} });
		expect(before.unchanged).toBe(false);
		await db.admin`delete from app.family_members where family_id = ${admin.familyId} and user_id = ${other.userId}`;
		await expect(client.recipes.search({ familyId: admin.familyId, query: {} })).rejects.toMatchObject({ code: 'forbidden' });
		await expect(client.recipes.search({ familyId: admin.familyId, query: {}, knownVersion: before.version })).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('is forbidden to non members and works as a read-only MCP tool', async () => {
		const m = await t.member();
		const other = await t.member();
		const k = marker();
		const recipeId = await cat.recipe({ name: { 'it-IT': `Mcp ${k}`, 'en-GB': `Mcp ${k}` } });
		await expect(m.client.recipes.search({ familyId: other.familyId, query: {} })).rejects.toMatchObject({ code: 'forbidden' });
		const list = await mcp(t.app, t.env, m.token, 'tools/list');
		expect(list.body.result.tools.find((tool: any) => tool.name === 'recipes_search').annotations.readOnlyHint).toBe(true);
		const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'recipes_search', arguments: { familyId: m.familyId, query: { text: k } } });
		expect(toolBody(call)).toMatchObject({ unchanged: false, data: { items: [{ recipe: { id: recipeId, name: `Mcp ${k}` } }] } });
	});
});

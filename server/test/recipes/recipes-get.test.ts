import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { testApp, type TestMember } from './app.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

describe.skipIf(!hasDatabase)('recipes.get', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	let t: Awaited<ReturnType<typeof testApp>>;
	beforeAll(async () => {
		db = await setupDatabase();
		cat = catalogueFixture(db);
		t = await testApp(db);
	});
	afterAll(() => db?.close());

	async function get(m: TestMember, input: { recipeId: string; servings?: number; slotId?: string }) {
		const result = await m.client.recipes.get({ familyId: m.familyId, ...input });
		if (result.unchanged) throw new Error('fresh read expected');
		return result.data;
	}

	it('scales to the servings asked, the base by default', async () => {
		const m = await t.member();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		expect(await get(m, { recipeId })).toMatchObject({ status: 'published', baseServings: 2, servings: 2, ingredients: [{ amount: '200 g' }] });
		expect(await get(m, { recipeId, servings: 4 })).toMatchObject({ servings: 4, ingredients: [{ amount: '400 g' }] });
		await expect(m.client.recipes.get({ familyId: m.familyId, recipeId, servings: 0 })).rejects.toMatchObject({ code: 'invalid' });
	});

	it('opens archived recipes, never drafts, even for curators or when a meal cites them', async () => {
		const m = await t.member();
		await db.grantGlobalRole(m.userId, 'recipe_curator');
		const archived = await cat.recipe({ name: { 'it-IT': 'A', 'en-GB': 'A' } });
		await cat.archive(archived);
		expect((await get(m, { recipeId: archived })).status).toBe('archived');
		const draftId = await cat.draft({ 'it-IT': 'B', 'en-GB': 'B' });
		await cat.meal(m.familyId, draftId, '2026-09-21', 'lunch');
		await expect(m.client.recipes.get({ familyId: m.familyId, recipeId: draftId })).rejects.toMatchObject({ code: 'not_found' });
		await expect(m.client.recipes.get({ familyId: m.familyId, recipeId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'not_found' });
	});

	it('opens a recipe from a book the family does not own only when a meal cites it', async () => {
		const m = await t.member();
		const bookId = await cat.book('b', 'Libro');
		const recipeId = await cat.recipe({ name: { 'it-IT': 'C', 'en-GB': 'C' }, bookId });
		await expect(m.client.recipes.get({ familyId: m.familyId, recipeId })).rejects.toMatchObject({ code: 'not_found' });
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
		expect((await get(m, { recipeId })).recipe).toMatchObject({ bookTitle: 'Libro', bookPages: '12' });
	});

	it('lists the last five past meals newest first (dinner before lunch) and every upcoming one', async () => {
		const m = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'D', 'en-GB': 'D' } });
		for (const date of ['2026-09-14', '2026-09-15', '2026-09-16']) await cat.meal(m.familyId, recipeId, date, 'lunch');
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'lunch');
		await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
		await cat.meal(m.familyId, recipeId, '2026-09-22', 'lunch');
		await cat.meal(m.familyId, recipeId, day(2), 'dinner');
		const detail = await get(m, { recipeId });
		expect(detail.history).toEqual([
			{ date: '2026-09-22', mealType: 'lunch' },
			{ date: '2026-09-21', mealType: 'dinner' },
			{ date: '2026-09-21', mealType: 'lunch' },
			{ date: '2026-09-16', mealType: 'lunch' },
			{ date: '2026-09-15', mealType: 'lunch' },
		]);
		expect(detail.upcoming.map((u) => u.date)).toEqual([day(2)]);
	});

	it('shows the version eaten in a past meal, the current one otherwise (R1), with its book', async () => {
		const m = await t.member();
		const bookA = await cat.book('a', 'Libro A');
		const bookB = await cat.book('b', 'Libro B');
		await db.admin`insert into app.family_books (family_id, book_id) values (${m.familyId}, ${bookA}), (${m.familyId}, ${bookB})`;
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' },
			bookId: bookA,
			bookPages: '12',
			createdAt: new Date('2026-09-01T10:00:00Z'),
		});
		const pastSlot = await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner');
		const futureSlot = await cat.meal(m.familyId, recipeId, day(2), 'lunch');
		const before = await m.client.recipes.get({ familyId: m.familyId, recipeId, slotId: pastSlot });
		await cat.publishVersion(recipeId, { name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' }, bookId: bookB, bookPages: '40' });
		expect((await get(m, { recipeId, slotId: pastSlot })).recipe).toMatchObject({ name: 'Sugo v1', bookTitle: 'Libro A', bookPages: '12' });
		expect((await get(m, { recipeId, slotId: futureSlot })).recipe.name).toBe('Sugo v2');
		expect((await get(m, { recipeId })).recipe).toMatchObject({ name: 'Sugo v2', bookTitle: 'Libro B' });
		const again = await m.client.recipes.get({ familyId: m.familyId, recipeId, slotId: pastSlot, knownVersion: before.version });
		expect(again.unchanged).toBe(false);
	});

	it('opened from a meal, scales to its servings unless servings are asked; a meal of zero servings keeps the base', async () => {
		const m = await t.member();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		const forSix = await cat.meal(m.familyId, recipeId, day(2), 'lunch', 6);
		const pastForThree = await cat.meal(m.familyId, recipeId, '2026-09-21', 'dinner', 3);
		const skipped = await cat.meal(m.familyId, recipeId, day(3), 'dinner', 0);
		expect(await get(m, { recipeId, slotId: forSix })).toMatchObject({ baseServings: 2, servings: 6, ingredients: [{ amount: '600 g' }] });
		expect(await get(m, { recipeId, slotId: pastForThree })).toMatchObject({ servings: 3, ingredients: [{ amount: '300 g' }] });
		expect(await get(m, { recipeId, slotId: forSix, servings: 1 })).toMatchObject({ servings: 1, ingredients: [{ amount: '100 g' }] });
		expect(await get(m, { recipeId, slotId: skipped })).toMatchObject({ servings: 2, ingredients: [{ amount: '200 g' }] });
	});

	it('refuses a slot of another family or of another recipe', async () => {
		const m = await t.member();
		const other = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'E', 'en-GB': 'E' } });
		const otherRecipe = await cat.recipe({ name: { 'it-IT': 'F', 'en-GB': 'F' } });
		const foreignSlot = await cat.meal(other.familyId, recipeId, '2026-09-21', 'lunch');
		const mySlot = await cat.meal(m.familyId, otherRecipe, '2026-09-21', 'lunch');
		for (const slotId of [foreignSlot, mySlot]) {
			await expect(m.client.recipes.get({ familyId: m.familyId, recipeId, slotId })).rejects.toMatchObject({ code: 'not_found' });
		}
	});

	it('refuses a removed member with the same token, even holding a version read before', async () => {
		const admin = await t.member();
		const other = await db.createUser();
		await db.addMember(admin.familyId, other.userId, 'member');
		const { client } = await t.clientFor(other);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Ex', 'en-GB': 'Ex' } });
		const before = await client.recipes.get({ familyId: admin.familyId, recipeId });
		expect(before.unchanged).toBe(false);
		await db.admin`delete from app.family_members where family_id = ${admin.familyId} and user_id = ${other.userId}`;
		await expect(client.recipes.get({ familyId: admin.familyId, recipeId })).rejects.toMatchObject({ code: 'forbidden' });
		await expect(client.recipes.get({ familyId: admin.familyId, recipeId, knownVersion: before.version })).rejects.toMatchObject({ code: 'forbidden' });
	});

	it('is forbidden to non members and works as a read-only MCP tool', async () => {
		const m = await t.member('en-GB');
		const other = await t.member();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'G', 'en-GB': 'G en' } });
		await expect(m.client.recipes.get({ familyId: other.familyId, recipeId })).rejects.toMatchObject({ code: 'forbidden' });
		const list = await mcp(t.app, t.env, m.token, 'tools/list');
		expect(list.body.result.tools.find((tool: any) => tool.name === 'recipes_get').annotations.readOnlyHint).toBe(true);
		const call = await mcp(t.app, t.env, m.token, 'tools/call', { name: 'recipes_get', arguments: { familyId: m.familyId, recipeId, servings: 3 } });
		expect(toolBody(call)).toMatchObject({ unchanged: false, data: { recipe: { name: 'G en' }, servings: 3 } });
	});
});

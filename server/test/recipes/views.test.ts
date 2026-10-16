import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb, type Tx } from '../../src/db.ts';
import { ingredientLines, ratingSummaries, recipeSummaries, recipeViewKey, recipeViews } from '../../src/recipes/views.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture, type CatalogueFixture } from './fixtures.ts';
import { interleaved } from './interleaved.ts';

describe.skipIf(!hasDatabase)('recipe views', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	beforeAll(async () => {
		db = await setupDatabase();
		cat = catalogueFixture(db);
	});
	afterAll(() => db?.close());

	const asUser = <T>(user: { userId: string; sessionId: string }, fn: (tx: Tx) => Promise<T>) =>
		withDb(
			db.appServerUrl,
			{ kind: 'user', claims: { sub: user.userId, role: 'authenticated', session_id: user.sessionId, exp: Math.floor(Date.now() / 1000) + 3600 } },
			fn,
		);
	async function family(locale: 'it-IT' | 'en-GB' = 'it-IT') {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		return { user, familyId };
	}

	it('averages the current members only and gives my stars', async () => {
		const me = await db.createUser();
		const other = await db.createUser();
		const stranger = await db.createUser();
		const familyId = await db.createFamily([
			{ userId: me.userId, role: 'family_admin' },
			{ userId: other.userId, role: 'member' },
		]);
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Pasta', 'en-GB': 'Pasta' } });
		await cat.rate(me.userId, recipeId, 4);
		await cat.rate(other.userId, recipeId, 2);
		await cat.rate(stranger.userId, recipeId, 5);
		const map = await asUser(me, (tx) => ratingSummaries(tx, familyId, me.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: 3, familyCount: 2, myStars: 4 });
	});

	it('gives an empty summary without votes', async () => {
		const { user, familyId } = await family();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Riso', 'en-GB': 'Rice' } });
		const map = await asUser(user, (tx) => ratingSummaries(tx, familyId, user.userId, [recipeId]));
		expect(map.get(recipeId)).toEqual({ familyAverage: null, familyCount: 0, myStars: null });
	});

	it('builds the current view in the language and system of the family', async () => {
		const { user, familyId } = await family('en-GB');
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo', 'en-GB': 'Sauce' },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' }, preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' } }],
		});
		const ref = { recipeId, version: null, servings: 4 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'en-GB' }, [ref]));
		const view = views.get(recipeViewKey(ref))!;
		expect(view.summary).toMatchObject({ id: recipeId, name: 'Sauce', description: 'Sauce, description', sourceType: 'home', proteinGroup: 'vegetarian' });
		expect(view).toMatchObject({ status: 'published', version: 1, baseServings: 2, rating: { familyCount: 0 } });
		expect(view.ingredients).toEqual([{ ingredientId: tomato, name: 'Tomatoes', amount: '400 g', preparation: 'diced', optional: false }]);
	});

	it('shows an older version with its own texts, servings, lines and book (R1)', async () => {
		const { user, familyId } = await family();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const bookA = await cat.book('a', 'Libro A');
		const bookB = await cat.book('b', 'Libro B');
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' },
			baseServings: 2,
			bookId: bookA,
			bookPages: '12',
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		await cat.publishVersion(recipeId, {
			name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' },
			baseServings: 4,
			bookId: bookB,
			bookPages: '40',
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 500, unit: 'g' } }],
		});
		const old = { recipeId, version: 1, servings: 2 };
		const now = { recipeId, version: null, servings: 4 };
		const same = { recipeId, version: 2, servings: 4 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, [old, now, same]));
		expect(views.get(recipeViewKey(old))).toMatchObject({
			version: 1,
			baseServings: 2,
			summary: { name: 'Sugo v1', bookTitle: 'Libro A', bookPages: '12' },
			ingredients: [{ name: 'Pomodori', amount: '200 g' }],
		});
		expect(views.get(recipeViewKey(now))).toMatchObject({ version: 2, summary: { name: 'Sugo v2', bookTitle: 'Libro B', bookPages: '40' } });
		expect(views.get(recipeViewKey(same))).toEqual(views.get(recipeViewKey(now)));
	});

	it('keeps the book of an older version after the source became a web page', async () => {
		const { user } = await family();
		const book = await cat.book('a', 'Libro A');
		const recipeId = await cat.recipe({ name: { 'it-IT': 'X', 'en-GB': 'X' }, bookId: book });
		await cat.publishVersion(recipeId, { bookId: null, sourceUrl: 'https://example.com/x' });
		const refs = [
			{ recipeId, version: 1, servings: 2 },
			{ recipeId, version: null, servings: 2 },
		];
		const summaries = await asUser(user, (tx) => recipeSummaries(tx, refs, 'it-IT'));
		expect(summaries.get(recipeViewKey(refs[0]))).toMatchObject({ sourceType: 'book', bookTitle: 'Libro A', sourceUrl: null });
		expect(summaries.get(recipeViewKey(refs[1]))).toMatchObject({ sourceType: 'web', bookTitle: null, sourceUrl: 'https://example.com/x' });
	});

	it('summarises a never-published recipe cited by a meal with the other language and a null description', async () => {
		const { user, familyId } = await family('en-GB');
		const draftId = await cat.draft({ 'it-IT': 'Vecchia ricetta' }, null);
		await cat.meal(familyId, draftId, '2026-09-21', 'dinner');
		const ref = { recipeId: draftId, version: null, servings: 2 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'en-GB' }, [ref]));
		expect(views.get(recipeViewKey(ref))).toEqual({
			status: 'draft',
			version: 0,
			baseServings: null,
			ingredients: null,
			rating: null,
			summary: {
				id: draftId,
				name: 'Vecchia ricetta',
				description: null,
				durationMinutes: null,
				sourceType: null,
				sourceUrl: null,
				bookTitle: null,
				bookPages: null,
				mealType: null,
				proteinGroup: null,
				photoUrl: null,
			},
		});
		const lines = await asUser(user, (tx) => ingredientLines(tx, [ref], { familyId, locale: 'en-GB' }));
		expect(lines.get(recipeViewKey(ref))).toBeNull();
	});

	/** A current photo row, as the photo operations write it (W12). */
	async function photo(recipeId: string): Promise<string> {
		const key = `photos/${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}.webp`;
		await db.admin`
			insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel)
			values (${crypto.randomUUID()}, ${recipeId}, ${key}, 'image/webp', 1600, 1067, 1000, 'web')`;
		return key;
	}

	it('gives the URL of the current photo, null without one and for a never-published recipe', async () => {
		const { user, familyId } = await family();
		const withPhoto = await cat.recipe({ name: { 'it-IT': 'Con foto', 'en-GB': 'With photo' } });
		const without = await cat.recipe({ name: { 'it-IT': 'Senza foto', 'en-GB': 'Without photo' } });
		const draftId = await cat.draft({ 'it-IT': 'Bozza con foto' });
		await cat.meal(familyId, draftId, '2026-09-28', 'dinner');
		const key = await photo(withPhoto);
		await photo(draftId);
		const refs = [withPhoto, without, draftId].map((recipeId) => ({ recipeId, version: null, servings: 2 }));
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, refs));
		expect(refs.map((ref) => views.get(recipeViewKey(ref))!.summary.photoUrl)).toEqual([`/${key}`, null, null]);
		const summaries = await asUser(user, (tx) => recipeSummaries(tx, refs, 'it-IT'));
		expect(refs.map((ref) => summaries.get(recipeViewKey(ref))!.photoUrl)).toEqual([`/${key}`, null, null]);
	});

	it('a removed photo is not shown', async () => {
		const { user, familyId } = await family();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Foto tolta', 'en-GB': 'Removed photo' } });
		const key = await photo(recipeId);
		await db.admin`update app.recipe_photos set removed_at = clock_timestamp() where storage_key = ${key}`;
		const ref = { recipeId, version: null, servings: 2 };
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, [ref]));
		expect(views.get(recipeViewKey(ref))!.summary.photoUrl).toBeNull();
	});

	it('prefers the caller language when the draft has it, and treats null texts as missing', async () => {
		const { user, familyId } = await family('en-GB');
		const draftId = await cat.draft({ 'it-IT': 'Zuppa', 'en-GB': 'Soup' }, { 'it-IT': 'Calda', 'en-GB': null });
		await cat.meal(familyId, draftId, '2026-09-21', 'lunch');
		const ref = { recipeId: draftId, version: null, servings: 2 };
		const summaries = await asUser(user, (tx) => recipeSummaries(tx, [ref], 'en-GB'));
		expect(summaries.get(recipeViewKey(ref))).toMatchObject({ name: 'Soup', description: 'Calda' });
	});

	it('never mixes two versions when a publication lands between the statements of a read', async () => {
		const { user, familyId } = await family();
		const tomato = await cat.ingredient('tomato', { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' });
		const recipeId = await cat.recipe({
			name: { 'it-IT': 'Sugo v1', 'en-GB': 'Sauce v1' },
			baseServings: 2,
			lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 200, unit: 'g' } }],
		});
		const old = { recipeId, version: 1, servings: 0 };
		const now = { recipeId, version: null, servings: 0 };
		const publish = () =>
			cat.publishVersion(recipeId, {
				name: { 'it-IT': 'Sugo v2', 'en-GB': 'Sauce v2' },
				baseServings: 4,
				lines: [{ ingredientId: tomato, quantity: { kind: 'amount', value: 500, unit: 'g' } }],
			});
		const views = await asUser(user, (tx) => recipeViews(interleaved(tx, publish), { familyId, userId: user.userId, locale: 'it-IT' }, [old, now]));
		expect(views.get(recipeViewKey(old))).toMatchObject({ version: 1, baseServings: 2, summary: { name: 'Sugo v1' }, ingredients: [{ amount: '200 g' }] });
		const current = views.get(recipeViewKey(now))!;
		const coherent = [
			{ version: 1, baseServings: 2, name: 'Sugo v1', amount: '200 g' },
			{ version: 2, baseServings: 4, name: 'Sugo v2', amount: '500 g' },
		];
		expect(coherent).toContainEqual({ version: current.version, baseServings: current.baseServings, name: current.summary.name, amount: current.ingredients![0].amount });
	});

	it('leaves out recipes the user cannot read', async () => {
		const { user, familyId } = await family();
		const draftId = await cat.draft({ 'it-IT': 'Segreta', 'en-GB': 'Secret' });
		const views = await asUser(user, (tx) => recipeViews(tx, { familyId, userId: user.userId, locale: 'it-IT' }, [{ recipeId: draftId, version: null, servings: 2 }]));
		expect(views.size).toBe(0);
	});
});

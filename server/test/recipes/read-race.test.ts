import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb, type Tx } from '../../src/db.ts';
import { readRecipe, readRecipeBook } from '../../src/recipes/read.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from '../support/db.ts';
import { catalogueFixture, marker, type CatalogueFixture } from './fixtures.ts';
import { interleaved } from './interleaved.ts';

/** Who may see a recipe and what it shows come from the same snapshot (review of PR #14). */
describe.skipIf(!hasDatabase)('recipe reads under a concurrent publication', () => {
	let db: TestDatabase;
	let cat: CatalogueFixture;
	beforeAll(async () => {
		db = await setupDatabase();
		cat = catalogueFixture(db);
	});
	afterAll(() => db?.close());

	async function family() {
		const user = await db.createUser();
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		const asUser = <T>(fn: (tx: Tx) => Promise<T>) =>
			withDb(
				db.appServerUrl,
				{ kind: 'user', claims: { sub: user.userId, role: 'authenticated', session_id: user.sessionId, exp: Math.floor(Date.now() / 1000) + 3600 } },
				fn,
			);
		return { viewer: { familyId, userId: user.userId, locale: 'it-IT' as const }, asUser };
	}

	it('never lists a version that moved to a book the family does not own', async () => {
		const { viewer, asUser } = await family();
		const k = marker();
		const recipeId = await cat.recipe({ name: { 'it-IT': `Web ${k}`, 'en-GB': `Web ${k}` }, sourceUrl: 'https://example.com/r' });
		const book = await cat.book('locked', 'Libro non posseduto');
		const toBook = () => cat.publishVersion(recipeId, { name: { 'it-IT': `Libro ${k}`, 'en-GB': `Book ${k}` }, bookId: book, sourceUrl: null });
		const { items } = await asUser((tx) => readRecipeBook(interleaved(tx, toBook), viewer, { text: k }));
		expect(items.map((i) => i.recipe.name)).not.toContain(`Libro ${k}`);
		expect(items.every((i) => i.recipe.bookTitle === null)).toBe(true);
	});

	it('never opens a version that moved to a book the family does not own', async () => {
		const { viewer, asUser } = await family();
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Web', 'en-GB': 'Web' }, sourceUrl: 'https://example.com/r' });
		const book = await cat.book('locked', 'Libro non posseduto');
		const toBook = () => cat.publishVersion(recipeId, { name: { 'it-IT': 'Dal libro', 'en-GB': 'From the book' }, bookId: book, sourceUrl: null });
		const outcome = await asUser((tx) => readRecipe(interleaved(tx, toBook), viewer, { recipeId })).then(
			(detail) => detail.recipe.name,
			(error: { code?: string }) => error.code,
		);
		expect(['Web', 'not_found']).toContain(outcome);
	});

	it('still opens it when a meal of the family cites the recipe', async () => {
		const { viewer, asUser } = await family();
		const book = await cat.book('locked', 'Libro non posseduto');
		const recipeId = await cat.recipe({ name: { 'it-IT': 'Dal libro', 'en-GB': 'From the book' }, bookId: book });
		await cat.meal(viewer.familyId, recipeId, '2026-09-21', 'lunch');
		const detail = await asUser((tx) => readRecipe(tx, viewer, { recipeId }));
		expect(detail.recipe).toMatchObject({ name: 'Dal libro', bookTitle: 'Libro non posseduto' });
	});
});

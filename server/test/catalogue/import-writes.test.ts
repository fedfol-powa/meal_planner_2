import { resolveReferences } from '@app/domain/recipe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDb } from '../../src/db.ts';
import { createBook, createDraft, createIngredient, type Actor } from '../../src/catalogue/write.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, type CatalogueActors } from './support.ts';

// write.ts as the production import will use it: slugs of the bundle kept, a second run finds them.
describe.skipIf(!hasDatabase)('catalogue writes for the import', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());

	it('keeps the import slugs and finds them again on a second run', async () => {
		const curator = await c.curator();
		const actor: Actor = { userId: curator.userId, channel: 'import' };
		const claims = { sub: curator.userId, role: 'authenticated' as const, session_id: curator.sessionId, exp: Math.floor(Date.now() / 1000) + 600 };
		const slug = `olio-extravergine-di-oliva-${crypto.randomUUID().slice(0, 6)}`;
		const run = (ids: { ingredient: string; book: string; draft: string }) =>
			withDb(c.actors.db.appServerUrl, { kind: 'user', claims }, async (tx) => {
				const oil = await createIngredient(tx, actor, {
					ingredientId: ids.ingredient,
					slug,
					name: { 'it-IT': 'Olio extravergine d’oliva', 'en-GB': 'Extra virgin olive oil' },
					department: 'condiments',
					isPantry: true,
				});
				const book = await createBook(tx, actor, { bookId: ids.book, slug: `${slug}-libro`, title: 'Il libro' });
				const lookup = {
					ingredientId: (s: string) => (s === slug ? oil.ingredientId : undefined),
					bookId: (s: string) => (s === `${slug}-libro` ? book.bookId : undefined),
				};
				const content = resolveReferences(completeContent('Bruschetta', slug), lookup);
				const draft = await createDraft(tx, actor, { draftId: ids.draft, content, originSlug: slug, originType: 'casa' });
				return { oil, book, draft };
			});
		const first = await run({ ingredient: crypto.randomUUID(), book: crypto.randomUUID(), draft: crypto.randomUUID() });
		expect(first.oil).toMatchObject({ slug, created: true });
		const second = await run({ ingredient: crypto.randomUUID(), book: crypto.randomUUID(), draft: crypto.randomUUID() });
		expect(second.oil).toEqual({ ...first.oil, created: false });
		expect(second.book).toEqual({ ...first.book, created: false });
		expect(second.draft).toEqual({ ...first.draft, created: false });
		const [row] = await c.actors.db.admin`select channel from app.recipe_draft_saves where draft_id = ${first.draft.draftId}`;
		expect(row!.channel).toBe('import');
		const [recipe] = await c.actors.db.admin`select origin_slug, origin_type from app.recipes where id = ${first.draft.recipeId}`;
		expect(recipe).toEqual({ origin_slug: slug, origin_type: 'casa' });
	});
});

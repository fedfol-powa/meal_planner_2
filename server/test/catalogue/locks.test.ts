import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasDatabase } from '../support/db.ts';
import { seedWeek } from '../support/shopping-fixtures.ts';
import { catalogueActors, draftContent, type CatalogueActors } from './support.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Row locks of the catalogue writes must let foreign-key checks through (FOR KEY SHARE): with
// FOR UPDATE a writer waiting on a counter and an insert citing the row deadlock (final review).
describe.skipIf(!hasDatabase)('catalogue row locks', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	it('an ingredient change waiting on the catalogue counter does not block a line citing the ingredient', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Ceci');
		const view = await curator.client.catalogue.getIngredient({ ingredientId });
		if (view.unchanged) throw new Error('expected data');
		// Like a publication: it has bumped the counter, then checks the foreign key of a new line.
		const publication = db().begin(async (sql) => {
			await sql`select version from app.catalogue_state for update`;
			await sleep(300);
			await sql`select 1 from app.ingredients where id = ${ingredientId} for key share`;
		});
		await sleep(50);
		const change = curator.client.catalogue.updateIngredient({
			ingredientId,
			baseVersion: view.data.version,
			name: { 'it-IT': 'Ceci', 'en-GB': 'Chickpeas' },
			synonyms: view.data.synonyms,
			department: view.data.department,
			isPantry: view.data.isPantry,
		});
		await expect(publication).resolves.toBeUndefined(); // no deadlock
		await expect(change).resolves.toMatchObject({ name: { 'en-GB': 'Chickpeas' } });
	});

	it('a draft save waiting on a family counter does not block a meal citing the recipe', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Vecchio') });
		const other = await c.actors.user();
		const familyId = await c.actors.db.createFamily([{ userId: other.userId, role: 'family_admin' }]);
		await seedWeek(c.actors.db, familyId, '2026-09-28', [{ date: '2026-09-28', mealType: 'dinner', recipeId: d.recipeId, servings: 2 }]);
		// Like a family write: it holds the family counter, then inserts a meal citing the recipe.
		const familyWrite = db().begin(async (sql) => {
			await sql`select data_version from app.families where id = ${familyId} for update`;
			await sleep(300);
			await sql`select 1 from app.recipes where id = ${d.recipeId} for key share`;
		});
		await sleep(50);
		const save = curator.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Nuovo') });
		await expect(familyWrite).resolves.toBeUndefined(); // no deadlock
		await expect(save).resolves.toMatchObject({ revision: 2 });
	});
});

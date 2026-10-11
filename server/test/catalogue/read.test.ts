import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue reads', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());

	it('refuses people who are not curators, also after a revocation with the same token', async () => {
		const member = await c.member();
		expect((await errorOf(member.client.catalogue.overview({}))).code).toBe('forbidden');
		const curator = await c.curator();
		await curator.client.catalogue.overview({});
		await c.revoke(curator.userId);
		expect((await errorOf(curator.client.catalogue.overview({}))).code).toBe('forbidden');
		expect((await errorOf(curator.client.catalogue.getGuide({}))).code).toBe('forbidden');
	});

	it('serves the guide', async () => {
		const curator = await c.curator();
		const { guide } = await curator.client.catalogue.getGuide({});
		expect(guide).toContain('catalogue_searchIngredients');
		expect(guide).toContain('catalogue_getIngredient');
		expect(guide).toContain('explicit yes');
	});

	it('shows an imported draft with unresolved lines and what it misses', async () => {
		const curator = await c.curator();
		const db = c.actors.db.admin;
		const [row] = await db<{ id: string }[]>`
			insert into app.recipes (slug, name, description) values (${'imp-' + crypto.randomUUID().slice(0, 8)},
				${db.json({ 'it-IT': 'Importata', 'en-GB': '' })}, ${db.json({ 'it-IT': '', 'en-GB': '' })}) returning id`;
		const content = draftContent('Importata', {
			ingredients: [
				{ ingredientId: null, variety: null, preparation: null, quantity: { kind: 'amount', value: null, unit: 'g' }, sourceText: 'farina q.b.', isOptional: false, isPrimary: false },
			],
		});
		const [draft] = await db<{ id: string }[]>`
			insert into app.recipe_drafts (recipe_id, kind, content, revision) values (${row!.id}, 'new', ${db.json(content as never)}, 1) returning id`;
		const view = await curator.client.catalogue.getDraft({ draftId: draft!.id });
		expect(view.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'required' });
		expect(view.missing).toContain('ingredients');
		expect(view).toMatchObject({ canDiscard: true, outcome: null, revision: 1, kind: 'new' });
		const { drafts } = await curator.client.catalogue.overview({});
		expect(drafts.find((d) => d.draftId === draft!.id)).toMatchObject({ kind: 'new', name: 'Importata' });
	});

	it('shows a stored draft that no longer matches the schema, with its problems', async () => {
		const curator = await c.curator();
		const db = c.actors.db.admin;
		const [row] = await db<{ id: string }[]>`
			insert into app.recipes (slug, name, description) values (${'old-' + crypto.randomUUID().slice(0, 8)},
				${db.json({ 'it-IT': 'Vecchia', 'en-GB': '' })}, ${db.json({ 'it-IT': '', 'en-GB': '' })}) returning id`;
		const [draft] = await db<{ id: string }[]>`
			insert into app.recipe_drafts (recipe_id, kind, content, revision)
			values (${row!.id}, 'new', ${db.json({ schemaVersion: 1, name: { 'it-IT': 'Vecchia' }, durationMinutes: 'venti' } as never)}, 1) returning id`;
		const view = await curator.client.catalogue.getDraft({ draftId: draft!.id });
		expect(view.issues.map((i) => i.code)).toContain('invalid_value');
		const { drafts } = await curator.client.catalogue.overview({});
		expect(drafts.find((d) => d.draftId === draft!.id)?.missing).toContain('invalid');
	});

	it('shows an imported draft whose references are not catalogue ids yet', async () => {
		const curator = await c.curator();
		const db = c.actors.db.admin;
		const [row] = await db<{ id: string }[]>`
			insert into app.recipes (slug, name, description) values (${'ref-' + crypto.randomUUID().slice(0, 8)},
				${db.json({ 'it-IT': 'Con slug', 'en-GB': '' })}, ${db.json({ 'it-IT': '', 'en-GB': '' })}) returning id`;
		const content = draftContent('Con slug', {
			sourceType: 'book',
			bookId: 'basta-un-wok',
			ingredients: [{ ingredientId: 'olio', variety: null, preparation: null, quantity: { kind: 'to_taste' }, sourceText: 'olio', isOptional: false, isPrimary: false }],
		});
		const [draft] = await db<{ id: string }[]>`
			insert into app.recipe_drafts (recipe_id, kind, content, revision) values (${row!.id}, 'new', ${db.json(content as never)}, 1) returning id`;
		const view = await curator.client.catalogue.getDraft({ draftId: draft!.id });
		expect(view.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
		expect(view).toMatchObject({ ingredientNames: {}, bookTitle: null });
	});

	it('answers not_found for an unknown draft', async () => {
		const curator = await c.curator();
		expect((await errorOf(curator.client.catalogue.getDraft({ draftId: crypto.randomUUID() }))).code).toBe('not_found');
	});
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { grams, seedPublishedRecipe, seedWeek } from '../support/shopping-fixtures.ts';
import { catalogueActors, draftContent, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue drafts', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	it('creates a new draft once per id, with the recipe name projected', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const first = await curator.client.catalogue.createDraft({ id, content: draftContent('Zuppa di farro') });
		const again = await curator.client.catalogue.createDraft({ id, content: draftContent('Altro nome') });
		expect(again.draftId).toBe(first.draftId);
		expect(again.revision).toBe(1);
		const [recipe] = await db()`select status, version, name, slug from app.recipes where id = ${first.recipeId}`;
		expect(recipe).toMatchObject({ status: 'draft', version: 0, name: { 'it-IT': 'Zuppa di farro', 'en-GB': '' } });
		expect(recipe!.slug).toMatch(/^zuppa-di-farro/);
		expect(await db()`select revision, channel from app.recipe_draft_saves where draft_id = ${id}`).toEqual([{ revision: 1, channel: 'web' }]);
	});

	it('refuses only blocking problems', async () => {
		const curator = await c.curator();
		const bad = await errorOf(curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('X', { durationMinutes: 0 }) }));
		expect(bad.code).toBe('invalid');
		expect(bad.data.issues).toContainEqual({ path: ['content', 'durationMinutes'], code: 'not_positive_integer' });
		const unknown = await errorOf(
			curator.client.catalogue.createDraft({
				id: crypto.randomUUID(),
				content: draftContent('Y', { ingredients: [{ ingredientId: crypto.randomUUID(), variety: null, preparation: null, quantity: { kind: 'to_taste' }, sourceText: 'y', isOptional: false, isPrimary: false }] }),
			}),
		);
		expect(unknown.data.issues).toContainEqual({ path: ['content', 'ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
		const ingredientId = await c.ingredient('Ceci');
		const line = { ingredientId, variety: null, preparation: null, quantity: { kind: 'amount' as const, value: null, unit: 'g' as const }, sourceText: 'ceci', isOptional: false, isPrimary: false };
		const ok = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Doppi', { ingredients: [line, line] }) });
		expect(ok.issues.map((i) => i.code)).toContain('duplicate_ingredient');
	});

	it('detects a conflict, overwrites knowingly and keeps the overwritten save', async () => {
		const lucia = await c.curator();
		const marco = await c.curator();
		const draft = await lucia.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Pesto') });
		await marco.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto', { durationMinutes: 10 }) });
		const conflict = await errorOf(lucia.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto genovese') }));
		expect(conflict.code).toBe('conflict');
		expect(conflict.data).toMatchObject({ kind: 'draft', revision: 2, by: marco.userId, theirFields: ['durationMinutes'], myFields: ['name'] });
		expect(conflict.data.theirs.durationMinutes).toBe(10);
		const saved = await lucia.client.catalogue.saveDraft({ draftId: draft.draftId, baseRevision: 1, content: draftContent('Pesto genovese'), overwriteRevision: 2 });
		expect(saved.revision).toBe(3);
		expect(await db()`select revision, overwritten from app.recipe_draft_saves where draft_id = ${draft.draftId} order by revision`).toEqual([
			{ revision: 1, overwritten: false },
			{ revision: 2, overwritten: true },
			{ revision: 3, overwritten: false },
		]);
	});

	it('does not overwrite a save that arrived after the conflict', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const d = await a.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Ragù') });
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Ragù', { durationMinutes: 90 }) });
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 2, content: draftContent('Ragù', { durationMinutes: 120 }) });
		const again = await errorOf(a.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Ragù bolognese'), overwriteRevision: 2 }));
		expect(again.data).toMatchObject({ kind: 'draft', revision: 3 });
	});

	it('treats a repeated save as done, even from the old base revision', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Minestrone') });
		const input = { draftId: d.draftId, baseRevision: 1, content: draftContent('Minestrone', { baseServings: 4 }) };
		const first = await curator.client.catalogue.saveDraft(input);
		const repeat = await curator.client.catalogue.saveDraft(input);
		expect(repeat.revision).toBe(first.revision);
		expect(await db()`select count(*)::int as n from app.recipe_draft_saves where draft_id = ${d.draftId}`).toEqual([{ n: 2 }]);
	});

	it('serialises two concurrent saves: one wins, the other gets a conflict', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const d = await a.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Polenta') });
		const results = await Promise.allSettled([
			a.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Polenta A') }),
			b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Polenta B') }),
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
		expect(rejected.reason.code).toBe('conflict');
	});

	it('creates once when the same id arrives twice at the same time', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const [a, b] = await Promise.all([
			curator.client.catalogue.createDraft({ id, content: draftContent('Parallela') }),
			curator.client.catalogue.createDraft({ id, content: draftContent('Parallela') }),
		]);
		expect(a.recipeId).toBe(b.recipeId);
		expect(await db()`select count(*)::int as n from app.recipe_drafts where id = ${id}`).toEqual([{ n: 1 }]);
	});

	it('gives different slugs to two new recipes with the same name created at the same time', async () => {
		const curator = await c.curator();
		const name = `Gemelle ${crypto.randomUUID().slice(0, 4)}`;
		const [a, b] = await Promise.all([1, 2].map(() => curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent(name) })));
		const slugs = await db()`select slug from app.recipes where id in (${a!.recipeId}, ${b!.recipeId})`;
		expect(new Set(slugs.map((r) => r.slug)).size).toBe(2);
	});

	it('opens one revision per published recipe and reuses it', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Riso');
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Risotto', baseServings: 2, lines: [{ ingredientId, quantity: grams(160) }] });
		const first = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		const second = await (await c.curator()).client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		expect(second.draftId).toBe(first.draftId);
		expect(first).toMatchObject({ kind: 'revision', baseVersion: 1, currentVersion: 1 });
		expect(first.content.name).toEqual({ 'it-IT': 'Risotto', 'en-GB': 'Risotto (en)' });
		const draftRecipe = (await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Mai') })).recipeId;
		expect((await errorOf(curator.client.catalogue.startRevision({ recipeId: draftRecipe, id: crypto.randomUUID() }))).data).toEqual({ reason: 'not_published' });
		expect((await errorOf(curator.client.catalogue.startRevision({ recipeId: crypto.randomUUID(), id: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('answers a repeated startRevision after its draft was discarded', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Farro');
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Farrotto', baseServings: 2, lines: [{ ingredientId, quantity: grams(160) }] });
		const id = crypto.randomUUID();
		const first = await curator.client.catalogue.startRevision({ recipeId, id });
		await curator.client.catalogue.discardDraft({ draftId: first.draftId });
		const repeat = await curator.client.catalogue.startRevision({ recipeId, id });
		expect(repeat).toMatchObject({ draftId: id, outcome: 'discarded' });
		const next = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		expect(next.draftId).not.toBe(id);
		expect((await curator.client.catalogue.startRevision({ recipeId, id })).draftId).toBe(id); // still the old creation
	});

	it('discards a revision, and a new draft only when no meal cites it', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Da scartare') });
		expect(await curator.client.catalogue.discardDraft({ draftId: d.draftId })).toEqual({ draftId: d.draftId, recipeId: d.recipeId, kind: 'new' });
		expect(await curator.client.catalogue.discardDraft({ draftId: d.draftId })).toMatchObject({ kind: 'new' }); // repeat
		expect((await db()`select outcome from app.recipe_drafts where id = ${d.draftId}`)[0]!.outcome).toBe('discarded');
		expect((await curator.client.catalogue.overview({})).drafts.some((x) => x.draftId === d.draftId)).toBe(false);

		const cited = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Citata') });
		const other = await c.actors.user();
		const familyId = await c.actors.db.createFamily([{ userId: other.userId, role: 'family_admin' }]);
		await seedWeek(c.actors.db, familyId, '2026-09-28', [{ date: '2026-09-28', mealType: 'dinner', recipeId: cited.recipeId, servings: 2 }]);
		expect((await curator.client.catalogue.getDraft({ draftId: cited.draftId })).canDiscard).toBe(false);
		expect((await errorOf(curator.client.catalogue.discardDraft({ draftId: cited.draftId }))).data).toEqual({ reason: 'cited_by_meals' });
	});

	it('bumps the counter of a family whose meal cites the new draft when its name changes', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Vecchio nome') });
		const other = await c.actors.user();
		const familyId = await c.actors.db.createFamily([{ userId: other.userId, role: 'family_admin' }]);
		await seedWeek(c.actors.db, familyId, '2026-09-28', [{ date: '2026-09-29', mealType: 'lunch', recipeId: d.recipeId, servings: 2 }]);
		const [before] = await db()`select data_version from app.families where id = ${familyId}`;
		await curator.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Nuovo nome') });
		const [after] = await db()`select data_version from app.families where id = ${familyId}`;
		expect(Number(after!.data_version)).toBeGreaterThan(Number(before!.data_version));
		expect((await db()`select name from app.recipes where id = ${d.recipeId}`)[0]!.name).toEqual({ 'it-IT': 'Nuovo nome', 'en-GB': '' });
	});
});

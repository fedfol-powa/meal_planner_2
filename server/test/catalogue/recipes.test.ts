import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, dataOf, draftContent, type CatalogueActors } from './support.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('catalogue search, archive, versions and restore', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	async function published(name: string) {
		const curator = await c.curator();
		const ingredientId = await c.ingredient(`${name} ingrediente`);
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent(name, ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		return { curator, recipeId: d.recipeId, ingredientId };
	}

	/** A second version changing the base servings to `servings`. */
	async function revise(curator: Awaited<ReturnType<typeof published>>['curator'], recipeId: string, change: object) {
		const rev = await curator.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: rev.draftId, baseRevision: rev.revision, content: { ...(rev.content as object), ...change } as never });
		return curator.client.catalogue.publish({ draftId: rev.draftId });
	}

	it('lets a curator without a family find a recipe by name and go on to revise it', async () => {
		const tag = crypto.randomUUID().slice(0, 6);
		const { recipeId } = await published(`Pappa ${tag}`);
		await published(`Ribollita ${tag}`);
		const archived = await published(`Panzanella ${tag}`);
		await db()`update app.recipes set status = 'archived', archived_at = now() where id = ${archived.recipeId}`;
		const fresh = await c.curator(); // new session, no family, no ids kept
		await fresh.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent(`Pappa ${tag} in bozza`) });
		const found = dataOf(await fresh.client.catalogue.searchRecipes({ text: `pappa ${tag}` }));
		expect(found.items).toEqual([expect.objectContaining({ recipeId, name: `Pappa ${tag}`, status: 'published', version: 1 })]);
		const onlyArchived = dataOf(await fresh.client.catalogue.searchRecipes({ text: tag, status: 'archived' }));
		expect(onlyArchived.items.map((i) => i.recipeId)).toEqual([archived.recipeId]);
		expect(dataOf(await fresh.client.catalogue.searchRecipes({ text: tag })).items).toHaveLength(3);
		expect(dataOf(await fresh.client.catalogue.listVersions({ recipeId })).versions).toHaveLength(1);
		expect((await fresh.client.catalogue.startRevision({ recipeId, id: crypto.randomUUID() })).kind).toBe('revision');
	});

	it('archives and brings back with absolute state', async () => {
		const { curator, recipeId } = await published('Gnocchi');
		expect(await curator.client.catalogue.setArchived({ recipeId, archived: true })).toMatchObject({ status: 'archived', changedBy: { userId: curator.userId } });
		await curator.client.catalogue.setArchived({ recipeId, archived: true });
		expect((await curator.client.catalogue.overview({})).archived.some((a) => a.recipeId === recipeId)).toBe(true);
		await curator.client.catalogue.setArchived({ recipeId, archived: false });
		expect(await db()`select status from app.recipe_status_changes where recipe_id = ${recipeId} order by changed_at, id`).toEqual([
			{ status: 'published' },
			{ status: 'archived' },
			{ status: 'published' },
		]);
		expect((await db()`select archived_at from app.recipes where id = ${recipeId}`)[0]!.archived_at).toBeNull();
		const draft = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Mai pubblicata') });
		expect((await errorOf(curator.client.catalogue.setArchived({ recipeId: draft.recipeId, archived: true }))).data).toEqual({ reason: 'not_published' });
		expect((await errorOf(curator.client.catalogue.setArchived({ recipeId: crypto.randomUUID(), archived: true }))).code).toBe('not_found');
	});

	it('lists versions and opens one as it was', async () => {
		const { curator, recipeId } = await published('Frittata');
		await revise(curator, recipeId, { durationMinutes: 15 });
		const list = await curator.client.catalogue.listVersions({ recipeId });
		expect(dataOf(list).versions.map((v) => v.version)).toEqual([2, 1]);
		expect((await curator.client.catalogue.listVersions({ recipeId, knownVersion: list.version })).unchanged).toBe(true);
		const v1 = dataOf(await curator.client.catalogue.getVersion({ recipeId, version: 1 }));
		expect(v1.content.durationMinutes).toBe(20);
		expect(v1.summary).toMatchObject({ id: recipeId, name: 'Frittata', durationMinutes: 20 });
		expect(v1.issues).toEqual([]);
		expect(v1.ingredients[0]).toMatchObject({ name: 'Frittata ingrediente' });
		expect((await errorOf(curator.client.catalogue.getVersion({ recipeId, version: 9 }))).code).toBe('not_found');
	});

	it('restores a version as a new one, once, after confirmation', async () => {
		const { curator, recipeId } = await published('Torta salata');
		await revise(curator, recipeId, { baseServings: 6 });
		expect((await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 1 }))).data).toMatchObject({ kind: 'version', version: 2 });
		const restored = await curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 });
		expect(restored).toEqual({ recipeId, version: 3, restoredFrom: 1 });
		expect(await curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 })).toEqual(restored); // repeat
		expect((await db()`select base_servings from app.recipes where id = ${recipeId}`)[0]!.base_servings).toBe(2);
		expect((await db()`select restored_from from app.recipe_versions where recipe_id = ${recipeId} and version = 3`)[0]!.restored_from).toBe(1);
		expect((await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 3, confirmVersion: 3 }))).data).toEqual({ reason: 'already_current' });
	});

	it('dates a restore after a wait for the catalogue counter', async () => {
		const { curator, recipeId } = await published('Canederli');
		await revise(curator, recipeId, { baseServings: 4 });
		let released!: Date;
		const holder = db().begin(async (sql) => {
			await sql`select version from app.catalogue_state for update`;
			await sleep(400);
			released = (await sql<{ at: Date }[]>`select clock_timestamp() as at`)[0]!.at;
		});
		await sleep(50);
		const restore = curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 });
		await holder;
		expect((await restore).version).toBe(3);
		const [v3] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${recipeId} and version = 3`;
		expect(v3!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		expect(await db()`select app.recipe_version_at(${recipeId}, ${new Date(released.getTime() - 100)}) as v`).toEqual([{ v: 2 }]);
	});

	it('refuses a version that no longer passes today’s checks', async () => {
		const { curator, recipeId, ingredientId } = await published('Sformato');
		const other = await c.ingredient('Altro');
		await revise(curator, recipeId, { ingredients: completeContent('Sformato', other).ingredients });
		await db()`update app.ingredients set archived_at = now() where id = ${ingredientId}`;
		const error = await errorOf(curator.client.catalogue.restoreVersion({ recipeId, version: 1, confirmVersion: 2 }));
		expect(error.data.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
		expect(dataOf(await curator.client.catalogue.getVersion({ recipeId, version: 1 })).issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
	});
});

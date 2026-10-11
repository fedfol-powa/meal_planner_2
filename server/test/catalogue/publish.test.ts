import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!hasDatabase)('catalogue publication', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	/** A published recipe with an open revision that changes the duration. */
	async function revisionOf(name: string) {
		const curator = await c.curator();
		const ingredientId = await c.ingredient(`${name} ingrediente`);
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent(name, ingredientId) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		const revision = await curator.client.catalogue.startRevision({ recipeId: d.recipeId, id: crypto.randomUUID() });
		await curator.client.catalogue.saveDraft({ draftId: revision.draftId, baseRevision: 1, content: { ...(revision.content as object), durationMinutes: 25 } as never });
		return { curator, recipeId: d.recipeId, draftId: revision.draftId };
	}

	/** Another transaction holds `lockSql` for a while; returns when it committed. */
	function holdLock(lockSql: string) {
		let released!: Date;
		const done = db().begin(async (sql) => {
			await sql.unsafe(lockSql);
			await sleep(400);
			released = (await sql<{ at: Date }[]>`select clock_timestamp() as at`)[0]!.at;
		});
		return { done: done.then(() => released) };
	}

	it('publishes a new recipe atomically and answers a repeat with the same version', async () => {
		const curator = await c.curator({ agent: true });
		const ingredientId = await c.ingredient('Lenticchie');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Lenticchie in umido', ingredientId) });
		const published = await curator.client.catalogue.publish({ draftId: d.draftId });
		expect(published).toMatchObject({ recipeId: d.recipeId, version: 1, conversions: [] });
		expect(await curator.client.catalogue.publish({ draftId: d.draftId })).toMatchObject({ version: 1 });
		const [recipe] = await db()`select status, version, duration_minutes, base_servings, name from app.recipes where id = ${d.recipeId}`;
		expect(recipe).toEqual({ status: 'published', version: 1, duration_minutes: 20, base_servings: 2, name: { 'it-IT': 'Lenticchie in umido', 'en-GB': 'Lenticchie in umido (en)' } });
		expect(await db()`select ingredient_id, quantity::float as quantity, unit from app.recipe_ingredients where recipe_id = ${d.recipeId}`).toEqual([
			{ ingredient_id: ingredientId, quantity: 200, unit: 'g' },
		]);
		expect(await db()`select version, channel from app.recipe_versions where recipe_id = ${d.recipeId}`).toEqual([{ version: 1, channel: 'mcp' }]);
		expect(await db()`select status from app.recipe_status_changes where recipe_id = ${d.recipeId}`).toEqual([{ status: 'published' }]);
		expect((await db()`select outcome from app.recipe_drafts where id = ${d.draftId}`)[0]!.outcome).toBe('published');
	});

	it('projects the seasons of the recipe', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Asparagi');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Risotto agli asparagi', ingredientId, { seasons: ['spring', 'summer'] }) });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		expect((await db()`select seasons from app.recipes where id = ${d.recipeId}`)[0]!.seasons).toEqual(['spring', 'summer']);
	});

	it('refuses an incomplete draft with every problem and writes nothing', async () => {
		const curator = await c.curator();
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: draftContent('Incompleta') });
		const error = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(error.code).toBe('invalid');
		expect(error.data.issues).toContainEqual({ path: ['name', 'en-GB'], code: 'translation_missing' });
		expect((await db()`select status from app.recipes where id = ${d.recipeId}`)[0]!.status).toBe('draft');
	});

	it('converts US cups with the recipe equivalence and refuses them without one', async () => {
		const curator = await c.curator();
		const flour = await c.ingredient('Farina');
		const cup = { ingredientId: flour, variety: null, preparation: null, quantity: { kind: 'amount' as const, value: 2, unit: 'us_cup' as const }, sourceText: '2 cups flour', isOptional: false, isPrimary: false };
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Pane', flour, { ingredients: [cup] }) });
		const refused = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(refused.data.issues).toContainEqual({ path: ['ingredients', 0, 'quantity', 'unit'], code: 'unit_not_publishable' });
		await db()`insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, source) values (${flour}, 'us_cup', 'g', 120, 'recipe', 'King Arthur')`;
		const check = await curator.client.catalogue.checkDraft({ draftId: d.draftId });
		expect(check.issues).toEqual([]);
		expect(check.conversions[0]?.to).toEqual({ kind: 'amount', value: 240, unit: 'g' });
		expect((await curator.client.catalogue.publish({ draftId: d.draftId })).conversions).toHaveLength(1);
		const [v] = await db()`select content from app.recipe_versions where recipe_id = ${d.recipeId}`;
		expect(v!.content.ingredients[0]).toMatchObject({ quantity: { kind: 'amount', value: 240, unit: 'g' }, sourceText: '2 cups flour' });
		const [draft] = await db()`select content from app.recipe_drafts where id = ${d.draftId}`;
		expect(draft!.content.ingredients[0].quantity.unit).toBe('us_cup');
	});

	it('publishes the equivalence of the line preparation, as the guide asks (generic 100, specific 120)', async () => {
		const curator = await c.curator();
		const cheese = await c.ingredient('Parmigiano');
		const set = { ingredientId: cheese, fromUnit: 'us_cup' as const, toUnit: 'g' as const, source: 'Esempio' };
		await curator.client.catalogue.setEquivalence({ ...set, factor: 100, preparation: null });
		await curator.client.catalogue.setEquivalence({ ...set, factor: 120, preparation: 'grattugiato' });
		const line = (preparation: { 'it-IT': string; 'en-GB': string } | null) => ({
			ingredientId: cheese, variety: null, preparation, quantity: { kind: 'amount' as const, value: 1, unit: 'us_cup' as const },
			sourceText: '1 cup grated Parmesan', isOptional: false, isPrimary: false,
		});
		const onlySource = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Sformato', cheese, { ingredients: [line(null)] }) });
		expect((await curator.client.catalogue.checkDraft({ draftId: onlySource.draftId })).conversions[0]?.to).toEqual({ kind: 'amount', value: 100, unit: 'g' });
		const d = await curator.client.catalogue.createDraft({
			id: crypto.randomUUID(),
			content: completeContent('Sformato grattugiato', cheese, { ingredients: [line({ 'it-IT': 'grattugiato', 'en-GB': 'grated' })] }),
		});
		expect((await curator.client.catalogue.checkDraft({ draftId: d.draftId })).conversions[0]).toMatchObject({ to: { value: 120 }, equivalence: { preparation: 'grattugiato' } });
		await curator.client.catalogue.publish({ draftId: d.draftId });
		const [v] = await db()`select content from app.recipe_versions where recipe_id = ${d.recipeId}`;
		expect(v!.content.ingredients[0]).toMatchObject({ quantity: { kind: 'amount', value: 120, unit: 'g' }, sourceText: '1 cup grated Parmesan' });
	});

	it('asks to confirm a revision started from a superseded version', async () => {
		const { curator, recipeId, draftId } = await revisionOf('Vellutata');
		const other = await c.curator();
		// A version 2 published by another curator meanwhile, written directly as the fixtures do.
		await db()`update app.recipes set version = 2 where id = ${recipeId}`;
		await db()`insert into app.recipe_versions (recipe_id, version, content, published_by, channel)
			select recipe_id, 2, content, ${other.userId}, 'web' from app.recipe_versions where recipe_id = ${recipeId} and version = 1`;
		const stale = await errorOf(curator.client.catalogue.publish({ draftId }));
		expect(stale.data).toMatchObject({ kind: 'version', version: 2, by: other.userId });
		expect(await curator.client.catalogue.publish({ draftId, confirmVersion: 2 })).toMatchObject({ version: 3 });
	});

	it('keeps an archived recipe archived when its revision is published', async () => {
		const { curator, recipeId, draftId } = await revisionOf('Erbazzone');
		await db()`update app.recipes set status = 'archived', archived_at = now() where id = ${recipeId}`;
		await curator.client.catalogue.publish({ draftId });
		expect((await db()`select status, version from app.recipes where id = ${recipeId}`)[0]).toEqual({ status: 'archived', version: 2 });
	});

	it('reports an ingredient archived after the draft was saved', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Topinambur');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Crema', ingredientId) });
		await db()`update app.ingredients set archived_at = now() where id = ${ingredientId}`;
		const error = await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }));
		expect(error.data.issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
		expect((await curator.client.catalogue.getDraft({ draftId: d.draftId })).issues).toContainEqual({ path: ['ingredients', 0, 'ingredientId'], code: 'unknown_ingredient' });
	});

	it('dates the version after the wait for the lock on the recipe, as R1 reads it', async () => {
		const { curator, recipeId, draftId } = await revisionOf('Hummus');
		const holder = holdLock(`select 1 from app.recipes where id = '${recipeId}' for update`);
		await sleep(50);
		const requested = new Date();
		const publication = curator.client.catalogue.publish({ draftId });
		const released = await holder.done;
		expect((await publication).version).toBe(2);
		const [v2] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${recipeId} and version = 2`;
		expect(v2!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		// The real R1 resolver: a meal that became past while the publication waited keeps version 1.
		const during = new Date((requested.getTime() + released.getTime()) / 2);
		expect(await db()`select app.recipe_version_at(${recipeId}, ${during}) as v`).toEqual([{ v: 1 }]);
		expect(await db()`select app.recipe_version_at(${recipeId}, ${v2!.published_at}) as v`).toEqual([{ v: 2 }]);
	});

	it('dates the version after a wait for the catalogue counter held by another writer', async () => {
		const { curator, recipeId, draftId } = await revisionOf('Macco di fave');
		// Another curator changing another ingredient holds the global counter row until commit.
		const holder = holdLock('select version from app.catalogue_state for update');
		await sleep(50);
		const requested = new Date();
		const publication = curator.client.catalogue.publish({ draftId });
		const released = await holder.done;
		expect((await publication).version).toBe(2);
		const [v2] = await db()<{ published_at: Date }[]>`select published_at from app.recipe_versions where recipe_id = ${recipeId} and version = 2`;
		expect(v2!.published_at.getTime()).toBeGreaterThanOrEqual(released.getTime());
		const during = new Date((requested.getTime() + released.getTime()) / 2);
		expect(await db()`select app.recipe_version_at(${recipeId}, ${during}) as v`).toEqual([{ v: 1 }]);
		const [closed] = await db()<{ closed_at: Date }[]>`select closed_at from app.recipe_drafts where id = ${draftId}`;
		expect(closed!.closed_at.getTime()).toBe(v2!.published_at.getTime()); // the repeat recognises the version by this instant
		expect(await curator.client.catalogue.publish({ draftId })).toMatchObject({ version: 2 });
	});

	it('leaves nothing behind when a write fails halfway', async () => {
		const curator = await c.curator();
		const ingredientId = await c.ingredient('Orzo');
		const d = await curator.client.catalogue.createDraft({ id: crypto.randomUUID(), content: completeContent('Orzotto', ingredientId) });
		// A failure after the recipe row is updated: a trigger on the lines, created for this test only.
		await db().unsafe(`create function app.test_fail() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`);
		await db().unsafe(`create trigger test_fail before insert on app.recipe_ingredients for each row
			when (new.recipe_id = '${d.recipeId}'::uuid) execute function app.test_fail()`);
		try {
			expect((await errorOf(curator.client.catalogue.publish({ draftId: d.draftId }))).code).toBe('internal');
		} finally {
			await db().unsafe('drop trigger test_fail on app.recipe_ingredients');
			await db().unsafe('drop function app.test_fail()');
		}
		expect((await db()`select status, version from app.recipes where id = ${d.recipeId}`)[0]).toEqual({ status: 'draft', version: 0 });
		expect(await db()`select 1 from app.recipe_versions where recipe_id = ${d.recipeId}`).toEqual([]);
		expect((await db()`select closed_at from app.recipe_drafts where id = ${d.draftId}`)[0]!.closed_at).toBeNull();
	});
});

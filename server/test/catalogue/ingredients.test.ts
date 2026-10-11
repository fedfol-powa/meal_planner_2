import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf } from '../support/actors.ts';
import { hasDatabase } from '../support/db.ts';
import { grams, seedPublishedRecipe } from '../support/shopping-fixtures.ts';
import { catalogueActors, dataOf, type CatalogueActors } from './support.ts';

describe.skipIf(!hasDatabase)('catalogue ingredients and books', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const db = () => c.actors.db.admin;

	it('creates an ingredient once, capitalised, with its first history row', async () => {
		const curator = await c.curator({ agent: true });
		const id = crypto.randomUUID();
		const input = { id, name: { 'it-IT': 'lenticchie rosse', 'en-GB': null }, department: 'pasta_grains' as const, isPantry: true };
		const view = await curator.client.catalogue.createIngredient(input);
		expect(await curator.client.catalogue.createIngredient(input)).toEqual(view);
		expect(view).toMatchObject({ ingredientId: id, name: { 'it-IT': 'Lenticchie rosse', 'en-GB': '' }, version: 1, equivalences: [] });
		expect(view.slug).toMatch(/^lenticchie-rosse/);
		expect(await db()`select version, channel, content->>'department' as department from app.ingredient_versions where ingredient_id = ${id}`).toEqual([
			{ version: 1, channel: 'mcp', department: 'pasta_grains' },
		]);
	});

	it('creates once when the same id arrives twice at the same time', async () => {
		const curator = await c.curator();
		const input = { id: crypto.randomUUID(), name: { 'it-IT': 'Cavolo nero', 'en-GB': 'Cavolo nero' }, department: 'produce' as const, isPantry: false };
		const [a, b] = await Promise.all([curator.client.catalogue.createIngredient(input), curator.client.catalogue.createIngredient(input)]);
		expect(a).toEqual(b);
		expect(await db()`select count(*)::int as n from app.ingredient_versions where ingredient_id = ${input.id}`).toEqual([{ n: 1 }]);
	});

	it('lets a new conversation search, read and change an ingredient without losing data', async () => {
		const first = await c.curator();
		const tag = crypto.randomUUID().slice(0, 6);
		const created = await first.client.catalogue.createIngredient({
			id: crypto.randomUUID(),
			name: { 'it-IT': `Scalogni ${tag}`, 'en-GB': null },
			department: 'produce',
			isPantry: false,
			synonyms: { 'it-IT': ['scalogno'], 'en-GB': [] },
		});
		await first.client.catalogue.setEquivalence({ ingredientId: created.ingredientId, fromUnit: 'us_cup', toUnit: 'g', factor: 160, preparation: null, source: 'USDA' });
		const later = await c.curator({ agent: true }); // another session: knows only the name
		const found = dataOf(await later.client.catalogue.searchIngredients({ text: `scalogni ${tag}` })).items[0]!;
		const read = dataOf(await later.client.catalogue.getIngredient({ ingredientId: found.ingredientId }));
		expect(read).toMatchObject({ version: 2, synonyms: { 'it-IT': ['scalogno'], 'en-GB': [] }, equivalences: [expect.objectContaining({ factor: 160 })] });
		const changed = await later.client.catalogue.updateIngredient({
			ingredientId: read.ingredientId,
			baseVersion: read.version,
			name: { 'it-IT': read.name['it-IT'], 'en-GB': 'Shallots' },
			synonyms: read.synonyms,
			department: read.department,
			isPantry: read.isPantry,
		});
		expect(changed).toMatchObject({ version: 3, name: { 'en-GB': 'Shallots' }, synonyms: read.synonyms, equivalences: read.equivalences });
		expect((await errorOf(later.client.catalogue.getIngredient({ ingredientId: crypto.randomUUID() }))).code).toBe('not_found');
	});

	it('updates from the version read and reports a conflict with who and what', async () => {
		const a = await c.curator();
		const b = await c.curator();
		const view = await a.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Porri', 'en-GB': null }, department: 'produce', isPantry: false });
		const next = await b.client.catalogue.updateIngredient({ ingredientId: view.ingredientId, baseVersion: 1, name: { 'it-IT': 'Porri', 'en-GB': 'Leeks' }, synonyms: view.synonyms, department: 'produce', isPantry: false });
		expect(next.version).toBe(2);
		const conflict = await errorOf(
			a.client.catalogue.updateIngredient({ ingredientId: view.ingredientId, baseVersion: 1, name: { 'it-IT': 'Porri', 'en-GB': null }, synonyms: view.synonyms, department: 'frozen', isPantry: false }),
		);
		expect(conflict.data).toMatchObject({ kind: 'ingredient', version: 2, by: b.userId, fields: ['name'] });
		expect(conflict.data.byName).not.toBeNull(); // catalogue_author_names covers ingredient_versions
	});

	it('keeps equivalences idempotent: same id on repeat and on change, removal repeatable', async () => {
		const curator = await c.curator();
		const view = await curator.client.catalogue.createIngredient({ id: crypto.randomUUID(), name: { 'it-IT': 'Zucchero', 'en-GB': 'Sugar' }, department: 'other', isPantry: true });
		const input = { ingredientId: view.ingredientId, fromUnit: 'us_cup' as const, toUnit: 'g' as const, factor: 200, preparation: null, source: 'USDA' };
		const set = await curator.client.catalogue.setEquivalence(input);
		expect(set.version).toBe(2);
		expect(await curator.client.catalogue.setEquivalence(input)).toEqual(set);
		expect(await db()`select count(*)::int as n from app.ingredient_versions where ingredient_id = ${view.ingredientId}`).toEqual([{ n: 2 }]);
		const changed = await curator.client.catalogue.setEquivalence({ ...input, factor: 198, source: 'King Arthur' });
		expect(changed.version).toBe(3);
		expect(changed.equivalences).toEqual([expect.objectContaining({ id: set.equivalences[0]!.id, factor: 198, source: 'King Arthur' })]);
		const withPrep = await curator.client.catalogue.setEquivalence({ ...input, preparation: 'A velo', factor: 120 });
		expect(withPrep.equivalences).toHaveLength(2);
		expect(withPrep.equivalences.find((e) => e.preparation)?.preparation).toBe('a velo');
		const removed = await curator.client.catalogue.removeEquivalence({ ingredientId: view.ingredientId, equivalenceId: set.equivalences[0]!.id });
		expect(removed).toMatchObject({ version: 5 });
		expect(removed.equivalences).toHaveLength(1);
		expect(await curator.client.catalogue.removeEquivalence({ ingredientId: view.ingredientId, equivalenceId: set.equivalences[0]!.id })).toEqual(removed);
		expect((await errorOf(curator.client.catalogue.setEquivalence({ ...input, source: '   ' }))).code).toBe('invalid');
		const [history] = await db()`select content from app.ingredient_versions where ingredient_id = ${view.ingredientId} and version = 5`;
		expect(history!.content.equivalences).toHaveLength(1);
	});

	it('finds ingredients by name, synonym and variety, and lists varieties', async () => {
		const curator = await c.curator();
		const tag = crypto.randomUUID().slice(0, 6);
		const tomato = await curator.client.catalogue.createIngredient({
			id: crypto.randomUUID(),
			name: { 'it-IT': `Pomodori ${tag}`, 'en-GB': 'Tomatoes' },
			department: 'produce',
			isPantry: false,
			synonyms: { 'it-IT': [`pelati${tag}`], 'en-GB': [] },
		});
		const { recipeId } = await seedPublishedRecipe(c.actors.db, { name: 'Insalata', baseServings: 2, lines: [{ ingredientId: tomato.ingredientId, quantity: grams(300) }] });
		// seedPublishedRecipe writes the version, not the projected lines: add the line as a publication would.
		await db()`insert into app.recipe_ingredients (recipe_id, position, ingredient_id, variety, variety_key, quantity_kind, quantity, unit, source_text, is_optional, is_primary)
			values (${recipeId}, 0, ${tomato.ingredientId}, ${db().json({ 'it-IT': `cuore di bue ${tag}`, 'en-GB': 'oxheart' })}, ${`cuore di bue ${tag}`}, 'amount', 300, 'g', 'x', false, false)`;
		expect(dataOf(await curator.client.catalogue.searchIngredients({ text: `bue ${tag}` })).items).toContainEqual(
			expect.objectContaining({ ingredientId: tomato.ingredientId, matched: 'variety' }),
		);
		expect(dataOf(await curator.client.catalogue.searchIngredients({ text: `pelati${tag}` })).items[0]).toMatchObject({ ingredientId: tomato.ingredientId, matched: 'synonym' });
		expect(dataOf(await curator.client.catalogue.listVarieties({ ingredientId: tomato.ingredientId })).varieties).toEqual([
			{ variety: { 'it-IT': `cuore di bue ${tag}`, 'en-GB': 'oxheart' }, uses: 1 },
		]);
		const hints = await curator.client.catalogue.checkVariety({ ingredientId: tomato.ingredientId, text: 'Pomodoro Cuore di bue', locale: 'it-IT' });
		expect(hints.hints.length).toBeGreaterThan(0);
	});

	it('creates books once and lists them', async () => {
		const curator = await c.curator();
		const id = crypto.randomUUID();
		const book = await curator.client.catalogue.createBook({ id, title: 'Basta un wok' });
		expect(await curator.client.catalogue.createBook({ id, title: 'Altro' })).toEqual(book);
		expect(book.slug).toMatch(/^basta-un-wok/);
		expect(dataOf(await curator.client.catalogue.listBooks({})).books).toContainEqual({ ...book, archived: false });
	});
});

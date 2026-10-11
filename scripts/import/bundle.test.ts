import { describe, expect, it } from 'vitest';
import { checkDraft, checkPublishable } from '../../domain/src/recipe/index.ts';
import { buildBundle } from './bundle.ts';
import { attributesFor, bundleLookup, inputsWith, originRecipe } from './test-fixtures.ts';

const wok = originRecipe({ id: 'wok', nome: 'Wok', tipo: 'libro', libro: { titolo: 'Basta un Wok', pagine: '76-77' }, ingredienti: [{ nome: 'Cipolla a dadini', quantita: '1' }] });
const args = (over: Partial<Parameters<typeof buildBundle>[0]> = {}) => ({
	origin: [originRecipe(), wok],
	attributes: new Map([['pasta-tonno', attributesFor()], ['wok', attributesFor({ primaryIngredient: null })]]),
	inputs: inputsWith(),
	existing: { recipes: [], ingredients: [], books: [] },
	importDate: '2026-10-12',
	generatedAt: '2026-10-12T10:00:00Z',
	...over
});

describe('buildBundle', () => {
	it('marks recipes publishable or draft and keeps every draft valid as a draft', () => {
		const { bundle } = buildBundle(args());
		expect(bundle.recipes.map((r) => [r.origin.slug, r.status])).toEqual([['pasta-tonno', 'publishable'], ['wok', 'draft']]);
		expect(bundle.recipes[1].issues.map((i) => i.path.join('.'))).toContain('name.en-GB');
		for (const r of bundle.recipes) expect(checkDraft(r.document, bundleLookup(bundle))).toEqual([]);
		expect(bundle.books).toEqual([{ slug: 'basta-un-wok', title: 'Basta un Wok' }]);
	});
	it('keeps an unresolved line through JSON and the draft save, and blocks publication', () => {
		const origin = [originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }, { nome: 'Sconosciuto', quantita: '1' }] })];
		const { bundle } = buildBundle(args({ origin }));
		const saved = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
		const draft = saved.recipes[0];
		expect(draft.status).toBe('draft');
		expect(checkDraft(draft.document, bundleLookup(saved))).toEqual([]);
		expect(checkPublishable(draft.document, bundleLookup(saved))).toEqual([{ code: 'required', path: ['ingredients', 2, 'ingredientId'] }]);
		expect(draft.document.ingredients?.[2].sourceText).toBe('Sconosciuto: 1');
	});
	it('keeps duplicate lines and blocks publication', () => {
		const origin = [originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: 'Pasta corta', quantita: '30 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }] })];
		const { bundle } = buildBundle(args({ origin }));
		expect(bundle.recipes[0].status).toBe('draft');
		expect(bundle.recipes[0].issues).toEqual([{ code: 'duplicate_ingredient', path: ['ingredients', 1, 'ingredientId'] }]);
	});
	it('skips what the database already has and still resolves its ingredients', () => {
		const { bundle, skipped } = buildBundle(args({ existing: { recipes: ['pasta-tonno'], ingredients: ['cipolle', 'tonno'], books: ['basta-un-wok'] } }));
		expect(skipped).toEqual(['pasta-tonno']);
		expect(bundle.recipes.map((r) => r.origin.slug)).toEqual(['wok']);
		expect(bundle.ingredients.map((i) => i.slug)).toEqual(['pasta-corta']);
		expect(bundle.books).toEqual([]);
		expect(bundle.recipes[0].issues.map((i) => i.code)).not.toContain('unknown_ingredient');
		expect(bundle.family.ratings.map((r) => r.originSlug)).toEqual(['wok']);
	});
	it('lists the files still to review', () => {
		expect(buildBundle(args({ inputs: inputsWith({ pendingReview: ['ingredients.yaml'] }) })).bundle.pendingReview).toEqual(['ingredients.yaml']);
	});
	it('is stable across runs', () => {
		expect(JSON.stringify(buildBundle(args()).bundle)).toBe(JSON.stringify(buildBundle(args()).bundle));
	});
});

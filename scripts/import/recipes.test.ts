import { describe, expect, it } from 'vitest';
import { checkDraft, checkPublishable } from '../../domain/src/recipe/index.ts';
import type { UnitEquivalence } from '../../domain/src/units/index.ts';
import { buildRecipe } from './recipes.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

const inputs = inputsWith();
const lookup = {
	hasIngredient: (id: string) => inputs.ingredients.some((x) => x.slug === id),
	ingredientHasEnglishName: () => true,
	hasBook: (id: string) => id === 'basta-un-wok'
};
const kinds = (r: ReturnType<typeof buildRecipe>) => r.findings.map((f) => f.kind);
const publication = (r: ReturnType<typeof buildRecipe>) => checkPublishable(r.document, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const noPrimary = attributesFor({ primaryIngredient: null });
const cup = (over: Partial<UnitEquivalence>): UnitEquivalence => ({ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: null, source: 'Fonte', ...over });

describe('buildRecipe', () => {
	it('builds a publishable document for a home recipe with verified lines', () => {
		const built = buildRecipe(originRecipe(), attributesFor(), inputs);
		expect(built.origin).toEqual({ slug: 'pasta-tonno', type: 'casa' });
		expect(built.document).toMatchObject({ sourceType: 'home', sourceUrl: null, durationMinutes: 20, baseServings: 4, name: { 'it-IT': 'Pasta al tonno', 'en-GB': 'Tuna pasta' } });
		expect(built.document.ingredients?.[1]).toMatchObject({ ingredientId: 'tonno', quantity: { kind: 'to_taste' }, sourceText: "Tonno sott'olio: q.b.", isPrimary: true });
		expect(publication(built)).toEqual([]);
		expect(built.findings).toEqual([]);
	});
	it('imports a home recipe with a URL as web and reports it (R4b)', () => {
		const built = buildRecipe(originRecipe({ url: 'https://www.fattoincasadabenedetta.it/x', note: "URL fornito dall'utente. Con il frullatore a immersione della famiglia." }), attributesFor(), inputs);
		expect(built.document).toMatchObject({ sourceType: 'web', sourceUrl: 'https://www.fattoincasadabenedetta.it/x' });
		expect(built.origin.type).toBe('casa');
		expect(kinds(built)).toContain('home_with_url');
	});
	it('maps books by title slug and pages', () => {
		const built = buildRecipe(originRecipe({ tipo: 'libro', libro: { titolo: 'Basta un Wok', pagine: '76-77' }, dipendenze_libro: ['p. 24'] }), attributesFor(), inputs);
		expect(built.document).toMatchObject({ sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' });
		expect(kinds(built)).toContain('book_dependency');
	});
	it('keeps unmapped lines as unresolved lines, without approximate matching', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: 'pasta  Corta', quantita: '10 g' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[1]).toEqual({ ingredientId: null, variety: null, preparation: null, quantity: { kind: 'amount', value: 10, unit: 'g' }, sourceText: 'pasta  Corta: 10 g', isOptional: false, isPrimary: false });
		expect(built.findings).toContainEqual({ kind: 'unmapped_line', detail: 'pasta  Corta' });
		expect(checkDraft(built.document, lookup)).toEqual([]);
		expect(publication(built)).toEqual(['required:ingredients.1.ingredientId']);
	});
	it('keeps the primary ingredient on an unresolved line', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno all'olio", quantita: 'q.b.' }] }), attributesFor({ primaryIngredient: 'tonno-all-olio' }), inputs);
		expect(built.document.ingredients?.[1]).toMatchObject({ ingredientId: null, isPrimary: true });
	});
	it('keeps both lines when two map to the same ingredient and variety', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '1 vaschetta da 250 g' }, { nome: 'Pasta corta', quantita: 'un piccolo pezzo' }] }), noPrimary, inputs);
		expect(built.document.ingredients).toHaveLength(2);
		expect(built.document.ingredients?.[0].quantity).toEqual({ kind: 'text', text: { 'it-IT': '1 vaschetta da 250 g', 'en-GB': '1 punnet (250 g)' } });
		expect(kinds(built)).toContain('duplicate_after_mapping');
		expect(publication(built)).toEqual(['duplicate_ingredient:ingredients.1.ingredientId', 'translation_missing:ingredients.1.quantity.text.en-GB']);
	});
	it('keeps a recipe without lines, servings or attributes as a draft with what it has', () => {
		const built = buildRecipe(originRecipe({ ingredienti: null, porzioni_base: null }), undefined, inputs);
		expect(built.document.ingredients).toEqual([]);
		expect(kinds(built)).toContain('missing_attributes');
		expect(publication(built)).toEqual([
			'required:baseServings', 'required:mealType', 'required:proteinGroup', 'required:isFreshFish', 'required:carbohydrateGroup',
			'required:category', 'required:hasVegetables', 'required:isHeavy', 'required:ingredients'
		]);
	});
	it('converts US cups only with an equivalence of the same preparation or of none', () => {
		const lines = [{ nome: 'Cipolla a dadini', quantita: '1/2 cup (circa 1/2 cipolla media)' }];
		const build = (equivalences: UnitEquivalence[]) => buildRecipe(originRecipe({ ingredienti: lines }), noPrimary, inputsWith({ equivalences }));
		const without = build([]);
		expect(without.document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
		expect(kinds(without)).toEqual(expect.arrayContaining(['quantity_note', 'cup_without_equivalence']));
		expect(build([cup({ preparation: 'a dadini' })]).document.ingredients?.[0]).toMatchObject({ quantity: { kind: 'amount', value: 0.5, unit: 'piece' }, sourceText: 'Cipolla a dadini: 1/2 cup (circa 1/2 cipolla media)' });
		expect(build([cup({ preparation: null, toUnit: 'g', factor: 160 })]).document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 80, unit: 'g' });
		expect(build([cup({ preparation: 'tritata' })]).document.ingredients?.[0].quantity).toEqual({ kind: 'amount', value: 0.5, unit: 'us_cup' });
	});
	it('reports quantities with notes, also when they stay text', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '145 g crudo (330 g cotto)' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[0].quantity).toEqual({ kind: 'text', text: { 'it-IT': '145 g crudo (330 g cotto)', 'en-GB': '' } });
		expect(built.findings).toContainEqual({ kind: 'quantity_note', detail: 'Pasta corta: 145 g crudo (330 g cotto)' });
	});
	it('reports an ambiguous number and keeps it as text', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '1.000 g' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[0].quantity).toEqual({ kind: 'text', text: { 'it-IT': '1.000 g', 'en-GB': '' } });
		expect(built.findings).toContainEqual({ kind: 'quantity_note', detail: 'Pasta corta: 1.000 g' });
	});
	it('reports alternatives in names, mapping notes and pantry items excluded in the origin', () => {
		const pantry = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }], note: 'Olio, sale e pepe esclusi.' }), noPrimary, inputs);
		expect(kinds(pantry)).toContain('pantry_excluded');
		const noted = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }] }), noPrimary, inputsWith({ lines: new Map([['Pasta corta', { ingredient: 'pasta-corta', variety: null, preparation: null, optional: false, note: 'o Pasta lunga' }]]) }));
		expect(kinds(noted)).toContain('mapping_note');
		expect(kinds(buildRecipe(originRecipe({ ingredienti: [{ nome: 'Cipolla', quantita: '1' }] }), noPrimary, inputs))).not.toContain('alternative_in_name');
		expect(kinds(buildRecipe(originRecipe({ ingredienti: [{ nome: 'Cipolla (o 1 cipollotto)', quantita: '1' }] }), noPrimary, inputs))).toContain('alternative_in_name');
	});
	it('marks optional lines from the mapping or the quantity text', () => {
		const built = buildRecipe(originRecipe({ ingredienti: [{ nome: 'Pasta corta', quantita: 'per servire, facoltativo' }] }), noPrimary, inputs);
		expect(built.document.ingredients?.[0].isOptional).toBe(true);
	});
	it('leaves English recipe texts empty without a translation', () => {
		const built = buildRecipe(originRecipe({ id: 'altra' }), attributesFor(), inputs);
		expect(built.document.name).toEqual({ 'it-IT': 'Pasta al tonno', 'en-GB': '' });
	});
});

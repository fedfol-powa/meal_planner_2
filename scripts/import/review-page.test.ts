import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle.ts';
import { renderReviewPage } from './review-page.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

describe('review page', () => {
	const { bundle } = buildBundle({
		origin: [originRecipe({ nome: 'Pasta <al> tonno', ingredienti: [{ nome: 'Pasta corta', quantita: '320 g' }, { nome: "Tonno sott'olio", quantita: 'q.b.' }, { nome: 'Zenzero', quantita: '1' }] })],
		attributes: new Map([['pasta-tonno', attributesFor()]]),
		inputs: inputsWith(),
		existing: { recipes: [], ingredients: [], books: [] },
		importDate: '2026-10-12',
		generatedAt: '2026-10-12T10:00:00Z'
	});
	const html = renderReviewPage(bundle, inputsWith().ingredients);
	it('is a standalone Italian page', () => {
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<html lang="it">');
		expect(html).not.toMatch(/<script|<link/);
	});
	it('shows both languages, the source line and the mapping, escaped', () => {
		expect(html).toContain('Pasta &lt;al&gt; tonno');
		expect(html).toContain('Tuna pasta');
		expect(html).toContain('Tonno sott&#39;olio: q.b.');
		expect(html).toContain('Short pasta');
		expect(html).toContain('in oil');
	});
	it('marks unresolved lines', () => {
		expect(html).toContain('Zenzero: 1');
		expect(html).toContain('da mappare');
	});
	it('names ingredients already in the database from the full catalogue, listing only the new ones to insert', () => {
		const rerun = buildBundle({
			origin: [originRecipe()],
			attributes: new Map([['pasta-tonno', attributesFor()]]),
			inputs: inputsWith(),
			existing: { recipes: [], ingredients: ['tonno'], books: [] },
			importDate: '2026-10-12',
			generatedAt: '2026-10-12T10:00:00Z'
		}).bundle;
		const page = renderReviewPage(rerun, inputsWith().ingredients);
		expect(page).toContain('Tuna');
		const toInsert = page.slice(page.indexOf('Ingredienti da inserire'));
		expect(toInsert).toContain('<code>pasta-corta</code>');
		expect(toInsert).not.toContain('<code>tonno</code>');
	});
});

import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle.ts';
import { renderReport } from './report.ts';
import { attributesFor, inputsWith, originRecipe } from './test-fixtures.ts';

const result = buildBundle({
	origin: [
		originRecipe({ url: 'https://example.it/p', note: "URL fornito dall'utente. Olio, sale e pepe esclusi.", storico: [{ settimana: '2026-09-28', pasto: 'mar-pranzo', cucinata: false }] }),
		originRecipe({ id: 'senza', ingredienti: null, porzioni_base: null, collaudata: true }),
		originRecipe({ id: 'farro', ingredienti: [{ nome: 'Pasta corta', quantita: '145 g crudo (330 g cotto)' }, { nome: 'Sconosciuto', quantita: '1' }] })
	],
	attributes: new Map([['pasta-tonno', attributesFor()], ['senza', attributesFor({ primaryIngredient: null })], ['farro', attributesFor({ primaryIngredient: null })]]),
	inputs: inputsWith({ pendingReview: ['ingredients.yaml'] }),
	existing: { recipes: [], ingredients: [], books: [] },
	importDate: '2026-10-12',
	generatedAt: '2026-10-12T10:00:00Z'
});

describe('ambiguity report', () => {
	const text = renderReport(result, { archivedCount: 3 });
	it('has one section per cause, in Italian', () => {
		for (const heading of ['## File da rivedere', '## Ricette in bozza', '## Righe da mappare', '## Ricette di casa con URL (R4)', '## Ricette provate senza data (R4)', '## Storico non importato o senza esito', "## Ingredienti di dispensa esclusi nell'origine", '## Quantità con note', '## Archivio'])
			expect(text).toContain(heading);
	});
	it('names the recipes and the reasons', () => {
		expect(text).toContain('`senza`');
		expect(text).toContain('Porzioni');
		expect(text).toContain('`farro`: Sconosciuto');
		expect(text).toContain('Pasta corta: 145 g crudo (330 g cotto)');
		expect(text).toContain('family_tried_recipes');
		expect(text).toContain('mar-pranzo');
		expect(text).toContain('3 schede');
		expect(text).toContain('ingredients.yaml');
	});
});

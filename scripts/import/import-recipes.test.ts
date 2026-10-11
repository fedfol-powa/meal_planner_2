import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { runImport } from './import-recipes.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function setup() {
	const root = mkdtempSync(join(tmpdir(), 'import-root-'));
	const origin = mkdtempSync(join(tmpdir(), 'import-origin-'));
	dirs.push(root, origin);
	mkdirSync(join(root, 'scripts/import'), { recursive: true });
	mkdirSync(join(origin, 'ricettario'), { recursive: true });
	const card = (id: string) => ({ id, nome: id, descrizione: 'Descrizione.', tipo: 'casa', url: null, tempo: '20 min', porzioni_base: 2, ingredienti: [{ nome: 'Ceci', quantita: '200 g' }], collaudata: false, feedback: null, tag: [], storico: [], note: null });
	// "vecchia" is already in the database and was edited in the origin: its primary ingredient no longer
	// matches its lines. It must not stop the import of "nuova".
	writeFileSync(join(origin, 'ricettario/ricette.yaml'), stringify({ ricette: [card('vecchia'), card('nuova')] }));
	const attributes = (primary: string) => ({ meal_type: 'both', protein_group: 'legumes', fresh_fish: false, carbohydrate_group: 'none', category: 'soup', has_vegetables: false, is_heavy: false, seasons: [], primary_ingredient: primary, uncertain: [], note: null });
	writeFileSync(join(root, 'scripts/import/recipe-attributes.yaml'), stringify({ recipes: { vecchia: attributes('lenticchie'), nuova: attributes('ceci') } }));
	writeFileSync(join(root, 'scripts/import/ingredients.yaml'), stringify({ ingredients: { ceci: { name: { 'it-IT': 'Ceci', 'en-GB': 'Chickpeas' }, department: 'tinned', pantry: false } } }));
	writeFileSync(join(root, 'scripts/import/ingredient-lines.yaml'), stringify({ lines: { Ceci: { ingredient: 'ceci', variety: null, preparation: null, optional: false } } }));
	writeFileSync(join(root, 'scripts/import/translations.en-GB.yaml'), stringify({ recipes: { nuova: { name: 'New', description: 'Description.' } }, quantities: {} }));
	writeFileSync(join(root, 'scripts/import/unit-equivalences.yaml'), stringify({ equivalences: [] }));
	const existingFile = join(root, 'existing.json');
	writeFileSync(existingFile, JSON.stringify({ recipes: ['vecchia'], ingredients: [], books: [] }));
	return { root, origin, existingFile };
}

describe('import command', () => {
	it('imports a new card even when an already imported card changed in the origin', () => {
		const { root, origin, existingFile } = setup();
		const { result, files } = runImport({ root, originDirectory: origin, existingFile, today: '2026-10-12', now: new Date('2026-10-12T10:00:00Z') });
		expect(result.skipped).toEqual(['vecchia']);
		expect(result.bundle.recipes.map((r) => [r.origin.slug, r.status])).toEqual([['nuova', 'publishable']]);
		expect(Object.keys(files).sort()).toEqual(['bundle.json', 'report.md', 'review.html']);
	});
	it('stops on a primary ingredient error of a card that is not in the database', () => {
		const { root, origin } = setup();
		expect(() => runImport({ root, originDirectory: origin, today: '2026-10-12' })).toThrow(/vecchia: primary_ingredient/);
	});
	it('refuses an invalid --today before reading anything', () => {
		expect(() => runImport({ root: '/nonexistent', today: '2026-02-30' })).toThrow(/Invalid import date/);
	});
});

import { describe, expect, it } from 'vitest';
import { approvalOf, approveText, contentHash, parseEquivalences, parseIngredients, parseLines, parseTranslations } from './inputs.ts';

const ingredientsYaml = `ingredients:
  pomodori:
    name: { it-IT: Pomodori, en-GB: Tomatoes }
    synonyms: { it-IT: [pomodoro], en-GB: [tomato] }
    department: produce
    pantry: false
`;

describe('approval bound to the content', () => {
	it('records date and hash, and stays valid while the content is unchanged', () => {
		const approved = approveText(ingredientsYaml, '2026-10-12');
		expect(approved.split('\n')[0]).toBe(`# Revisione: 2026-10-12, rivisto dall'utente, sha256:${contentHash(ingredientsYaml)}`);
		expect(approvalOf(approved)).toEqual({ date: '2026-10-12', valid: true });
		expect(approvalOf(approveText(approved, '2026-10-13'))).toEqual({ date: '2026-10-13', valid: true });
	});
	it('becomes invalid after any change and is missing without the line', () => {
		const changed = `${approveText(ingredientsYaml, '2026-10-12')}  peperoni:\n    name: { it-IT: Peperoni, en-GB: Peppers }\n`;
		expect(approvalOf(changed)).toEqual({ date: '2026-10-12', valid: false });
		expect(approvalOf(ingredientsYaml)).toEqual({ date: null, valid: false });
	});
});

describe('import inputs', () => {
	it('reads the ingredient catalogue', () => {
		const { ingredients, errors } = parseIngredients(ingredientsYaml);
		expect(errors).toEqual([]);
		expect(ingredients).toEqual([{ slug: 'pomodori', name: { 'it-IT': 'Pomodori', 'en-GB': 'Tomatoes' }, synonyms: { 'it-IT': ['pomodoro'], 'en-GB': ['tomato'] }, department: 'produce', isPantry: false }]);
		expect(parseIngredients('ingredients:\n  x:\n    name: { it-IT: X }\n').errors[0]).toMatch(/^x:/);
	});
	it('reads line mappings and refuses unknown ingredients', () => {
		const text = `lines:
  "Pomodoro a dadini (varietà Roma)":
    ingredient: pomodori
    variety: { it-IT: Roma, en-GB: Roma }
    preparation: { it-IT: a dadini, en-GB: diced }
    optional: false
  "Cetriolo":
    ingredient: cetrioli
    variety: null
    preparation: null
    optional: false
`;
		const { lines, errors } = parseLines(text, new Set(['pomodori']));
		expect(lines.get('Pomodoro a dadini (varietà Roma)')).toEqual({ ingredient: 'pomodori', variety: { 'it-IT': 'Roma', 'en-GB': 'Roma' }, preparation: { 'it-IT': 'a dadini', 'en-GB': 'diced' }, optional: false, note: null });
		expect(errors).toEqual(['Cetriolo: unknown ingredient "cetrioli"']);
	});
	it('reads translations', () => {
		const t = parseTranslations('recipes:\n  pasta-tonno: { name: Tuna pasta, description: Dress the pasta. }\nquantities:\n  "1 mazzetto": "1 bunch"\n');
		expect(t.errors).toEqual([]);
		expect(t.recipes.get('pasta-tonno')).toEqual({ name: 'Tuna pasta', description: 'Dress the pasta.' });
		expect(t.quantities.get('1 mazzetto')).toBe('1 bunch');
	});
	it('reads recipe equivalences with an optional preparation, normalised', () => {
		const e = parseEquivalences('equivalences:\n  - { ingredient: cipolle, from: us_cup, to: piece, factor: 1, preparation: A dadini, source: "Fonte: 1/2 cup = 1/2 cipolla" }\n  - { ingredient: cipolle, from: us_cup, to: g, factor: 160, source: "Tabella" }\n', new Set(['cipolle']));
		expect(e.errors).toEqual([]);
		expect(e.equivalences).toEqual([
			{ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'piece', factor: 1, scope: 'recipe', preparation: 'a dadini', source: 'Fonte: 1/2 cup = 1/2 cipolla' },
			{ ingredientId: 'cipolle', fromUnit: 'us_cup', toUnit: 'g', factor: 160, scope: 'recipe', preparation: null, source: 'Tabella' }
		]);
		expect(parseEquivalences('equivalences:\n  - { ingredient: x, from: us_cup, to: piece, factor: 0, source: "" }\n', new Set()).errors.length).toBeGreaterThan(0);
		const twice = '  - { ingredient: cipolle, from: us_cup, to: g, factor: 1, source: a }\n';
		expect(parseEquivalences(`equivalences:\n${twice}${twice}`, new Set(['cipolle'])).errors.length).toBeGreaterThan(0);
	});
});

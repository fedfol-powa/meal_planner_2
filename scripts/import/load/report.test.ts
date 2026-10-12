import { describe, expect, it } from 'vitest';
import { emptyFamilyResult } from './family.ts';
import { loadSummary, renderLoadReport } from './report.ts';

const result = {
	mode: 'dry-run' as const,
	catalogue: { books: { created: 1, present: 0 }, ingredients: { created: 148, present: 0 }, equivalences: { created: 2, present: 1, diverging: ['farina: tazza→g 120 (in the database tazza→g 125)'] },
		recipes: { published: 0, drafts: 56, present: 0 }, publicationBlocked: ['ingredients.yaml'] },
	family: { ...emptyFamilyResult(), ownedBooks: ['Basta un Wok'], ratings: { created: 0, present: 0, pending: ['riso-cantonese-casa'] },
		duplicates: [{ date: '2026-09-01', mealType: 'lunch' as const, originSlug: 'b' }],
		preferences: [{ originSlug: 'gamberi-zucchine-skottle', name: 'Gamberi', note: 'non proporla nelle cene per 4' }] },
	baseline: null,
	importReport: "# Report dell'import del ricettario\n\n## Ricette di casa con URL (R4)\n\n- `x`: url\n\n## Ricette provate senza data (R4)\n\n- `y`\n",
};
describe('renderLoadReport', () => {
	it('opens with mode, inputs and blocked publication, and lists what needs a look', () => {
		const text = renderLoadReport(result, { endpoint: 'app_server.lronuqvtjdhfyychnscr@pooler:5432/postgres', inputs: 'abcd1234abcd1234' });
		expect(text.split('\n').slice(0, 8).join('\n')).toMatch(/dry-run[\s\S]*abcd1234abcd1234[\s\S]*ingredients\.yaml/);
		for (const s of ['riso-cantonese-casa', 'Basta un Wok', 'farina', 'Preferenze da sistemare a mano', 'gamberi-zucchine-skottle', '`b`'])
			expect(text).toContain(s);
		expect(text).toContain('Ricette di casa con URL (R4)'); // the import report is embedded
		expect(text).toContain('Ricette provate senza data (R4)');
		expect(text).not.toMatch(/postgres(ql)?:\/\//);
	});
	it('summarises in one line', () => {
		expect(loadSummary(result)).toMatch(/^dry-run: 148 ingredients, 0 published, 56 drafts/);
	});
});

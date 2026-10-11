import { describe, expect, it } from 'vitest';
import { cleanDraft } from './clean.ts';

describe('cleanDraft', () => {
	it('trims texts and varieties without touching numbers or unresolved lines', () => {
		const cleaned = cleanDraft({
			schemaVersion: 1,
			name: { 'it-IT': ' Zuppa ', 'en-GB': null },
			sourceUrl: ' https://example.org/z ',
			ingredients: [
				{ ingredientId: 'ceci', variety: { 'it-IT': ' neri  di Murgia ', 'en-GB': 'black' }, preparation: { 'it-IT': ' lessati' }, quantity: { kind: 'text', text: { 'it-IT': ' 1 barattolo ' } }, sourceText: ' Ceci: 1 barattolo ', isOptional: false, isPrimary: false },
				{ ingredientId: null, variety: null, preparation: null, quantity: { kind: 'amount', value: 2, unit: 'piece' }, sourceText: 'Zenzero: 2', isOptional: false, isPrimary: false }
			]
		});
		expect(cleaned.name).toEqual({ 'it-IT': 'Zuppa', 'en-GB': null });
		expect(cleaned.sourceUrl).toBe('https://example.org/z');
		expect(cleaned.ingredients?.[0]).toMatchObject({ variety: { 'it-IT': 'neri di Murgia', 'en-GB': 'black' }, preparation: { 'it-IT': 'lessati' }, quantity: { kind: 'text', text: { 'it-IT': '1 barattolo' } }, sourceText: 'Ceci: 1 barattolo' });
		expect(cleaned.ingredients?.[1]).toMatchObject({ ingredientId: null, quantity: { kind: 'amount', value: 2, unit: 'piece' } });
	});
});

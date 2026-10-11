import { describe, expect, it } from 'vitest';
import { checkPublishable, toPublished } from './check.ts';
import { lookup, publishedExample } from './test-fixtures.ts';

const codes = (over: object) => checkPublishable({ ...publishedExample, ...over }, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const line = (over: object) => ({ ...publishedExample.ingredients[0], ...over });
const withLine = (over: object) => codes({ ingredients: [line(over)] });
const withLines = (...lines: object[]) => codes({ ingredients: lines.map(line) });
const without = (key: string) => Object.fromEntries(Object.entries(publishedExample).filter(([k]) => k !== key));

describe('checkPublishable', () => {
	it('passes a complete document and narrows its type', () => {
		expect(codes({})).toEqual([]);
		expect(toPublished(publishedExample).name['en-GB']).toBe('Tuna pasta');
	});
	it('needs both languages; blank text counts as missing', () => {
		expect(codes({ name: { 'it-IT': 'Pasta', 'en-GB': '  ' } })).toEqual(['translation_missing:name.en-GB']);
		expect(codes({ description: null })).toEqual(['required:description']);
		expect(codes({ description: { 'en-GB': 'x' } })).toEqual(['translation_missing:description.it-IT']);
	});
	it('applies the rules of each source type', () => {
		expect(codes({ sourceType: 'web' })).toEqual(['required:sourceUrl']);
		expect(codes({ sourceType: 'youtube', sourceUrl: 'https://youtu.be/a', bookPages: '3' })).toEqual(['not_applicable:bookPages']);
		expect(codes({ sourceType: 'book' })).toEqual(['required:bookId', 'required:bookPages']);
		expect(codes({ sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' })).toEqual([]);
		expect(codes({ sourceType: 'home', sourceUrl: 'https://a.it' })).toEqual(['not_applicable:sourceUrl']);
		expect(codes({ sourceType: null })).toEqual(['required:sourceType']);
	});
	it('needs duration, servings and planner attributes, not seasons', () => {
		expect(codes({ durationMinutes: null, baseServings: undefined })).toEqual(['required:durationMinutes', 'required:baseServings']);
		expect(codes({ category: null, isHeavy: undefined, seasons: undefined })).toEqual(['required:category', 'required:isHeavy']);
		expect(codes({ proteinGroup: 'eggs', isFreshFish: true })).toEqual(['invalid_value:isFreshFish']);
	});
	it('checks every ingredient line', () => {
		expect(codes({ ingredients: [] })).toEqual(['required:ingredients']);
		expect(withLine({ ingredientId: null })).toEqual(['required:ingredients.0.ingredientId']);
		expect(withLine({ sourceText: ' ' })).toEqual(['required:ingredients.0.sourceText']);
		expect(withLine({ quantity: { kind: 'amount', value: null, unit: 'g' } })).toEqual(['required:ingredients.0.quantity.value']);
		expect(withLine({ quantity: { kind: 'amount', value: 1, unit: 'us_cup' } })).toEqual(['unit_not_publishable:ingredients.0.quantity.unit']);
		expect(withLine({ quantity: { kind: 'text', text: { 'it-IT': '1 mazzetto' } } })).toEqual(['translation_missing:ingredients.0.quantity.text.en-GB']);
		expect(withLine({ quantity: { kind: 'text', text: {} } })).toEqual(['required:ingredients.0.quantity.text']);
		expect(withLine({ variety: { 'it-IT': 'Roma' } })).toEqual(['translation_missing:ingredients.0.variety.en-GB']);
		expect(withLine({ variety: { 'it-IT': ' ', 'en-GB': '' } })).toEqual([]);
		expect(withLine({ preparation: { 'en-GB': 'diced' } })).toEqual(['translation_missing:ingredients.0.preparation.it-IT']);
		expect(withLine({ ingredientId: 'pomodori' })).toEqual(['translation_missing:ingredients.0.ingredientId']);
	});
	it('finds duplicates only among lines whose variety identity is known', () => {
		const tuna = (variety: object | null) => ({ ingredientId: 'tonno', variety });
		expect(withLines(tuna(null), tuna(null))).toEqual(['duplicate_ingredient:ingredients.1.ingredientId']);
		expect(withLines(tuna({ 'it-IT': 'tipo Roma', 'en-GB': 'Roma' }), tuna({ 'it-IT': 'roma', 'en-GB': 'roma' }))).toEqual(['duplicate_ingredient:ingredients.1.ingredientId']);
		expect(withLines(tuna({ 'en-GB': 'red' }), tuna({ 'en-GB': 'green' }))).toEqual([
			'translation_missing:ingredients.0.variety.it-IT',
			'translation_missing:ingredients.1.variety.it-IT'
		]);
		expect(withLines(tuna({ 'it-IT': 'Roma', 'en-GB': 'Roma' }), tuna({ 'en-GB': 'Roma' }))).toEqual(['translation_missing:ingredients.1.variety.it-IT']);
		expect(withLines(tuna(null), tuna({ 'en-GB': 'red' }))).toEqual(['translation_missing:ingredients.1.variety.it-IT']);
		expect(withLines({ ingredientId: null }, { ingredientId: null })).toEqual(['required:ingredients.0.ingredientId', 'required:ingredients.1.ingredientId']);
	});
	it('keeps the draft refusals', () => {
		expect(codes({ sourceType: 'web', sourceUrl: 'nope' })).toEqual(['invalid_url:sourceUrl']);
	});
	it('converts every document without publication problems (invariant)', () => {
		const lineWithout = (key: string) => ({ ...publishedExample, ingredients: [Object.fromEntries(Object.entries(publishedExample.ingredients[0]).filter(([k]) => k !== key))] });
		const variants = [
			publishedExample,
			without('sourceUrl'), without('bookId'), without('bookPages'), without('seasons'),
			lineWithout('variety'), lineWithout('preparation'),
			{ ...publishedExample, ingredients: [line({ variety: { 'it-IT': ' ' }, preparation: {} })] },
			{ ...publishedExample, sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' },
			{ ...publishedExample, sourceType: 'web', sourceUrl: 'https://example.it/r' }
		];
		for (const variant of variants) {
			expect(checkPublishable(variant, lookup)).toEqual([]);
			expect(() => toPublished(variant)).not.toThrow();
		}
		expect(toPublished(without('seasons')).seasons).toEqual([]);
		expect(toPublished(without('sourceUrl')).sourceUrl).toBeNull();
		expect(toPublished(lineWithout('variety')).ingredients[0].variety).toBeNull();
	});
	it('refuses to narrow an incomplete document', () => {
		expect(() => toPublished({ ...publishedExample, durationMinutes: null })).toThrow();
	});
});

import { describe, expect, it } from 'vitest';
import { checkDraft, httpUrlHost } from './check.ts';
import { lookup, publishedExample } from './test-fixtures.ts';

const codes = (input: unknown) => checkDraft(input, lookup).map((i) => `${i.code}:${i.path.join('.')}`);
const line = (over: object) => ({ ...publishedExample.ingredients[0], ...over });
const doc = (ingredients: object[]) => ({ schemaVersion: 1, name: { 'it-IT': 'Z' }, ingredients });

describe('checkDraft', () => {
	it('accepts a complete document and an incomplete draft', () => {
		expect(codes(publishedExample)).toEqual([]);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Zuppa' } })).toEqual([]);
	});
	it('treats absent keys like null', () => {
		expect(codes({ schemaVersion: 1, name: { 'en-GB': 'Soup' }, ingredients: [line({ variety: undefined, preparation: undefined })] })).toEqual([]);
	});
	it('needs a name in at least one language', () => {
		expect(codes({ schemaVersion: 1, name: { 'it-IT': ' ' } })).toEqual(['required:name']);
	});
	it('reads http(s) addresses without the URL global', () => {
		expect(httpUrlHost('https://www.YouTube.com/watch?v=x')).toBe('www.youtube.com');
		expect(httpUrlHost('http://example.it:8080/a')).toBe('example.it');
		expect(httpUrlHost('ftp://a')).toBeNull();
		expect(httpUrlHost('https://exa mple.it')).toBeNull();
		expect(httpUrlHost('nope')).toBeNull();
	});
	it('refuses wrong data', () => {
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'x'.repeat(121) } })).toEqual(['too_long:name.it-IT']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceUrl: 'ftp://a' })).toEqual(['invalid_url:sourceUrl']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceType: 'youtube', sourceUrl: 'https://vimeo.com/1' })).toEqual(['invalid_url:sourceUrl']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceType: 'youtube', sourceUrl: 'https://youtu.be/abc' })).toEqual([]);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, durationMinutes: 0, baseServings: 2.5 })).toEqual(['not_positive_integer:durationMinutes', 'not_positive_integer:baseServings']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, durationMinutes: 1441, baseServings: 101 })).toEqual(['not_positive_integer:durationMinutes', 'not_positive_integer:baseServings']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, bookId: 'altro' })).toEqual(['unknown_book:bookId']);
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, bookPages: '1'.repeat(21) })).toEqual(['too_long:bookPages']);
	});
	it('refuses wrong ingredient lines', () => {
		expect(codes(doc([line({ ingredientId: 'sconosciuto' })]))).toEqual(['unknown_ingredient:ingredients.0.ingredientId']);
		expect(codes(doc([line({ quantity: { kind: 'amount', value: -1, unit: 'g' } })]))).toEqual(['invalid_amount:ingredients.0.quantity.value']);
		expect(codes(doc([line({ isPrimary: true }), line({ ingredientId: 'tonno', isPrimary: true })]))).toEqual(['multiple_primary:ingredients.1.isPrimary']);
		expect(codes(doc([line({ variety: { 'en-GB': 'x'.repeat(41) } })]))).toEqual(['too_long:ingredients.0.variety.en-GB']);
		expect(codes(doc([line({ preparation: { 'it-IT': 'x'.repeat(61) } })]))).toEqual(['too_long:ingredients.0.preparation.it-IT']);
		expect(codes(doc([line({ quantity: { kind: 'text', text: { 'it-IT': 'x'.repeat(41) } } })]))).toEqual(['too_long:ingredients.0.quantity.text.it-IT']);
		expect(codes(doc([line({ sourceText: 'x'.repeat(201) })]))).toEqual(['too_long:ingredients.0.sourceText']);
	});
	it('accepts what only blocks publication: empty amounts, cups, unresolved and duplicate lines', () => {
		expect(codes(doc([line({ quantity: { kind: 'amount', value: null, unit: 'g' } })]))).toEqual([]);
		expect(codes(doc([line({ quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' } })]))).toEqual([]);
		expect(codes(doc([line({ ingredientId: null, sourceText: 'Zenzero fresco: 1 pezzo' })]))).toEqual([]);
		expect(codes(doc([line({ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma' } }), line({ ingredientId: 'pomodori', variety: { 'it-IT': 'roma' } })]))).toEqual([]);
	});
	it('treats blank source fields as empty, not as wrong data', () => {
		expect(codes({ schemaVersion: 1, name: { 'it-IT': 'Z' }, sourceType: 'home', sourceUrl: '   ', bookId: ' ' })).toEqual([]);
	});
	it('returns schema errors as invalid_value', () => {
		expect(codes({ schemaVersion: 1, name: {}, mealType: 'brunch' })).toEqual(['invalid_value:mealType']);
	});
});

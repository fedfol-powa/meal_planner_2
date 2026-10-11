import { describe, expect, it } from 'vitest';
import { cleanVariety, comparableVariety, lineKey, varietyHints } from './variety.ts';

describe('ingredient variety', () => {
	it('keeps the text as written, with single spaces', () => {
		expect(cleanVariety('  cuore  di bue ')).toBe('cuore di bue');
	});
	it('keys a line by ingredient and normalised Italian variety', () => {
		expect(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'tipo Roma' } })).toBe(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'roma' } }));
		expect(lineKey({ ingredientId: 'pomodori', variety: null })).not.toBe(lineKey({ ingredientId: 'pomodori', variety: { 'it-IT': 'Roma' } }));
	});
	it('compares a variety only when its identity is known: none at all, or the Italian text', () => {
		expect(comparableVariety(null)).toBe(true);
		expect(comparableVariety({ 'it-IT': ' ', 'en-GB': '' })).toBe(true);
		expect(comparableVariety({ 'it-IT': 'Roma' })).toBe(true);
		expect(comparableVariety({ 'en-GB': 'red' })).toBe(false);
		expect(comparableVariety({ 'it-IT': null, 'en-GB': 'Roma' })).toBe(false);
	});
	it('suggests the known spelling, the name without the ingredient, and flags preparations', () => {
		const known = [{ 'it-IT': 'cuore di bue', 'en-GB': 'oxheart' }];
		expect(varietyHints({ ingredientName: 'Pomodori', known, text: 'Cuore di Bue', locale: 'it-IT' })).toEqual([{ kind: 'existing_spelling', suggestion: known[0] }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: 'Pomodoro tipo Roma', locale: 'it-IT' })).toEqual([{ kind: 'repeats_ingredient', suggestion: 'Roma' }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: 'a dadini', locale: 'it-IT' })).toEqual([{ kind: 'preparation' }]);
		expect(varietyHints({ ingredientName: 'Pomodori', known: [], text: '  ', locale: 'it-IT' })).toEqual([]);
	});
});

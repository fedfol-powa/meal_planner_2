import { describe, expect, it } from 'vitest';
import { changedFields, sameDocument } from './fields.ts';

describe('changedFields', () => {
	it('lists the top-level keys that differ, in a stable order', () => {
		expect(changedFields({ name: { 'it-IT': 'A' }, durationMinutes: 10, ingredients: [] }, { name: { 'it-IT': 'B' }, durationMinutes: 10, ingredients: [1] }))
			.toEqual(['ingredients', 'name']);
	});
	it('treats a missing key and null as the same', () => {
		expect(changedFields({ sourceUrl: null }, {})).toEqual([]);
		expect(changedFields({ sourceUrl: 'https://a.it' }, {})).toEqual(['sourceUrl']);
	});
	it('ignores key order inside values', () => {
		expect(changedFields({ name: { 'it-IT': 'A', 'en-GB': 'B' } }, { name: { 'en-GB': 'B', 'it-IT': 'A' } })).toEqual([]);
	});
});

describe('sameDocument', () => {
	it('ignores key order but not array order', () => {
		expect(sameDocument({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
		expect(sameDocument({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { emptyDraft, publishedRecipeSchema, recipeDraftSchema } from './document.ts';
import { filled } from './localized.ts';
import { publishedExample } from './test-fixtures.ts';

const firstLine = publishedExample.ingredients[0];

describe('recipe document schema', () => {
	it('accepts a complete document at both levels', () => {
		expect(publishedRecipeSchema.safeParse(publishedExample).success).toBe(true);
		expect(recipeDraftSchema.safeParse(publishedExample).success).toBe(true);
	});
	it('accepts an empty draft and a draft with missing keys', () => {
		expect(recipeDraftSchema.safeParse(emptyDraft()).success).toBe(true);
		expect(recipeDraftSchema.safeParse({ schemaVersion: 1, name: { 'it-IT': 'Zuppa' } }).success).toBe(true);
	});
	it('accepts only in a draft an amount without value, US cups and an unresolved line', () => {
		for (const line of [
			{ ...firstLine, quantity: { kind: 'amount', value: null, unit: 'g' } },
			{ ...firstLine, quantity: { kind: 'amount', value: 0.5, unit: 'us_cup' } },
			{ ...firstLine, ingredientId: null }
		]) {
			const doc = { ...publishedExample, ingredients: [line] };
			expect(recipeDraftSchema.safeParse(doc).success).toBe(true);
			expect(publishedRecipeSchema.safeParse(doc).success).toBe(false);
		}
	});
	it('refuses values outside the vocabularies and unknown keys', () => {
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), proteinGroup: 'meat' }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), sourceType: 'casa' }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), tags: ['x'] }).success).toBe(false);
		expect(recipeDraftSchema.safeParse({ ...emptyDraft(), schemaVersion: 2 }).success).toBe(false);
	});
	it('treats blank text as missing', () => {
		expect(filled('  ')).toBe(false);
		expect(filled(null)).toBe(false);
		expect(filled(' a ')).toBe(true);
	});
});

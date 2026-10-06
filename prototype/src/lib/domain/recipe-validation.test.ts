import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import type { DemoDatabase, RecipeContent } from './types';
import { summarize, validateForPublish, validateForSave } from './recipe-validation';

let db: DemoDatabase;
beforeEach(() => { db = createInitial().db; });

const complete = (): RecipeContent => ({
	name: { 'it-IT': 'Vellutata di zucca', 'en-GB': 'Pumpkin soup' },
	description: { 'it-IT': 'Zucca e brodo frullati.', 'en-GB': 'Pumpkin and stock, blended.' },
	sourceType: 'home',
	sourceUrl: null,
	bookId: null,
	bookPages: null,
	durationMinutes: 40,
	baseServings: 4,
	mealType: 'dinner',
	proteinGroup: 'vegetarian',
	ingredients: [
		{ ingredientId: 'zucca-pulita', quantity: { kind: 'amount', value: 800, unit: 'g' }, sourceText: '800 g', text: null, isOptional: false },
		{ ingredientId: 'brodo-vegetale', quantity: { kind: 'to_taste' }, sourceText: 'q.b.', text: null, isOptional: false }
	]
});

describe('validateForSave', () => {
	it('accepts an incomplete draft with only a name', () => {
		const content = { ...complete(), name: { 'it-IT': 'Zucca', 'en-GB': null }, description: { 'it-IT': '', 'en-GB': null }, durationMinutes: null, baseServings: null, ingredients: [] };
		expect(validateForSave(db, content)).toEqual([]);
	});
	it('refuses data present but invalid', () => {
		const content = complete();
		content.sourceUrl = 'not a url';
		content.baseServings = 0;
		content.ingredients.push({ ...content.ingredients[0] });
		content.ingredients.push({ ingredientId: 'unknown', quantity: { kind: 'amount', value: -1, unit: 'g' }, sourceText: '', text: null, isOptional: false });
		const codes = validateForSave(db, content).map((i) => `${i.field}:${i.code}${i.line ?? ''}`);
		expect(codes).toEqual(['sourceUrl:invalid_url', 'baseServings:not_positive_integer', 'ingredients:duplicate_ingredient2', 'ingredients:unknown_ingredient3', 'ingredients:invalid_amount3']);
	});
	it('needs a name in at least one language', () => {
		expect(validateForSave(db, { ...complete(), name: { 'it-IT': ' ', 'en-GB': null } })).toEqual([{ field: 'name', code: 'required' }]);
	});
});

describe('validateForPublish', () => {
	it('passes a complete recipe', () => {
		expect(validateForPublish(db, complete())).toEqual([]);
	});
	it('requires both languages, source data by type, duration, servings and ingredients', () => {
		const content = { ...complete(), name: { 'it-IT': 'Zucca', 'en-GB': null }, sourceType: 'book' as const, durationMinutes: null, baseServings: null, ingredients: [] };
		const issues = validateForPublish(db, content);
		expect(issues).toEqual(expect.arrayContaining([
			{ field: 'name', code: 'translation_missing', locale: 'en-GB' },
			{ field: 'bookId', code: 'required' },
			{ field: 'bookPages', code: 'required' },
			{ field: 'durationMinutes', code: 'required' },
			{ field: 'baseServings', code: 'required' },
			{ field: 'ingredients', code: 'required' }
		]));
		expect(summarize(issues)).toEqual(['source', 'details', 'baseServings', 'ingredients', 'translation']);
	});
	it('requires a web address for web and YouTube sources', () => {
		expect(validateForPublish(db, { ...complete(), sourceType: 'youtube' })).toEqual([{ field: 'sourceUrl', code: 'required' }]);
	});
	it('requires the wording of a non-numeric quantity in both languages', () => {
		const content = complete();
		content.ingredients[0] = { ...content.ingredients[0], quantity: { kind: 'text' }, sourceText: '1 spicchio', text: { 'it-IT': '1 spicchio', 'en-GB': null } };
		expect(validateForPublish(db, content)).toEqual([{ field: 'ingredients', code: 'translation_missing', line: 0, locale: 'en-GB' }]);
	});
	it('keeps the imported drafts out of the catalogue', () => {
		for (const recipe of db.recipes.filter((r) => r.status === 'draft' && r.createdBy === 'user-federico'))
			expect(summarize(validateForPublish(db, recipe))).toEqual(expect.arrayContaining(['baseServings', 'ingredients', 'translation']));
	});
	it('accepts every published demo recipe except the one without duration', () => {
		const failing = db.recipes.filter((r) => r.status === 'published' && validateForPublish(db, r).length > 0).map((r) => r.id);
		expect(failing).toEqual(['erbazzone-uova-strapazzate-stracchino']);
	});
});

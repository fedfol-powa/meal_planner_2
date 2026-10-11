import { describe, expect, it } from 'vitest';
import { emptyDraft, recipeDraftSchema } from './document.ts';
import { blocksDraft, issuesFromZod, missingData } from './issues.ts';

describe('validation issues', () => {
	it('turns zod errors into invalid_value with the same path', () => {
		const result = recipeDraftSchema.safeParse({ ...emptyDraft(), ingredients: [{ ingredientId: 'x', quantity: { kind: 'amount', value: 1, unit: 'cup' }, sourceText: '', isOptional: false, isPrimary: false }] });
		expect(result.success).toBe(false);
		const issues = issuesFromZod(result.error!);
		expect(issues.every((i) => i.code === 'invalid_value')).toBe(true);
		expect(issues.some((i) => i.path.join('.').startsWith('ingredients.0.quantity'))).toBe(true);
	});
	it('separates refusals from publication problems; duplicates never block a draft', () => {
		expect(blocksDraft({ path: ['sourceUrl'], code: 'invalid_url' })).toBe(true);
		expect(blocksDraft({ path: ['name', 'en-GB'], code: 'translation_missing' })).toBe(false);
		expect(blocksDraft({ path: ['sourceUrl'], code: 'not_applicable' })).toBe(false);
		expect(blocksDraft({ path: ['ingredients', 1, 'ingredientId'], code: 'duplicate_ingredient' })).toBe(false);
	});
	it('summarises issues for the draft cards in a stable order', () => {
		expect(
			missingData([
				{ path: ['ingredients'], code: 'required' },
				{ path: ['name', 'en-GB'], code: 'translation_missing' },
				{ path: ['category'], code: 'required' },
				{ path: ['bookPages'], code: 'required' },
				{ path: ['sourceUrl'], code: 'not_applicable' },
				{ path: ['durationMinutes'], code: 'required' },
				{ path: ['ingredients', 0, 'quantity', 'unit'], code: 'unit_not_publishable' },
				{ path: ['ingredients', 1, 'ingredientId'], code: 'duplicate_ingredient' },
				{ path: ['sourceUrl'], code: 'invalid_url' },
				{ path: ['description'], code: 'required' }
			])
		).toEqual(['names', 'source', 'details', 'attributes', 'ingredients', 'translation', 'invalid']);
	});
});

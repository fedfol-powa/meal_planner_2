import { describe, expect, it } from 'vitest';
import { checkPublishable, toPublished } from './check.ts';
import { cleanDraft } from './clean.ts';
import { recipeDraftSchema, type RecipeDraftDocument } from './document.ts';
import { projectRecipe, resolveReferences, toPlannerRecipe } from './projection.ts';
import { lookup, publishedExample } from './test-fixtures.ts';

const refs = { ingredientId: (s: string) => `id-${s}`, bookId: (s: string) => (s === 'basta-un-wok' ? 'b1' : undefined) };
const FIELDS = ['sourceUrl', 'bookId', 'bookPages'] as const;

/** A home recipe whose source fields hold an empty value, or none at all. */
function homeWith(blank: string | null | undefined): RecipeDraftDocument {
	const doc: Record<string, unknown> = { ...publishedExample };
	for (const field of FIELDS) {
		if (blank === undefined) delete doc[field];
		else doc[field] = blank;
	}
	return doc as RecipeDraftDocument;
}

describe('empty source fields', () => {
	for (const blank of ['', '   ', null, undefined]) {
		it(`become null for ${JSON.stringify(blank) ?? 'an omitted key'}`, () => {
			const draft = homeWith(blank);
			expect(checkPublishable(draft, lookup)).toEqual([]);
			const published = toPublished(draft);
			for (const field of FIELDS) expect(published[field]).toBeNull();
			expect(projectRecipe(published).recipe).toMatchObject({ sourceUrl: null, bookId: null, bookPages: null });
			expect(toPlannerRecipe('r1', published).bookId).toBeNull();
			expect(resolveReferences(draft, refs).bookId ?? null).toBeNull();
			const cleaned = cleanDraft(draft);
			for (const field of FIELDS) expect(cleaned[field] ?? null).toBeNull();
		});
	}
});

describe('book recipes', () => {
	it('keep the resolved book id through publication, projection and the planner', () => {
		const draft = recipeDraftSchema.parse({ ...publishedExample, sourceType: 'book', bookId: 'basta-un-wok', bookPages: '76-77' });
		const resolved = resolveReferences(draft, refs);
		expect(resolved.bookId).toBe('b1');
		const published = toPublished(resolved);
		expect(projectRecipe(published).recipe).toMatchObject({ bookId: 'b1', bookPages: '76-77' });
		expect(toPlannerRecipe('r1', published).bookId).toBe('b1');
	});
});

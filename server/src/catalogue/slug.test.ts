import { describe, expect, it } from 'vitest';
import { slugify, uniqueSlug } from './slug.ts';

describe('slugs', () => {
	it('keeps letters and digits, without accents', () => {
		expect(slugify('Pasta e fagioli à la Nonna!', 'recipe')).toBe('pasta-e-fagioli-a-la-nonna');
		expect(slugify('Olio extravergine d’oliva', 'ingredient')).toBe('olio-extravergine-d-oliva');
		expect(slugify('  ', 'recipe')).toBe('recipe');
		expect(slugify('x'.repeat(100), 'recipe')).toHaveLength(60);
		expect(slugify(`${'a'.repeat(59)} b`, 'recipe')).toBe('a'.repeat(59));
	});
	it('adds a numeric suffix when taken', async () => {
		const taken = new Set(['pesto', 'pesto-2']);
		expect(await uniqueSlug('pesto', async (s) => taken.has(s))).toBe('pesto-3');
		expect(await uniqueSlug('ragu', async () => false)).toBe('ragu');
	});
});

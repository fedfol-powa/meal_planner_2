import { describe, expect, it } from 'vitest';
import { truncate } from './text';

describe('truncate', () => {
	it('keeps texts within the limit', () => {
		expect(truncate('gnambox.com', 22)).toBe('gnambox.com');
		expect(truncate('a'.repeat(22), 22)).toBe('a'.repeat(22));
	});
	it('cuts longer texts to the limit, ellipsis included', () => {
		const cut = truncate('ricette.giallozafferano.it', 22);
		expect(cut).toBe('ricette.giallozaffera…');
		expect([...cut]).toHaveLength(22);
	});
	it('does not end with a space before the ellipsis', () => {
		expect(truncate('Libro: Panini e tramezzini, pp. 110-111', 22)).toBe('Libro: Panini e trame…');
		expect(truncate('Libro: Panini e tramezzini', 17)).toBe('Libro: Panini e…');
	});
});

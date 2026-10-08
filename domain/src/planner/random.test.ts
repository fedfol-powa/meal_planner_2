import { describe, expect, it } from 'vitest';
import { compareIds, createRandom, seedFrom, weightedPick } from './random.ts';

describe('random', () => {
	it('derives the same seed from the same text', () => {
		expect(seedFrom('family-a:2026-10-12')).toBe(seedFrom('family-a:2026-10-12'));
		expect(seedFrom('family-a:2026-10-12')).not.toBe(seedFrom('family-a:2026-10-19'));
	});
	it('repeats the same sequence for the same seed, within [0, 1)', () => {
		const a = createRandom(42);
		const b = createRandom(42);
		for (let i = 0; i < 100; i++) {
			const x = a();
			expect(x).toBe(b());
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThan(1);
		}
	});
	it('never picks a choice with weight zero', () => {
		const random = createRandom(7);
		for (let i = 0; i < 1000; i++) {
			expect(weightedPick([{ item: 'never', weight: 0 }, { item: 'always', weight: 1 }], random)).toBe('always');
		}
	});
	it('orders ids by code point, whatever the runtime locale', () => {
		expect(compareIds('Z', 'a')).toBeLessThan(0);
		expect(compareIds('r-01', 'r01')).toBeLessThan(0);
		expect(compareIds('same', 'same')).toBe(0);
		expect(['b', 'a-c', 'A', 'a'].sort(compareIds)).toEqual(['A', 'a', 'a-c', 'b']);
	});
	it('refuses an empty list', () => {
		expect(() => weightedPick([], createRandom(1))).toThrow();
	});
});

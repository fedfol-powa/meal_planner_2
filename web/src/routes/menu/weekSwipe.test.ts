import { describe, expect, it } from 'vitest';
import { swipeStep } from './weekSwipe';

describe('swipeStep', () => {
  it('goes to the next week leftwards and to the previous one rightwards', () => {
    expect(swipeStep(-60, 5)).toBe(1);
    expect(swipeStep(60, -5)).toBe(-1);
  });
  it('ignores short, diagonal and vertical moves', () => {
    expect(swipeStep(-47, 0)).toBe(0);
    expect(swipeStep(-80, 41)).toBe(0);
    expect(swipeStep(10, 120)).toBe(0);
    expect(swipeStep(0, 0)).toBe(0);
  });
  it('accepts a move exactly on the thresholds', () => {
    expect(swipeStep(-48, 24)).toBe(1);
  });
});

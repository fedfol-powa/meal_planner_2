import { describe, expect, it } from 'vitest';
import { releaseStep, resist, unresist, velocityOf } from './weekSwipe';

describe('releaseStep', () => {
  it('goes to the next week leftwards and to the previous one rightwards past a third of the row', () => {
    expect(releaseStep(-120, 0, 350)).toBe(1);
    expect(releaseStep(120, 0, 350)).toBe(-1);
  });
  it('goes back below a third of the row', () => {
    expect(releaseStep(-116, 0, 350)).toBe(0);
    expect(releaseStep(0, 0, 350)).toBe(0);
  });
  it('changes week with a short quick flick', () => {
    expect(releaseStep(-40, -0.8, 350)).toBe(1);
    expect(releaseStep(20, 0.5, 350)).toBe(-1);
  });
  it('ignores a flick too short or too slow', () => {
    expect(releaseStep(-19, -2, 350)).toBe(0);
    expect(releaseStep(-60, -0.49, 350)).toBe(0);
  });
  it('goes back when the finger flicks back, even past a third', () => {
    expect(releaseStep(-200, 0.6, 350)).toBe(0);
    expect(releaseStep(-60, 0.8, 350)).toBe(0);
  });
});

describe('resist', () => {
  it('follows the finger less and less, never beyond the row', () => {
    const near = resist(50, 340);
    const far = resist(100, 340);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(50);
    expect(far - near).toBeLessThan(near);
    expect(Math.round(far)).toBe(47);
    expect(resist(100_000, 340)).toBeLessThan(340);
  });
  it('keeps the direction', () => {
    expect(resist(-100, 340)).toBeCloseTo(-resist(100, 340));
    expect(resist(0, 340)).toBe(0);
  });
  it('is undone by unresist, either way', () => {
    for (const dx of [-300, -40, 5, 120]) expect(unresist(resist(dx, 340), 340)).toBeCloseTo(dx);
    expect(unresist(0, 340)).toBe(0);
  });
});

describe('velocityOf', () => {
  it('measures the last 100 ms', () => {
    const samples = [
      { t: 0, x: 0 },
      { t: 400, x: -10 },
      { t: 450, x: -30 },
      { t: 500, x: -70 }
    ];
    expect(velocityOf(samples)).toBeCloseTo(-60 / 100);
  });
  it('falls back to the sample before when the window holds only the release', () => {
    expect(velocityOf([{ t: 0, x: 0 }, { t: 500, x: -150 }, { t: 500, x: -150 }])).toBeCloseTo(-150 / 500);
  });
  it('is zero without movement in time', () => {
    expect(velocityOf([{ t: 10, x: 0 }])).toBe(0);
    expect(velocityOf([{ t: 10, x: 0 }, { t: 10, x: -40 }])).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { lastEatenOn, nextBoundary, pastMeals, resortByLastEaten } from './mealTime';

const up = (date: string, mealType: 'lunch' | 'dinner', passesAt: string) => ({ date, mealType, passesAt });
// Four planned meals, read once: the answer stays «unchanged» while time goes by.
const upcoming = [
  up('2026-10-12', 'lunch', '2026-10-12T13:30:00.000Z'),
  up('2026-10-12', 'dinner', '2026-10-12T21:00:00.000Z'),
  up('2026-10-13', 'lunch', '2026-10-13T13:30:00.000Z'),
  up('2026-10-14', 'dinner', '2026-10-14T21:00:00.000Z')
];

describe('meal time on the device', () => {
  it('follows the clock through all four upcoming meals without a new read', () => {
    const view = { lastEatenOn: '2026-09-21', upcoming };
    expect(lastEatenOn(view, new Date('2026-10-12T13:29:00Z'))).toBe('2026-09-21');
    expect(lastEatenOn(view, new Date('2026-10-12T13:30:00Z'))).toBe('2026-10-12');
    expect(lastEatenOn(view, new Date('2026-10-14T21:00:00Z'))).toBe('2026-10-14');
  });

  it('merges history and passed upcoming meals, newest first, five at most', () => {
    const history = ['2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01'].map((date) => ({ date, mealType: 'lunch' as const }));
    expect(pastMeals({ history, upcoming }, new Date('2026-10-13T00:00:00Z'))).toEqual([
      { date: '2026-10-12', mealType: 'dinner' },
      { date: '2026-10-12', mealType: 'lunch' },
      { date: '2026-09-05', mealType: 'lunch' },
      { date: '2026-09-04', mealType: 'lunch' },
      { date: '2026-09-03', mealType: 'lunch' }
    ]);
  });

  it('re-sorts by the derived date only when something passed, missing values last', () => {
    const a = { recipe: { name: 'A' }, lastEatenOn: '2026-09-01', upcoming: [upcoming[0]!] };
    const b = { recipe: { name: 'B' }, lastEatenOn: '2026-10-01', upcoming: [] };
    const c = { recipe: { name: 'C' }, lastEatenOn: null, upcoming: [] };
    const before = new Date('2026-10-12T00:00:00Z');
    const after = new Date('2026-10-13T00:00:00Z');
    expect(resortByLastEaten([b, a, c], before, false, 'it-IT')).toEqual([b, a, c]);
    expect(resortByLastEaten([b, a, c], after, false, 'it-IT')).toEqual([a, b, c]);
    expect(resortByLastEaten([b, a, c], after, true, 'it-IT')).toEqual([b, a, c]);
  });

  it('finds the next boundary across views', () => {
    expect(nextBoundary([[upcoming[2]!], upcoming], new Date('2026-10-12T14:00:00Z'))?.toISOString()).toBe('2026-10-12T21:00:00.000Z');
    expect(nextBoundary([upcoming], new Date('2026-10-15T00:00:00Z'))).toBeNull();
  });
});

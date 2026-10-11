import { describe, expect, it } from 'vitest';
import { addMonths, pickSelected } from './selection';

const days = ['2026-10-05', '2026-10-06', '2026-10-07'];

describe('menu selection', () => {
  it('prefers the requested day, then the opening day, then the first day of the week', () => {
    expect(pickSelected(days, '2026-10-06', '2026-10-07')).toBe('2026-10-06');
    expect(pickSelected(days, '2026-11-01', '2026-10-07')).toBe('2026-10-07');
    expect(pickSelected(days, undefined, '2026-12-01')).toBe('2026-10-05');
    expect(pickSelected([], '2026-10-06')).toBeNull();
  });
  it('moves across years by month', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

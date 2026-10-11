import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMealClock } from './useMealClock';

const lists = [
  [
    { date: '2026-10-12', mealType: 'lunch' as const, passesAt: '2026-10-12T13:30:00.000Z' },
    { date: '2026-10-12', mealType: 'dinner' as const, passesAt: '2026-10-12T21:00:00.000Z' }
  ]
];

describe('useMealClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-12T13:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('ticks at the next passesAt and then at the following one, and clears its timer', () => {
    const { result, unmount } = renderHook(() => useMealClock(lists));
    expect(result.current.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(result.current.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-12T13:30:00Z'));
    act(() => vi.advanceTimersByTime(7.5 * 3_600_000));
    expect(result.current.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-12T21:00:00Z'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

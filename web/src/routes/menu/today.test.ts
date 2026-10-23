import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFamilyToday } from './today';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome.
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Renders the hook counting its renders. */
function renderCounted(timeZone: string) {
  let renders = 0;
  const hook = renderHook(() => {
    renders += 1;
    return useFamilyToday(timeZone);
  });
  return { ...hook, renders: () => renders };
}

describe('useFamilyToday', () => {
  it('reads the family date, not the device one', () => {
    vi.setSystemTime(new Date('2026-10-08T22:30:00Z'));
    expect(renderHook(() => useFamilyToday('Europe/Rome')).result.current).toBe('2026-10-09');
    expect(renderHook(() => useFamilyToday('UTC')).result.current).toBe('2026-10-08');
  });
  it('renders again when the app comes back on another day', () => {
    const hook = renderCounted('Europe/Rome');
    expect(hook.result.current).toBe('2026-10-08');
    const before = hook.renders();
    vi.setSystemTime(new Date('2026-10-09T08:00:00Z'));
    expect(hook.renders()).toBe(before);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(hook.renders()).toBe(before + 1);
    expect(hook.result.current).toBe('2026-10-09');
  });
  it('also on pageshow', () => {
    const hook = renderCounted('Europe/Rome');
    const before = hook.renders();
    vi.setSystemTime(new Date('2026-10-09T08:00:00Z'));
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(hook.renders()).toBe(before + 1);
    expect(hook.result.current).toBe('2026-10-09');
  });
  it('does not render again on the same day', () => {
    const hook = renderCounted('Europe/Rome');
    const before = hook.renders();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(hook.renders()).toBe(before);
  });
});

import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { LoadingArea, LoadingScope, Skeleton } from './Skeleton';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const wrap = (ui: ReactNode) => <LocaleProvider initial="it-IT">{ui}</LocaleProvider>;
const area = (loading: boolean, paused = false) =>
  wrap(
    <LoadingArea loading={loading} paused={paused} skeleton={<span className="skeleton-card" />}>
      <p>Contenuto</p>
    </LoadingArea>
  );
const skeleton = (container: HTMLElement) => container.querySelector<HTMLElement>('.skeleton');
const status = () => screen.getByRole('status');

describe('LoadingArea', () => {
  it('reserves the space at once and shows the blocks after 200 ms', () => {
    const { container } = render(area(true));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    expect(status().textContent).toBe('');
    act(() => void vi.advanceTimersByTime(199));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(1));
    expect(skeleton(container)?.dataset.visible).toBe('true');
    expect(status().textContent).toBe('Caricamento…');
  });

  it('marks the area busy with one status and hides the skeleton', () => {
    const { container } = render(area(true));
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(skeleton(container)?.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton(container)?.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });

  it('shows the content and clears the status when loading ends', () => {
    const { container, rerender } = render(area(true));
    act(() => void vi.advanceTimersByTime(300));
    rerender(area(false));
    expect(screen.getByText('Contenuto')).toBeTruthy();
    expect(skeleton(container)).toBeNull();
    expect(container.querySelector('[aria-busy]')).toBeNull();
    expect(status().textContent).toBe('');
  });

  it('never shows the blocks for a load shorter than the delay', () => {
    const { container, rerender } = render(area(true));
    for (let i = 0; i < 3; i++) {
      act(() => void vi.advanceTimersByTime(50));
      expect(skeleton(container)?.dataset.visible).toBe('false');
    }
    rerender(area(false));
    act(() => void vi.advanceTimersByTime(500));
    expect(skeleton(container)).toBeNull();
    expect(status().textContent).toBe('');
  });

  it('restarts the delay for each new wait', () => {
    const { container, rerender } = render(area(true));
    act(() => void vi.advanceTimersByTime(300));
    rerender(area(false));
    rerender(area(true));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(199));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(1));
    expect(skeleton(container)?.dataset.visible).toBe('true');
  });

  it('clears its timer on unmount', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(area(true));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => void vi.advanceTimersByTime(500));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a paused load keeps the skeleton still', () => {
    const { container } = render(area(true, true));
    expect(skeleton(container)?.dataset.paused).toBe('true');
  });
});

describe('LoadingScope', () => {
  it('all skeletons of a scope share the delay, the pause and one status', () => {
    const scope = (paused: boolean) =>
      wrap(
        <LoadingScope loading paused={paused}>
          <header>
            <Skeleton as="span" className="skeleton-block" />
          </header>
          <Skeleton>
            <span className="skeleton-card" />
          </Skeleton>
        </LoadingScope>
      );
    const { container, rerender } = render(scope(false));
    const all = () => [...container.querySelectorAll<HTMLElement>('.skeleton')];
    expect(all()).toHaveLength(2);
    expect(all().map((el) => el.dataset.visible)).toEqual(['false', 'false']);
    act(() => void vi.advanceTimersByTime(200));
    expect(all().map((el) => el.dataset.visible)).toEqual(['true', 'true']);
    expect(all().every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true);
    rerender(scope(true));
    expect(all().map((el) => el.dataset.paused)).toEqual(['true', 'true']);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

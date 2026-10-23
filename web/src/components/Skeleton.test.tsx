import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { LoadingArea, LoadingContinuity, LoadingScope, Skeleton } from './Skeleton';

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

describe('LoadingScope gather', () => {
  const gathered = (first: boolean, second: boolean, paused: [boolean, boolean] = [false, false]) =>
    wrap(
      <LoadingScope gather>
        <LoadingArea loading={first} paused={paused[0]} className="first" skeleton={<span className="skeleton-card" />}>
          <p>Primo</p>
        </LoadingArea>
        <LoadingArea loading={second} paused={paused[1]} className="second" skeleton={<span className="skeleton-card" />}>
          <p>Secondo</p>
        </LoadingArea>
      </LoadingScope>
    );
  const loadingStatuses = () => screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…');

  it('gathers the waits of inner areas into one status', () => {
    const { container } = render(gathered(true, true));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(200));
    expect(loadingStatuses()).toHaveLength(1);
    const all = [...container.querySelectorAll<HTMLElement>('.skeleton')];
    expect(all).toHaveLength(2);
    expect(all.map((el) => el.dataset.visible)).toEqual(['true', 'true']);
  });

  it('shows an inner area as soon as its data arrives', () => {
    const { container, rerender } = render(gathered(true, true));
    act(() => void vi.advanceTimersByTime(200));
    rerender(gathered(false, true));
    expect(screen.getByText('Primo')).toBeTruthy();
    expect(container.querySelector('.first')?.getAttribute('aria-busy')).toBeNull();
    expect(container.querySelector('.second')?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector<HTMLElement>('.second .skeleton')?.dataset.visible).toBe('true');
    expect(loadingStatuses()).toHaveLength(1);
    rerender(gathered(false, false));
    expect(screen.getByText('Secondo')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('pauses the gathered wait only when every wait is paused', () => {
    const { container, rerender } = render(gathered(true, true, [true, false]));
    const all = () => [...container.querySelectorAll<HTMLElement>('.skeleton')];
    expect(all().map((el) => el.dataset.paused)).toEqual([undefined, undefined]);
    rerender(gathered(true, true, [true, true]));
    expect(all().map((el) => el.dataset.paused)).toEqual(['true', 'true']);
  });

  it('keeps a nested scope without gather independent', () => {
    render(
      wrap(
        <LoadingScope loading>
          <LoadingArea loading skeleton={<span className="skeleton-card" />} />
        </LoadingScope>
      )
    );
    act(() => void vi.advanceTimersByTime(200));
    expect(loadingStatuses()).toHaveLength(2);
  });

  it('announces the given label', () => {
    render(wrap(<LoadingArea loading label="Verifico il link…" skeleton={<span className="skeleton-card" />} />));
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.getByRole('status').textContent).toBe('Verifico il link…');
  });
});

describe('LoadingContinuity (W22)', () => {
  const block = <span className="skeleton-card" />;
  // One page: its gate shows the waiting layout, then the page's own layout of the same wait.
  const page = (phase: 'gate' | 'detail', gather = false) =>
    wrap(
      <LoadingContinuity>
        {phase === 'gate' ? (
          <LoadingArea key="gate" loading skeleton={block} />
        ) : gather ? (
          <LoadingScope gather key="detail">
            <LoadingArea loading skeleton={block} />
          </LoadingScope>
        ) : (
          <LoadingArea key="detail" loading skeleton={block} />
        )}
      </LoadingContinuity>
    );
  // Two pages: each with its own continuity (a route change mounts a new one).
  const route = (name: string, loading = true) =>
    wrap(
      <LoadingContinuity key={name}>
        <LoadingArea loading={loading} skeleton={block} />
      </LoadingContinuity>
    );

  it('the same page keeps its visible wait from the gate to the detail', () => {
    const { container, rerender } = render(page('gate'));
    act(() => void vi.advanceTimersByTime(200));
    expect(skeleton(container)?.dataset.visible).toBe('true');
    rerender(page('detail'));
    expect(skeleton(container)?.dataset.visible).toBe('true');
    expect(status().textContent).toBe('Caricamento…');
  });

  it('the same page keeps it also when the detail gathers its areas', () => {
    const { container, rerender } = render(page('gate'));
    act(() => void vi.advanceTimersByTime(200));
    rerender(page('detail', true));
    expect(skeleton(container)?.dataset.visible).toBe('true');
  });

  it('a new page waits the whole delay again', () => {
    const { container, rerender } = render(route('members'));
    act(() => void vi.advanceTimersByTime(200));
    expect(skeleton(container)?.dataset.visible).toBe('true');
    rerender(route('exclusions'));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(199));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    act(() => void vi.advanceTimersByTime(1));
    expect(skeleton(container)?.dataset.visible).toBe('true');
  });

  it('a new page answered within the delay never shows its blocks', () => {
    const { container, rerender } = render(route('members'));
    act(() => void vi.advanceTimersByTime(200));
    rerender(route('exclusions'));
    act(() => void vi.advanceTimersByTime(150));
    expect(skeleton(container)?.dataset.visible).toBe('false');
    rerender(route('exclusions', false));
    expect(skeleton(container)).toBeNull();
    expect(status().textContent).toBe('');
  });

  it('without a continuity a remounted wait starts again', () => {
    const view = (key: string) => wrap(<LoadingArea key={key} loading skeleton={block} />);
    const { container, rerender } = render(view('a'));
    act(() => void vi.advanceTimersByTime(200));
    rerender(view('b'));
    expect(skeleton(container)?.dataset.visible).toBe('false');
  });

  it('a wait that ended with its data does not carry over', () => {
    const { container, rerender } = render(page('gate'));
    act(() => void vi.advanceTimersByTime(200));
    rerender(wrap(<LoadingContinuity><LoadingArea key="gate" loading={false} skeleton={block} /></LoadingContinuity>));
    rerender(page('detail'));
    expect(skeleton(container)?.dataset.visible).toBe('false');
  });
});

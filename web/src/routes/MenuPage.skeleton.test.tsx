import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { DEMO_USER } from '../auth/backend';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome.
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const trackSkeleton = () => document.querySelector('.calendar [aria-busy="true"] .skeleton.day');

/** Holds the reads of the weeks until released; later reads go through. */
function holdWeeks(api: ReturnType<typeof fakeApi>) {
  const read = api.menu.getWeek;
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  api.menu.getWeek = (input) => gate.then(() => read(input));
  return () => act(async () => release());
}

describe('menu while loading (W20)', () => {
  it('menu: day row and meal skeleton while a new week loads', async () => {
    const api = fakeApi();
    const release = holdWeeks(api);
    renderApp('/menu?day=2026-10-06', { api });
    // The day row is real: the days come from the date.
    const day = await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    expect(day.closest('nav')?.getAttribute('aria-label')).toBe('Giorni della settimana');
    expect(screen.getByText('ottobre 2026')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.calendar .skeleton[data-visible="true"]')).not.toBeNull());
    expect(trackSkeleton()?.querySelectorAll('article.meal.skeleton-card')).toHaveLength(2);
    expect(screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')).toHaveLength(1);
    await release();
    expect(await screen.findByText('Doppia dose, avanza per venerdì', { exact: false })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();

  });

  it('menu: no skeleton with the cached week', async () => {
    const api = fakeApi();
    const { history } = renderApp('/menu?day=2026-10-06', { api });
    await screen.findByText('Doppia dose, avanza per venerdì', { exact: false });
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    api.menu.getWeek = () => new Promise(() => undefined);
    act(() => history.push('/menu?day=2026-10-06'));
    expect(await screen.findByText('Doppia dose, avanza per venerdì', { exact: false })).toBeTruthy();
    expect(document.querySelector('.calendar .skeleton')).toBeNull();
  });

  it('menu: error and no weeks replace the skeleton', async () => {
    const failing = fakeApi();
    failing.menu.getWeek = async () => {
      throw new ApiError('internal');
    };
    const { unmount } = renderApp('/menu?day=2026-10-06', { api: failing });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    unmount();
    const empty = fakeApi();
    empty.menu.getOpening = async () => ({ unchanged: false, version: 'v1', data: { kind: 'no_weeks' } }) as never;
    renderApp('/menu', { api: empty });
    expect(await screen.findByText('Ancora nessun menu')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('startup on /menu without day shows the menu skeleton with a placeholder day row', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdCheck();
    renderApp('/menu', { backend, api: fakeApi() });
    expect(document.querySelector('.calendar .skeleton.day-links')).not.toBeNull();
    expect(document.querySelector('.calendar .skeleton.day')).not.toBeNull();
    await act(async () => answer({ status: 'signedIn', user: DEMO_USER }));
    expect(await screen.findByRole('link', { name: 'giovedì 8 ottobre' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
  });
});

import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { DEMO_FAMILY_ID } from '../../api/fake/seed';
import { createMemoryStore } from '../../api/persister';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { MONDAY, ops, TOMATO } from './fixtures';
import { queueKey } from './storage';
import { createShoppingServer } from './testServer';

afterEach(() => setOnline(true));

const PATH = `/shopping/${MONDAY}?day=2026-10-14`;
const TITLE = 'Settimana 12–18 ottobre';
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const header = () => document.querySelector<HTMLElement>('.page-header')!;

function open(options: { store?: ReturnType<typeof createMemoryStore> } = {}) {
  const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
  const rendered = renderApp(PATH, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER), store: options.store });
  return { server, ...rendered };
}

describe('shopping page while loading (W20)', () => {
  it('shopping: real title and back link, header blocks and list share one wait', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    server.holdNextRead();
    renderApp(PATH, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    await waitFor(() => expect(server.reads).toHaveBeenCalled());
    expect(within(header()).getByRole('link', { name: 'Menu' })).toBeTruthy();
    expect(within(header()).getByRole('heading', { level: 1 }).textContent).toContain(TITLE);
    // Blocks in the header (summary, «…» menu) and in the list.
    expect(skeletons().filter((el) => header().contains(el)).length).toBe(2);
    expect(skeletons().some((el) => !header().contains(el))).toBe(true);
    expect(skeletons().every((el) => el.dataset.visible === 'false')).toBe(true);
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    act(() => server.releaseRead());
    expect(await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('shopping offline without a saved copy keeps every block still', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const { history } = renderApp('/menu', { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    await screen.findAllByRole('article');
    // The network drops, then the list is opened: its read waits for the network.
    act(() => setOnline(false));
    act(() => history.push(PATH));
    await waitFor(() => expect(skeletons().filter((el) => header().contains(el))).toHaveLength(2));
    await waitFor(() => expect(skeletons().every((el) => el.dataset.paused === 'true')).toBe(true));
    expect(skeletons().length).toBeGreaterThan(2);
    expect(server.reads).not.toHaveBeenCalled();
    act(() => setOnline(true));
    expect(await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('shopping: error and empty replace the skeleton', async () => {
    // A week without a menu: nothing to buy.
    const missing = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const { unmount } = renderApp('/shopping/2026-10-05', { createApi: () => (locale) => missing.api(locale), backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByText('Nessun menu per questa settimana')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    unmount();
    const failing = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const createApi = () => (locale: 'it-IT' | 'en-GB') => {
      const api = failing.api(locale);
      api.shopping.getWeekList = async () => {
        throw new ApiError('internal');
      };
      return api;
    };
    renderApp(PATH, { createApi, backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('shopping: no skeleton with the cached copy', async () => {
    const { server, history } = open();
    await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });
    history.push('/recipes');
    await screen.findAllByRole('article');
    server.holdNextRead();
    history.push(PATH);
    expect(await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('shopping: a saved list with pending changes waits for the queue, never shows the server list alone', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const base = createMemoryStore();
    const tick = ops.tick(TOMATO);
    const saved = { ...tick, input: { ...tick.input, familyId: DEMO_FAMILY_ID } };
    base.entries.set(queueKey(DEMO_USER.id), { ops: [{ userId: DEMO_USER.id, queuedAt: 0, state: 'pending', label: 'Pomodori', op: saved }], notices: [], seq: 0 });
    server.holdNextWrite();
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const store = { ...base, get: async (key: string) => (key.startsWith('shopping-queue:') ? gate.then(() => base.get(key)) : base.get(key)) };
    renderApp(PATH, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER), store });
    await waitFor(() => expect(server.reads).toHaveBeenCalled());
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true') && skeletons().length > 0).toBe(true));
    expect(screen.queryByRole('checkbox', { name: 'Preso o già in casa: Pomodori' })).toBeNull();
    act(() => release());
    const box = (await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' })) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(document.querySelector('.skeleton')).toBeNull();
  });
});

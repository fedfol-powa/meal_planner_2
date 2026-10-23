import { useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { OverviewView } from '@app/contract';
import { createFakeApi } from '../api/fake/fakeApi';
import { cacheKey, createMemoryStore, type KeyValueStore } from '../api/persister';
import { catalogueKeys } from '../features/catalogue/queries';
import { catalogueApi, LUCIA } from '../features/catalogue/test-support';
import { setOnline } from '../test/connectivity';
import { gate, holdCalls } from '../test/holdCalls';
import { renderApp } from '../test/renderApp';
import { DEMO_USER } from '../auth/backend';
import { createStubBackend } from '../test/stubBackend';

afterEach(() => setOnline(true));

const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const busyArea = () => document.querySelector('.secondary-view [aria-busy="true"]');
const visible = () => document.querySelector('.skeleton[data-visible="true"]');
const cards = () => document.querySelectorAll('.secondary-view .skeleton article.meal.skeleton-card');

const overview: OverviewView = {
  drafts: [{ draftId: '1d7c3b1e-0000-4000-8000-000000000001', recipeId: '2e8d4c2f-0000-4000-8000-000000000001', kind: 'new', name: 'Zuppa di farro',
    createdBy: LUCIA, updatedBy: LUCIA, updatedAt: '2026-10-06T16:00:00.000Z', missing: [] }],
  archived: [{ recipeId: '3f9e5d30-0000-4000-8000-000000000009', name: 'Erbazzone', archivedBy: LUCIA, archivedAt: '2026-10-05T10:00:00.000Z' }]
};

describe('recipe book while loading (W20)', () => {
  it('recipes: list skeleton while the first read loads, cards on arrival', async () => {
    const api = fakeApi();
    const search = holdCalls(api, 'recipes', 'search');
    renderApp('/recipes', { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ricettario' })).toBeTruthy();
    expect(screen.getByRole('search')).toBeTruthy();
    await waitFor(() => expect(visible()).not.toBeNull());
    expect(busyArea()).not.toBeNull();
    expect(cards()).toHaveLength(3);
    await search.open();
    expect((await screen.findAllByRole('article')).length).toBeGreaterThan(0);
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(busyArea()).toBeNull();
  });

  it('recipes: error and empty replace the skeleton', async () => {
    const api = fakeApi();
    api.recipes.search = async () => ({ unchanged: false, version: 'v1', data: { items: [] } }) as never;
    const { unmount } = renderApp('/recipes', { api });
    expect(await screen.findByText('Nessuna ricetta trovata')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    unmount();
    const failing = fakeApi();
    failing.recipes.search = async () => {
      throw Object.assign(new Error('boom'), { code: 'internal' });
    };
    renderApp('/recipes', { api: failing });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(screen.queryAllByRole('status').some((s) => s.textContent === 'Caricamento…')).toBe(false);
  });

  it('recipes: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp('/recipes', { api });
    await screen.findAllByRole('article');
    history.push('/menu');
    await screen.findByRole('navigation', { name: /giorni|settimana/i }).catch(() => undefined);
    api.recipes.search = () => new Promise(() => undefined);
    history.push('/recipes');
    expect((await screen.findAllByRole('article')).length).toBeGreaterThan(0);
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('recipes: filters keep panel, text, focus and node while the profile arrives', async () => {
    const api = fakeApi();
    const profile = holdCalls(api, 'profile', 'get');
    const search = holdCalls(api, 'recipes', 'search');
    renderApp('/recipes', { api });
    const box = (await screen.findByRole('searchbox')) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Filtri e ordinamento' }));
    expect(screen.getByRole('button', { name: 'Filtri e ordinamento' }).getAttribute('aria-expanded')).toBe('true');
    box.focus();
    fireEvent.change(box, { target: { value: 'pa' } });
    await profile.open();
    await waitFor(() => expect(cards()).toHaveLength(3));
    expect(screen.getByRole('searchbox')).toBe(box);
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe('pa');
    expect(screen.getByRole('button', { name: 'Filtri e ordinamento' }).getAttribute('aria-expanded')).toBe('true');
    await search.open();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
    expect(screen.getByRole('searchbox')).toBe(box);
  });

  it('recipes: member never sees curator sections', async () => {
    const api = catalogueApi({ overview: async () => overview }, []);
    const profile = holdCalls(api, 'profile', 'get');
    renderApp('/recipes', { api });
    await screen.findByRole('searchbox');
    expect(screen.queryByRole('button', { name: /Bozze/ })).toBeNull();
    await profile.open();
    await screen.findAllByRole('article');
    expect(screen.queryByRole('button', { name: /Bozze/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Archiviate/ })).toBeNull();
  });

  it('recipes: curator sections stay while the results reload', async () => {
    const api = catalogueApi({ overview: async () => overview });
    renderApp('/recipes', { api });
    const drafts = await screen.findByRole('button', { name: /Bozze/ });
    const archived = screen.getByRole('button', { name: /Archiviate/ });
    await screen.findAllByRole('article');
    api.recipes.search = () => new Promise(() => undefined);
    // A new search with no saved copy: the list waits, the sections stay where they are.
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zuppa' } });
    await new Promise((done) => setTimeout(done, 250));
    expect(screen.getByRole('button', { name: /Bozze/ })).toBe(drafts);
    expect(screen.getByRole('button', { name: /Archiviate/ })).toBe(archived);
  });

  it('recipes: without a family the curator sections stay, the filters do not', async () => {
    const api = catalogueApi({ overview: async () => overview });
    const get = api.profile.get;
    api.profile.get = async (...args) => ({ ...(await get(...args)), families: [], currentFamilyId: null });
    renderApp('/recipes', { api });
    expect(await screen.findByText('Non fai ancora parte di una famiglia')).toBeTruthy();
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('entering offline without a saved profile keeps a still skeleton', async () => {
    const api = fakeApi();
    const get = api.profile.get;
    let attempts = 0;
    let fail!: () => void;
    // First read: no answer until the network drops, then the fetch fails as fetch does offline.
    api.profile.get = (...args) => (++attempts === 1 ? new Promise((_, reject) => (fail = () => reject(new TypeError('Failed to fetch')))) : get(...args));
    renderApp('/recipes', { api });
    await waitFor(() => expect(attempts).toBe(1));
    act(() => setOnline(false));
    await act(async () => fail());
    // The retry waits for the network: the skeleton stands still.
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton[data-paused="true"]')).not.toBeNull(), { timeout: 3000 });
    act(() => setOnline(true));
    expect((await screen.findAllByRole('article', {}, { timeout: 3000 })).length).toBeGreaterThan(0);
    expect(document.querySelector('.skeleton')).toBeNull();
  });
});

/** An overview already in memory, read in another language. */
function CachedOverview({ locale, view }: { locale: string; view: OverviewView }) {
  const client = useQueryClient();
  if (!client.getQueryData(catalogueKeys.overview(locale))) client.setQueryData(catalogueKeys.overview(locale), view);
  return null;
}

const common: OverviewView = { ...overview, drafts: overview.drafts.map((d) => ({ ...d, missing: ['source'] })) };
const sectionBlocks = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')].filter((el) => el.querySelector('h2'));
const draftCards = () => document.querySelectorAll('.secondary-view .skeleton .skeleton-card:not(.meal)');
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const resultsArea = () => document.querySelector('.secondary-view .recipe-grid, .secondary-view [aria-busy]');

describe('curator sections while loading (W22)', () => {
  it('curator: one draft card and the archived title while the overview loads', async () => {
    const api = catalogueApi({ overview: async () => common });
    const held = holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api });
    await waitFor(() => expect(sectionBlocks()).toHaveLength(2));
    expect(draftCards()).toHaveLength(1);
    const [drafts, archived] = sectionBlocks();
    const results = (await screen.findAllByRole('article'))[0]!;
    expect(drafts!.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(archived!.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    await held.open();
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
  });

  it('curator: the count of a cached overview in another language', async () => {
    const two: OverviewView = { ...common, drafts: [common.drafts[0]!, { ...common.drafts[0]!, draftId: '1d7c3b1e-0000-4000-8000-000000000002', name: 'Torta' }] };
    const api = catalogueApi({ overview: async () => two });
    holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api, extra: <CachedOverview locale="en-GB" view={two} /> });
    await waitFor(() => expect(draftCards()).toHaveLength(2));
  });

  it('curator: no drafts in a cached overview, no drafts section of blocks', async () => {
    const none: OverviewView = { ...common, drafts: [] };
    const api = catalogueApi({ overview: async () => none });
    holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api, extra: <CachedOverview locale="en-GB" view={none} /> });
    await waitFor(() => expect(sectionBlocks()).toHaveLength(1));
    expect(draftCards()).toHaveLength(0);
  });

  it('curator: the recipe count and one loading announcement', async () => {
    const api = catalogueApi({ overview: async () => common });
    const held = holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api });
    await screen.findAllByRole('article');
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    expect(screen.getAllByRole('status').some((s) => /ricett/.test(s.textContent ?? ''))).toBe(true);
    await held.open();
    await screen.findByText('Zuppa di farro');
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('curator: sections replace their blocks', async () => {
    const api = catalogueApi({ overview: async () => common });
    const held = holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api });
    await waitFor(() => expect(draftCards()).toHaveLength(1));
    await held.open();
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Archiviate/ })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Zuppa di farro/ })).toHaveLength(1);
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
  });

  it('curator: no drafts removes the section on arrival', async () => {
    const api = catalogueApi({ overview: async () => ({ drafts: [], archived: [] }) });
    const held = holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api });
    await waitFor(() => expect(sectionBlocks()).toHaveLength(2));
    await held.open();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
    expect(screen.queryByRole('button', { name: /Bozze/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Archiviate/ })).toBeNull();
  });

  it('role arrives during the wait: blocks join, filters stay', async () => {
    const api = catalogueApi({ overview: async () => common });
    const profile = holdCalls(api, 'profile', 'get');
    holdCalls(api, 'catalogue', 'overview');
    renderApp('/recipes', { api });
    const box = await screen.findByRole('searchbox');
    expect(sectionBlocks()).toHaveLength(0);
    await profile.open();
    await waitFor(() => expect(draftCards()).toHaveLength(1));
    expect(screen.getByRole('searchbox')).toBe(box);
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
  });

  it('not a curator: never a block of the sections', async () => {
    const api = catalogueApi({ overview: async () => common }, []);
    const search = holdCalls(api, 'recipes', 'search');
    renderApp('/recipes', { api });
    await screen.findByRole('searchbox');
    expect(sectionBlocks()).toHaveLength(0);
    await new Promise((done) => setTimeout(done, 250));
    expect(sectionBlocks()).toHaveLength(0);
    expect(resultsArea()).not.toBeNull();
    await search.open();
    await screen.findAllByRole('article');
    expect(sectionBlocks()).toHaveLength(0);
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('not a curator with the profile held: never a block of the sections', async () => {
    const api = catalogueApi({ overview: async () => common }, []);
    const profile = holdCalls(api, 'profile', 'get');
    renderApp('/recipes', { api });
    await screen.findByRole('searchbox');
    expect(sectionBlocks()).toHaveLength(0);
    await profile.open();
    expect(sectionBlocks()).toHaveLength(0);
    await screen.findAllByRole('article');
    expect(sectionBlocks()).toHaveLength(0);
  });

  it('curator: no section blocks with the overview cached', async () => {
    const api = catalogueApi({ overview: async () => common });
    const { history } = renderApp('/recipes', { api });
    await screen.findByText('Zuppa di farro');
    act(() => history.push('/profile'));
    await screen.findByRole('heading', { level: 1, name: 'Federico' });
    holdCalls(api, 'catalogue', 'overview');
    act(() => history.push('/recipes'));
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    expect(sectionBlocks()).toHaveLength(0);
  });
});

/** The memory store, with the restore transaction of the saved copy held until the gate opens. */
function slowRestore(store: KeyValueStore) {
  const g = gate();
  const held: KeyValueStore = {
    ...store,
    transact: (prefixes, change) =>
      prefixes.length === 2 && prefixes[0] === cacheKey(DEMO_USER.id) ? g.opened.then(() => store.transact(prefixes, change)) : store.transact(prefixes, change)
  };
  return { store: held, ...g };
}

describe('slow restore of the saved copy (W20)', () => {
  it.each([['online', true], ['offline', false]] as const)('a slow restore of the saved copy shows the skeleton, then the saved recipes (%s)', async (_, online) => {
    const store = createMemoryStore();
    const first = renderApp('/recipes', { api: fakeApi(), store, backend: createStubBackend(DEMO_USER) });
    await screen.findAllByRole('article');
    await waitFor(async () => expect(await store.get(cacheKey(DEMO_USER.id))).toBeDefined());
    first.unmount();

    const api = fakeApi();
    const calls: string[] = [];
    for (const [area, method] of [['recipes', 'search'], ['profile', 'get']] as const) {
      (api[area] as Record<string, unknown>)[method] = () => {
        calls.push(`${area}.${method}`);
        return new Promise(() => undefined);
      };
    }
    if (!online) act(() => setOnline(false));
    const restore = slowRestore(store);
    renderApp('/recipes', { api, store: restore.store, backend: createStubBackend(DEMO_USER) });
    await waitFor(() => expect(visible()).not.toBeNull(), { timeout: 2000 });
    expect(document.querySelector('.skeleton[data-paused]')).toBeNull();
    await restore.open();
    expect((await screen.findAllByRole('article')).length).toBeGreaterThan(0);
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(within(document.body).getByRole('heading', { level: 1, name: 'Ricettario' })).toBeTruthy();
  });
});

import { useQueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, createFakeData } from '../api/fake/fakeApi';
import { setOnline } from '../test/connectivity';
import type { Api, ProfileView, RecipeListItem } from '../api/types';
import type { CreateApi } from '../session/SessionScope';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';

const WOK = 'Wok di pollo con peperoni, carote e zucchine; riso basmati';

/** A list item in the shape the Worker sends (W6). */
const listItem = (id: string, name: string, patch: Partial<RecipeListItem> = {}): RecipeListItem => ({
  recipe: {
    id, name, description: null, durationMinutes: 20, sourceType: 'home', sourceUrl: null, bookTitle: null, bookPages: null,
    mealType: 'both', proteinGroup: 'eggs'
  },
  rating: { familyAverage: null, familyCount: 0, myStars: null },
  baseServings: 2, ingredients: [], addedOn: '2026-09-01', lastEatenOn: null, upcoming: [],
  ...patch
});
const answer = <T,>(data: T) => Promise.resolve({ unchanged: false as const, version: 'v1', data });
const cardTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('recipes', () => {
  it('searches by ingredient and keeps the text in the address', async () => {
    const { history } = renderApp('/recipes');
    await screen.findByRole('heading', { name: 'Ricettario', level: 1 });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca per nome o ingrediente' }), { target: { value: 'basmati' } });
    expect(await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
    await waitFor(() => expect(history.location.search).toContain('basmati'));
  });
  it('opens filters, applies one and marks the toggle as active', async () => {
    const { history } = renderApp('/recipes');
    const toggle = await screen.findByRole('button', { name: 'Filtri e ordinamento' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByLabelText('Tempo massimo'), { target: { value: '15' } });
    await waitFor(() => expect(history.location.search).toContain('time=15'));
    expect(toggle.getAttribute('data-active')).toBe('true');
    expect(screen.queryByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeNull();
  });
  it('filters by the eight protein groups of the planner', async () => {
    const { history } = renderApp('/recipes');
    fireEvent.click(await screen.findByRole('button', { name: 'Filtri e ordinamento' }));
    const select = screen.getByLabelText('Gruppo alimentare') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(
      ['Tutti', 'Pesce', 'Carne bianca', 'Carne rossa', 'Salumi', 'Legumi', 'Uova', 'Formaggi', 'Vegetariano']
    );
    fireEvent.change(select, { target: { value: 'cured_meat' } });
    await waitFor(() => expect(history.location.search).toContain('group=cured_meat'));
    expect(await screen.findByRole('heading', { name: /Pasta robiola e speck/ })).toBeTruthy();
  });
  it('offers to clear filters when nothing matches', async () => {
    const { history } = renderApp('/recipes?q=zzzz');
    expect(await screen.findByRole('heading', { name: 'Nessuna ricetta trovata' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));
    await waitFor(() => expect(history.location.search).toBe(''));
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('shows the error instead of cached recipes when a read is refused, with a retry', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const search = api.recipes.search;
    let calls = 0;
    api.recipes.search = (input) => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : search(input));
    renderApp('/recipes', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
  });
  it('keeps cached recipes readable offline', async () => {
    renderApp('/recipes');
    await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) });
    act(() => setOnline(false));
    // Returning to the app re-checks the data; offline the read pauses and the copy stays.
    act(() => void window.dispatchEvent(new Event('focus')));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeTruthy();
    expect(screen.getByText('Sei offline: puoi consultare i dati già caricati.')).toBeTruthy();
  });
  it('reads sorting from the address', async () => {
    renderApp('/recipes?sort=rating&dir=reverse');
    fireEvent.click(await screen.findByRole('button', { name: 'Filtri e ordinamento' }));
    expect((screen.getByLabelText('Ordina per') as HTMLSelectElement).value).toBe('rating');
    expect(screen.getByRole('button', { name: 'Inverti l’ordine' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('recipes from the Worker (W6)', () => {
  it('shows the count and the cards of the items', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.recipes.search = () => answer({ items: [listItem('a', 'Frittata'), listItem('b', 'Uova sode')] });
    renderApp('/recipes', { api });
    expect((await screen.findByText('2 ricette')).getAttribute('role')).toBe('status');
    expect(cardTitles()).toEqual(['Frittata', 'Uova sode']);
  });
  it('asks the Worker for the red meat group when «Carne rossa» is chosen', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const search = vi.spyOn(api.recipes, 'search');
    renderApp('/recipes', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Filtri e ordinamento' }));
    fireEvent.change(screen.getByLabelText('Gruppo alimentare'), { target: { value: 'red_meat' } });
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ query: { proteinGroup: 'red_meat' } }), expect.anything()));
  });
  it('moves a recipe up when one of its planned meals passes while the page is open, without reading again', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    // Now is 2026-10-08T10:00:00Z: the omelette's lunch passes 50 ms later.
    const omelette = listItem('a', 'Omelette', { lastEatenOn: '2026-09-01', upcoming: [{ date: '2026-10-08', mealType: 'lunch', passesAt: '2026-10-08T10:00:00.050Z' }] });
    const salad = listItem('b', 'Insalata', { lastEatenOn: '2026-10-01' });
    const search = vi.fn(() => answer({ items: [salad, omelette] }));
    api.recipes.search = search;
    renderApp('/recipes?sort=lastEaten', { api });
    await screen.findByRole('heading', { name: 'Omelette' });
    expect(cardTitles()).toEqual(['Insalata', 'Omelette']);
    act(() => vi.setSystemTime(new Date('2026-10-08T10:01:00Z')));
    await waitFor(() => expect(cardTitles()).toEqual(['Omelette', 'Insalata']));
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('reads the new family after a change of family and never shows the previous one', async () => {
    let current = 'family-main';
    const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = (): ProfileView => ({
      user: { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT', globalRoles: [] },
      families: [
        { id: 'family-main', name: 'Famiglia Folloni', timeZone: 'Europe/Rome', role: 'family_admin', measurementSystem: 'metric' },
        { id: 'family-b', name: 'Famiglia Bianchi', timeZone: 'Europe/Rome', role: 'member', measurementSystem: 'metric' }
      ],
      currentFamilyId: current
    });
    const search = vi.fn((input: Parameters<Api['recipes']['search']>[0]) =>
      input.familyId === 'family-b' ? answer({ items: [listItem('b1', 'Ricetta dei Bianchi')] }) : base.recipes.search(input)
    );
    const api: Api = { ...base, profile: { ...base.profile, get: async () => profile() }, recipes: { ...base.recipes, search } };
    function SwitchFamily() {
      const queryClient = useQueryClient();
      return <button type="button" onClick={() => { current = 'family-b'; void queryClient.invalidateQueries({ queryKey: ['profile'] }); }}>test: famiglia B</button>;
    }
    renderApp('/recipes', { api, extra: <SwitchFamily /> });
    await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) });
    fireEvent.click(screen.getByText('test: famiglia B'));
    expect(await screen.findByRole('heading', { name: 'Ricetta dei Bianchi' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeNull();
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ familyId: 'family-b' }), expect.anything());
  });
});

describe('previous data only within the same view (second review, C7)', () => {
  it('never shows the list in the previous language while the new one loads', async () => {
    const createApi: CreateApi = (user) => {
      // One fake backend for both languages, as fakeClients does: the profile says the same language in both.
      const data = createFakeData(user ?? undefined);
      return (locale) => {
        const api = createFakeApi({ getLocale: () => locale, data, latencyMs: 0 });
        const search = api.recipes.search;
        api.recipes.search = (input) => (locale === 'en-GB' ? new Promise(() => {}) : search(input));
        return api;
      };
    };
    renderApp('/recipes', { createApi, extra: <LanguageSwitch /> });
    await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) });
    // English recipes never arrive. A first round trip puts both profiles in cache, so the
    // family gate stays open and the list stays mounted across the last switch.
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByRole('heading', { name: 'Recipes', level: 1 });
    fireEvent.click(screen.getByText('test: italiano'));
    await screen.findByRole('heading', { name: new RegExp(WOK.slice(0, 20)) });
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByRole('heading', { name: 'Recipes', level: 1 });
    await screen.findByText('Loading…');
    expect(screen.queryByRole('heading', { name: new RegExp(WOK.slice(0, 20)) })).toBeNull();
  });
});

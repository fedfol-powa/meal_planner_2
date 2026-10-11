import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID } from '../api/fake/fakeApi';
import type { RecipeDetailView } from '../api/types';
import { setOnline } from '../test/connectivity';
import type { CreateApi } from '../session/SessionScope';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';

const WOK = 'wok-pollo-peperoni-riso-basmati';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('recipe page', () => {
  it('shows source, rating, servings and ingredients, with a way back to the menu day', async () => {
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-08`);
    const title = await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(title.getAttribute('href')).toBe('https://ricetta.it/riso-basmati-con-pollo-e-verdure');
    // The back link, not the navbar item with the same name.
    const back = screen.getAllByRole('link', { name: 'Menu' }).find((link) => link.classList.contains('page-back'));
    expect(back?.getAttribute('href')).toBe('/menu?day=2026-10-08');
    expect(screen.getByText('Dosi della fonte per 6 porzioni')).toBeTruthy();
    expect(row('Riso basmati').textContent).toContain('300 g');
    expect(screen.getByRole('group', { name: 'Il tuo voto' })).toBeTruthy();
  });
  it('scales the ingredients with the servings and keeps them in the address', async () => {
    const { history } = renderApp(`/recipes/${WOK}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(history.location.search).toContain('servings=7'));
    await waitFor(() => expect(row('Riso basmati').textContent).toContain('350 g'));
  });
  it('does not go below one serving', async () => {
    renderApp(`/recipes/${WOK}?servings=1`);
    expect(((await screen.findByRole('button', { name: 'Una porzione in meno' })) as HTMLButtonElement).disabled).toBe(true);
  });
  it('lists the last times the family had it', async () => {
    renderApp('/recipes/omelette-spinaci-montasio');
    expect(await screen.findByText('lunedì 21 settembre, Cena')).toBeTruthy();
  });
  it('names the book and its pages under the title', async () => {
    renderApp('/recipes/burrito-vegan');
    expect(await screen.findByText(/^Libro: .+, pp\. 110-111$/)).toBeTruthy();
  });
  it('passes the meal reference to the read when opened from a meal', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.spyOn(api.recipes, 'get');
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-05&slot=2026-10-05-dinner`, { api });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ recipeId: WOK, slotId: '2026-10-05-dinner' }), expect.anything());
  });
  it('says when a recipe does not exist', async () => {
    renderApp('/recipes/nope');
    expect(await screen.findByRole('heading', { name: 'Ricetta non disponibile' })).toBeTruthy();
  });
});

describe('recipe page from the Worker (W6)', () => {
  const detail = (patch: Partial<RecipeDetailView> = {}): RecipeDetailView => ({
    recipe: {
      id: 'r1', name: 'Frittata', description: null, durationMinutes: 15, sourceType: 'home', sourceUrl: null,
      bookTitle: null, bookPages: null, mealType: 'both', proteinGroup: 'eggs'
    },
    status: 'published', baseServings: 2, servings: 2, ingredients: [],
    rating: { familyAverage: null, familyCount: 0, myStars: null }, history: [], upcoming: [],
    ...patch
  });
  const withDetail = (view: RecipeDetailView) => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.fn(() => Promise.resolve({ unchanged: false as const, version: 'v1', data: view }));
    api.recipes.get = get;
    return { api, get };
  };

  it('reads again with the servings chosen', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.spyOn(api.recipes, 'get');
    renderApp(`/recipes/${WOK}`, { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ recipeId: WOK, servings: 7 }), expect.anything()));
  });
  it('adds a planned meal that passes while the page is open to the last five times, without reading again', async () => {
    const history = ['2026-10-01', '2026-09-24', '2026-09-17', '2026-09-10', '2026-09-03'].map((date) => ({ date, mealType: 'dinner' as const }));
    // Now is 2026-10-08T10:00:00Z: today's lunch passes 50 ms later.
    const { api, get } = withDetail(detail({ history, upcoming: [{ date: '2026-10-08', mealType: 'lunch', passesAt: '2026-10-08T10:00:00.050Z' }] }));
    renderApp('/recipes/r1', { api });
    const list = () => screen.getByRole('heading', { name: 'Le ultime volte' }).parentElement!.querySelectorAll('li');
    await screen.findByText('giovedì 1 ottobre, Cena');
    expect(list()).toHaveLength(5);
    act(() => vi.setSystemTime(new Date('2026-10-08T10:01:00Z')));
    await waitFor(() => expect(list()[0]?.textContent).toBe('giovedì 8 ottobre, Pranzo'));
    expect(list()).toHaveLength(5);
    expect(screen.queryByText('giovedì 3 settembre, Cena')).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('shows time and food group under the description, in Italian and British English', async () => {
    const first = renderApp('/recipes/r1', { api: withDetail(detail()).api });
    expect((await screen.findByText(/Uova/)).textContent).toBe('15 min · Uova');
    first.unmount();
    renderApp('/recipes/r1', { api: withDetail(detail()).api, extra: <LanguageSwitch /> });
    await screen.findByText(/Uova/);
    fireEvent.click(screen.getByText('test: english'));
    expect((await screen.findByText(/Eggs/)).textContent).toBe('15 min · Eggs');
  });
  it('shows the group alone without a time, and no line without either', async () => {
    const view = withDetail(detail({ recipe: { ...detail().recipe, durationMinutes: null } }));
    const first = renderApp('/recipes/r1', { api: view.api });
    expect((await screen.findByText(/Uova/)).textContent).toBe('Uova');
    first.unmount();
    const bare = withDetail(detail({ recipe: { ...detail().recipe, durationMinutes: null, proteinGroup: null } }));
    const { container } = renderApp('/recipes/r1', { api: bare.api });
    await screen.findByRole('heading', { name: 'Frittata' });
    expect(container.querySelector('.meal-meta')).toBeNull();
  });
  it('shows no empty paragraph without a description', async () => {
    const { api } = withDetail(detail());
    const { container } = renderApp('/recipes/r1', { api });
    await screen.findByRole('heading', { name: 'Frittata' });
    expect(container.querySelector('.description')).toBeNull();
  });
  it('says the recipe is not available when the Worker answers not_found', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.recipes.get = () => Promise.reject(new ApiError('not_found'));
    renderApp('/recipes/r1', { api });
    expect(await screen.findByRole('heading', { name: 'Ricetta non disponibile' })).toBeTruthy();
  });
  it('refuses a rating offline at once and sends nothing', async () => {
    const data = createFakeData();
    const before = structuredClone(data.ratings);
    renderApp(`/recipes/${WOK}`, { api: createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, data }) });
    const star = await screen.findByLabelText(/Dai 1 stella a Wok/);
    act(() => setOnline(false));
    fireEvent.click(star);
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(data.ratings).toEqual(before);
    expect(data.revision).toBe(1);
  });
  it('sends the rating online and shows the answer', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const set = vi.spyOn(api.ratings, 'set');
    renderApp(`/recipes/${WOK}`, { api });
    fireEvent.click(await screen.findByLabelText(/Dai 1 stella a Wok/));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, recipeId: WOK, stars: 1 }, expect.anything()));
    expect(await screen.findByLabelText(/Il tuo voto: 1 stella\./)).toBeTruthy();
  });
});

describe('previous data only within the same view (second review, C7)', () => {
  type GetInput = Parameters<ReturnType<typeof createFakeApi>['recipes']['get']>[0];
  /** Fake client whose recipe reads matching `held` never answer. */
  const holding = (held: (input: GetInput, locale: string) => boolean): CreateApi => (user) => (locale) => {
    const api = createFakeApi({ getLocale: () => locale, user: user ?? undefined, latencyMs: 0 });
    const get = api.recipes.get;
    api.recipes.get = (input) => (held(input, locale) ? new Promise(() => {}) : get(input));
    return api;
  };
  const wokTitle = () => screen.queryByRole('link', { name: /Wok di pollo/ });

  it('shows no data of the previous recipe while another one loads', async () => {
    const { history } = renderApp(`/recipes/${WOK}`, { createApi: holding((input) => input.recipeId !== WOK) });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    history.push('/recipes/omelette-spinaci-montasio');
    await screen.findByText('Caricamento…');
    expect(wokTitle()).toBeNull();
  });
  it('shows no data of the previous meal while the recipe of another meal loads', async () => {
    const { history } = renderApp(`/recipes/${WOK}?from=menu&day=2026-10-08&slot=2026-10-08-lunch`, {
      createApi: holding((input) => input.slotId === '2026-10-08-dinner')
    });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    history.push(`/recipes/${WOK}?from=menu&day=2026-10-08&slot=2026-10-08-dinner`);
    await screen.findByText('Caricamento…');
    expect(wokTitle()).toBeNull();
  });
  it('never shows the recipe in the previous language while the new one loads', async () => {
    renderApp(`/recipes/${WOK}`, { createApi: holding((_input, locale) => locale === 'en-GB'), extra: <LanguageSwitch /> });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    // A first round trip puts both profiles in cache: the page stays mounted on the last switch.
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByText('Loading…');
    fireEvent.click(screen.getByText('test: italiano'));
    await screen.findByRole('link', { name: /Wok di pollo/ });
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByText('Loading…');
    expect(wokTitle()).toBeNull();
  });
  it('keeps the recipe while only the servings change, with the ingredients marked as updating', async () => {
    renderApp(`/recipes/${WOK}`, { createApi: holding((input) => input.servings === 7) });
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(screen.getByLabelText('Ingredienti').getAttribute('aria-busy')).toBe('true'));
    expect(wokTitle()).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Porzioni' }).textContent).toContain('7 porzioni');
  });
});

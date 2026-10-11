import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../api/fake/fakeApi';
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
    expect(await screen.findByText('Contenuto non trovato.')).toBeTruthy();
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

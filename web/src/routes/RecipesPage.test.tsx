import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { setOnline } from '../test/connectivity';
import type { CreateApi } from '../session/SessionScope';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';

const WOK = 'Wok di pollo con peperoni, carote e zucchine; riso basmati';

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

describe('previous data only within the same view (second review, C7)', () => {
  it('never shows the list in the previous language while the new one loads', async () => {
    const createApi: CreateApi = (user, getLocale) => {
      const api = createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 0 });
      const search = api.recipes.search;
      api.recipes.search = (input) => (getLocale() === 'en-GB' ? new Promise(() => {}) : search(input));
      return api;
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

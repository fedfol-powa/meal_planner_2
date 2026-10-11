import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, createFakeData } from '../api/fake/fakeApi';
import type { Api, RatingSummary } from '../api/types';
import { addDays } from '../lib/calendar';
import { setOnline } from '../test/connectivity';
import { renderApp } from '../test/renderApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome.
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const current = () => within(screen.getByRole('navigation', { name: 'Giorni della settimana' })).getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'location');

describe('menu', () => {
  it('opens on today with the month bar and the week', async () => {
    renderApp('/menu');
    await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
    expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre');
    expect(screen.getByRole('button', { name: 'ottobre 2026' })).toBeTruthy();
    expect(screen.getByText('Doppia dose, avanza per venerdì', { exact: false })).toBeTruthy();
    expect(screen.getByText('Cambiato da Anna, venerdì 21:30')).toBeTruthy();
    const bag = screen.getByRole('button', { name: 'Lista della spesa (in arrivo)' });
    expect((bag as HTMLButtonElement).disabled).toBe(true);
  });
  it('opens the requested day', async () => {
    renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    expect(current()?.getAttribute('aria-label')).toBe('martedì 6 ottobre');
  });
  it('falls back to the opening day for malformed or unknown days', async () => {
    const malformed = renderApp('/menu?day=domani');
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    malformed.unmount();
    const { history } = renderApp('/menu?day=2030-01-07');
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    expect(history.location.search).not.toContain('2030');
  });
  it('selects a day from the selector and keeps it in the address', async () => {
    const { history } = renderApp('/menu');
    fireEvent.click(await screen.findByRole('link', { name: 'lunedì 5 ottobre' }));
    await waitFor(() => expect(history.location.search).toContain('2026-10-05'));
    expect(current()?.getAttribute('aria-label')).toBe('lunedì 5 ottobre');
  });
  it('chooses any day with a menu from the calendar', async () => {
    const { history } = renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli un giorno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'lunedì 12 ottobre' }) as HTMLButtonElement).disabled).toBe(false));
    expect((within(dialog).getByRole('button', { name: 'sabato 31 ottobre' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'lunedì 12 ottobre' }));
    await waitFor(() => expect(history.location.search).toContain('2026-10-12'));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('lunedì 12 ottobre'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('goes back to the opening day when Menu is tapped on the menu', async () => {
    const { history } = renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
    await waitFor(() => expect(history.location.search).not.toContain('2026-10-06'));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
  });
  it('keeps the chosen day when coming back from the recipes', async () => {
    const { history } = renderApp('/menu?day=2026-10-06');
    await screen.findByRole('link', { name: 'martedì 6 ottobre' });
    fireEvent.click(screen.getByRole('link', { name: 'Ricettario' }));
    await waitFor(() => expect(history.location.pathname).toBe('/recipes'));
    fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
    await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('martedì 6 ottobre'));
  });
  it('links each meal to its recipe with the meal reference', async () => {
    renderApp('/menu');
    await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
    const details = screen.getAllByRole('link', { name: 'Scheda ricetta' }).map((a) => a.getAttribute('href') ?? '');
    expect(details.length).toBeGreaterThan(0);
    expect(details.every((href) => /from=menu&day=\d{4}-\d{2}-\d{2}&slot=\d{4}-\d{2}-\d{2}-(lunch|dinner)/.test(href))).toBe(true);
  });
  it('offers to retry a week that failed to load', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const getWeek = api.menu.getWeek;
    let calls = 0;
    api.menu.getWeek = (input) => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : getWeek(input));
    renderApp('/menu', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('link', { name: 'giovedì 8 ottobre' })).toBeTruthy();
  });
  it('gives focus back to the calendar icon after choosing a day or pressing Escape', async () => {
    renderApp('/menu');
    const icon = await screen.findByRole('button', { name: 'Scegli un giorno' });
    icon.focus();
    fireEvent.click(icon);
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'martedì 6 ottobre' }));
    await waitFor(() => expect(document.activeElement).toBe(icon));
    fireEvent.click(icon);
    await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(icon);
  });
  it('gives focus back to the month when the calendar was opened from it', async () => {
    renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'ottobre 2026' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect((within(dialog).getByRole('button', { name: 'lunedì 5 ottobre' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'lunedì 5 ottobre' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ottobre 2026' })));
  });
  it('does not steal focus from the month arrows when the days are read again', async () => {
    renderApp('/menu');
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli un giorno' }));
    const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mese successivo' }));
    const previous = within(dialog).getByRole('button', { name: 'Mese precedente' });
    previous.focus();
    fireEvent.click(previous);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'giovedì 8 ottobre' })).toBeTruthy());
    await new Promise((r) => setTimeout(r, 20));
    expect(document.activeElement).toBe(previous);
  });
  it('says when the family has no menu yet', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.menu.getOpening = async () => ({ unchanged: false, version: 'opening-1', data: { kind: 'no_weeks' } });
    renderApp('/menu', { api });
    expect(await screen.findByRole('heading', { name: 'Ancora nessun menu' })).toBeTruthy();
  });
  it('asks the opening for the family local date, not the device one', async () => {
    vi.setSystemTime(new Date('2026-10-08T22:30:00Z')); // 00:30 on Friday 9 October in Rome
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const getOpening = vi.spyOn(api.menu, 'getOpening');
    renderApp('/menu', { api });
    await screen.findByRole('link', { name: 'venerdì 9 ottobre' });
    expect(getOpening).toHaveBeenCalledWith(expect.objectContaining({ today: '2026-10-09' }), expect.anything());
  });
  it.each([
    ['it-IT', 'Nessuna ricetta adatta', 'giovedì 8 ottobre'],
    ['en-GB', 'No suitable recipe', 'Thursday 8 October']
  ] as const)('shows a generated week with no suitable recipe as empty meals, not as no menu (%s)', async (locale, title, day) => {
    // The language of the screens comes from the profile.
    const shared = createFakeData();
    shared.profile.locale = locale;
    const api = createFakeApi({ getLocale: () => locale, data: shared, latencyMs: 0 });
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-10-05', i));
    api.menu.getOpening = async () => ({ unchanged: false, version: 'o1', data: { kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' } });
    api.menu.getWeek = async () => ({
      unchanged: false,
      version: 'w1',
      data: {
        startsOn: '2026-10-05',
        days: days.map((date) => ({
          date,
          meals: (['lunch', 'dinner'] as const).map((mealType) => ({
            slotId: crypto.randomUUID(), date, mealType, kind: 'empty' as const, recipe: null, freeText: null, servings: 2,
            ingredients: null, note: null, rating: null, canOpenRecipe: false, lastChange: null
          }))
        }))
      }
    });
    renderApp('/menu', { api, locale });
    await screen.findByRole('link', { name: day });
    expect(screen.getAllByRole('heading', { name: title }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Ancora nessun menu|No menu yet/)).toBeNull();
  });
  it('applies a rating given from the menu only after the server confirms it', async () => {
    const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    let confirm: (value: RatingSummary) => void = () => {};
    const set = vi.fn<Api['ratings']['set']>(() => new Promise<RatingSummary>((resolve) => (confirm = resolve)));
    const api: Api = { ...base, ratings: { set } };
    renderApp('/menu', { api });
    await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
    const today = screen.getAllByRole('region').find((r) => r.id === 'day-2026-10-08') ?? document.getElementById('day-2026-10-08')!;
    const toggle = within(today).getAllByRole('button', { name: /Voto della famiglia/ })[0]!;
    fireEvent.click(toggle);
    const star = within(today).getAllByLabelText(/^Dai 5 stelle a /)[0]!;
    fireEvent.click(star);
    expect(await screen.findByText('Invio del voto…')).toBeTruthy();
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ stars: 5 }), expect.anything());
    expect(within(today).queryByText('3,0')).toBeNull();
    await act(async () => confirm({ familyAverage: 3, familyCount: 9, myStars: 5 }));
    await waitFor(() => expect(within(today).getAllByText('3,0').length).toBeGreaterThan(0));
    expect(screen.queryByText('Invio del voto…')).toBeNull();
  });

  describe('offline after the day changed', () => {
    afterEach(() => setOnline(true));
    async function openThenGoOffline() {
      const view = renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      fireEvent.click(screen.getByRole('link', { name: 'Profilo' }));
      await waitFor(() => expect(view.history.location.pathname).toBe('/profile'));
      act(() => setOnline(false));
      vi.setSystemTime(new Date('2026-10-09T08:00:00Z')); // Friday: a new opening, never read
      return view;
    }
    it('opens on the new day from the weeks already saved', async () => {
      await openThenGoOffline();
      fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('venerdì 9 ottobre'));
      expect(screen.getByRole('region', { name: 'Pasti della settimana' })).toBeTruthy();
    });
    it('shows a requested day of a saved week', async () => {
      const { history } = await openThenGoOffline();
      act(() => history.push('/menu?day=2026-10-06'));
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('martedì 6 ottobre'));
    });
  });

});

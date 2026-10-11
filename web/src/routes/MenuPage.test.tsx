import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
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
    // The bag opens the list of the week shown, coming back to the same day.
    const bag = screen.getByRole('link', { name: 'Lista della spesa' });
    expect(bag.getAttribute('href')).toBe('/shopping/2026-10-05?day=2026-10-08');
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
});

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { DEMO_FAMILY_ID } from '../../api/fake/seed';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { createMemoryStore } from '../../api/persister';
import { FAMILY, grams, item, listView, MONDAY, ops, RICE, TOMATO } from './fixtures';
import { queueKey } from './storage';
import { createShoppingServer } from './testServer';

// The list is shown: its «…» menu exists only then (the title is already there while loading, W20).
const listShown = () => screen.findByRole('button', { name: 'Azioni della lista' });

const PATH = `/shopping/${MONDAY}?day=2026-10-14`;
const withOptionalRice = () =>
  listView({
    departments: [
      ...listView().departments.slice(0, 1),
      { department: 'pasta_grains', items: [item(RICE, 'Riso', { department: 'pasta_grains', quantity: '300 g', combined: grams(300), isOptional: true })] }
    ],
    skipped: [
      { slotId: 'b0000000-0000-4000-8000-000000000001', recipeId: 'b0000000-0000-4000-8000-000000000002', recipeName: 'Zuppa del giorno' },
      { slotId: 'b0000000-0000-4000-8000-000000000003', recipeId: 'b0000000-0000-4000-8000-000000000004', recipeName: null }
    ]
  });

function open(options: { base?: Parameters<typeof createShoppingServer>[0]; path?: string } = {}) {
  const server = createShoppingServer(options.base, DEMO_FAMILY_ID);
  const rendered = renderApp(options.path ?? PATH, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
  return { server, ...rendered };
}

const tomatoBox = () => screen.getByRole('checkbox', { name: 'Preso o già in casa: Pomodori' }) as HTMLInputElement;
const row = (box: HTMLElement) => box.closest('li')!;
// The bottom bar has a «Menu» link too: the one of the page header.
const backLink = () => within(document.querySelector('.page-header') as HTMLElement).getByRole('link', { name: 'Menu' });

describe('shopping page', () => {
  it('shows the departments in the order of the domain, with names, quantities and optional items', async () => {
    open({ base: withOptionalRice });
    await listShown();
    expect(screen.getByRole('heading', { level: 1, name: 'Settimana 12–18 ottobre' })).toBeTruthy();
    expect(screen.getByText('3 pasti')).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Frutta e verdura', 'Pasta, riso e cereali', 'Altro']);
    const rice = row(screen.getByRole('checkbox', { name: 'Preso o già in casa: Riso' }));
    expect(within(rice).getByText('300 g')).toBeTruthy();
    expect(within(rice).getByText('· facoltativo', { exact: false })).toBeTruthy();
    expect(screen.getByText('Senza ingredienti disponibili: Zuppa del giorno, Ricetta non ancora pubblicata')).toBeTruthy();
  });

  it('ticks at once with the sync mark, sends the quantity shown, and clears the mark once confirmed', async () => {
    const { server } = open();
    await listShown();
    server.holdNextWrite();
    fireEvent.click(tomatoBox());
    await waitFor(() => expect(tomatoBox().checked).toBe(true));
    expect(within(row(tomatoBox())).getByRole('img', { name: 'da sincronizzare' })).toBeTruthy();
    expect(screen.getByText('Modifiche salvate su questo telefono, da sincronizzare')).toBeTruthy();
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    expect(server.applied[0]).toMatchObject({ input: { checked: true, quantityAtCheck: grams(200) } });
    act(() => server.releaseWrite());
    await waitFor(() => expect(screen.queryByText('Modifiche salvate su questo telefono, da sincronizzare')).toBeNull());
    expect(within(row(tomatoBox())).queryByRole('img', { name: 'da sincronizzare' })).toBeNull();
    expect(tomatoBox().checked).toBe(true);
  });

  it('shows «prima» when the item grew, also while the tick is still queued', async () => {
    const { server } = open();
    await listShown();
    setOnline(false);
    fireEvent.click(tomatoBox());
    await waitFor(() => expect(tomatoBox().checked).toBe(true));
    // Another member doubles the portions: the next read brings 400 g.
    server.setBase(() => listView({ departments: [{ department: 'produce', items: [item(TOMATO, 'Pomodori', { quantity: '400 g', combined: grams(400) })] }] }));
    setOnline(true);
    server.failNext(new ApiError('network'));
    await waitFor(() => expect(screen.getByText('400 g')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('prima: 200 g')).toBeTruthy());
    expect(tomatoBox().checked).toBe(false);
  });

  it('adds a free item with Enter, ignores an empty one and limits the length', async () => {
    const { server } = open();
    await listShown();
    const field = screen.getByRole('textbox', { name: 'Aggiungi una voce' }) as HTMLInputElement;
    expect(field.maxLength).toBe(60);
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.submit(field.closest('form')!);
    fireEvent.change(field, { target: { value: '  Pane   integrale ' } });
    fireEvent.submit(field.closest('form')!);
    await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pane integrale' });
    expect(field.value).toBe('');
    await waitFor(() => expect(server.calls).toEqual(['addFreeItem']));
    expect(server.applied[0]).toMatchObject({ input: { text: 'Pane integrale' } });
  });

  it('puts an item back from «Non in lista»', async () => {
    const { server } = open();
    await listShown();
    expect(screen.getByText('Non in lista (2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rimetti in lista: Olio' }));
    await screen.findByRole('checkbox', { name: 'Preso o già in casa: Olio' });
    expect(screen.getByText('Non in lista (1)')).toBeTruthy();
    await waitFor(() => expect(server.calls).toEqual(['setAddedBack']));
  });

  it('shows a refused change until «Ok»', async () => {
    const { server } = open();
    await listShown();
    server.failNext(new ApiError('invalid'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Preso o già in casa: Detersivo' }));
    await screen.findByText('Modifica non salvata: Detersivo');
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));
    await waitFor(() => expect(screen.queryByText('Modifica non salvata: Detersivo')).toBeNull());
  });

  it('keeps the list editable offline with an unverified session, without calls', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const backend = createStubBackend(DEMO_USER);
    // A session that could not be renewed (unverified), the list read once, then no network in the shop.
    backend.setCheck({ status: 'unverified', user: DEMO_USER });
    renderApp(PATH, { createApi: () => (locale) => server.api(locale), backend });
    await listShown();
    setOnline(false);
    backend.refreshResult = { kind: 'network' };
    const calls = server.calls.length;
    fireEvent.click(tomatoBox());
    await waitFor(() => expect(tomatoBox().checked).toBe(true));
    expect(screen.getByText('Modifiche salvate su questo telefono, da sincronizzare')).toBeTruthy();
    expect(server.calls.length).toBe(calls);
  });

  it('waits for the queue saved on the phone before showing the list or exporting it (PR #22 review, finding 3)', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    server.holdNextWrite();
    const base = createMemoryStore();
    const tick = ops.tick(TOMATO);
    const saved = { ...tick, input: { ...tick.input, familyId: DEMO_FAMILY_ID } };
    base.entries.set(queueKey(DEMO_USER.id), { ops: [{ userId: DEMO_USER.id, queuedAt: 0, state: 'pending', label: 'Pomodori', op: saved }], notices: [], seq: 0 });
    // The first read of the queue from the device is slow.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const store = { ...base, get: async (key: string) => (key.startsWith('shopping-queue:') ? gate.then(() => base.get(key)) : base.get(key)) };
    renderApp(PATH, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER), store });
    await waitFor(() => expect(server.reads).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The title is real while waiting (W20); the list and its menu are not there yet.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Azioni della lista' })).toBeNull();
    act(() => release());
    await waitFor(() => expect(tomatoBox().checked).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Azioni della lista' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Bring!/ }));
    expect(server.createLink).not.toHaveBeenCalled();
  });

  it('reads the list of the family of the profile (PR #18)', async () => {
    const server = createShoppingServer(undefined, FAMILY);
    const family = { id: FAMILY, name: 'Famiglia Rossi', timeZone: 'Europe/Rome', measurementSystem: 'metric' as const, role: 'member' as const };
    const api = (locale: 'it-IT' | 'en-GB') => {
      const base = server.api(locale);
      return {
        ...base,
        profile: {
          ...base.profile,
          get: async () => ({ user: { id: DEMO_USER.id, displayName: 'Anna', email: DEMO_USER.email, locale, menuEmails: true, globalRoles: [] }, families: [family], currentFamilyId: FAMILY })
        }
      } as typeof base;
    };
    renderApp(PATH, { createApi: () => (locale) => api(locale), backend: createStubBackend(DEMO_USER) });
    await listShown();
    expect(server.reads).toHaveBeenCalledWith(expect.objectContaining({ familyId: FAMILY, weekStartsOn: MONDAY }));
    fireEvent.click(tomatoBox());
    await waitFor(() => expect(server.applied[0]).toMatchObject({ input: { familyId: FAMILY } }));
  });

  it('shows an empty state for a week without a menu, with the way back', async () => {
    open({ path: '/shopping/2026-11-02' });
    await screen.findByText('Nessun menu per questa settimana');
    expect(backLink().getAttribute('href')).toBe('/menu');
  });

  it('goes back to the menu day it was opened from', async () => {
    open();
    await listShown();
    expect(backLink().getAttribute('href')).toBe('/menu?day=2026-10-14');
  });
});

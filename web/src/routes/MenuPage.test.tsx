import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, createFakeData } from '../api/fake/fakeApi';
import type { Api, RatingSummary } from '../api/types';
import { addDays } from '../lib/calendar';
import { realClients } from '../api/clients';
import { createRpcClient } from '../api/rpc';
import { DEMO_USER } from '../auth/backend';
import { setOnline } from '../test/connectivity';
import { createRpcTestServer, SERVER_PROFILE, SERVER_RECIPE } from '../test/rpcServer';
import { createStubBackend } from '../test/stubBackend';
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
  describe('dragging the days', () => {
    // jsdom lays nothing out: the row is 350 px wide and the test drives the clock.
    let clock = 0;
    beforeEach(() => {
      clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(350);
    });
    afterEach(() => vi.restoreAllMocks());

    const row = () => current()!.closest('.day-links')!;
    const strip = () => row().querySelector<HTMLElement>('.day-strip')!;
    const finger = (x: number, y: number, identifier = 0) => ({ identifier, clientX: x, clientY: y });
    const touch = (x: number, y: number) => ({ touches: [finger(x, y)], changedTouches: [finger(x, y)] });
    /** Puts a finger down and moves it in four steps over `ms`, without lifting it. */
    function press(dx: number, { dy = 0, ms = 500, target = row() as Element } = {}) {
      fireEvent.touchStart(target, touch(200, 100));
      for (let i = 1; i <= 4; i++) {
        clock += ms / 4;
        fireEvent.touchMove(target, touch(200 + (dx * i) / 4, 100 + (dy * i) / 4));
      }
      return () => fireEvent.touchEnd(target, { touches: [], changedTouches: [finger(200 + dx, 100 + dy)] });
    }
    /** A slow drag by default: only the distance decides. */
    const drag = (dx: number, options: Parameters<typeof press>[1] = {}) => press(dx, options)();
    const offset = () => strip().style.transform;
    /** Demo data without the meals of some days. */
    function apiWithout(...days: string[]) {
      const data = createFakeData();
      for (const week of data.weeks) week.slots = week.slots.filter((slot) => !days.includes(slot.date));
      return createFakeApi({ getLocale: () => 'it-IT', data, latencyMs: 0 });
    }
    // The neighbouring dates and weeks are read in advance (latency 0, a few ticks).
    const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

    it('follows the finger and shows the days of the week alongside', async () => {
      renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      press(-60);
      expect(offset()).toBe('translateX(-60px)');
      const next = row().querySelector('.day-week-next')!;
      expect(next.getAttribute('aria-hidden')).toBe('true');
      expect([...next.querySelectorAll('strong')].map((d) => d.textContent)).toEqual(['12', '13', '14', '15', '16', '17', '18']);
      // The same weekday is marked, as it will be on arrival; nothing there can be focused.
      expect(next.querySelector('[aria-current="location"] strong')?.textContent).toBe('15');
      expect(next.querySelector('a, button, [tabindex]')).toBeNull();
      expect([...row().querySelectorAll('.day-week-previous strong')].map((d) => d.textContent)).toEqual(['28', '29', '30', '1', '2', '3', '4']);
    });
    it('goes back below a third of the row', async () => {
      const { history } = renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      drag(-110);
      await settle();
      expect(offset()).toBe('');
      expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre');
      expect(history.location.search).not.toContain('day=');
    });
    it('opens the same weekday of the next week past a third leftwards, as a new history entry', async () => {
      const { history } = renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      drag(-130);
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
      expect(offset()).toBe('');
      expect(history.location.search).toContain('2026-10-15');
      act(() => history.back());
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
    });
    it('opens the same weekday of the previous week past a third rightwards', async () => {
      renderApp('/menu?day=2026-10-06');
      await screen.findByRole('link', { name: 'martedì 6 ottobre' });
      await settle();
      drag(130);
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('martedì 29 settembre'));
    });
    it('changes week with a short quick flick', async () => {
      renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      drag(-40, { ms: 50 });
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
    });
    it('keeps the week alongside in view until its days arrive', async () => {
      renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      drag(-130);
      // The whole row and its divider: the days alongside now fill it.
      expect(offset()).toBe('translateX(-351px)');
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
      expect(offset()).toBe('');
    });
    it('resists towards a week that does not exist and goes back', async () => {
      const { history } = renderApp('/menu?day=2026-10-15');
      await screen.findByRole('link', { name: 'giovedì 15 ottobre' });
      await settle();
      expect(row().querySelector('.day-week-next')!.childElementCount).toBe(0);
      const release = press(-200);
      const moved = -Number(/-?[\d.]+/.exec(offset())![0]);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(100);
      release();
      await settle();
      expect(offset()).toBe('');
      expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre');
      expect(history.location.search).toContain('2026-10-15');
    });
    it('leaves vertical moves to the page', async () => {
      const { history } = renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      const release = press(-40, { dy: 90 });
      expect(offset()).toBe('');
      release();
      await settle();
      expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre');
      expect(history.location.search).not.toContain('day=');
    });
    it('keeps a tap on a day as the choice of that day', async () => {
      const { history } = renderApp('/menu');
      const monday = await screen.findByRole('link', { name: 'lunedì 5 ottobre' });
      await settle();
      drag(0, { target: monday });
      fireEvent.click(monday);
      await waitFor(() => expect(history.location.search).toContain('2026-10-05'));
      expect(current()?.getAttribute('aria-label')).toBe('lunedì 5 ottobre');
    });
    it('does not also choose the day under the finger after a drag', async () => {
      renderApp('/menu');
      const monday = await screen.findByRole('link', { name: 'lunedì 5 ottobre' });
      await settle();
      drag(-130, { target: monday });
      fireEvent.click(monday, { detail: 1 });
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
    });
    it('opens the same weekday even when that day has no meals', async () => {
      renderApp('/menu', { api: apiWithout('2026-10-15') });
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      drag(-130);
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
      expect(within(document.getElementById('day-2026-10-15')!).getByText('Nessun pasto pianificato in questo giorno.')).toBeTruthy();
    });
    it('finds a week across two months from the meals in the other month', async () => {
      // Week of 28 September: only the September days keep their meals.
      renderApp('/menu?day=2026-10-09', { api: apiWithout('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04') });
      await screen.findByRole('link', { name: 'venerdì 9 ottobre' });
      await settle();
      drag(130);
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('venerdì 2 ottobre'));
    });
    it('ignores a drag made while a second finger touched outside the row', async () => {
      const { history } = renderApp('/menu');
      await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
      await settle();
      const target = row();
      fireEvent.touchStart(target, touch(200, 100));
      fireEvent.touchMove(target, touch(150, 100));
      fireEvent.touchStart(document.body, { touches: [finger(150, 100), finger(50, 500, 1)], changedTouches: [finger(50, 500, 1)] });
      expect(offset()).toBe('');
      fireEvent.touchEnd(document.body, { touches: [finger(150, 100)], changedTouches: [finger(50, 500, 1)] });
      fireEvent.touchMove(target, touch(20, 100));
      fireEvent.touchEnd(target, { touches: [], changedTouches: [finger(20, 100)] });
      await settle();
      expect(offset()).toBe('');
      expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre');
      expect(history.location.search).not.toContain('day=');
    });
    it('lets a new tap choose a day right after a drag that went back', async () => {
      const { history } = renderApp('/menu?day=2026-10-15');
      const monday = await screen.findByRole('link', { name: 'lunedì 12 ottobre' });
      await settle();
      drag(-130);
      fireEvent.touchStart(monday, touch(40, 100));
      fireEvent.touchEnd(monday, { touches: [], changedTouches: [finger(40, 100)] });
      fireEvent.click(monday, { detail: 1 });
      await waitFor(() => expect(history.location.search).toContain('2026-10-12'));
    });
    it('lets the keyboard choose a day right after a drag', async () => {
      const { history } = renderApp('/menu?day=2026-10-15');
      const monday = await screen.findByRole('link', { name: 'lunedì 12 ottobre' });
      await settle();
      drag(-130);
      fireEvent.click(monday, { detail: 0 });
      await waitFor(() => expect(history.location.search).toContain('2026-10-12'));
    });
    it('lets a mouse press choose a day right after a drag, with a click without pointer type', async () => {
      const { history } = renderApp('/menu?day=2026-10-15');
      const monday = await screen.findByRole('link', { name: 'lunedì 12 ottobre' });
      await settle();
      drag(-130);
      fireEvent.pointerDown(monday, { pointerType: 'mouse' });
      // A plain MouseEvent, without pointerType, as older Safari sends it.
      fireEvent.click(monday, { detail: 1 });
      await waitFor(() => expect(history.location.search).toContain('2026-10-12'));
    });
    describe('with the Web Animations API', () => {
      const cancel = vi.fn();
      // jsdom has none: the test lends one to the elements, with animations that never end.
      const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
      beforeEach(() => {
        cancel.mockClear();
        animate.mockClear();
        HTMLElement.prototype.animate = animate;
      });
      afterEach(() => {
        delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
        delete (window as Partial<Window>).matchMedia;
      });

      it('animates the way back, takes the row from where it is and stops when the days go away', async () => {
        const view = renderApp('/menu?day=2026-10-15');
        await screen.findByRole('link', { name: 'giovedì 15 ottobre' });
        await settle();
        drag(60);
        expect(animate).toHaveBeenCalledTimes(1);
        // Halfway back, a new touch holds the row where it is.
        strip().style.transform = 'translateX(30px)';
        fireEvent.touchStart(row(), touch(200, 100));
        expect(cancel).toHaveBeenCalledTimes(1);
        fireEvent.touchMove(row(), touch(220, 100));
        expect(offset()).toBe('translateX(50px)');
        fireEvent.touchEnd(row(), { touches: [], changedTouches: [finger(220, 100)] });
        expect(animate).toHaveBeenCalledTimes(2);
        view.unmount();
        expect(cancel).toHaveBeenCalledTimes(2);
      });
      it('completes and goes back at once with reduced motion, still following the finger', async () => {
        window.matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList);
        renderApp('/menu');
        await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
        await settle();
        const release = press(-60);
        expect(offset()).toBe('translateX(-60px)');
        release();
        expect(offset()).toBe('');
        drag(-130);
        await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
        expect(animate).not.toHaveBeenCalled();
      });
    });
    it('reads the weeks alongside in advance: offline, the next one opens at once', async () => {
      try {
        renderApp('/menu');
        await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
        await settle();
        act(() => setOnline(false));
        drag(-130);
        await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 15 ottobre'));
      } finally {
        setOnline(true);
      }
    });
    it('offline, opens a week whose days are known but not saved and waits for it, as the calendar does', async () => {
      const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
      const getWeek = api.menu.getWeek;
      // The reading in advance of the next week never ends.
      api.menu.getWeek = (input) => (input.weekStartsOn === '2026-10-12' ? new Promise(() => {}) : getWeek(input));
      try {
        const { history } = renderApp('/menu', { api });
        await screen.findByRole('link', { name: 'giovedì 8 ottobre' });
        await settle();
        act(() => setOnline(false));
        drag(-130);
        await waitFor(() => expect(history.location.search).toContain('2026-10-15'));
        expect(await screen.findByText('Caricamento…')).toBeTruthy();
      } finally {
        setOnline(true);
      }
    });
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

  it('in real mode opens the family of the profile read from the Worker, with its local date', async () => {
    vi.setSystemTime(new Date('2026-10-08T22:30:00Z')); // 00:30 on the 9th in Rome, the family's zone
    const server = createRpcTestServer();
    const backend = createStubBackend(DEMO_USER);
    const rpc = createRpcClient({ getCredentials: () => backend.getCredentials(), fetch: server.fetch });
    renderApp('/menu', { backend, createApi: realClients({ rpc, latencyMs: 0 }) });
    // The test server answers no_weeks: the menu says so, from the server's answer.
    expect(await screen.findByRole('heading', { name: 'Ancora nessun menu' })).toBeTruthy();
    expect(server.openingSeen).toEqual([{ familyId: SERVER_PROFILE.currentFamilyId, today: '2026-10-09' }]);
  });

  describe('real client: vote, recipe card and recipe book with the menu', () => {
    const FAMILY = SERVER_PROFILE.currentFamilyId!;
    const SLOT = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    function realApp(path: string) {
      const server = createRpcTestServer();
      // On Thursday 8 October the menu opens on today; Wednesday's lunch, with the server's recipe, is past.
      server.answerMenu({
        opening: { kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' },
        week: {
          startsOn: '2026-10-05',
          days: Array.from({ length: 7 }, (_, i) => {
            const date = addDays('2026-10-05', i);
            return {
              date,
              meals:
                date === '2026-10-07'
                  ? [{
                      slotId: SLOT, date, mealType: 'lunch' as const, kind: 'recipe' as const, recipe: SERVER_RECIPE.recipe, freeText: null, servings: 4,
                      ingredients: SERVER_RECIPE.ingredients, note: null, rating: SERVER_RECIPE.rating, canOpenRecipe: true, lastChange: null
                    }]
                  : []
            };
          })
        }
      });
      const backend = createStubBackend(DEMO_USER);
      const rpc = createRpcClient({ getCredentials: () => backend.getCredentials(), fetch: server.fetch });
      return { server, ...renderApp(path, { backend, createApi: realClients({ rpc, latencyMs: 0 }) }) };
    }
    const noRevocation = () => expect(screen.queryByText(/Non hai accesso a questa famiglia/)).toBeNull();

    it('rates a past meal through ratings.set on the Worker and shows the confirmed summary', async () => {
      const { server } = realApp('/menu?day=2026-10-07');
      await screen.findByRole('heading', { name: /Ricetta dal server/ });
      fireEvent.click(screen.getByRole('button', { name: /Voto della famiglia/ }));
      fireEvent.click(screen.getByLabelText('Dai 4 stelle a Ricetta dal server'));
      await waitFor(() => expect(server.recipeCalls).toContainEqual({ op: 'ratings.set', input: { familyId: FAMILY, recipeId: SERVER_RECIPE.recipe.id, stars: 4 } }));
      expect((await screen.findAllByText('4,0')).length).toBeGreaterThan(0);
      noRevocation();
    });

    it('opens the recipe card of a past meal from the Worker, with the meal it was eaten at', async () => {
      const { server, history } = realApp('/menu?day=2026-10-07');
      await screen.findByRole('heading', { name: /Ricetta dal server/ });
      fireEvent.click(screen.getByRole('link', { name: 'Scheda ricetta' }));
      await waitFor(() => expect(history.location.pathname).toBe(`/recipes/${SERVER_RECIPE.recipe.id}`));
      await waitFor(() => expect(server.recipeCalls.find((c) => c.op === 'recipes.get')?.input).toMatchObject({ familyId: FAMILY, recipeId: SERVER_RECIPE.recipe.id, slotId: SLOT }));
      noRevocation();
    });

    it('goes from the recipe book to the menu and back with no false forbidden', async () => {
      const { server, history } = realApp('/recipes');
      expect(await screen.findByText('Ricetta dal server')).toBeTruthy();
      fireEvent.click(screen.getByRole('link', { name: 'Menu' }));
      await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe('giovedì 8 ottobre'));
      expect(server.openingSeen.map((o) => o.familyId)).toEqual([FAMILY]);
      fireEvent.click(screen.getByRole('link', { name: 'Ricettario' }));
      await waitFor(() => expect(history.location.pathname).toBe('/recipes'));
      expect(await screen.findByText('Ricetta dal server')).toBeTruthy();
      noRevocation();
    });
  });

});

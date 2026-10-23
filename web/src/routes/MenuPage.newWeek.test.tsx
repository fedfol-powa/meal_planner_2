import type { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, DEMO_FAMILY_ID } from '../api/fake/fakeApi';
import { familyAccessOf, queryKeys, weekVisits } from '../api/queries';
import type { Api, ProfileView } from '../api/types';
import picker from '../components/DatePicker.module.css';
import type { Session } from '../session/session';
import { useSession } from '../session/SessionScope';
import { setOnline } from '../test/connectivity';
import { renderApp } from '../test/renderApp';

// W24, spec 6.1: the dot on the calendar icon and the days of the new week in green.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 22 October 2026, 12:00 in Rome: the menu of the week of 26 October is ready.
  vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setOnline(true);
});

const NEW_WEEK = '2026-10-26';
const FRESH = ['lunedì 26 ottobre', 'martedì 27 ottobre', 'mercoledì 28 ottobre', 'giovedì 29 ottobre', 'venerdì 30 ottobre', 'sabato 31 ottobre'];
const WITH_DOT = 'Scegli un giorno, menu della settimana prossima pronto';

type NewWeekInput = { familyId: string };
type SeenInput = { familyId: string; weekStartsOn: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

/** The demo backend with the two operations of the notice observed (and replaceable). */
function newWeekApi(overrides: { getNewWeek?: (input: NewWeekInput) => Promise<{ weekStartsOn: string | null }>; markWeekSeen?: (input: SeenInput) => Promise<{ ok: true }> } = {}) {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const getNewWeek = vi.fn((input: NewWeekInput) => (overrides.getNewWeek ? overrides.getNewWeek(input) : base.menu.getNewWeek(input)));
  const markWeekSeen = vi.fn((input: SeenInput) => (overrides.markWeekSeen ? overrides.markWeekSeen(input) : base.menu.markWeekSeen(input)));
  const api = { ...base, menu: { ...base.menu, getNewWeek, markWeekSeen } } as unknown as Api;
  return { api, base, getNewWeek, markWeekSeen, seen: () => markWeekSeen.mock.calls.map(([input]) => ({ familyId: input.familyId, weekStartsOn: input.weekStartsOn })) };
}

/** The session of the rendered app, for the tests that act on it. */
function captureSession() {
  const seen: { session: Session | null } = { session: null };
  function Capture() {
    seen.session = useSession();
    return null;
  }
  return { extra: <Capture />, session: () => seen.session!, queryClient: (): QueryClient => seen.session!.queryClient };
}

const current = () => within(screen.getByRole('navigation', { name: 'Giorni della settimana' })).getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'location');
async function dayShown(name: string) {
  await waitFor(() => expect(current()?.getAttribute('aria-label')).toBe(name));
  await waitFor(() => expect(document.querySelector('.calendar [aria-busy="true"]')).toBeNull());
}
const icon = () => screen.getByRole('button', { name: /^Scegli un giorno/ });
const dot = () => icon().querySelector(`.${picker.dot}`);
async function dotShown() {
  await screen.findByRole('button', { name: WITH_DOT });
  expect(dot()?.getAttribute('aria-hidden')).toBe('true');
}
async function dotGone() {
  await screen.findByRole('button', { name: 'Scegli un giorno' });
  expect(dot()).toBeNull();
}
/** Opens the month and waits for its days with a menu. */
async function openCalendar() {
  if (icon().getAttribute('aria-expanded') !== 'true') fireEvent.click(icon());
  const dialog = await screen.findByRole('dialog', { name: 'Scegli un giorno' });
  await waitFor(() => expect((within(dialog).getByRole('button', { name: /^giovedì 22 ottobre/ }) as HTMLButtonElement).disabled).toBe(false));
  return dialog;
}
const freshDays = (dialog: HTMLElement) => [...dialog.querySelectorAll(`.${picker.fresh}`)].map((day) => day.getAttribute('aria-label'));
async function chooseInCalendar(name: RegExp) {
  const dialog = await openCalendar();
  fireEvent.click(within(dialog).getByRole('button', { name }));
}
const tick = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe('notice of the new week', () => {
  it('marks the calendar icon and the days of the new week, with their names', async () => {
    const { api, markWeekSeen } = newWeekApi();
    renderApp('/menu', { api });
    await dayShown('giovedì 22 ottobre');
    await dotShown();
    const dialog = await openCalendar();
    for (const name of FRESH) {
      const day = within(dialog).getByRole('button', { name: `${name}, settimana nuova` });
      expect(day.classList.contains(picker.fresh!)).toBe(true);
    }
    expect(freshDays(dialog)).toEqual(FRESH.map((name) => `${name}, settimana nuova`));
    expect(within(dialog).getByRole('button', { name: 'domenica 25 ottobre' }).classList.contains(picker.fresh!)).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'giovedì 22 ottobre' }).getAttribute('aria-pressed')).toBe('true');
    expect(markWeekSeen).not.toHaveBeenCalled();
  });

  it('a day of the new week chosen in the calendar marks the week seen and switches the notice off', async () => {
    const { api, seen } = newWeekApi();
    renderApp('/menu', { api });
    await dotShown();
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await dayShown('lunedì 26 ottobre');
    await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
    await dotGone();
    const dialog = await openCalendar();
    expect(freshDays(dialog)).toEqual([]);
    expect(within(dialog).getByRole('button', { name: 'lunedì 26 ottobre' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('a link to a day of the new week marks it seen', async () => {
    const { api, seen } = newWeekApi();
    renderApp('/menu?day=2026-10-28', { api });
    await dayShown('mercoledì 28 ottobre');
    await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
    await dotGone();
  });

  describe('swipe', () => {
    let clock = 0;
    beforeEach(() => {
      clock = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => clock);
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(350);
    });
    const finger = (x: number) => ({ identifier: 0, clientX: x, clientY: 100 });
    function drag(dx: number) {
      const row = current()!.closest('.day-links')!;
      fireEvent.touchStart(row, { touches: [finger(200)], changedTouches: [finger(200)] });
      for (let i = 1; i <= 4; i++) {
        clock += 125;
        fireEvent.touchMove(row, { touches: [finger(200 + (dx * i) / 4)], changedTouches: [finger(200 + (dx * i) / 4)] });
      }
      fireEvent.touchEnd(row, { touches: [], changedTouches: [finger(200 + dx)] });
    }

    it('the next week reached with a swipe of the days is seen', async () => {
      const { api, seen } = newWeekApi();
      renderApp('/menu', { api });
      await dayShown('giovedì 22 ottobre');
      await dotShown();
      // The weeks alongside are read in advance.
      await tick();
      drag(-130);
      await dayShown('giovedì 29 ottobre');
      await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
      await dotGone();
    });
  });

  it('no new week: no dot, no green and no call', async () => {
    const { api, markWeekSeen } = newWeekApi({ getNewWeek: async () => ({ weekStartsOn: null }) });
    renderApp('/menu', { api });
    await dayShown('giovedì 22 ottobre');
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await dayShown('lunedì 26 ottobre');
    await tick();
    expect(dot()).toBeNull();
    expect(icon().getAttribute('aria-label')).toBe('Scegli un giorno');
    expect(freshDays(await openCalendar())).toEqual([]);
    expect(markWeekSeen).not.toHaveBeenCalled();
  });

  it('a failed visit brings the dot back; the next visit of the week calls again', async () => {
    let fail = true;
    const { api, base, seen } = newWeekApi({ markWeekSeen: (input) => (fail ? Promise.reject(new ApiError('internal')) : base.menu.markWeekSeen(input)) });
    renderApp('/menu', { api });
    await dotShown();
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await dayShown('lunedì 26 ottobre');
    await waitFor(() => expect(seen()).toHaveLength(1));
    // Read again after the error: the server still says the week is new.
    await dotShown();
    // Not repeated while the week stays shown.
    await tick();
    expect(seen()).toHaveLength(1);
    // The chosen day stays the chosen one, also green.
    const dialog = await openCalendar();
    const chosen = within(dialog).getByRole('button', { name: 'lunedì 26 ottobre, settimana nuova' });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'giovedì 22 ottobre' }));
    await dayShown('giovedì 22 ottobre');
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }, { familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
    await dotGone();
  });

  it('the same week in two families is marked in each, without remounting the menu', async () => {
    const OTHER = '0f4b2c1d-6e7f-4a8b-9c0d-1e2f3a4b5c6d';
    const marked = new Set<string>();
    let shown = DEMO_FAMILY_ID;
    const asDemo = <I extends { familyId: string }>(input: I): I => ({ ...input, familyId: DEMO_FAMILY_ID });
    const { api, base, seen } = newWeekApi({
      getNewWeek: async ({ familyId }) => ({ weekStartsOn: marked.has(familyId) ? null : NEW_WEEK }),
      markWeekSeen: async ({ familyId }) => {
        marked.add(familyId);
        return { ok: true };
      }
    });
    // The other family has the same menu as the demo one.
    const menu = api.menu as unknown as Record<string, (input: { familyId: string }) => Promise<unknown>>;
    for (const operation of ['getOpening', 'getWeek', 'getDates'] as const) {
      const read = base.menu[operation] as unknown as (input: { familyId: string }) => Promise<unknown>;
      menu[operation] = (input) => read(asDemo(input));
    }
    const profileGet = base.profile.get;
    api.profile.get = (async () => {
      const profile = await profileGet({});
      const other = { ...profile.families[0]!, id: OTHER, name: 'Famiglia al mare' };
      return { ...profile, families: [...profile.families, other], currentFamilyId: shown } satisfies ProfileView;
    }) as Api['profile']['get'];
    const app = captureSession();
    renderApp('/menu?day=2026-10-26', { api, extra: app.extra });
    await dayShown('lunedì 26 ottobre');
    await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
    // MenuView has no key per family: the same instance follows the change.
    shown = OTHER;
    await act(() => app.queryClient().invalidateQueries({ queryKey: ['profile'] }));
    await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }, { familyId: OTHER, weekStartsOn: NEW_WEEK }]));
    await dotGone();
  });

  it('a read still running when the week is seen does not bring the dot back', async () => {
    let slow: ReturnType<typeof deferred<{ weekStartsOn: string | null }>> | null = null;
    const { api } = newWeekApi({ getNewWeek: async () => (slow ? slow.promise : { weekStartsOn: NEW_WEEK }) });
    const app = captureSession();
    renderApp('/menu', { api, extra: app.extra });
    await dotShown();
    slow = deferred();
    void app.queryClient().invalidateQueries({ queryKey: queryKeys.newWeek(DEMO_FAMILY_ID) });
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await dayShown('lunedì 26 ottobre');
    await dotGone();
    await act(async () => slow!.resolve({ weekStartsOn: NEW_WEEK }));
    await tick();
    expect(dot()).toBeNull();
    expect(app.queryClient().getQueryData(queryKeys.newWeek(DEMO_FAMILY_ID))).toMatchObject({ weekStartsOn: null });
  });

  it('a read started after the optimistic update, answered with the server before the visit, does not bring the dot back', async () => {
    const marking = deferred<{ ok: true }>();
    let afterVisit = false;
    const { api } = newWeekApi({
      // The server has not recorded the visit yet: it answers the week, delivered once the visit succeeded.
      getNewWeek: async () => {
        const answer = { weekStartsOn: NEW_WEEK };
        if (afterVisit) {
          await marking.promise;
          await new Promise((r) => setTimeout(r, 5));
        }
        return answer;
      },
      markWeekSeen: () => marking.promise
    });
    const app = captureSession();
    renderApp('/menu', { api, extra: app.extra });
    await dotShown();
    await chooseInCalendar(/^lunedì 26 ottobre/);
    await dayShown('lunedì 26 ottobre');
    await dotGone();
    afterVisit = true;
    // As at the end of a read of the opening.
    void app.queryClient().invalidateQueries({ queryKey: queryKeys.newWeek(DEMO_FAMILY_ID) });
    await act(async () => marking.resolve({ ok: true }));
    await tick();
    expect(app.queryClient().getQueryData(queryKeys.newWeek(DEMO_FAMILY_ID))).toMatchObject({ weekStartsOn: null });
    expect(dot()).toBeNull();
    expect(freshDays(await openCalendar())).toEqual([]);
  });

  it('a week made by the lazy generation while the opening is read shows the dot at the end of that read', async () => {
    const generated = deferred<void>();
    let ready = false;
    const { api, base, getNewWeek } = newWeekApi({
      getNewWeek: async () => {
        const answer = { weekStartsOn: ready ? NEW_WEEK : null };
        generated.resolve();
        return answer;
      }
    });
    const getOpening = base.menu.getOpening;
    (api.menu as { getOpening: typeof getOpening }).getOpening = (async (...args: Parameters<typeof getOpening>) => {
      await generated.promise;
      ready = true;
      await new Promise((r) => setTimeout(r, 5));
      return getOpening(...args);
    }) as typeof getOpening;
    renderApp('/menu', { api });
    await dayShown('giovedì 22 ottobre');
    await dotShown();
    expect(getNewWeek.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  describe('offline', () => {
    it('hides the dot and the green days, and calls nothing', async () => {
      const { api, markWeekSeen } = newWeekApi();
      const { history } = renderApp('/menu', { api });
      await dayShown('giovedì 22 ottobre');
      await dotShown();
      // The new week is read in advance (a day of it is alongside).
      await tick();
      act(() => setOnline(false));
      await dotGone();
      expect(freshDays(await openCalendar())).toEqual([]);
      act(() => history.push('/menu?day=2026-10-26'));
      await dayShown('lunedì 26 ottobre');
      await tick();
      expect(markWeekSeen).not.toHaveBeenCalled();
    });

    it('back online on an earlier week, reads again and shows the dot', async () => {
      const { api, getNewWeek } = newWeekApi();
      renderApp('/menu', { api });
      await dayShown('giovedì 22 ottobre');
      await dotShown();
      act(() => setOnline(false));
      await dotGone();
      const reads = getNewWeek.mock.calls.length;
      act(() => setOnline(true));
      await dotShown();
      expect(getNewWeek.mock.calls.length).toBeGreaterThan(reads);
    });

    it('back online on the new week, marks it seen and keeps the dot off', async () => {
      const { api, seen } = newWeekApi();
      const { history } = renderApp('/menu', { api });
      await dayShown('giovedì 22 ottobre');
      await dotShown();
      await tick();
      act(() => setOnline(false));
      act(() => history.push('/menu?day=2026-10-26'));
      await dayShown('lunedì 26 ottobre');
      expect(seen()).toEqual([]);
      act(() => setOnline(true));
      await waitFor(() => expect(seen()).toEqual([{ familyId: DEMO_FAMILY_ID, weekStartsOn: NEW_WEEK }]));
      await tick();
      await dotGone();
      expect(freshDays(await openCalendar())).toEqual([]);
    });
  });

  describe('revocation of the family', () => {
    it('after leaving and joining again with the same client, the dot comes back and a visit calls again', async () => {
      const marked = new Set<string>();
      const { api, seen } = newWeekApi({
        getNewWeek: async ({ familyId }) => ({ weekStartsOn: marked.has(familyId) ? null : NEW_WEEK }),
        markWeekSeen: async ({ familyId }) => {
          marked.add(familyId);
          return { ok: true };
        }
      });
      const app = captureSession();
      renderApp('/menu', { api, extra: app.extra });
      await dotShown();
      await chooseInCalendar(/^lunedì 26 ottobre/);
      await waitFor(() => expect(seen()).toHaveLength(1));
      await waitFor(() => expect(weekVisits(app.queryClient()).get(DEMO_FAMILY_ID, NEW_WEEK)).toBe('done'));
      await chooseInCalendar(/^giovedì 22 ottobre/);
      await dayShown('giovedì 22 ottobre');
      // On the server the cascade deletes the visits of a person who leaves.
      marked.clear();
      act(() => app.session().revoke(DEMO_FAMILY_ID));
      expect(weekVisits(app.queryClient()).get(DEMO_FAMILY_ID, NEW_WEEK)).toBeUndefined();
      // A profile read started after the revocation, on the session's clock.
      act(() => void app.session().restore(DEMO_FAMILY_ID, familyAccessOf(app.queryClient()).now()));
      await dayShown('giovedì 22 ottobre');
      await dotShown();
      await chooseInCalendar(/^lunedì 26 ottobre/);
      await waitFor(() => expect(seen()).toHaveLength(2));
      await dotGone();
    });

    it('a revocation while the reads are being cancelled sends no visit (final review, finding 3)', async () => {
      const { api, seen } = newWeekApi();
      const app = captureSession();
      renderApp('/menu', { api, extra: app.extra });
      await dotShown();
      const client = app.queryClient();
      const cancel = client.cancelQueries.bind(client);
      vi.spyOn(client, 'cancelQueries').mockImplementation(async (...args: Parameters<QueryClient['cancelQueries']>) => {
        await cancel(...args);
        app.session().revoke(DEMO_FAMILY_ID);
      });
      await chooseInCalendar(/^lunedì 26 ottobre/);
      await tick();
      expect(seen()).toEqual([]);
    });

    it('a visit refused for the family revokes it, like the other writes', async () => {
      const { api, seen } = newWeekApi({ markWeekSeen: async () => { throw new ApiError('forbidden'); } });
      const app = captureSession();
      renderApp('/menu', { api, extra: app.extra });
      await dotShown();
      const revoke = vi.spyOn(app.session(), 'revoke');
      await chooseInCalendar(/^lunedì 26 ottobre/);
      await waitFor(() => expect(seen()).toHaveLength(1));
      await waitFor(() => expect(revoke).toHaveBeenCalledWith(DEMO_FAMILY_ID));
    });

    it('a visit answered after the revocation does not count as confirmed', async () => {
      const marking = deferred<{ ok: true }>();
      const { api, seen } = newWeekApi({ markWeekSeen: () => marking.promise });
      const app = captureSession();
      renderApp('/menu', { api, extra: app.extra });
      await dotShown();
      await chooseInCalendar(/^lunedì 26 ottobre/);
      await waitFor(() => expect(seen()).toHaveLength(1));
      expect(weekVisits(app.queryClient()).get(DEMO_FAMILY_ID, NEW_WEEK)).toBe('pending');
      act(() => app.session().revoke(DEMO_FAMILY_ID));
      await act(async () => marking.resolve({ ok: true }));
      await tick();
      expect(weekVisits(app.queryClient()).get(DEMO_FAMILY_ID, NEW_WEEK)).toBeUndefined();
    });
  });
});

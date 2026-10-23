import { ORPCError } from '@orpc/server';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClients } from '../api/fake/fakeApi';
import { DEMO_FAMILY_ID } from '../api/fake/seed';
import { createMemoryStore, revokedKey, type KeyValueStore } from '../api/persister';
import { DEMO_USER } from '../auth/backend';
import { leavePage } from '../features/agents/leave';
import { undoOf } from '../features/meals/sessionState';
import { realMealsApp } from '../features/meals/testApp';
import { MONDAY } from '../features/shopping/fixtures';
import { QUEUE_PREFIX } from '../features/shopping/storage';
import { createShoppingServer } from '../features/shopping/testServer';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';
import { useSession } from '../session/SessionScope';
import { isBusy, registeredBusy, resetBusy } from './busy';
import { startUpdates, type ContainerLike, type DocumentLike } from './update';

afterEach(() => resetBusy());

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

/** A device store whose writes (transactions and deletes) matching `when` wait while held. */
function holdingStore(when: (prefixes: string[]) => boolean) {
  const inner = createMemoryStore();
  let held: ReturnType<typeof deferred<void>> | null = null;
  let waiting = 0;
  const store: KeyValueStore = {
    ...inner,
    transact: async (prefixes, change) => {
      if (held && when(prefixes)) {
        waiting += 1;
        await held.promise;
        waiting -= 1;
      }
      return inner.transact(prefixes, change);
    },
    delete: async (key) => {
      if (held && when([key])) await held.promise;
      return inner.delete(key);
    }
  };
  return {
    store,
    /** Writes waiting for the release. */
    waiting: () => waiting,
    hold() {
      held = deferred();
    },
    release() {
      held?.resolve();
      held = null;
    }
  };
}

const lunchCard = () => screen.findByRole('article', { name: /Ricetta dal server/ });
/** As in features/meals/MealActions.test.tsx: one more serving, sent at once by closing the panel. */
async function changeServings() {
  const lunch = await lunchCard();
  fireEvent.click(within(lunch).getByRole('button', { name: 'Modifica il pasto' }));
  fireEvent.click(within(lunch).getByRole('button', { name: 'Una porzione in più' }));
  fireEvent.click(within(lunch).getByRole('button', { name: 'Modifica il pasto' }));
}
/** Exposes the session's «Annulla» slot to the test. */
let undoSlot: ReturnType<typeof undoOf> | null = null;
function UndoSlotProbe() {
  undoSlot = undoOf(useSession());
  return null;
}
/** Exposes the session to the test. */
let shownSession: ReturnType<typeof useSession> | null = null;
function SessionProbe() {
  shownSession = useSession();
  return null;
}
const SHOPPING = `/shopping/${MONDAY}?day=2026-10-14`;
const tomatoes = () => screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });

describe('busy page with the real providers (spec W8)', () => {
  it('is free on a quiet Menu', async () => {
    realMealsApp('/menu');
    await lunchCard();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('is free on the sign-in page, where there is no shopping queue', async () => {
    renderApp('/login', { backend: createStubBackend(null) });
    await screen.findByRole('button', { name: 'Accedi' });
    expect(registeredBusy()).toBe(false);
  });
  it('a meal change in flight is busy (mutation window)', async () => {
    const { server } = realMealsApp('/menu');
    await lunchCard();
    await waitFor(() => expect(registeredBusy()).toBe(false));
    // The server never answers: the mutation stays in flight.
    server.answerMeals({ setServings: () => new Promise(() => {}) });
    await changeServings();
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.setServings')).toHaveLength(1));
    expect(registeredBusy()).toBe(true);
  });
  it('an offered «Annulla» is busy after the answer (undo window)', async () => {
    realMealsApp('/menu');
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    // No mutation in flight any more: only the undo check protects this moment.
    expect(registeredBusy()).toBe(true);
  });
  it('an «Annulla» that cannot be used any more is not busy: another family, or past its 6 seconds', async () => {
    realMealsApp('/menu', { extra: <UndoSlotProbe /> });
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    const offer = undoSlot!.get()!;
    // Offered in another family (the family was switched within the 6 seconds): no toast, no timer.
    undoSlot!.set({ ...offer, familyId: 'another-family' });
    expect(registeredBusy()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(registeredBusy()).toBe(false);
    // Back in the foreground after iOS kept the timer from firing: the clock decides.
    undoSlot!.set({ ...offer, at: Date.now() - 7000 });
    expect(registeredBusy()).toBe(false);
  });
  it('a password change is busy from the filled-in form until its answer', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdChangePassword();
    renderApp('/profile/password', { backend });
    // As in routes/profile/PasswordPage.test.tsx: fill the three fields and submit.
    const field = (label: string) => screen.findByLabelText(label, { exact: true });
    await field('Password attuale');
    await waitFor(() => expect(registeredBusy()).toBe(false));
    fireEvent.change(await field('Password attuale'), { target: { value: 'old-password' } });
    fireEvent.change(await field('Nuova password'), { target: { value: 'new-password' } });
    fireEvent.change(await field('Conferma la nuova password'), { target: { value: 'new-password' } });
    expect(registeredBusy()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
    await waitFor(() => expect(backend.changePasswordCalls).toHaveLength(1));
    expect(registeredBusy()).toBe(true);
    answer({ ok: true });
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a language change is busy until the profile answers', async () => {
    const held = deferred();
    const base = fakeClients({ latencyMs: 0 });
    const createApi: typeof base = (user) => (locale) => {
      const api = base(user)(locale);
      return { ...api, profile: { ...api.profile, update: async (input) => (await held.promise, api.profile.update(input)) } };
    };
    renderApp('/menu', { createApi, backend: createStubBackend(DEMO_USER), extra: <LanguageSwitch /> });
    await screen.findByRole('navigation', { name: 'Giorni della settimana' });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    await waitFor(() => expect(registeredBusy()).toBe(true));
    held.resolve();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a sign-out is busy during the cleanup, then during backend.signOut(), then free', async () => {
    const device = holdingStore(() => true);
    const backend = createStubBackend(DEMO_USER);
    const end = backend.holdSignOut();
    renderApp('/profile/preferences', { backend, store: device.store });
    const signOut = await screen.findByRole('button', { name: 'Esci' });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    device.hold();
    fireEvent.click(signOut);
    // Cleanup held: backend.signOut() not reached yet.
    await waitFor(() => expect(registeredBusy()).toBe(true));
    expect(backend.signOutCalls).toBe(0);
    device.release();
    await waitFor(() => expect(backend.signOutCalls).toBe(1));
    expect(registeredBusy()).toBe(true);
    end();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a shopping change is busy while its record is written, before any operation is in the record', async () => {
    const device = holdingStore((prefixes) => prefixes.some((prefix) => prefix.startsWith(QUEUE_PREFIX)));
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(SHOPPING, { store: device.store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    const box = await tomatoes();
    await waitFor(() => expect(registeredBusy()).toBe(false));
    device.hold();
    fireEvent.click(box);
    // The transaction is held: the record has no operation yet, only mutate's trackBusy protects.
    await waitFor(() => expect(registeredBusy()).toBe(true));
    device.release();
  });
  it('an empty queue read on return to the foreground is not busy: nothing to interrupt', async () => {
    const device = holdingStore((prefixes) => prefixes.some((prefix) => prefix.startsWith(QUEUE_PREFIX)));
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(SHOPPING, { store: device.store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    await tomatoes();
    await waitFor(() => expect(registeredBusy()).toBe(false));
    device.hold();
    // Back in the foreground the queue looks for something to send: one read of the empty record.
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(device.waiting()).toBe(1));
    expect(registeredBusy()).toBe(false);
    device.release();
  });
  it('a shopping change waiting to be sent is busy with no device write running', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(SHOPPING, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    const box = await tomatoes();
    await waitFor(() => expect(registeredBusy()).toBe(false));
    server.holdNextWrite();
    fireEvent.click(box);
    // Sent and held by the server: the record writes are over, only the queue check protects.
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registeredBusy()).toBe(true);
  });
});

/**
 * The real update loop of the page (`startUpdates`) with a worker of another version: `resume()`
 * brings the page back to the foreground, which resets the interaction and checks the version.
 */
function newVersionWaiting() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
  const reload = vi.fn();
  const container = Object.assign(new EventTarget(), {
    controller: { postMessage: (_: unknown, ports: MessagePort[]) => ports[0]!.postMessage({ type: 'version', version: 'next' }) },
    register: async () => ({ update: async () => {} }),
    getRegistration: async () => undefined
  });
  const entries = new Map<string, string>();
  void startUpdates({
    container: container as ContainerLike,
    document: doc as DocumentLike,
    loaded: new Promise(() => {}),
    storage: { getItem: (k) => entries.get(k) ?? null, setItem: (k, v) => void entries.set(k, v), removeItem: (k) => void entries.delete(k) },
    reload,
    pageVersion: 'current',
    isBusy
  });
  return {
    reload,
    async resume() {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
      // The worker answers through a MessageChannel.
      await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
    }
  };
}

describe('no reload into a new version during operations outside TanStack Query (PR #43 review)', () => {
  it('reloads a free page: the harness works', async () => {
    realMealsApp('/menu');
    await lunchCard();
    await waitFor(() => expect(isBusy()).toBe(false));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('servings waiting for the delayed save', async () => {
    const { server } = realMealsApp('/menu');
    const lunch = await lunchCard();
    await waitFor(() => expect(isBusy()).toBe(false));
    fireEvent.click(within(lunch).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(lunch).getByRole('button', { name: 'Una porzione in più' }));
    const update = newVersionWaiting();
    await update.resume();
    expect(server.mealCalls.filter((c) => c.op === 'meals.setServings')).toHaveLength(0);
    expect(update.reload).not.toHaveBeenCalled();
    // The delayed save leaves as usual.
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.setServings')).toHaveLength(1), { timeout: 2000 });
  });
  it.each([
    ['accepted', (input: Parameters<ReturnType<typeof realMealsApp>['server']['defaultMeals']['setServings']>[0], server: ReturnType<typeof realMealsApp>['server']) => server.defaultMeals.setServings(input)],
    ['refused', () => {
      // Not `forbidden`: that one revokes the family and closes the menu (SessionScope).
      throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
    }]
  ] as const)('servings saved by leaving the Menu, until the answer (%s)', async (_, outcome) => {
    const { server, history } = realMealsApp('/menu');
    let answer!: () => void;
    const held = new Promise<void>((resolve) => (answer = resolve));
    server.answerMeals({ setServings: async (input) => (await held, outcome(input, server)) });
    const lunch = await lunchCard();
    await waitFor(() => expect(isBusy()).toBe(false));
    fireEvent.click(within(lunch).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(lunch).getByRole('button', { name: 'Una porzione in più' }));
    await act(() => history.push('/recipes'));
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.setServings')).toHaveLength(1));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    // Answered and handled: the next return to the foreground reloads.
    answer();
    await waitFor(() => expect(isBusy()).toBe(false));
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('a sign-in waiting for its answer; the idle sign-in page reloads', async () => {
    const backend = createStubBackend(null);
    let answer!: (result: { ok: false; reason: 'invalid_credentials' }) => void;
    const signIn = vi.spyOn(backend, 'signIn').mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderApp('/login', { backend });
    const button = await screen.findByRole('button', { name: 'Accedi' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-password' } });
    fireEvent.submit(button.closest('form')!);
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    answer({ ok: false, reason: 'invalid_credentials' });
    await screen.findByRole('alert');
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('an agent consent waiting for its answer', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.holdDecision();
    renderApp('/authorize?authorization_id=auth-1', { backend });
    const allow = (await screen.findByRole('button', { name: 'Consenti' })) as HTMLButtonElement;
    await waitFor(() => expect(allow.disabled).toBe(false));
    await waitFor(() => expect(isBusy()).toBe(false));
    fireEvent.click(allow);
    await waitFor(() => expect(backend.decisions).toHaveLength(1));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
  });
  it('an agent request read and approved by the server at once, until the way back to the agent', async () => {
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdAuthorization();
    renderApp('/authorize?authorization_id=auth-1', { backend });
    // The request is being read: the consent's blocks (W22).
    await waitFor(() => expect(document.querySelector('.entry-page .skeleton')).not.toBeNull());
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=y' } });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=y'));
    leave.mockRestore();
  });
  it('an agent consent waiting for a choice is free', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdAuthorization();
    renderApp('/authorize?authorization_id=auth-1', { backend });
    answer(backend.authorization);
    const allow = (await screen.findByRole('button', { name: 'Consenti' })) as HTMLButtonElement;
    await waitFor(() => expect(allow.disabled).toBe(false));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('a password change filled in and not sent, with the keyboard closed; the empty form is free', async () => {
    renderApp('/profile/password', { backend: createStubBackend(DEMO_USER) });
    const field = await screen.findByLabelText('Nuova password', { exact: true });
    await waitFor(() => expect(isBusy()).toBe(false));
    fireEvent.change(field, { target: { value: 'new-password' } });
    expect(document.activeElement).not.toBe(field);
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '' } });
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('a shopping item typed and not added yet, with the keyboard closed', async () => {
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(SHOPPING, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    await tomatoes();
    await waitFor(() => expect(isBusy()).toBe(false));
    const field = screen.getByRole('textbox', { name: 'Aggiungi una voce' });
    fireEvent.change(field, { target: { value: 'Latte' } });
    expect(document.activeElement).not.toBe(field);
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: '  ' } });
    await update.resume();
    expect(update.reload).toHaveBeenCalledTimes(1);
  });
  it('a revoked family while its mark is written on the device', async () => {
    const mark = revokedKey(DEMO_USER.id, 'gone-family');
    const device = holdingStore((prefixes) => prefixes.includes(mark));
    renderApp('/menu', { backend: createStubBackend(DEMO_USER), store: device.store, extra: <SessionProbe /> });
    await screen.findByRole('navigation', { name: 'Giorni della settimana' });
    await waitFor(() => expect(isBusy()).toBe(false));
    device.hold();
    act(() => shownSession!.revoke('gone-family', { announce: false }));
    await waitFor(() => expect(device.waiting()).toBe(1));
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    device.release();
  });
});

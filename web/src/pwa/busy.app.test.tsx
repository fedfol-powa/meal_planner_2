import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeClients } from '../api/fake/fakeApi';
import { DEMO_FAMILY_ID } from '../api/fake/seed';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import { DEMO_USER } from '../auth/backend';
import { undoOf } from '../features/meals/sessionState';
import { realMealsApp } from '../features/meals/testApp';
import { MONDAY } from '../features/shopping/fixtures';
import { QUEUE_PREFIX } from '../features/shopping/storage';
import { createShoppingServer } from '../features/shopping/testServer';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';
import { useSession } from '../session/SessionScope';
import { registeredBusy, resetBusy } from './busy';

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
  it('a password change is busy until its answer', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdChangePassword();
    renderApp('/profile/password', { backend });
    // As in routes/profile/PasswordPage.test.tsx: fill the three fields and submit.
    const field = (label: string) => screen.findByLabelText(label, { exact: true });
    fireEvent.change(await field('Password attuale'), { target: { value: 'old-password' } });
    fireEvent.change(await field('Nuova password'), { target: { value: 'new-password' } });
    fireEvent.change(await field('Conferma la nuova password'), { target: { value: 'new-password' } });
    await waitFor(() => expect(registeredBusy()).toBe(false));
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

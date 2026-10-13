import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, createSupabaseBackend } from '../../auth/supabaseBackend';
import { renderApp } from '../../test/renderApp';
import { createStack, stack, type StackPerson } from '../../test/stack';

describe.skipIf(!stack)('password page on the local stack', () => {
  const env = stack ? createStack() : null!;
  afterAll(() => env.cleanup());
  beforeEach(() => localStorage.clear());

  /** The app with the real Supabase backend (data from the fake API: the page needs no Worker). */
  function open(person: StackPerson) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(person.session));
    const backend = createSupabaseBackend(stack!.url, stack!.key, { storage: localStorage });
    return renderApp('/profile/password', { backend });
  }
  /** The shopping queue renews the session once at start-up: wait for it, so later reads are stable. */
  async function started(person: StackPerson) {
    await field('Password attuale');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? '{}').refresh_token).not.toBe(person.session.refresh_token));
  }
  const field = (label: string) => screen.findByLabelText(label, { exact: true }) as Promise<HTMLInputElement>;
  async function change(current: string, next: string) {
    fireEvent.change(await field('Password attuale'), { target: { value: current } });
    fireEvent.change(await field('Nuova password'), { target: { value: next } });
    fireEvent.change(await field('Conferma la nuova password'), { target: { value: next } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambia password' }));
  }

  it('changes the password and stays signed in as the same person', async () => {
    const person = await env.person();
    open(person);
    await started(person);
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    await change('first-password', 'second-password');
    expect(await screen.findByText(/^Password cambiata\./, {}, { timeout: 5000 })).toBeTruthy();
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(stored);
    expect(await env.canSignIn(person.email, 'second-password')).toBe(true);
  });
  it('shows the server’s refusal of a wrong current password on its field', async () => {
    const person = await env.person();
    open(person);
    await change('not-the-password', 'second-password');
    expect(await screen.findByText('La password attuale non è corretta.', {}, { timeout: 5000 })).toBeTruthy();
    expect((await field('Password attuale')).getAttribute('aria-invalid')).toBe('true');
    expect(await env.canSignIn(person.email, 'first-password')).toBe(true);
  });
  it('after a session revoked on the server, leads to the sign-in page and clears this device', async () => {
    const person = await env.person();
    const { history } = open(person);
    await started(person);
    await env.sql`delete from auth.sessions where user_id = ${person.id}`;
    await change('first-password', 'second-password');
    fireEvent.click(await screen.findByRole('button', { name: 'Accedi di nuovo' }, { timeout: 5000 }));
    expect(await screen.findByRole('heading', { name: 'Accedi' })).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull());
    expect(history.location.pathname).not.toBe('/profile/password');
  });
});

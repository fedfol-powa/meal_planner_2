import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { DEMO_USER } from '../auth/backend';
import { createStubBackend } from '../test/stubBackend';
import { renderApp } from '../test/renderApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('profile', () => {
  it('shows the person, the family and the future destinations as placeholders', async () => {
    renderApp('/profile', { backend: createStubBackend(DEMO_USER, 'fake') });
    expect(await screen.findByRole('heading', { name: 'Federico' })).toBeTruthy();
    expect(screen.getByText('federico@example.com')).toBeTruthy();
    expect(screen.getByText('Famiglia Folloni')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Membri e inviti/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Esci' })).toBeNull();
  });
  it('switches the whole app to English, recipe texts included', async () => {
    renderApp('/profile');
    fireEvent.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en-GB');
    fireEvent.click(screen.getByRole('link', { name: 'Recipes' }));
    expect(await screen.findByRole('heading', { name: /Chicken stir-fry/ })).toBeTruthy();
  });
  it('keeps language and sign-out available when the profile cannot be read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.me.get = () => Promise.reject(new ApiError('unknown'));
    const backend = createStubBackend(DEMO_USER, 'supabase');
    renderApp('/profile', { backend, api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.getByText('federico@example.com')).toBeTruthy();
    expect(screen.getByLabelText('English')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy();
  });
  it('signs out in real mode, clearing the session, and goes to the sign-in page', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(backend.signOutCalls).toBe(1);
  });
  it('does not carry a person\'s language choice over to the next one', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile', { backend });
    fireEvent.click(await screen.findByLabelText('English'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    act(() => backend.setUser({ id: 'user-anna', email: 'anna@example.com' }));
    // Back to the page requested before sign-in, in Anna's profile language (Italian in the fake client).
    await waitFor(() => expect(history.location.pathname).toBe('/profile'));
    expect(await screen.findByText('Lingua')).toBeTruthy();
    expect(screen.queryByText('Language')).toBeNull();
  });
  it('hides the cached profile when a new read fails with an error other than network (second review, C8)', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = api.me.get;
    let refuse = false;
    api.me.get = (input) => (refuse ? Promise.reject(new ApiError('unknown')) : get(input));
    renderApp('/profile', { backend: createStubBackend(DEMO_USER, 'supabase'), api });
    expect(await screen.findByRole('heading', { name: 'Federico' })).toBeTruthy();
    refuse = true;
    // Another view reads the profile again, and the read fails.
    fireEvent.click(screen.getByRole('link', { name: 'Ricettario' }));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Profilo' }));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Federico' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'federico@example.com' })).toBeTruthy();
    expect(screen.getByLabelText('English')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy();
  });
});

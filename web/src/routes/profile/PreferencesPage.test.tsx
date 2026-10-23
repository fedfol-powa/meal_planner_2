import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import type { ProfileView } from '../../api/types';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const nameField = () => screen.findByLabelText('Nome') as Promise<HTMLInputElement>;

describe('preferences', () => {
  it('saves the name on blur, keeps the typed text while sending, then shows the server value', async () => {
    const api = fakeApi();
    const update = api.profile.update;
    let release: () => void = () => {};
    api.profile.update = vi.fn((input) => new Promise<ProfileView>((resolve) => (release = () => resolve(update(input))))) as unknown as typeof update;
    renderApp('/profile/preferences', { api });
    const field = await nameField();
    fireEvent.change(field, { target: { value: '  Fede  ' } });
    fireEvent.blur(field);
    await waitFor(() => expect(api.profile.update).toHaveBeenCalledWith({ displayName: '  Fede  ' }, expect.anything()));
    expect(field.value).toBe('  Fede  ');
    expect(field.disabled).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(field.value).toBe('Fede'));
    expect(field.disabled).toBe(false);
  });
  it('does not send an unchanged name', async () => {
    const api = fakeApi();
    api.profile.update = vi.fn() as unknown as typeof api.profile.update;
    renderApp('/profile/preferences', { api });
    const field = await nameField();
    fireEvent.change(field, { target: { value: ' Federico ' } });
    fireEvent.blur(field);
    expect(api.profile.update).not.toHaveBeenCalled();
    expect(field.value).toBe('Federico');
  });
  it('restores the saved name and shows the error when saving fails', async () => {
    const api = fakeApi();
    api.profile.update = (async () => {
      throw new ApiError('invalid');
    }) as unknown as typeof api.profile.update;
    renderApp('/profile/preferences', { api });
    const field = await nameField();
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Dati non validi.');
    expect(field.value).toBe('Federico');
  });
  it('saves the language in the profile and applies it at the answer', async () => {
    const api = fakeApi();
    const spy = vi.spyOn(api.profile, 'update');
    renderApp('/profile/preferences', { api, backend: createStubBackend(DEMO_USER, 'supabase') });
    fireEvent.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Account and preferences' })).toBeTruthy();
    expect(spy).toHaveBeenCalledWith({ locale: 'en-GB' }, expect.anything());
  });
  it('keeps the language radios still while the choice is being saved (PR #21 review, finding 3)', async () => {
    const api = fakeApi();
    const update = api.profile.update;
    let release: () => void = () => {};
    api.profile.update = vi.fn((input) => new Promise<ProfileView>((resolve) => (release = () => resolve(update(input))))) as unknown as typeof update;
    renderApp('/profile/preferences', { api, backend: createStubBackend(DEMO_USER, 'supabase') });
    fireEvent.click(await screen.findByLabelText('English'));
    await waitFor(() => expect((screen.getByLabelText('Italiano') as HTMLInputElement).disabled).toBe(true));
    expect((screen.getByLabelText('Italiano') as HTMLInputElement).checked).toBe(true);
    await act(async () => release());
    expect(await screen.findByRole('heading', { name: 'Account and preferences' })).toBeTruthy();
    expect((screen.getByLabelText('Italiano') as HTMLInputElement).disabled).toBe(false);
  });
  it('switches the whole app to English, recipe texts included', async () => {
    renderApp('/profile/preferences', { backend: createStubBackend(DEMO_USER, 'supabase') });
    fireEvent.click(await screen.findByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Account and preferences' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en-GB');
    fireEvent.click(screen.getByRole('link', { name: 'Recipes' }));
    expect(await screen.findByRole('heading', { name: /Chicken stir-fry/ })).toBeTruthy();
  });
  it('offline keeps the language choice on this device only, and the name read only', async () => {
    const api = fakeApi();
    const spy = vi.spyOn(api.profile, 'update');
    renderApp('/profile/preferences', { api, backend: createStubBackend(DEMO_USER, 'supabase') });
    const field = await nameField();
    act(() => setOnline(false));
    await waitFor(() => expect(field.disabled).toBe(true));
    fireEvent.click(screen.getByLabelText('English'));
    expect(await screen.findByRole('heading', { name: 'Account and preferences' })).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });
  it('keeps language and sign-out available when the profile cannot be read', async () => {
    const api = fakeApi();
    api.profile.get = () => Promise.reject(new ApiError('unknown'));
    renderApp('/profile/preferences', { backend: createStubBackend(DEMO_USER, 'supabase'), api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.getByLabelText('English')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Esci' })).toBeTruthy();
  });
  it('signs out in real mode, clearing the session, and goes to the sign-in page', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile/preferences', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(backend.signOutCalls).toBe(1);
  });
  it('does not carry a person\'s language over to the next one', async () => {
    const backend = createStubBackend(DEMO_USER, 'supabase');
    const { history } = renderApp('/profile/preferences', { backend });
    fireEvent.click(await screen.findByLabelText('English'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    act(() => backend.setUser({ id: 'user-anna', email: 'anna@example.com' }));
    // Anna starts from the menu, not from the previous person's page, in her profile language (Italian in the fake client).
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(await screen.findByRole('navigation', { name: 'Navigazione principale' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
  it('links to the account deletion in the danger zone', async () => {
    renderApp('/profile/preferences', { api: fakeApi() });
    const link = await screen.findByRole('link', { name: 'Cancella l’account' });
    expect(link.getAttribute('href')).toBe('/profile/account/delete');
  });
  describe('menu emails', () => {
    const box = () => screen.findByRole('checkbox', { name: /Email con il menu della settimana/ }) as Promise<HTMLInputElement>;
    it('shows the choice and saves it at once, with the sending notice and then the confirmation', async () => {
      const api = fakeApi();
      const update = api.profile.update;
      let release: () => void = () => {};
      api.profile.update = vi.fn((input) => new Promise<ProfileView>((resolve) => (release = () => resolve(update(input))))) as unknown as typeof update;
      renderApp('/profile/preferences', { api });
      const field = await box();
      expect(field.checked).toBe(true);
      const hint = screen.getByText('Il mercoledì sera, quando è pronto il menu della settimana dopo');
      expect(hint.id).not.toBe('');
      expect(field.getAttribute('aria-describedby')).toBe(hint.id);
      fireEvent.click(field);
      await waitFor(() => expect(api.profile.update).toHaveBeenCalledWith({ menuEmails: false }, expect.anything()));
      expect((await screen.findByText('Salvataggio…')).getAttribute('role')).toBe('status');
      // The value sent stays shown while saving, not the one still in the cache (final review, finding 1).
      expect((await box()).checked).toBe(false);
      await act(async () => release());
      expect(await screen.findByText('Salvato')).toBeTruthy();
      expect(screen.queryByText('Salvataggio…')).toBeNull();
      expect((await box()).checked).toBe(false);
    });
    it('is disabled offline', async () => {
      renderApp('/profile/preferences');
      const field = await box();
      act(() => setOnline(false));
      await waitFor(() => expect(field.disabled).toBe(true));
    });
    it('shows the error and keeps the saved value when saving fails', async () => {
      const api = fakeApi();
      api.profile.update = (async () => {
        throw new ApiError('invalid');
      }) as unknown as typeof api.profile.update;
      renderApp('/profile/preferences', { api });
      fireEvent.click(await box());
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Dati non validi.');
      expect((await box()).checked).toBe(true);
    });
  });
});

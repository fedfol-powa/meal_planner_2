import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { setBrowserLanguages } from '../test/browserLanguages';
import { createStubBackend } from '../test/stubBackend';
import { renderApp } from '../test/renderApp';

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Accedi' }));
}

describe('sign-in page', () => {
  it('writes the email given by the link in advance (spec W9)', async () => {
    renderApp('/login?email=giulia%40x.it', { backend: createStubBackend(null) });
    expect(((await screen.findByLabelText('Email')) as HTMLInputElement).value).toBe('giulia@x.it');
  });
  it('«Password dimenticata?» leads to /password/forgot with the email written (spec W15)', async () => {
    const { history } = renderApp('/login', { backend: createStubBackend(null) });
    const link = await screen.findByRole('link', { name: 'Password dimenticata?' });
    expect(link.getAttribute('href')).toBe('/password/forgot');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' giulia@x.it ' } });
    fireEvent.click(screen.getByRole('link', { name: 'Password dimenticata?' }));
    await waitFor(() => expect(history.location.href).toBe('/password/forgot?email=giulia%40x.it'));
    expect(((await screen.findByLabelText('Email')) as HTMLInputElement).value).toBe('giulia@x.it');
  });
  it('explains wrong credentials and network problems', async () => {
    const backend = createStubBackend(null);
    renderApp('/login', { backend });
    await screen.findByRole('heading', { name: 'Accedi' });
    backend.nextSignIn = { ok: false, reason: 'invalid_credentials' };
    fill('anna@example.com', 'wrong');
    expect((await screen.findByRole('alert')).textContent).toBe('Email o password non corrette.');
    backend.nextSignIn = { ok: false, reason: 'network' };
    fill('anna@example.com', 'secret');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Non riesco a raggiungere il servizio: controlla la connessione.'));
  });
  it('goes back to the requested page after signing in', async () => {
    const backend = createStubBackend(null);
    const { history } = renderApp('/recipes', { backend });
    await screen.findByRole('heading', { name: 'Accedi' });
    fill('anna@example.com', 'secret');
    await waitFor(() => expect(history.location.pathname).toBe('/recipes'));
  });
  it('speaks English when the browser does', async () => {
    setBrowserLanguages(['en-GB']);
    renderApp('/login', { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });
  it('LoginPage shows «Questo account è stato cancellato.» when the first profile read is unauthorized after sign-in', async () => {
    const backend = createStubBackend(null);
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    // An account waiting for deletion: Auth signs in, the app has no profile any more.
    api.profile.get = vi.fn().mockRejectedValue(new ApiError('unauthorized')) as unknown as typeof api.profile.get;
    const { history } = renderApp('/login', { backend, api });
    await screen.findByRole('heading', { name: 'Accedi' });
    fill('anna@example.com', 'secret');
    expect(await screen.findByText('Questo account è stato cancellato.')).toBeTruthy();
    expect(history.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { name: 'Accedi' })).toBeTruthy();
    expect(api.profile.get).toHaveBeenCalledTimes(2);
    expect(backend.signOutCalls).toBe(1);
  });
  it('shows no notice after a plain sign-out', async () => {
    const backend = createStubBackend(null);
    renderApp('/login', { backend });
    await screen.findByRole('heading', { name: 'Accedi' });
    expect(screen.queryByText('Questo account è stato cancellato.')).toBeNull();
    expect(screen.queryByText('Account cancellato.')).toBeNull();
  });
});

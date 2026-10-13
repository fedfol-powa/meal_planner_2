import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});

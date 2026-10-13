import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { setInvitationClient } from './client';

const TOKEN = 'a'.repeat(43);
const valid = (overrides = {}) => ({
  get: vi.fn(async () => ({ invitedBy: 'Federico', roles: [] })),
  accept: vi.fn(async ({ email }: { email: string }) => ({ email })),
  ...overrides
});

function fill(password = 'segreta123', again = password) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'giulia@x.it' } });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Giulia' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Ripeti la password'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: 'Crea l’account' }));
}

describe('/invite/app', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows who invites and creates the account, then signs in and opens the wizard', async () => {
    const client = valid();
    setInvitationClient(client);
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    expect(await screen.findByRole('heading', { name: 'Hai un invito per Cosa si mangia?' })).toBeTruthy();
    expect(screen.getByText('Te l’ha mandato Federico')).toBeTruthy();
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalledWith({ token: TOKEN, email: 'giulia@x.it', displayName: 'Giulia', password: 'segreta123', locale: 'it-IT' }));
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('giulia@x.it', 'segreta123'));
    await waitFor(() => expect(history.location.pathname).toBe('/family/new'));
  });

  it('opens the wizard also when the sign-in is reported after it resolves (Supabase)', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => ({ invitedBy: 'Federico', roles: ['recipe_curator'] })) }));
    const backend = createStubBackend({ id: 'user-federico', email: 'federico@example.com' });
    vi.spyOn(backend, 'signIn').mockImplementation(async (email) => {
      setTimeout(() => backend.setUser({ id: 'user-giulia', email }), 20);
      return { ok: true };
    });
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    // After «Esci e continua», as from WhatsApp with the administrator's session open.
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(history.location.pathname).toBe('/family/new'));
    expect(history.location.search).toContain('recipe_curator');
  });

  it('one message for every unusable link', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
    expect(screen.getByText('Chiedi un link nuovo a chi ti ha invitato.')).toBeTruthy();
  });

  it('checks the passwords before sending', async () => {
    const client = valid();
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill('segreta123', 'diversa123');
    expect(await screen.findByText('Le due password non coincidono')).toBeTruthy();
    fill('è'.repeat(37));
    expect(await screen.findByText(/Password troppo lunga/)).toBeTruthy();
    expect(client.accept).not.toHaveBeenCalled();
  });

  it('shows the wrong email on the field', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Non è l’email di questo invito')).toBeTruthy();
  });

  it('when sign-in fails after the creation, leads to the login page with the email', async () => {
    setInvitationClient(valid());
    const backend = createStubBackend(null);
    vi.spyOn(backend, 'signIn').mockResolvedValue({ ok: false, reason: 'network' });
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Il tuo account è pronto, ma l’accesso non è riuscito: controlla la connessione ed entra con la password che hai appena scelto.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('when the password is refused after a repeated acceptance, speaks of the first password', async () => {
    setInvitationClient(valid());
    const backend = createStubBackend(null);
    vi.spyOn(backend, 'signIn').mockResolvedValue({ ok: false, reason: 'invalid_credentials' });
    renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Il tuo account è pronto: entra con la password che hai scelto la prima volta.')).toBeTruthy();
  });

  it('tells a malformed email from the email of another invitation', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'invalid_format' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Email non valida')).toBeTruthy();
    expect(screen.queryByText('Non è l’email di questo invito')).toBeNull();
  });

  it('translates password_too_long from the server', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['password'], code: 'password_too_long' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(/Password troppo lunga/)).toBeTruthy();
  });

  it('too many attempts while loading: «Riprova» reads the link again', async () => {
    const get = vi.fn().mockRejectedValueOnce(new ApiError('rate_limited')).mockResolvedValue({ invitedBy: 'Federico', roles: [] });
    setInvitationClient(valid({ get }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByText('Troppi tentativi. Riprova tra un minuto.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('with another account open, signs out and keeps the link', async () => {
    setInvitationClient(valid());
    const { history } = renderApp(`/invite/app#${TOKEN}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(history.location.hash).toBe(`#${TOKEN}`);
  });

  it('after «Esci e continua» the form sends', async () => {
    const client = valid();
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend({ id: 'user-federico', email: 'federico@example.com' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalled());
  });

  it('a late event of the account just closed does not block the form', async () => {
    const client = valid();
    setInvitationClient(client);
    const backend = createStubBackend({ id: 'user-federico', email: 'federico@example.com' });
    renderApp(`/invite/app#${TOKEN}`, { backend });
    const endSignOut = backend.holdSignOut();
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    // Supabase can report the closing session once more while it ends it.
    backend.emit('TOKEN_REFRESHED', { id: 'user-federico', email: 'federico@example.com' });
    endSignOut();
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalled());
  });

  it('says when Auth refuses the password as weak', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['password'], code: 'weak_password' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Password troppo debole: scegline una più lunga o meno comune')).toBeTruthy();
  });

  it('an event of the account being signed out during the request does not drop the answer', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend({ id: 'user-federico', email: 'federico@example.com' });
    const signIn = vi.spyOn(backend, 'signIn');
    renderApp(`/invite/app#${TOKEN}`, { backend });
    const endSignOut = backend.holdSignOut();
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    // Supabase reports the closing account once more while it ends it.
    backend.emit('TOKEN_REFRESHED', { id: 'user-federico', email: 'federico@example.com' });
    endSignOut();
    deferred.answer();
    await waitFor(() => expect(signIn).toHaveBeenCalledWith('giulia@x.it', 'segreta123'));
  });

  it('after a reload of a used link, the page says it is no longer valid and offers sign-in', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
  });

  /** An acceptance whose answer the test releases. */
  function deferredAccept() {
    let answer!: () => void;
    const accept = vi.fn(({ email }: { email: string }) => new Promise<{ email: string }>((r) => (answer = () => r({ email }))));
    return { accept, answer: () => answer() };
  }

  it('one submission at a time, also with two taps before the next render', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Crea l’account' }));
    expect(deferred.accept).toHaveBeenCalledTimes(1);
  });

  it('a late answer after leaving the page neither signs in nor navigates', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    history.push('/login');
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(signIn).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe('/login');
  });

  it('a late answer after someone signed in meanwhile neither signs in nor navigates', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    backend.emit('SIGNED_IN', { id: 'other', email: 'altro@x.it' } as never); // a sign-in from another tab
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(signIn).not.toHaveBeenCalled();
    expect(history.location.pathname).not.toBe('/family/new');
  });

  it('a late answer for another link (fragment changed) neither signs in nor navigates', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    history.replace(`/invite/app#${'b'.repeat(43)}`);
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(signIn).not.toHaveBeenCalled();
  });

  /** A sign-in whose answer the test releases; the session is reported by the test, if at all. */
  function heldSignIn(backend: ReturnType<typeof createStubBackend>) {
    let answer!: () => void;
    const signIn = vi.spyOn(backend, 'signIn').mockImplementation(() => new Promise((r) => (answer = () => r({ ok: true }))));
    return { signIn, answer: () => answer() };
  }

  it('the account closed earlier signing in again ends the attempt (the exception lasts only while it is closed)', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const federico = { id: 'user-federico', email: 'federico@example.com' };
    const backend = createStubBackend(federico);
    const signIn = vi.spyOn(backend, 'signIn');
    renderApp(`/invite/app#${TOKEN}`, { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    await waitFor(() => expect(backend.signOutCalls).toBe(1));
    await new Promise((r) => setTimeout(r, 0)); // the sign-out is over
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    // A signs in again (another tab), then the answer arrives before React re-renders.
    backend.setUser(federico);
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(signIn).not.toHaveBeenCalled();
  });

  it('someone else signing in while our sign-in is pending: the old attempt does not navigate', async () => {
    setInvitationClient(valid());
    const backend = createStubBackend(null);
    const held = heldSignIn(backend);
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(held.signIn).toHaveBeenCalled());
    backend.setUser({ id: 'other', email: 'altro@x.it' }); // another tab
    held.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(history.location.pathname).not.toBe('/family/new');
    expect(history.location.pathname).not.toBe('/login');
  });

  it('leaving and coming back to the same link while our sign-in is pending: the old attempt does not navigate', async () => {
    setInvitationClient(valid());
    const backend = createStubBackend(null);
    const held = heldSignIn(backend);
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(held.signIn).toHaveBeenCalled());
    history.push('/login');
    history.push(`/invite/app#${TOKEN}`);
    held.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(history.location.pathname).toBe('/invite/app');
  });
});

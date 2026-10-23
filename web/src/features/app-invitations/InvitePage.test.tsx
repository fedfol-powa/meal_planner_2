import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { GlobalRole } from '@app/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { isBusy, registeredBusy, resetBusy } from '../../pwa/busy';
import { startUpdates, type ContainerLike, type DocumentLike } from '../../pwa/update';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { setInvitationClient } from './client';

const TOKEN = 'a'.repeat(43);
type Outcome = 'sent' | 'failed' | 'too_soon' | 'not_needed' | 'not_sent' | 'unavailable';
const valid = (overrides = {}) => ({
  get: vi.fn(async () => ({ invitedBy: 'Federico', roles: [] as GlobalRole[] })),
  // The answer carries the normalised email, not the field's.
  accept: vi.fn(async (_input: { email: string }) => ({ email: 'giulia@x.it', passwordEmail: 'sent' as Outcome })),
  resendPasswordEmail: vi.fn(async (_input: { token: string; email: string; locale: string }) => ({ passwordEmail: 'sent' as 'sent' | 'failed' | 'too_soon' | 'not_needed' | 'unavailable' })),
  ...overrides
});

function fill(email = ' Giulia@X.it ') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Giulia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continua' }));
}

const resendButton = () => screen.getByRole('button', { name: 'Rimanda l’email' }) as HTMLButtonElement;
const minute = async () => act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

/**
 * As in pwa/busy.app.test.tsx: the real update loop with a worker of another version. Under fake
 * timers `resume()` waits for the answer itself, not for a time: the loop asks `isBusy` only once
 * the worker's version has arrived and differs, right before it reloads or not.
 */
function newVersionWaiting() {
  let checks = 0;
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
    isBusy: () => {
      checks += 1;
      return isBusy();
    }
  });
  return {
    reload,
    async resume() {
      const before = checks;
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
      // vi.waitFor polls on real timers; the worker answers through a real MessageChannel.
      await act(() => vi.waitFor(() => expect(checks).toBe(before + 1)));
    }
  };
}

describe('/invite/app', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetBusy();
  });

  it('shows who invites and a form with no password', async () => {
    setInvitationClient(valid());
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Hai un invito per Cosa si mangia?' })).toBeTruthy();
    expect(screen.getByText('Te l’ha mandato Federico')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Nome')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.queryByLabelText('Ripeti la password')).toBeNull();
    expect(screen.getByText('Ti mandiamo un’email per scegliere la password.')).toBeTruthy();
  });

  it('accepts without a password, never signs in, and asks to check the mail with the email of the answer', async () => {
    const client = valid();
    setInvitationClient(client);
    const backend = createStubBackend(null);
    const signIn = vi.spyOn(backend, 'signIn');
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(client.accept).toHaveBeenCalledWith({ token: TOKEN, email: 'Giulia@X.it', displayName: 'Giulia', locale: 'it-IT' }));
    expect(await screen.findByRole('heading', { name: 'Controlla la posta' })).toBeTruthy();
    expect(screen.getByText('Ti abbiamo mandato un’email a giulia@x.it: apri il link per scegliere la password. Poi entrerai con email e password.')).toBeTruthy();
    expect(screen.getByText('Il link vale 24 ore. Controlla anche la posta indesiderata.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Email sbagliata? Ricomincia' })).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe('/invite/app');
  });

  it('with roles, says the person will also be curator', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => ({ invitedBy: 'Federico', roles: ['recipe_curator'] as GlobalRole[] })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Quando entri potrai anche gestire il ricettario.')).toBeTruthy();
  });

  it('«Rimanda l’email» is enabled after 60 seconds and resends with the email of the answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = valid();
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    expect(resendButton().disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(resendButton().disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(resendButton().disabled).toBe(false);
    fireEvent.click(resendButton());
    await waitFor(() => expect(client.resendPasswordEmail).toHaveBeenCalledWith({ token: TOKEN, email: 'giulia@x.it', locale: 'it-IT' }));
    // A new send: the wait starts again.
    await waitFor(() => expect(resendButton().disabled).toBe(true));
    expect(screen.getByText('Ti abbiamo mandato un’email a giulia@x.it: apri il link per scegliere la password. Poi entrerai con email e password.')).toBeTruthy();
  });

  it('a resend answered too_soon keeps the 60-second wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setInvitationClient(valid({ resendPasswordEmail: vi.fn(async () => ({ passwordEmail: 'too_soon' })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Ti abbiamo appena mandato un’email: aspetta un minuto prima di chiederne un’altra.')).toBeTruthy();
    expect(resendButton().disabled).toBe(true);
    await minute();
    expect(resendButton().disabled).toBe(false);
  });

  it('a resend that fails says so and waits 60 seconds before the next one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resend = vi.fn().mockResolvedValueOnce({ passwordEmail: 'failed' }).mockResolvedValue({ passwordEmail: 'sent' });
    setInvitationClient(valid({ resendPasswordEmail: resend }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    const outcome = await screen.findByText('Non siamo riusciti a mandare l’email.');
    expect(outcome.getAttribute('role')).toBe('status');
    expect(resendButton().disabled).toBe(true);
    await minute();
    fireEvent.click(resendButton());
    await waitFor(() => expect(resend).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Ti abbiamo mandato un’email a giulia@x.it/)).toBeTruthy();
  });

  it('a resend not needed or unavailable sends to the sign-in page with the email', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resend = vi.fn().mockResolvedValueOnce({ passwordEmail: 'not_needed' });
    setInvitationClient(valid({ resendPasswordEmail: resend }));
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Il tuo account è pronto: entra con email e password')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimanda l’email' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Vai all’accesso' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
  });

  it('a resend unavailable points to «Password dimenticata?»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setInvitationClient(valid({ resendPasswordEmail: vi.fn(async () => ({ passwordEmail: 'unavailable' })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Non possiamo rimandare l’email da qui: usa «Password dimenticata?» dalla pagina di accesso')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimanda l’email' })).toBeNull();
  });

  it('a resend in flight keeps the page busy: back in the foreground with an update → no reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer!: (value: { passwordEmail: 'sent' }) => void;
    const resend = vi.fn(() => new Promise<{ passwordEmail: 'sent' }>((resolve) => { answer = resolve; }));
    setInvitationClient(valid({ resendPasswordEmail: resend }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    expect(registeredBusy()).toBe(false);
    fireEvent.click(resendButton());
    await waitFor(() => expect(resend).toHaveBeenCalled());
    expect(registeredBusy()).toBe(true);
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    await act(async () => answer({ passwordEmail: 'sent' }));
    // The answer is handled: a new wait, and the page is free again.
    await waitFor(() => expect(resendButton().disabled).toBe(true));
    expect(registeredBusy()).toBe(false);
    await update.resume();
    expect(update.reload).toHaveBeenCalled();
  });

  it('a resend refused by the network keeps the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setInvitationClient(valid({ resendPasswordEmail: vi.fn(async () => { throw new ApiError('rate_limited'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByRole('heading', { name: 'Controlla la posta' });
    await minute();
    fireEvent.click(resendButton());
    expect(await screen.findByText('Troppi tentativi. Riprova tra un minuto.')).toBeTruthy();
    await waitFor(() => expect(resendButton().disabled).toBe(false));
  });

  it.each([
    ['failed', 'Non siamo riusciti a mandare l’email.'],
    ['too_soon', 'Ti abbiamo appena mandato un’email: aspetta un minuto prima di chiederne un’altra.']
  ] as const)('accept answered %s shows its text with «Rimanda l’email»', async (passwordEmail, text) => {
    setInvitationClient(valid({ accept: vi.fn(async () => ({ email: 'giulia@x.it', passwordEmail })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(text)).toBeTruthy();
    expect(resendButton()).toBeTruthy();
  });

  it('accept answered failed waits 60 seconds before «Rimanda l’email»', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = valid({ accept: vi.fn(async () => ({ email: 'giulia@x.it', passwordEmail: 'failed' })) });
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await screen.findByText('Non siamo riusciti a mandare l’email.');
    expect(resendButton().disabled).toBe(true);
    await minute();
    expect(resendButton().disabled).toBe(false);
    fireEvent.click(resendButton());
    await waitFor(() => expect(client.resendPasswordEmail).toHaveBeenCalled());
  });

  it('accept answered not_needed leads to sign-in', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => ({ email: 'giulia@x.it', passwordEmail: 'not_needed' })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Il tuo account è pronto: entra con email e password')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
  });

  it('accept answered unavailable: only the message, no commands', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => ({ email: 'giulia@x.it', passwordEmail: 'unavailable' })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Non possiamo mandare l’email per questo account. Chiedi un link nuovo a chi ti ha invitato.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rimanda l’email' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('one message for every unusable link', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: 'Questo invito non vale più' })).toBeTruthy();
    expect(screen.getByText('Chiedi un link nuovo a chi ti ha invitato.')).toBeTruthy();
  });

  it('asks for the name before sending', async () => {
    const client = valid();
    setInvitationClient(client);
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'giulia@x.it' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }));
    expect(await screen.findByText('Scrivi il tuo nome')).toBeTruthy();
    expect(client.accept).not.toHaveBeenCalled();
  });

  it('shows the wrong email on the field', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Non è l’email di questo invito')).toBeTruthy();
  });

  it('tells a malformed email from the email of another invitation', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('invalid', { issues: [{ path: ['email'], code: 'invalid_format' }] }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText('Email non valida')).toBeTruthy();
    expect(screen.queryByText('Non è l’email di questo invito')).toBeNull();
  });

  it('an existing account: the message with the link to sign in', async () => {
    setInvitationClient(valid({ accept: vi.fn(async () => { throw new ApiError('not_allowed', { reason: 'account_exists' }); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    expect(await screen.findByText(/Esiste già un account con questa email/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
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
    expect(await screen.findByRole('heading', { name: 'Controlla la posta' })).toBeTruthy();
  });

  it('an event of the account being signed out during the request does not drop the answer', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend({ id: 'user-federico', email: 'federico@example.com' });
    renderApp(`/invite/app#${TOKEN}`, { backend });
    const endSignOut = backend.holdSignOut();
    fireEvent.click(await screen.findByRole('button', { name: 'Esci e continua' }));
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    backend.emit('TOKEN_REFRESHED', { id: 'user-federico', email: 'federico@example.com' });
    endSignOut();
    deferred.answer();
    expect(await screen.findByRole('heading', { name: 'Controlla la posta' })).toBeTruthy();
  });

  it('after a reload of a used link, the page says it is no longer valid and offers sign-in', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('invitation_unavailable'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('link', { name: 'Vai all’accesso' })).toBeTruthy();
  });

  /** An acceptance whose answer the test releases. */
  function deferredAccept() {
    let answer!: () => void;
    const accept = vi.fn((_input: { email: string }) => new Promise<{ email: string; passwordEmail: Outcome }>((r) => (answer = () => r({ email: 'giulia@x.it', passwordEmail: 'sent' }))));
    return { accept, answer: () => answer() };
  }

  it('one submission at a time, also with two taps before the next render', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }));
    expect(deferred.accept).toHaveBeenCalledTimes(1);
  });

  it('a late answer after leaving the page changes nothing', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    history.push('/login');
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(history.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Controlla la posta' })).toBeNull();
  });

  it('a late answer after someone signed in meanwhile shows nothing', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const backend = createStubBackend(null);
    renderApp(`/invite/app#${TOKEN}`, { backend });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    backend.emit('SIGNED_IN', { id: 'other', email: 'altro@x.it' } as never); // a sign-in from another tab
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Controlla la posta' })).toBeNull();
  });

  it('a late answer for another link (fragment changed) shows nothing', async () => {
    const deferred = deferredAccept();
    setInvitationClient(valid({ accept: deferred.accept }));
    const { history } = renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await screen.findByLabelText('Email');
    fill();
    await waitFor(() => expect(deferred.accept).toHaveBeenCalled());
    history.replace(`/invite/app#${'b'.repeat(43)}`);
    deferred.answer();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('heading', { name: 'Controlla la posta' })).toBeNull();
  });
});

describe('/invite/app while loading (W22)', () => {
  afterEach(() => vi.restoreAllMocks());
  const skeleton = () => document.querySelector<HTMLElement>('.entry-page .skeleton');
  const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');

  it('app invite: the form as blocks while the link is read, then the form', async () => {
    let answer!: () => void;
    const held = new Promise<void>((done) => (answer = done));
    setInvitationClient(valid({ get: vi.fn(async () => (await held, { invitedBy: 'Federico', roles: [] as GlobalRole[] })) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    await waitFor(() => expect(skeleton()).not.toBeNull());
    expect(skeleton()!.querySelector('.entry-title.skeleton-block')).not.toBeNull();
    expect(skeleton()!.querySelectorAll('.field')).toHaveLength(2);
    expect(skeleton()!.querySelector('.text-button.wide.skeleton-block')).not.toBeNull();
    expect(screen.queryByText('…')).toBeNull();
    await waitFor(() => expect(skeleton()!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.entry-page [aria-busy="true"]')).not.toBeNull();
    await act(async () => answer());
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(skeleton()).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('app invite: with an account open, the line and the button as blocks', async () => {
    setInvitationClient(valid({ get: vi.fn(() => new Promise<never>(() => {})) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend({ id: 'user-other', email: 'bruno@example.test' }) });
    await waitFor(() => expect(skeleton()).not.toBeNull());
    expect(skeleton()!.querySelectorAll('.field')).toHaveLength(0);
    expect(skeleton()!.querySelector('.text-button.wide.skeleton-block')).not.toBeNull();
  });

  it('app invite: an error replaces the skeleton', async () => {
    setInvitationClient(valid({ get: vi.fn(async () => { throw new ApiError('internal'); }) }));
    renderApp(`/invite/app#${TOKEN}`, { backend: createStubBackend(null) });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(skeleton()).toBeNull();
  });
});

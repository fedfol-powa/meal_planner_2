import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USER } from '../../auth/backend';
import { createSupabaseBackend, type AuthClient } from '../../auth/supabaseBackend';
import { isBusy, registeredBusy, resetBusy } from '../../pwa/busy';
import { startUpdates, type ContainerLike, type DocumentLike } from '../../pwa/update';
import { setBrowserLanguages } from '../../test/browserLanguages';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { needsHomeScreenHint } from '../family-new/ios';
import { createDemoLinkClient, createLinkClient, forgetLink, setLinkClient } from './linkClient';

vi.mock('../family-new/ios', () => ({ needsHomeScreenHint: vi.fn(() => false) }));

const AUTH_URL = 'http://auth.test';
const PATH = '/password#token_hash=hash-1&type=recovery';
const INVALID = 'Questo link non vale più';
const VERIFY_FAILED = 'Non siamo riusciti a verificare il link. Chiedi un link nuovo.';
const GENERIC = 'Qualcosa non ha funzionato: riprova.';

type Answer = () => Promise<Response>;
const json = (status: number, body: unknown): Answer => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const offline: Answer = async () => {
  throw new TypeError('Failed to fetch');
};
const VERIFIED = json(200, { access_token: 'tok-1', refresh_token: 'refresh-1', user: { email: 'giulia@x.it' } });

/** Supabase Auth seen through fetch: the answers of /verify and of each PUT /user in order. */
function authServer() {
  const calls: { path: string; method: string; body: unknown; authorization: string | null }[] = [];
  const server = {
    calls,
    verify: VERIFIED,
    saves: [] as Answer[],
    /** The next /verify waits until the returned function answers it. */
    holdVerify(): (answer?: Answer) => void {
      let release!: (answer: Answer) => void;
      const held = new Promise<Answer>((resolve) => (release = resolve));
      server.verify = async () => (await held)();
      return (answer = VERIFIED) => release(answer);
    },
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null, authorization: headers.get('authorization') });
      if (url.pathname === '/auth/v1/verify') return server.verify();
      if (url.pathname === '/auth/v1/user') return (server.saves.shift() ?? json(200, { id: 'u' }))();
      throw new Error(`unexpected ${url.pathname}`);
    })
  };
  setLinkClient(createLinkClient({ url: AUTH_URL, publishableKey: 'publishable', fetch: server.fetch as unknown as typeof fetch }));
  return server;
}

function choose(password = 'nuova-password', again = password) {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Ripeti la password'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: /Salva la password|Riprova/ }));
}

/** As in pwa/busy.app.test.tsx: the real update loop with a worker of another version. */
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
      await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
    }
  };
}

const blur = () => (document.activeElement as HTMLElement | null)?.blur();

describe('/password', () => {
  beforeEach(() => vi.mocked(needsHomeScreenHint).mockReturnValue(false));
  afterEach(() => {
    // Unmounted first: a page still mounted would record the link again.
    cleanup();
    forgetLink();
    resetBusy();
  });

  it('keeps the fragment until the verification succeeds, then removes it', async () => {
    const server = authServer();
    const release = server.holdVerify();
    const { history } = renderApp(PATH, { backend: createStubBackend(null) });
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(server.calls[0]).toMatchObject({ path: '/auth/v1/verify', method: 'POST', body: { type: 'recovery', token_hash: 'hash-1' } });
    expect(history.location.hash).toBe('#token_hash=hash-1&type=recovery');
    release();
    expect(await screen.findByRole('heading', { name: 'Scegli la password' })).toBeTruthy();
    expect(screen.getByText('Account: giulia@x.it')).toBeTruthy();
    expect(screen.getByText('Dopo il salvataggio gli altri dispositivi e gli agenti collegati dovranno accedere di nuovo')).toBeTruthy();
    await waitFor(() => expect(history.location.hash).toBe(''));
    expect(history.location.pathname).toBe('/password');
  });

  it('is busy while the verification is in flight, and keeps busy with a usable token', async () => {
    const server = authServer();
    const release = server.holdVerify();
    renderApp(PATH, { backend: createStubBackend(null) });
    await waitFor(() => expect(server.calls).toHaveLength(1));
    expect(registeredBusy()).toBe(true);
    release();
    await screen.findByRole('heading', { name: 'Scegli la password' });
    expect(registeredBusy()).toBe(true);
  });

  it('before the verification (offline) the page is free and the fragment stays', async () => {
    setOnline(false);
    const server = authServer();
    const { history } = renderApp(PATH, { backend: createStubBackend(null) });
    expect(await screen.findByText('Sei offline: puoi consultare i dati già caricati.')).toBeTruthy();
    expect(server.calls).toHaveLength(0);
    expect(registeredBusy()).toBe(false);
    expect(history.location.hash).toBe('#token_hash=hash-1&type=recovery');
    setOnline(true);
    expect(await screen.findByRole('heading', { name: 'Scegli la password' })).toBeTruthy();
  });

  it('verified → save failed → back in the foreground with an update → no reload → retry succeeds', async () => {
    const server = authServer();
    server.saves.push(offline);
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect((await screen.findByRole('alert')).textContent).toBe('Non riesco a raggiungere il servizio: controlla la connessione.');
    blur();
    // Only the usable token keeps the page busy now: no request in flight, no focus in a field.
    expect(registeredBusy()).toBe(true);
    const update = newVersionWaiting();
    await update.resume();
    expect(update.reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Password salvata.')).toBeTruthy();
    const saves = server.calls.filter((call) => call.path === '/auth/v1/user');
    expect(saves).toHaveLength(2);
    expect(saves.every((call) => call.authorization === 'Bearer tok-1')).toBe(true);
    expect(saves[1]!.body).toEqual({ password: 'nuova-password' });
    blur();
    expect(registeredBusy()).toBe(false);
  });

  it('after the save: «Accedi» to /login with the email, the page is free', async () => {
    authServer();
    const { history } = renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect(await screen.findByText('Password salvata.')).toBeTruthy();
    expect(screen.getByText('Ora entra con la tua email e la nuova password.')).toBeTruthy();
    expect(screen.queryByText(/schermata Home/)).toBeNull();
    blur();
    expect(registeredBusy()).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Accedi' }));
    await waitFor(() => expect(history.location.href).toBe('/login?email=giulia%40x.it'));
    expect(((await screen.findByLabelText('Email')) as HTMLInputElement).value).toBe('giulia@x.it');
  });

  it('on iOS outside the installed app, one more line for the Home Screen app', async () => {
    vi.mocked(needsHomeScreenHint).mockReturnValue(true);
    authServer();
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect(await screen.findByText('Se usi l’app dalla schermata Home, aprila ed entra lì con email e la nuova password.')).toBeTruthy();
  });

  it('a code wrong, expired or used: «non vale più», the page free', async () => {
    const server = authServer();
    server.verify = json(403, { code: 'otp_expired' });
    const { history } = renderApp(PATH, { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: INVALID })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chiedi un link nuovo' }).getAttribute('href')).toBe('/password/forgot');
    expect(registeredBusy()).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Chiedi un link nuovo' }));
    await waitFor(() => expect(history.location.pathname).toBe('/password/forgot'));
  });

  it('network during the verification: «Chiedi un link nuovo», never «non vale più»', async () => {
    const server = authServer();
    server.verify = offline;
    renderApp(PATH, { backend: createStubBackend(null) });
    expect(await screen.findByText(VERIFY_FAILED)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Chiedi un link nuovo' }).getAttribute('href')).toBe('/password/forgot');
    expect(screen.queryByText(INVALID)).toBeNull();
    expect(registeredBusy()).toBe(false);
  });

  it('an unknown answer of the verification (429, 5xx) reads like the network', async () => {
    for (const answer of [json(429, { code: 'over_request_rate_limit' }), json(500, {})]) {
      forgetLink();
      const server = authServer();
      server.verify = answer;
      const { unmount } = renderApp(PATH, { backend: createStubBackend(null) });
      expect(await screen.findByText(VERIFY_FAILED)).toBeTruthy();
      expect(screen.queryByText(INVALID)).toBeNull();
      unmount();
    }
  });

  it('without a fragment and nothing verified in memory: «non vale più», no request', async () => {
    const server = authServer();
    renderApp('/password', { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: INVALID })).toBeTruthy();
    expect(server.calls).toHaveLength(0);
  });

  it('another type than recovery: «non vale più», no request', async () => {
    const server = authServer();
    renderApp('/password#token_hash=hash-1&type=signup', { backend: createStubBackend(null) });
    expect(await screen.findByRole('heading', { name: INVALID })).toBeTruthy();
    expect(server.calls).toHaveLength(0);
  });

  it('checks the passwords before sending, with the Profile texts', async () => {
    const server = authServer();
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    expect(screen.getByText('Almeno 8 caratteri.')).toBeTruthy();
    choose('corta');
    expect(await screen.findByText('Servono almeno 8 caratteri.')).toBeTruthy();
    choose('nuova-password', 'diversa-password');
    expect(await screen.findByText('Le due password non coincidono.')).toBeTruthy();
    expect(server.calls.filter((call) => call.path === '/auth/v1/user')).toHaveLength(0);
  });

  it('errors of the save with the Profile texts; the token stays for a new attempt', async () => {
    const server = authServer();
    server.saves.push(json(422, { code: 'weak_password', weak_password: { reasons: ['length'] } }), json(422, { code: 'same_password' }));
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect(await screen.findByText('La nuova password è troppo corta.')).toBeTruthy();
    choose('altra-password');
    expect(await screen.findByText('La nuova password è uguale a quella attuale.')).toBeTruthy();
    blur();
    expect(registeredBusy()).toBe(true);
    choose('terza-password');
    expect(await screen.findByText('Password salvata.')).toBeTruthy();
  });

  it('reasons that cannot happen in a recovery fall back to the generic text', async () => {
    const server = authServer();
    server.saves.push(json(400, { code: 'invalid_credentials' }), json(400, { code: 'reauthentication_needed' }), json(500, {}));
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      choose();
      await waitFor(() => expect(server.calls.filter((call) => call.path === '/auth/v1/user')).toHaveLength(attempt + 1));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(GENERIC));
      expect(screen.queryByText('La password attuale non è corretta.')).toBeNull();
    }
  });

  it('a 401 of the save: «non vale più», the token discarded, the page free', async () => {
    const server = authServer();
    server.saves.push(json(401, { code: 'session_not_found' }));
    renderApp(PATH, { backend: createStubBackend(null) });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect(await screen.findByRole('heading', { name: INVALID })).toBeTruthy();
    blur();
    expect(registeredBusy()).toBe(false);
  });

  it('direct calls only: the shared client is never used, no setSession, nothing stored', async () => {
    const server = authServer();
    const auth = {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      setSession: vi.fn(),
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      exchangeCodeForSession: vi.fn()
    };
    const backend = createSupabaseBackend(AUTH_URL, 'publishable', { auth: auth as unknown as AuthClient });
    renderApp(PATH, { backend });
    await screen.findByRole('heading', { name: 'Scegli la password' });
    choose();
    expect(await screen.findByText('Password salvata.')).toBeTruthy();
    for (const method of ['setSession', 'verifyOtp', 'updateUser', 'exchangeCodeForSession', 'signInWithPassword', 'refreshSession'] as const) {
      expect(auth[method]).not.toHaveBeenCalled();
    }
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /auth/v1/verify', 'PUT /auth/v1/user']);
    expect(Object.keys(localStorage).filter((key) => key.startsWith('sb-'))).toEqual([]);
  });

  it('another tab signing in while the verification waits changes nothing', async () => {
    const server = authServer();
    const release = server.holdVerify();
    const backend = createStubBackend(null);
    const { history } = renderApp(PATH, { backend });
    await waitFor(() => expect(server.calls).toHaveLength(1));
    act(() => backend.setUser({ id: 'user-anna', email: 'anna@example.com' }));
    release();
    expect(await screen.findByRole('heading', { name: 'Scegli la password' })).toBeTruthy();
    expect(screen.getByText('Account: giulia@x.it')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Esci e continua' })).toBeNull();
    expect(server.calls.filter((call) => call.path === '/auth/v1/verify')).toHaveLength(1);
    await waitFor(() => expect(history.location.hash).toBe(''));
  });

  it('with an account open: asks to sign out first, without using the code; «Esci e continua» goes on', async () => {
    const server = authServer();
    const backend = createStubBackend(DEMO_USER);
    const { history } = renderApp(PATH, { backend });
    expect(await screen.findByText('Hai aperto l’app come Federico. Per scegliere la password di un altro account esci e torna qui')).toBeTruthy();
    expect(server.calls).toHaveLength(0);
    expect(registeredBusy()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Esci e continua' }));
    expect(await screen.findByRole('heading', { name: 'Scegli la password' })).toBeTruthy();
    expect(backend.signOutCalls).toBe(1);
    expect(server.calls).toHaveLength(1);
    await waitFor(() => expect(history.location.hash).toBe(''));
  });

  it('fake mode: token_hash=demo verifies and saves without the network', async () => {
    setLinkClient(createDemoLinkClient());
    renderApp('/password#token_hash=demo&type=recovery', { backend: createStubBackend(DEMO_USER, 'fake') });
    expect(await screen.findByText(`Account: ${DEMO_USER.email}`)).toBeTruthy();
    choose();
    expect(await screen.findByText('Password salvata.')).toBeTruthy();
  });

  it('speaks British English', async () => {
    setBrowserLanguages(['en-GB']);
    authServer();
    renderApp(PATH, { backend: createStubBackend(null), locale: 'en-GB' });
    expect(await screen.findByRole('heading', { name: 'Choose your password' })).toBeTruthy();
  });
});

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { createMemoryStore } from '../../api/persister';
import { DEMO_USER } from '../../auth/backend';
import { queueKey, registerShoppingStorage } from '../shopping/storage';
import { setOnline } from '../../test/connectivity';
import { createMemoryHub } from '../../test/memoryChannel';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { leavePage } from './leave';

// As in main.tsx: the shopping queue is a per-user key that signing out deletes.
registerShoppingStorage();

const OTHER = { id: 'user-other', email: 'bruno@example.test' };
const consent = (overrides: Partial<{ id: string; clientName: string }> = {}) => ({
  ok: true as const,
  value: { kind: 'consent' as const, id: 'auth-1', clientName: 'Claude Code', clientId: 'client-1', redirectUri: 'http://127.0.0.1:9/callback', scopes: ['openid', 'email'], ...overrides }
});

describe('agent consent page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('shows who asks, with which account, what it can do on the account, the data and the limits of «Scollega»; allows once', async () => {
    const backend = createStubBackend(DEMO_USER);
    const hold = backend.holdDecision();
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    expect(await screen.findByRole('heading', { name: 'Claude Code vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
    expect(screen.getByText('È il nome con cui l’agente si presenta: non è verificato.')).toBeTruthy();
    expect(screen.getByText(DEMO_USER.email)).toBeTruthy();
    expect(screen.getByText(/Agirà con il tuo account, come se fossi tu/)).toBeTruthy();
    expect(screen.getByText(/Potrà anche cambiare la password del tuo account e chiudere le tue sessioni/)).toBeTruthy();
    expect(screen.getByText('Eliminare una famiglia resta possibile solo nell’app.')).toBeTruthy();
    expect(screen.getByText(/revoca questa autorizzazione e le sessioni dell’agente/)).toBeTruthy();
    expect(screen.getByText(/Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala/)).toBeTruthy();
    expect(screen.queryByText(/quando vuoi|bloccarlo/)).toBeNull();
    // Scopes: what the agent receives, not limits.
    expect(screen.getByText('un identificativo del tuo account')).toBeTruthy();
    expect(screen.getByText('il tuo indirizzo email')).toBeTruthy();
    expect(screen.getByText(/non ciò che può fare/)).toBeTruthy();
    // Details to tell same-named clients apart.
    expect(screen.getByText('client-1')).toBeTruthy();
    expect(screen.getByText('http://127.0.0.1:9/callback')).toBeTruthy();

    const allow = await screen.findByRole('button', { name: 'Consenti' });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(allow);
    fireEvent.click(allow);
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    hold({ ok: true, value: 'http://127.0.0.1:9/callback?code=x' });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=x'));
    expect(backend.decisions).toEqual([{ id: 'auth-1', decision: 'approve' }]);
  });

  it('adds the global roles once the profile is read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    vi.spyOn(api.profile, 'get').mockResolvedValue({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator', 'app_admin'] } });
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    expect(await screen.findByText('Potrà anche gestire il ricettario.')).toBeTruthy();
    expect(screen.getByText('Potrà anche amministrare l’app.')).toBeTruthy();
  });

  it('keeps «Consenti» disabled until the profile of this person is read', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    let answer!: (value: typeof profile) => void;
    vi.spyOn(api.profile, 'get').mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    const allow = await screen.findByRole('button', { name: 'Consenti' });
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Sto leggendo il tuo profilo…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(false);
    answer({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator'] } });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Potrà anche gestire il ricettario.')).toBeTruthy();
  });

  it('with the profile in error: no «Consenti», a retry, «Annulla» still there', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const read = vi.spyOn(api.profile, 'get').mockRejectedValue(new ApiError('internal'));
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api });
    expect(await screen.findByText(/Non è stato possibile leggere il tuo profilo/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Annulla' }) as HTMLButtonElement).disabled).toBe(false);
    read.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('a cached profile whose re-read fails does not allow; a successful retry does', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const read = vi.spyOn(api.profile, 'get');
    let queries!: QueryClient;
    function GrabClient() {
      queries = useQueryClient();
      return null;
    }
    const backend = createStubBackend(DEMO_USER);
    renderApp('/authorize?authorization_id=auth-1', { backend, api, extra: <GrabClient /> });
    const allow = await screen.findByRole('button', { name: 'Consenti' });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    read.mockRejectedValue(new ApiError('internal'));
    await act(() => queries.refetchQueries({ queryKey: ['profile', 'get'] }));
    expect(await screen.findByText(/Non è stato possibile leggere il tuo profilo/)).toBeTruthy();
    expect((allow as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(allow);
    expect(backend.decisions).toEqual([]);
    read.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
  });

  it('while the profile is read again, the cached roles do not allow: «Consenti» waits for the current ones', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    const read = vi.spyOn(api.profile, 'get');
    let queries!: QueryClient;
    function GrabClient() {
      queries = useQueryClient();
      return null;
    }
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER), api, extra: <GrabClient /> });
    const allow = await screen.findByRole('button', { name: 'Consenti' });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    let answer!: (value: typeof profile) => void;
    read.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    act(() => void queries.refetchQueries({ queryKey: ['profile', 'get'] }));
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText('Sto leggendo il tuo profilo…')).toBeTruthy();
    expect(screen.queryByText('Potrà anche gestire il ricettario.')).toBeNull();
    answer({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator'] } });
    await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText('Potrà anche gestire il ricettario.')).toBeTruthy();
  });

  it('shows a hostile or very long client name as plain text', async () => {
    const backend = createStubBackend(DEMO_USER);
    const hostile = `<img src=x onerror="alert(1)">${'Claude'.repeat(40)}`;
    backend.authorization = consent({ clientName: hostile });
    const { container } = renderApp('/authorize?authorization_id=auth-1', { backend });
    expect(await screen.findByRole('heading', { name: `${hostile} vuole usare Cosa si mangia con il tuo account` })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('refuses and sends the agent its error', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.decision = { ok: true, value: 'http://127.0.0.1:9/callback?error=access_denied' };
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?error=access_denied'));
    expect(backend.decisions).toEqual([{ id: 'auth-1', decision: 'deny' }]);
  });

  it('goes straight back to the agent when it is already connected', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=y' } };
    const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
    renderApp('/authorize?authorization_id=auth-1', { backend });
    await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=y'));
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();
  });

  it('says the request is not valid when it is missing, expired or already used', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: false, reason: 'not_found' };
    renderApp('/authorize?authorization_id=old', { backend });
    expect(await screen.findByRole('heading', { name: 'Richiesta non valida o scaduta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();

    renderApp('/authorize', { backend: createStubBackend(DEMO_USER) });
    // The first page's heading is already there: wait for the second one too.
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Richiesta non valida o scaduta' })).toHaveLength(2));
  });

  it('lets the person try again after a network failure', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.authorization = { ok: false, reason: 'network' };
    renderApp('/authorize?authorization_id=auth-1', { backend });
    const retry = await screen.findByRole('button', { name: 'Riprova' });
    backend.authorization = consent({ clientName: 'Codex' });
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
  });

  describe('late answers never act on an abandoned request', () => {
    it('answers in reverse order after the request changed: only the current one counts', async () => {
      const backend = createStubBackend(DEMO_USER);
      const first = backend.holdAuthorization();
      const second = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      history.push('/authorize?authorization_id=auth-2');
      second(consent({ id: 'auth-2', clientName: 'Codex' }));
      expect(await screen.findByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
      first({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=old' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Codex vuole usare Cosa si mangia con il tuo account' })).toBeTruthy();
    });

    it('leaving the page while the request is read', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      history.push('/profile');
      answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=late' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
    });

    it('a history event that stays on the same request drops nothing: the read and the decision still land', async () => {
      const backend = createStubBackend(DEMO_USER);
      const read = backend.holdAuthorization();
      const decided = backend.holdDecision();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      history.replace('/authorize?authorization_id=auth-1');
      read(consent());
      const allow = await screen.findByRole('button', { name: 'Consenti' });
      await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(allow);
      history.replace('/authorize?authorization_id=auth-1');
      decided({ ok: true, value: 'http://127.0.0.1:9/callback?code=x' });
      await waitFor(() => expect(leave).toHaveBeenCalledWith('http://127.0.0.1:9/callback?code=x'));
    });

    it('leaving the page while the decision is sent', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdDecision();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      const { history } = renderApp('/authorize?authorization_id=auth-1', { backend });
      const allow = await screen.findByRole('button', { name: 'Consenti' });
      await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(allow);
      history.push('/profile');
      answer({ ok: true, value: 'http://127.0.0.1:9/callback?code=late' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
    });

    it('the person signs out elsewhere while the request is read: the answer is dropped at once', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      backend.setUser(null);
      answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=late' } });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(leave).not.toHaveBeenCalled();
    });

    it('another account signs in while the request is read', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdAuthorization();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      renderApp('/authorize?authorization_id=auth-1', { backend });
      await waitFor(() => expect(screen.getByText('…')).toBeTruthy());
      // Same tick, no React update in between: the session closed by the event is enough.
      backend.setUser(OTHER);
      answer({ ok: true, value: { kind: 'redirect', url: 'http://127.0.0.1:9/callback?code=of-the-first' } });
      expect(await screen.findByText(OTHER.email)).toBeTruthy();
      expect(leave).not.toHaveBeenCalled();
    });

    it('another account signs in while the decision is sent', async () => {
      const backend = createStubBackend(DEMO_USER);
      const answer = backend.holdDecision();
      const leave = vi.spyOn(leavePage, 'to').mockImplementation(() => undefined);
      renderApp('/authorize?authorization_id=auth-1', { backend });
      const allow = await screen.findByRole('button', { name: 'Consenti' });
      await waitFor(() => expect((allow as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(allow);
      // Same tick, no React update in between.
      backend.setUser(OTHER);
      answer({ ok: true, value: 'http://127.0.0.1:9/callback?code=of-the-first' });
      expect(await screen.findByText(OTHER.email)).toBeTruthy();
      expect(leave).not.toHaveBeenCalled();
      // The new person's request is loaded afresh: «Consenti» usable again, not stuck on the old decision.
      await waitFor(() => expect((screen.getByRole('button', { name: 'Consenti' }) as HTMLButtonElement).disabled).toBe(false));
    });
  });

  it('asks to sign in first and comes back here', async () => {
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(null) });
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain(encodeURIComponent('/authorize?authorization_id=auth-1'));
  });

  it('switches account with the common sign-out, even when Supabase fails, and comes back to the request', async () => {
    const backend = createStubBackend(DEMO_USER);
    backend.signOutError = new Error('Auth unreachable');
    const store = createMemoryStore();
    store.entries.set(queueKey(DEMO_USER.id), { ops: [], notices: [], seq: 0 });
    const hub = createMemoryHub();
    const { history } = renderApp('/authorize?authorization_id=auth-1', { backend, store, channel: hub.channel() });
    fireEvent.click(await screen.findByRole('button', { name: 'Non sei tu? Cambia account' }));
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain(encodeURIComponent('/authorize?authorization_id=auth-1'));
    expect(hub.sent).toContainEqual({ type: 'signedOut', userId: DEMO_USER.id });
    await waitFor(() => expect(store.entries.has(queueKey(DEMO_USER.id))).toBe(false));
    expect(backend.signOutCalls).toBe(1);

    backend.setUser(OTHER);
    await waitFor(() => expect(history.location.pathname).toBe('/authorize'));
    expect(await screen.findByText(OTHER.email)).toBeTruthy();
  });

  it('offline: explains that the connection is needed and offers no buttons', async () => {
    setOnline(false);
    renderApp('/authorize?authorization_id=auth-1', { backend: createStubBackend(DEMO_USER) });
    expect(await screen.findByText('Serve la connessione per collegare un agente.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Consenti' })).toBeNull();
  });
});

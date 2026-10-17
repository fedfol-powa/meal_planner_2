import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_STORAGE_KEY, createSupabaseBackend, signInFailure, type AuthClient, type OAuthApi } from './supabaseBackend';

type Listener = (event: string, session: { user: { id: string; email?: string } } | null) => void;

function setup(overrides: Partial<Record<keyof AuthClient, unknown>> = {}) {
  let listener: Listener = () => {};
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: {} }, error: null })),
    ...overrides
  };
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
  const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', { auth: auth as unknown as AuthClient, storage });
  return { auth, stored, backend, emit: (event: string, session: Parameters<Listener>[1]) => listener(event, session) };
}

describe('supabase backend', () => {
  it('maps sign-in errors to our reasons', () => {
    expect(signInFailure({ code: 'invalid_credentials', status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ status: 400 })).toBe('invalid_credentials');
    expect(signInFailure({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(signInFailure({ status: 500 })).toBe('unknown');
  });
  it('signs out of this device only and leaves nothing stored even when the service fails', async () => {
    const { auth, stored, backend } = setup({ signOut: vi.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })) });
    stored.set(AUTH_STORAGE_KEY, '{}');
    stored.set(`${AUTH_STORAGE_KEY}-code-verifier`, 'x');
    await expect(backend.signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(stored.size).toBe(0);
  });
  it('tells a verified session, an unverifiable one and no session apart', async () => {
    const user = { id: 'u1', email: 'anna@example.com' };
    const signedIn = setup({ getSession: vi.fn(async () => ({ data: { session: { user } }, error: null })) });
    expect(await signedIn.backend.check()).toEqual({ status: 'signedIn', user });
    const offline = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })) });
    offline.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await offline.backend.check()).toEqual({ status: 'unverified', user });
    const refused = setup({ getSession: vi.fn(async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400 } })) });
    refused.stored.set(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    expect(await refused.backend.check()).toEqual({ status: 'signedOut' });
    expect(await setup().backend.check()).toEqual({ status: 'signedOut' });
  });
  it('reports sign-ins, sign-outs and new tokens with their kind, ignoring empty initial events', () => {
    const { backend, emit } = setup();
    const listener = vi.fn();
    backend.onChange(listener);
    emit('INITIAL_SESSION', null);
    expect(listener).not.toHaveBeenCalled();
    const user = { id: 'u1', email: 'a@example.com' };
    emit('SIGNED_IN', { user });
    expect(listener).toHaveBeenLastCalledWith({ type: 'SIGNED_IN', user });
    emit('TOKEN_REFRESHED', { user });
    expect(listener).toHaveBeenLastCalledWith({ type: 'TOKEN_REFRESHED', user });
    emit('SIGNED_OUT', null);
    expect(listener).toHaveBeenLastCalledWith({ type: 'SIGNED_OUT', user: null });
  });
  it('renews the session once on request, telling refusal and missing network apart (second PR)', async () => {
    const user = { id: 'u1', email: 'a@example.com' };
    const ok = setup({ refreshSession: vi.fn(async () => ({ data: { session: { user } }, error: null })) });
    expect(await ok.backend.refresh()).toEqual({ kind: 'ok', userId: 'u1' });
    const refused = setup({ refreshSession: vi.fn(async () => ({ data: { session: null }, error: { name: 'AuthApiError', status: 400 } })) });
    expect(await refused.backend.refresh()).toEqual({ kind: 'rejected' });
    const empty = setup({ refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })) });
    expect(await empty.backend.refresh()).toEqual({ kind: 'rejected' });
    const offline = setup({ refreshSession: vi.fn(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) })) });
    expect(await offline.backend.refresh()).toEqual({ kind: 'network' });
  });
  it('changes the password with the device session, without touching the shared client', async () => {
    // Shaped like Supabase's: the change is bound to the token's session_id.
    const deviceToken = `header.${btoa(JSON.stringify({ sub: 'u1', session_id: 's1' }))}.signature`;
    const session = { user: { id: 'u1', email: 'anna@example.com' }, access_token: deviceToken };
    const sent: { path: string; authorization: string | null }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      sent.push({ path: url.pathname, authorization: new Headers(init?.headers).get('authorization') });
      if (url.pathname.endsWith('/user')) return Response.json({ code: 'same_password', message: 'same' }, { status: 422 });
      if (url.pathname.endsWith('/token')) return Response.json({ access_token: 'check-token' });
      return new Response(null, { status: 204 });
    });
    const auth = {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn()
    };
    const stored = new Map([[AUTH_STORAGE_KEY, JSON.stringify(session)]]);
    const storage = { getItem: (k: string) => stored.get(k) ?? null, removeItem: (k: string) => void stored.delete(k) };
    const backend = createSupabaseBackend('http://127.0.0.1:54321', 'key', { auth: auth as unknown as AuthClient, storage, fetch: fetchImpl as unknown as typeof fetch });
    expect(await backend.changePassword('old-password', 'old-password!')).toEqual({ ok: false, reason: 'same_password' });
    expect(sent.find((r) => r.path.endsWith('/user'))?.authorization).toBe(`Bearer ${deviceToken}`);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(stored.get(AUTH_STORAGE_KEY)).toBe(JSON.stringify(session));

    // A token without its session id cannot be bound to the change: nothing is sent.
    session.access_token = 'no-session-id';
    sent.length = 0;
    expect(await backend.changePassword('old-password', 'new-password')).toEqual({ ok: false, reason: 'session_expired' });
    expect(sent).toEqual([]);
  });
});

describe('agent consent', () => {
  const oauth = (overrides: Partial<Record<'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization', unknown>>) =>
    ({
      getAuthorizationDetails: vi.fn(),
      approveAuthorization: vi.fn(),
      denyAuthorization: vi.fn(),
      ...overrides
    }) as unknown as OAuthApi;
  const backendWith = (api: OAuthApi) => createSupabaseBackend('http://sb', 'key', { auth: setup().auth as unknown as AuthClient, storage: { getItem: () => null, removeItem: () => undefined }, oauth: api });

  it('reads a request that needs consent: client name, id, return page and scopes', async () => {
    const api = oauth({
      getAuthorizationDetails: vi.fn(async () => ({
        data: { authorization_id: 'auth-1', redirect_uri: 'http://localhost/cb', client: { id: 'c-1', name: 'Claude Code', uri: '', logo_uri: '' }, user: { id: 'u', email: 'a@x' }, scope: 'openid  email profile ' },
        error: null
      }))
    });
    expect(await backendWith(api).getAuthorization('auth-1')).toEqual({
      ok: true,
      value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code', clientId: 'c-1', redirectUri: 'http://localhost/cb', scopes: ['openid', 'email', 'profile'] }
    });
  });

  it('goes straight back to the agent when the grant is already active', async () => {
    const api = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?code=x' }, error: null })) });
    expect(await backendWith(api).getAuthorization('auth-1')).toEqual({ ok: true, value: { kind: 'redirect', url: 'http://localhost/cb?code=x' } });
  });

  it('maps missing or expired requests and network failures', async () => {
    const missing = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 404, name: 'AuthApiError', message: 'not found' } })) });
    const offline = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 0, name: 'AuthRetryableFetchError', message: 'fetch failed' } })) });
    const broken = oauth({ getAuthorizationDetails: vi.fn(async () => ({ data: null, error: { status: 500, name: 'AuthApiError', message: 'boom' } })) });
    for (const [api, reason] of [[missing, 'not_found'], [offline, 'network'], [broken, 'unknown']] as const) {
      expect(await backendWith(api).getAuthorization('auth-1')).toEqual({ ok: false, reason });
    }
  });

  it('approves or denies without letting the library navigate, and returns where to go', async () => {
    const approve = vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?code=x' }, error: null }));
    const deny = vi.fn(async () => ({ data: { redirect_url: 'http://localhost/cb?error=access_denied' }, error: null }));
    const backend = backendWith(oauth({ approveAuthorization: approve, denyAuthorization: deny }));
    expect(await backend.decideAuthorization('auth-1', 'approve')).toEqual({ ok: true, value: 'http://localhost/cb?code=x' });
    expect(approve).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true });
    expect(await backend.decideAuthorization('auth-1', 'deny')).toEqual({ ok: true, value: 'http://localhost/cb?error=access_denied' });
    expect(deny).toHaveBeenCalledWith('auth-1', { skipBrowserRedirect: true });
  });
  describe('requestPasswordEmail', () => {
    const withReset = (resetPasswordForEmail: unknown) => {
      const { auth, backend } = setup({ resetPasswordForEmail });
      return { auth, backend };
    };
    it('asks Supabase for the recovery link back to /password', async () => {
      const reset = vi.fn(async () => ({ data: {}, error: null }));
      const { backend } = withReset(reset);
      expect(await backend.requestPasswordEmail('anna@example.com')).toEqual({ ok: true });
      expect(reset).toHaveBeenCalledWith('anna@example.com', { redirectTo: `${location.origin}/password` });
    });
    it('counts the per-address 429 as sent and the project 429 as project_limit', async () => {
      const perAddress = { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 42 seconds.' };
      expect(await withReset(vi.fn(async () => ({ data: null, error: perAddress }))).backend.requestPasswordEmail('a@b.c')).toEqual({ ok: true });
      const project = { name: 'AuthApiError', status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' };
      expect(await withReset(vi.fn(async () => ({ data: null, error: project }))).backend.requestPasswordEmail('a@b.c')).toEqual({ ok: false, reason: 'project_limit' });
    });
    it('maps a lost request to network and the rest to unknown', async () => {
      expect(await withReset(vi.fn(async () => ({ data: null, error: new AuthRetryableFetchError('offline', 0) }))).backend.requestPasswordEmail('a@b.c')).toEqual({ ok: false, reason: 'network' });
      expect(await withReset(vi.fn(async () => ({ data: null, error: { name: 'AuthApiError', status: 500, message: 'boom' } }))).backend.requestPasswordEmail('a@b.c')).toEqual({ ok: false, reason: 'unknown' });
    });
  });
});

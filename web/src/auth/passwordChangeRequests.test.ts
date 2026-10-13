import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { changePasswordFailure, changePasswordWith, sessionIdOf, type DeviceSession, type PasswordChangeDeps, type SessionRead } from './passwordChangeRequests';

const URL_ = 'http://127.0.0.1:54321';
const A: DeviceSession = { userId: 'user-a', sessionId: 'session-a1', email: 'a@example.test', accessToken: 'token-a' };
/** The same session after a renewal: new token, same session id. */
const A_RENEWED: DeviceSession = { ...A, accessToken: 'token-a-renewed' };
/** A new sign-in of the same person: same user, another session. */
const A_AGAIN: DeviceSession = { ...A, sessionId: 'session-a2', accessToken: 'token-a-again' };
const B: DeviceSession = { userId: 'user-b', sessionId: 'session-b1', email: 'b@example.test', accessToken: 'token-b' };
const offline: SessionRead = { session: null, error: new AuthRetryableFetchError('offline', 0) };

type Answer = Response | Promise<Response> | Error;
interface Sent { method: string; path: string; authorization: string | null; apikey: string | null; version: string | null; body: unknown }

/** A fake Supabase Auth: answers per path, records every request. */
function fakeAuth(answers: Partial<Record<'token' | 'logout' | 'user', Answer | Answer[]>> = {}) {
  const sent: Sent[] = [];
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]])) as Record<string, Answer[]>;
  const defaults: Record<string, () => Response> = {
    token: () => Response.json({ access_token: 'check-token', refresh_token: 'check-refresh', user: { id: 'user-a' } }),
    logout: () => new Response(null, { status: 204 }),
    user: () => Response.json({ id: 'user-a' })
  };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const kind = url.pathname.endsWith('/token') ? 'token' : url.pathname.endsWith('/logout') ? 'logout' : 'user';
    sent.push({
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      authorization: headers.get('authorization'),
      apikey: headers.get('apikey'),
      version: headers.get('x-supabase-api-version'),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });
    const queued = queues[kind]?.length ? queues[kind]!.length > 1 ? queues[kind]!.shift()! : queues[kind]![0]! : defaults[kind]!();
    if (queued instanceof Error) throw queued;
    return queued;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
}
const errorAnswer = (status: number, code: string, extra: object = {}) => Response.json({ code, message: code, ...extra }, { status, headers: { 'x-sb-error-code': code } });

function deps(fetchImpl: typeof fetch, reads: (SessionRead | (() => SessionRead))[] = [{ session: A, error: null }]): PasswordChangeDeps {
  let i = 0;
  return {
    url: URL_,
    publishableKey: 'publishable',
    fetch: fetchImpl,
    readSession: async () => {
      const next = reads[Math.min(i++, reads.length - 1)]!;
      return typeof next === 'function' ? next() : next;
    }
  };
}

describe('changePasswordFailure', () => {
  it('maps every Supabase answer to our reasons', () => {
    expect(changePasswordFailure(new AuthRetryableFetchError('offline', 0))).toBe('network');
    expect(changePasswordFailure({ name: 'TypeError', status: 0 })).toBe('network');
    expect(changePasswordFailure({ code: 'over_request_rate_limit', status: 429 })).toBe('rate_limited');
    expect(changePasswordFailure({ status: 429 })).toBe('rate_limited');
    expect(changePasswordFailure({ code: 'current_password_mismatch', status: 400 })).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'invalid_credentials', status: 400 })).toBe('current_invalid');
    // Other refusals of the sign-in are not about the password (Auth v2.197.0, token.go).
    expect(changePasswordFailure({ status: 400 })).toBe('unknown');
    expect(changePasswordFailure({ code: 'user_banned', status: 400 })).toBe('unknown');
    expect(changePasswordFailure({ code: 'email_not_confirmed', status: 400 })).toBe('unknown');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['characters'] })).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length', 'characters'] })).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length'] })).toBe('weak_length');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['pwned'] })).toBe('weak');
    expect(changePasswordFailure({ code: 'weak_password', status: 422 })).toBe('weak');
    expect(changePasswordFailure({ code: 'same_password', status: 422 })).toBe('same_password');
    expect(changePasswordFailure({ code: 'reauthentication_needed', status: 400 })).toBe('reauthentication_needed');
    expect(changePasswordFailure(new AuthSessionMissingError())).toBe('session_expired');
    expect(changePasswordFailure({ status: 401 })).toBe('session_expired');
    expect(changePasswordFailure({ code: 'session_not_found', status: 403 })).toBe('session_expired');
    expect(changePasswordFailure({ code: 'refresh_token_not_found', status: 400 })).toBe('session_expired');
    expect(changePasswordFailure({ code: 'bad_jwt', status: 403 })).toBe('session_expired');
    expect(changePasswordFailure({ code: 'validation_failed', status: 400 })).toBe('unknown');
    expect(changePasswordFailure({ status: 500 })).toBe('unknown');
  });
});

describe('sessionIdOf', () => {
  it('reads the session_id claim of an access token, null when there is none', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-a', session_id: 'session-a1', note: '??>>' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(payload).toMatch(/[-_]/); // base64url, unpadded, as in real tokens
    expect(sessionIdOf(`header.${payload}.signature`)).toBe('session-a1');
    expect(sessionIdOf(`header.${btoa(JSON.stringify({ sub: 'user-a' }))}.signature`)).toBeNull();
    expect(sessionIdOf('not-a-jwt')).toBeNull();
  });
});

describe('changePasswordWith', () => {
  it('checks the current password, revokes the check, then changes it with the captured token', async () => {
    const { fetchImpl, sent } = fakeAuth();
    expect(await changePasswordWith(deps(fetchImpl), 'old-password', 'new-password')).toEqual({ ok: true });
    expect(sent.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /auth/v1/token?grant_type=password',
      'POST /auth/v1/logout?scope=local',
      'PUT /auth/v1/user'
    ]);
    expect(sent.every((r) => r.apikey === 'publishable' && r.version === '2024-01-01')).toBe(true);
    expect(sent[0]).toMatchObject({ authorization: null, body: { email: 'a@example.test', password: 'old-password' } });
    expect(sent[1]!.authorization).toBe('Bearer check-token');
    expect(sent[2]).toMatchObject({ authorization: 'Bearer token-a', body: { password: 'new-password', current_password: 'old-password' } });
  });
  it('changes nothing and revokes nothing when the current password is wrong', async () => {
    const { fetchImpl, sent } = fakeAuth({ token: errorAnswer(400, 'invalid_credentials') });
    expect(await changePasswordWith(deps(fetchImpl), 'wrong', 'new-password')).toEqual({ ok: false, reason: 'current_invalid' });
    expect(sent.map((r) => r.path)).toEqual(['/auth/v1/token?grant_type=password']);
  });
  it('tries the revocation again once, and a double failure does not change the outcome', async () => {
    const twice = fakeAuth({ logout: [new Response('down', { status: 503 }), new Response(null, { status: 204 })] });
    expect(await changePasswordWith(deps(twice.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: true });
    expect(twice.sent.filter((r) => r.path.startsWith('/auth/v1/logout')).map((r) => r.authorization)).toEqual(['Bearer check-token', 'Bearer check-token']);

    const unreachable = fakeAuth({ logout: [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')], user: errorAnswer(422, 'same_password') });
    expect(await changePasswordWith(deps(unreachable.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(unreachable.sent.filter((r) => r.path.startsWith('/auth/v1/logout'))).toHaveLength(2);
  });
  it('tells a renewal blocked by the network from a session that is over, without any request', async () => {
    const network = fakeAuth();
    expect(await changePasswordWith(deps(network.fetchImpl, [offline]), 'a', 'b')).toEqual({ ok: false, reason: 'network' });
    const refused = fakeAuth();
    expect(await changePasswordWith(deps(refused.fetchImpl, [{ session: null, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    const none = fakeAuth();
    expect(await changePasswordWith(deps(none.fetchImpl, [{ session: null, error: null }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    expect([...network.sent, ...refused.sent, ...none.sent]).toEqual([]);
  });
  /** A check held open until `answer`; `device` is what the shared client holds meanwhile. */
  function heldCheck() {
    let answer!: (response: Response) => void;
    const auth = fakeAuth({ token: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(auth.fetchImpl, [() => device]), 'password-a', 'new-password-a');
    return {
      ...auth,
      during(read: SessionRead) {
        device = read;
        answer(Response.json({ access_token: 'check-token' }));
        return running;
      }
    };
  }
  it('sends no change when another tab switched to B during the check', async () => {
    const check = heldCheck();
    expect(await check.during({ session: B, error: null })).toEqual({ ok: false, reason: 'account_changed' });
    expect(check.sent.some((r) => r.method === 'PUT')).toBe(false);
    expect(check.sent.some((r) => r.authorization === 'Bearer token-b')).toBe(false);
  });
  it('sends no change when the same person signed in again with another session during the check', async () => {
    const check = heldCheck();
    expect(await check.during({ session: A_AGAIN, error: null })).toEqual({ ok: false, reason: 'account_changed' });
    expect(check.sent.some((r) => r.method === 'PUT')).toBe(false);
  });
  it('keeps the captured token when the same session was renewed during the check', async () => {
    const check = heldCheck();
    expect(await check.during({ session: A_RENEWED, error: null })).toEqual({ ok: true });
    expect(check.sent.find((r) => r.method === 'PUT')!.authorization).toBe('Bearer token-a');
  });
  it('reports a session that ended during the check, without sending the change', async () => {
    const signedOut = heldCheck();
    expect(await signedOut.during({ session: null, error: null })).toEqual({ ok: false, reason: 'session_expired' });
    const refused = heldCheck();
    expect(await refused.during({ session: null, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } })).toEqual({ ok: false, reason: 'session_expired' });
    expect([...signedOut.sent, ...refused.sent].some((r) => r.method === 'PUT')).toBe(false);
  });
  it('reports the network, not a change of account, when the session cannot be read before the change', async () => {
    const check = heldCheck();
    expect(await check.during(offline)).toEqual({ ok: false, reason: 'network' });
    expect(check.sent.some((r) => r.method === 'PUT')).toBe(false);
  });
  /** The change held open until `answer`; `device` is what the shared client holds meanwhile. */
  function heldChange() {
    let answer!: (response: Response) => void;
    const auth = fakeAuth({ user: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(auth.fetchImpl, [() => device]), 'password-a', 'new-password-a');
    return {
      ...auth,
      async during(read: SessionRead, response: Response) {
        await vi.waitFor(() => expect(auth.sent.some((r) => r.method === 'PUT')).toBe(true));
        device = read;
        answer(response);
        return running;
      }
    };
  }
  it('a change the server confirmed stays a success, whatever the device holds afterwards', async () => {
    const switched = heldChange();
    expect(await switched.during({ session: B, error: null }, Response.json({ id: 'user-a' }))).toEqual({ ok: true });
    expect(switched.sent.find((r) => r.method === 'PUT')!.authorization).toBe('Bearer token-a');
    const unreadable = heldChange();
    expect(await unreadable.during(offline, Response.json({ id: 'user-a' }))).toEqual({ ok: true });
  });
  it('a refused change reports the account change, or the server’s answer when the device cannot be read', async () => {
    const switched = heldChange();
    expect(await switched.during({ session: B, error: null }, errorAnswer(403, 'session_not_found'))).toEqual({ ok: false, reason: 'account_changed' });
    const again = heldChange();
    expect(await again.during({ session: A_AGAIN, error: null }, errorAnswer(403, 'session_not_found'))).toEqual({ ok: false, reason: 'account_changed' });
    const unreadable = heldChange();
    expect(await unreadable.during(offline, errorAnswer(422, 'same_password'))).toEqual({ ok: false, reason: 'same_password' });
  });
  it('reads error codes from the body or only from the header, and survives a body that is not JSON', async () => {
    const weak = fakeAuth({ user: Response.json({ code: 'weak_password', message: 'weak', weak_password: { reasons: ['pwned'] } }, { status: 422 }) });
    expect(await changePasswordWith(deps(weak.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'weak' });
    const headerOnly = fakeAuth({ user: new Response('<html>', { status: 403, headers: { 'x-sb-error-code': 'session_not_found' } }) });
    expect(await changePasswordWith(deps(headerOnly.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'session_expired' });
    const broken = fakeAuth({ user: new Response('<html>', { status: 502 }) });
    expect(await changePasswordWith(deps(broken.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'unknown' });
    const unreachable = fakeAuth({ token: new TypeError('Failed to fetch') });
    expect(await changePasswordWith(deps(unreachable.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'network' });
  });
});

import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { changePasswordFailure, changePasswordWith, type DeviceSession, type PasswordChangeDeps, type SessionRead } from './passwordChangeRequests';

const URL_ = 'http://127.0.0.1:54321';
const A: DeviceSession = { userId: 'user-a', email: 'a@example.test', accessToken: 'token-a' };
const B: DeviceSession = { userId: 'user-b', email: 'b@example.test', accessToken: 'token-b' };

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
    expect(changePasswordFailure(new AuthRetryableFetchError('offline', 0), 'verify')).toBe('network');
    expect(changePasswordFailure({ name: 'TypeError', status: 0 }, 'update')).toBe('network');
    expect(changePasswordFailure({ code: 'over_request_rate_limit', status: 429 }, 'verify')).toBe('rate_limited');
    expect(changePasswordFailure({ status: 429 }, 'update')).toBe('rate_limited');
    expect(changePasswordFailure({ code: 'current_password_mismatch', status: 400 }, 'update')).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'invalid_credentials', status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ status: 400 }, 'verify')).toBe('current_invalid');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['characters'] }, 'update')).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length', 'characters'] }, 'update')).toBe('weak_characters');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['length'] }, 'update')).toBe('weak_length');
    expect(changePasswordFailure({ code: 'weak_password', status: 422, reasons: ['pwned'] }, 'update')).toBe('weak');
    expect(changePasswordFailure({ code: 'weak_password', status: 422 }, 'update')).toBe('weak');
    expect(changePasswordFailure({ code: 'same_password', status: 422 }, 'update')).toBe('same_password');
    expect(changePasswordFailure({ code: 'reauthentication_needed', status: 400 }, 'update')).toBe('reauthentication_needed');
    expect(changePasswordFailure(new AuthSessionMissingError(), 'update')).toBe('session_expired');
    expect(changePasswordFailure({ status: 401 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'session_not_found', status: 403 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'refresh_token_not_found', status: 400 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'bad_jwt', status: 403 }, 'update')).toBe('session_expired');
    expect(changePasswordFailure({ code: 'validation_failed', status: 400 }, 'update')).toBe('unknown');
    expect(changePasswordFailure({ status: 500 }, 'update')).toBe('unknown');
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

    const offline = fakeAuth({ logout: [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')], user: errorAnswer(422, 'same_password') });
    expect(await changePasswordWith(deps(offline.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'same_password' });
    expect(offline.sent.filter((r) => r.path.startsWith('/auth/v1/logout'))).toHaveLength(2);
  });
  it('tells a renewal blocked by the network from a session that is over, without any request', async () => {
    const network = fakeAuth();
    expect(await changePasswordWith(deps(network.fetchImpl, [{ session: null, error: new AuthRetryableFetchError('offline', 0) }]), 'a', 'b')).toEqual({ ok: false, reason: 'network' });
    const refused = fakeAuth();
    expect(await changePasswordWith(deps(refused.fetchImpl, [{ session: null, error: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    const none = fakeAuth();
    expect(await changePasswordWith(deps(none.fetchImpl, [{ session: null, error: null }]), 'a', 'b')).toEqual({ ok: false, reason: 'session_expired' });
    expect([...network.sent, ...refused.sent, ...none.sent]).toEqual([]);
  });
  it('sends no change when another tab switched to B during the check', async () => {
    let answer!: (response: Response) => void;
    const held = new Promise<Response>((resolve) => (answer = resolve));
    const { fetchImpl, sent } = fakeAuth({ token: held });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    device = { session: B, error: null };
    answer(Response.json({ access_token: 'check-token' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.some((r) => r.method === 'PUT')).toBe(false);
    expect(sent.some((r) => r.authorization === 'Bearer token-b')).toBe(false);
  });
  it('sends no change when the person signed out during the check', async () => {
    let answer!: (response: Response) => void;
    const { fetchImpl, sent } = fakeAuth({ token: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    device = { session: null, error: null };
    answer(Response.json({ access_token: 'check-token' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.some((r) => r.method === 'PUT')).toBe(false);
  });
  it('reports a neutral outcome when the account changed while the change was on its way', async () => {
    let answer!: (response: Response) => void;
    const { fetchImpl, sent } = fakeAuth({ user: new Promise<Response>((resolve) => (answer = resolve)) });
    let device: SessionRead = { session: A, error: null };
    const running = changePasswordWith(deps(fetchImpl, [() => device]), 'password-a', 'new-password-a');
    await vi.waitFor(() => expect(sent.some((r) => r.method === 'PUT')).toBe(true));
    device = { session: B, error: null };
    answer(Response.json({ id: 'user-a' }));
    expect(await running).toEqual({ ok: false, reason: 'account_changed' });
    expect(sent.find((r) => r.method === 'PUT')!.authorization).toBe('Bearer token-a');
  });
  it('reads error codes from the body or only from the header, and survives a body that is not JSON', async () => {
    const weak = fakeAuth({ user: Response.json({ code: 'weak_password', message: 'weak', weak_password: { reasons: ['pwned'] } }, { status: 422 }) });
    expect(await changePasswordWith(deps(weak.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'weak' });
    const headerOnly = fakeAuth({ user: new Response('<html>', { status: 403, headers: { 'x-sb-error-code': 'session_not_found' } }) });
    expect(await changePasswordWith(deps(headerOnly.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'session_expired' });
    const broken = fakeAuth({ user: new Response('<html>', { status: 502 }) });
    expect(await changePasswordWith(deps(broken.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'unknown' });
    const offline = fakeAuth({ token: new TypeError('Failed to fetch') });
    expect(await changePasswordWith(deps(offline.fetchImpl), 'old-password', 'new-password')).toEqual({ ok: false, reason: 'network' });
  });
});

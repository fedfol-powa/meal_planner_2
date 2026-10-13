import type { ChangePasswordFailure, ChangePasswordResult } from './backend';

/** The version supabase-js sends: errors come as { code, message } (gotrue v2.197.0). */
const API_VERSION = '2024-01-01';

export type AuthErrorLike = { code?: string; status?: number; name?: string; reasons?: string[] };
export interface DeviceSession { userId: string; email: string; accessToken: string }
export interface SessionRead { session: DeviceSession | null; error: AuthErrorLike | null }
export interface PasswordChangeDeps {
  url: string;
  publishableKey: string;
  fetch: typeof fetch;
  /** This device's session as the shared client holds it now (read at every step). */
  readSession(): Promise<SessionRead>;
}

const isNetwork = (error: AuthErrorLike) => error.name === 'AuthRetryableFetchError' || error.status === 0;

/** Supabase Auth answers to our reasons (spec, table of errors); `verify` is the throwaway sign-in. */
export function changePasswordFailure(error: AuthErrorLike, step: 'verify' | 'update'): ChangePasswordFailure {
  if (isNetwork(error)) return 'network';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited';
  if (error.code === 'current_password_mismatch') return 'current_invalid';
  if (step === 'verify' && (error.code === 'invalid_credentials' || error.status === 400)) return 'current_invalid';
  if (error.code === 'weak_password') {
    if (error.reasons?.includes('characters')) return 'weak_characters';
    return error.reasons?.length && error.reasons.every((reason) => reason === 'length') ? 'weak_length' : 'weak';
  }
  if (error.code === 'same_password') return 'same_password';
  if (error.code === 'reauthentication_needed') return 'reauthentication_needed';
  if (
    error.name === 'AuthSessionMissingError' ||
    error.status === 401 ||
    error.code === 'session_not_found' ||
    error.code === 'refresh_token_not_found' ||
    error.code === 'bad_jwt'
  )
    return 'session_expired';
  return 'unknown';
}

type Call = { ok: true; body: unknown } | { ok: false; error: AuthErrorLike };

async function call(deps: PasswordChangeDeps, path: string, init: { method: string; token?: string; body?: object }): Promise<Call> {
  const headers: Record<string, string> = {
    apikey: deps.publishableKey,
    'content-type': 'application/json',
    'x-supabase-api-version': API_VERSION
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let response: Response;
  try {
    response = await deps.fetch(`${deps.url}/auth/v1${path}`, { method: init.method, headers, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch {
    return { ok: false, error: { name: 'TypeError', status: 0 } };
  }
  const body = (await response.json().catch(() => null)) as { code?: unknown; weak_password?: { reasons?: string[] } } | null;
  if (response.ok) return { ok: true, body };
  const code = response.headers.get('x-sb-error-code') ?? (typeof body?.code === 'string' ? body.code : undefined);
  return { ok: false, error: { status: response.status, code, reasons: body?.weak_password?.reasons } };
}

/**
 * Verify, revoke the check, change: all bound to the session captured at the start, never to
 * whatever the shared client holds later (review W7, finding 1). No supabase-js client for the
 * check: nothing stored, no events, no listeners to dispose of.
 */
export async function changePasswordWith(deps: PasswordChangeDeps, current: string, next: string): Promise<ChangePasswordResult> {
  const fail = (reason: ChangePasswordFailure): ChangePasswordResult => ({ ok: false, reason });
  // 0. Capture: the error first, as check() does — a renewal blocked by the network is not an expiry.
  const first = await deps.readSession();
  if (first.error) return fail(isNetwork(first.error) ? 'network' : 'session_expired');
  if (!first.session) return fail('session_expired');
  const captured = first.session;
  const stillSameUser = async () => (await deps.readSession()).session?.userId === captured.userId;

  // 1. The current password, through a sign-in of its own.
  const verified = await call(deps, '/token?grant_type=password', { method: 'POST', body: { email: captured.email, password: current } });
  if (!verified.ok) return fail(changePasswordFailure(verified.error, 'verify'));

  // 2. Revoke that sign-in with its own token, once more if it fails. A double failure leaves it
  //    alive on the server until its refresh token expires or the next successful change (known limit).
  const checkToken = (verified.body as { access_token?: unknown } | null)?.access_token;
  if (typeof checkToken === 'string') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if ((await call(deps, '/logout?scope=local', { method: 'POST', token: checkToken })).ok) break;
    }
  }

  // 3. Another tab signed out or switched account: nothing is sent.
  if (!(await stillSameUser())) return fail('account_changed');

  // 4. The change, with the captured token: Supabase keeps exactly that session and ends the others.
  const changed = await call(deps, '/user', { method: 'PUT', token: captured.accessToken, body: { password: next, current_password: current } });

  // 5. The device moved on meanwhile: a neutral outcome, nothing applied locally.
  if (!(await stillSameUser())) return fail('account_changed');
  return changed.ok ? { ok: true } : fail(changePasswordFailure(changed.error, 'update'));
}

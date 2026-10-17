import type { ChangePasswordFailure, ChangePasswordResult } from './backend';

/** The version supabase-js sends: errors come as { code, message } (gotrue v2.197.0). */
const API_VERSION = '2024-01-01';

export type AuthErrorLike = { code?: string; status?: number; name?: string; reasons?: string[] };
/** `sessionId` is the token's `session_id`: it stays the same across renewals, a new sign-in changes it. */
export interface DeviceSession { userId: string; sessionId: string; email: string; accessToken: string }
export interface SessionRead { session: DeviceSession | null; error: AuthErrorLike | null }
export interface PasswordChangeDeps {
  url: string;
  publishableKey: string;
  fetch: typeof fetch;
  /** This device's session as the shared client holds it now (read at every step). */
  readSession(): Promise<SessionRead>;
}

const isNetwork = (error: AuthErrorLike) => error.name === 'AuthRetryableFetchError' || error.status === 0;

/** The `session_id` claim of a Supabase access token; null when it cannot be read. */
export function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as { session_id?: unknown };
    return typeof claims.session_id === 'string' ? claims.session_id : null;
  } catch {
    return null;
  }
}

/** Supabase Auth answers to our reasons (spec, table of errors). */
export function changePasswordFailure(error: AuthErrorLike): ChangePasswordFailure {
  if (isNetwork(error)) return 'network';
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited';
  // Only these say the password is wrong: `user_banned`, `email_not_confirmed`… are not about it.
  if (error.code === 'current_password_mismatch' || error.code === 'invalid_credentials') return 'current_invalid';
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

export type Call = { ok: true; body: unknown } | { ok: false; error: AuthErrorLike };

export async function call(deps: Pick<PasswordChangeDeps, 'url' | 'publishableKey' | 'fetch'>, path: string, init: { method: string; token?: string; body?: object }): Promise<Call> {
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

/** What one read of the device says about the captured session. */
type Identity = 'same' | 'changed' | 'unverifiable' | 'ended';

async function identityOf(deps: PasswordChangeDeps, captured: DeviceSession | null): Promise<{ identity: Identity; session: DeviceSession | null }> {
  const { session, error } = await deps.readSession();
  // The error first, as check() does: a renewal blocked by the network is not an expiry.
  if (error) return { identity: isNetwork(error) ? 'unverifiable' : 'ended', session: null };
  if (!session) return { identity: 'ended', session: null };
  // A renewal keeps the session id; a new sign-in, even of the same person, does not.
  const same = !captured || (session.userId === captured.userId && session.sessionId === captured.sessionId);
  return { identity: same ? 'same' : 'changed', session };
}

const BEFORE_CHANGE: Record<Exclude<Identity, 'same'>, ChangePasswordFailure> = {
  changed: 'account_changed',
  unverifiable: 'network',
  ended: 'session_expired'
};

/**
 * Verify, revoke the check, change: all bound to the session captured at the start, never to
 * whatever the shared client holds later (review W7, findings 1 of both rounds). No supabase-js
 * client for the check: nothing stored, no events, no listeners to dispose of.
 */
export async function changePasswordWith(deps: PasswordChangeDeps, current: string, next: string): Promise<ChangePasswordResult> {
  const fail = (reason: ChangePasswordFailure): ChangePasswordResult => ({ ok: false, reason });
  // 0. Capture: user, session id, email and token, once.
  const first = await identityOf(deps, null);
  if (first.identity !== 'same') return fail(BEFORE_CHANGE[first.identity]);
  const captured = first.session!;

  // 1. The current password, through a sign-in of its own.
  const verified = await call(deps, '/token?grant_type=password', { method: 'POST', body: { email: captured.email, password: current } });
  if (!verified.ok) return fail(changePasswordFailure(verified.error));

  // 2. Revoke that sign-in with its own token, once more if it fails. A double failure leaves it
  //    alive on the server until its refresh token expires or the next successful change (known limit).
  const checkToken = (verified.body as { access_token?: unknown } | null)?.access_token;
  if (typeof checkToken === 'string') {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if ((await call(deps, '/logout?scope=local', { method: 'POST', token: checkToken })).ok) break;
    }
  }

  // 3. Another session (another account, or the same person signed in again), a session that
  //    ended, or one that cannot be read now: nothing is sent.
  const before = await identityOf(deps, captured);
  if (before.identity !== 'same') return fail(BEFORE_CHANGE[before.identity]);

  // 4. The change, with the captured token: Supabase keeps exactly that session and ends the others.
  const changed = await call(deps, '/user', { method: 'PUT', token: captured.accessToken, body: { password: next, current_password: current } });
  // A change the server confirmed is a success: what the device holds now cannot undo it.
  if (changed.ok) return { ok: true };

  // 5. A refusal after the device moved on concerns a session no longer shown: a neutral outcome.
  if ((await identityOf(deps, captured)).identity === 'changed') return fail('account_changed');
  return fail(changePasswordFailure(changed.error));
}

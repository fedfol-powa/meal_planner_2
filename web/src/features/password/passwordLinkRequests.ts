import type { ChangePasswordFailure } from '../../auth/backend';
import { call, changePasswordFailure, type PasswordChangeDeps } from '../../auth/passwordChangeRequests';

/**
 * Direct requests to Supabase Auth for the /password page (spec «/password», points 4 and 6).
 * Nothing here touches the shared supabase-js client: no session is stored, adopted or announced.
 */
export type LinkDeps = Pick<PasswordChangeDeps, 'url' | 'publishableKey' | 'fetch'>;

/** What the verification gives back, kept in memory only. */
export interface VerifiedLink { email: string; accessToken: string }

export type VerifyLinkResult = { ok: true; link: VerifiedLink } | { ok: false; reason: 'invalid_link' | 'network' | 'unknown' };
export type SavePasswordResult = { ok: true } | { ok: false; reason: ChangePasswordFailure | 'invalid_link' };

/** `POST /auth/v1/verify`: a code that is wrong, expired or used is a 4xx other than 429. */
export async function verifyLink(deps: LinkDeps, tokenHash: string): Promise<VerifyLinkResult> {
  const result = await call(deps, '/verify', { method: 'POST', body: { type: 'recovery', token_hash: tokenHash } });
  if (!result.ok) {
    const { status } = result.error;
    if (status === 0) return { ok: false, reason: 'network' };
    return { ok: false, reason: status !== undefined && status >= 400 && status < 500 && status !== 429 ? 'invalid_link' : 'unknown' };
  }
  const body = result.body as { access_token?: unknown; user?: { email?: unknown } } | null;
  const email = body?.user?.email;
  if (typeof body?.access_token !== 'string' || typeof email !== 'string' || !email) return { ok: false, reason: 'unknown' };
  return { ok: true, link: { email, accessToken: body.access_token } };
}

/** `PUT /auth/v1/user` with the link's own token; Supabase ends the other sessions. */
export async function savePassword(deps: LinkDeps, link: VerifiedLink, password: string): Promise<SavePasswordResult> {
  const result = await call(deps, '/user', { method: 'PUT', token: link.accessToken, body: { password } });
  if (result.ok) return { ok: true };
  const reason = changePasswordFailure(result.error);
  return { ok: false, reason: reason === 'session_expired' ? 'invalid_link' : reason };
}

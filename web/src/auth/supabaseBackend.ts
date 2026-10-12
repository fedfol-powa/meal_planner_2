import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentAuthorization, AuthBackend, AuthorizationFailure, AuthorizationResult, AuthUser, SignInFailure } from './backend';

export const AUTH_STORAGE_KEY = 'cosasimangia-auth';
export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut' | 'refreshSession'>;

export type OAuthApi = Pick<SupabaseClient['auth']['oauth'], 'getAuthorizationDetails' | 'approveAuthorization' | 'denyAuthorization'>;

export function authorizationFailure(error: { status?: number; name?: string }): AuthorizationFailure {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (error.status === 400 || error.status === 404) return 'not_found';
  return 'unknown';
}

export function signInFailure(error: { code?: string; status?: number; name?: string }): SignInFailure {
  if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid_credentials';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  return 'unknown';
}

const toUser = (user: { id: string; email?: string } | null | undefined): AuthUser | null =>
  user ? { id: user.id, email: user.email ?? '' } : null;

/** Email and password only (spec: link and Google come in wave 3). The library keeps and renews the session. */
export function createSupabaseBackend(
  url: string,
  publishableKey: string,
  deps: { auth?: AuthClient; oauth?: OAuthApi; storage?: Pick<Storage, 'getItem' | 'removeItem'> } = {}
): AuthBackend {
  const storage = deps.storage ?? window.localStorage;
  const client = deps.auth
    ? null
    : createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }
      });
  const auth: AuthClient = deps.auth ?? client!.auth;
  const oauth: OAuthApi | null = deps.oauth ?? client?.auth.oauth ?? null;

  // Offline with an expired token the library keeps the stored session but reports no session.
  const storedUser = (): AuthUser | null => {
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      return raw ? toUser((JSON.parse(raw) as { user?: { id: string; email?: string } }).user) : null;
    } catch {
      return null;
    }
  };

  return {
    mode: 'supabase',
    async check() {
      const { data, error } = await auth.getSession();
      const user = toUser(data.session?.user);
      if (user) return { status: 'signedIn', user };
      const stored = error && isAuthRetryableFetchError(error) ? storedUser() : null;
      return stored ? { status: 'unverified', user: stored } : { status: 'signedOut' };
    },
    onChange(listener) {
      // No Supabase calls inside the callback: the library holds a lock while it runs.
      const { data } = auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') listener({ type: 'SIGNED_OUT', user: null });
        else if (session) listener({ type: event, user: { id: session.user.id, email: session.user.email ?? '' } });
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await auth.signInWithPassword({ email, password });
      return error ? { ok: false, reason: signInFailure(error) } : { ok: true };
    },
    async signOut() {
      const { error } = await auth.signOut({ scope: 'local' });
      // The library removes the stored session even when it returns an error; make sure of it.
      if (error) {
        for (const key of [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]) {
          try {
            storage.removeItem(key);
          } catch {
            // Storage unavailable: nothing was stored there either.
          }
        }
      }
    },
    async refresh() {
      const { data, error } = await auth.refreshSession();
      if (error) return isAuthRetryableFetchError(error) ? { kind: 'network' } : { kind: 'rejected' };
      return data.session ? { kind: 'ok', userId: data.session.user.id } : { kind: 'rejected' };
    },
    async getCredentials() {
      const { data } = await auth.getSession();
      return data.session ? { accessToken: data.session.access_token, userId: data.session.user.id } : null;
    },
    async getAuthorization(id): Promise<AuthorizationResult<AgentAuthorization>> {
      if (!oauth) return { ok: false, reason: 'unknown' };
      const { data, error } = await oauth.getAuthorizationDetails(id);
      if (error || !data) return { ok: false, reason: error ? authorizationFailure(error) : 'unknown' };
      return 'authorization_id' in data
        ? {
            ok: true,
            value: {
              kind: 'consent',
              id: data.authorization_id,
              clientName: data.client.name ?? '',
              clientId: data.client.id,
              redirectUri: data.redirect_uri,
              scopes: data.scope.split(' ').filter(Boolean)
            }
          }
        : { ok: true, value: { kind: 'redirect', url: data.redirect_url } };
    },
    async decideAuthorization(id, decision) {
      if (!oauth) return { ok: false, reason: 'unknown' };
      const options = { skipBrowserRedirect: true };
      const { data, error } = decision === 'approve' ? await oauth.approveAuthorization(id, options) : await oauth.denyAuthorization(id, options);
      if (error || !data) return { ok: false, reason: error ? authorizationFailure(error) : 'unknown' };
      return { ok: true, value: data.redirect_url };
    }
  };
}

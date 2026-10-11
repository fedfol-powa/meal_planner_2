import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthBackend, AuthUser, SignInFailure } from './backend';

export const AUTH_STORAGE_KEY = 'cosasimangia-auth';
export type AuthClient = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithPassword' | 'signOut' | 'refreshSession'>;

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
  deps: { auth?: AuthClient; storage?: Pick<Storage, 'getItem' | 'removeItem'> } = {}
): AuthBackend {
  const storage = deps.storage ?? window.localStorage;
  const auth: AuthClient =
    deps.auth ??
    createClient(url, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }
    }).auth;

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
      return !error && !!data.session;
    },
    async getAccessToken() {
      const { data } = await auth.getSession();
      return data.session?.access_token ?? null;
    }
  };
}

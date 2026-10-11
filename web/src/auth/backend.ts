export interface AuthUser { id: string; email: string }
export type SessionCheck = { status: 'signedIn'; user: AuthUser } | { status: 'unverified'; user: AuthUser } | { status: 'signedOut' };
export type SignInFailure = 'invalid_credentials' | 'network' | 'unknown';
export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };

/** What the app needs from authentication; Supabase in real mode, a fixed demo user in fake mode. */
export interface AuthBackend {
  readonly mode: 'fake' | 'supabase';
  /** unverified: offline with a session that cannot be renewed now (read-only use of the stored copy). */
  check(): Promise<SessionCheck>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** This device only; nothing stays stored even when the service cannot be reached. */
  signOut(): Promise<void>;
  /** One renewal of the session; false when it was refused or impossible. */
  refresh(): Promise<boolean>;
  /** For the future oRPC link (Authorization: Bearer), read at every request. */
  getAccessToken(): Promise<string | null>;
}

export const DEMO_USER: AuthUser = { id: 'user-federico', email: 'federico@example.com' };

/** Fake mode (no VITE_SUPABASE_*): always signed in as the demo user, no sign-in page. */
export function createFakeBackend(): AuthBackend {
  return {
    mode: 'fake',
    check: async () => ({ status: 'signedIn', user: DEMO_USER }),
    onChange: () => () => undefined,
    signIn: async () => ({ ok: true }),
    signOut: async () => undefined,
    refresh: async () => true,
    getAccessToken: async () => null
  };
}

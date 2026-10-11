export interface AuthUser { id: string; email: string }
export type SessionCheck = { status: 'signedIn'; user: AuthUser } | { status: 'unverified'; user: AuthUser } | { status: 'signedOut' };
export type SignInFailure = 'invalid_credentials' | 'network' | 'unknown';
export type SignInResult = { ok: true } | { ok: false; reason: SignInFailure };
/** Outcome of one renewal (W4's interface): `network` changes nothing, `rejected` ends the session. */
/** The token and the person it belongs to, read together from the same stored session. */
export interface Credentials { accessToken: string; userId: string }
export type RenewResult = { kind: 'ok'; userId: string } | { kind: 'rejected' } | { kind: 'network' };
/** Supabase's own event kinds: a renewal of the same session must not look like a new sign-in. */
export type AuthEventType =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY'
  | 'MFA_CHALLENGE_VERIFIED';
export type AuthEvent = { type: 'SIGNED_OUT'; user: null } | { type: Exclude<AuthEventType, 'SIGNED_OUT'>; user: AuthUser };

/** What the app needs from authentication; Supabase in real mode, a fixed demo user in fake mode. */
export interface AuthBackend {
  readonly mode: 'fake' | 'supabase';
  /** unverified: offline with a session that cannot be renewed now (read-only use of the stored copy). */
  check(): Promise<SessionCheck>;
  onChange(listener: (event: AuthEvent) => void): () => void;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** This device only; nothing stays stored even when the service cannot be reached. */
  signOut(): Promise<void>;
  /** One renewal of the session; `userId` is the user of the renewed token. */
  refresh(): Promise<RenewResult>;
  /** For the oRPC link (Authorization: Bearer), read at every request; null without a session. */
  getCredentials(): Promise<Credentials | null>;
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
    refresh: async () => ({ kind: 'ok', userId: DEMO_USER.id }),
    getCredentials: async () => null
  };
}

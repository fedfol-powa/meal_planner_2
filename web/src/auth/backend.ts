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
/** A consent request opened by an agent (OAuth server of Supabase Auth, spec section 13). */
export type AgentAuthorization =
  | {
      kind: 'consent';
      id: string;
      /** Name the client registered with; not verified. */
      clientName: string;
      /** OAuth client id and registered return page, to tell same-named clients apart. */
      clientId: string;
      redirectUri: string;
      /** Requested scopes (OIDC): data sent to the agent, not limits on what it can do. */
      scopes: string[];
    }
  /** Grant already active: Supabase skips the consent and sends the agent its code. */
  | { kind: 'redirect'; url: string };
export type AuthorizationFailure = 'not_found' | 'network' | 'unknown';
export type AuthorizationResult<T> = { ok: true; value: T } | { ok: false; reason: AuthorizationFailure };

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
  /** The agent's consent request; not_found when missing, expired or already decided. */
  getAuthorization(id: string): Promise<AuthorizationResult<AgentAuthorization>>;
  /** Allows or refuses the request; the value is the agent's URL to go to (code or error). */
  decideAuthorization(id: string, decision: 'approve' | 'deny'): Promise<AuthorizationResult<string>>;
}

export const DEMO_USER: AuthUser = { id: 'user-federico', email: 'federico@example.com' };

/** Fake mode: a demo request, so the consent screen can be seen without Supabase. */
export const DEMO_AUTHORIZATION: AgentAuthorization = {
  kind: 'consent',
  id: 'demo',
  clientName: 'Claude Code',
  clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
  redirectUri: 'http://localhost:33418/callback',
  scopes: ['openid', 'email', 'profile']
};

/** Fake mode (no VITE_SUPABASE_*): always signed in as the demo user, no sign-in page. */
export function createFakeBackend(): AuthBackend {
  return {
    mode: 'fake',
    check: async () => ({ status: 'signedIn', user: DEMO_USER }),
    onChange: () => () => undefined,
    signIn: async () => ({ ok: true }),
    signOut: async () => undefined,
    refresh: async () => ({ kind: 'ok', userId: DEMO_USER.id }),
    getCredentials: async () => null,
    getAuthorization: async () => ({ ok: true, value: DEMO_AUTHORIZATION }),
    // No agent waits in fake mode: back to the connected agents.
    decideAuthorization: async () => ({ ok: true, value: '/profile/agents' })
  };
}

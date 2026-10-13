import type { AgentAuthorization, AuthBackend, ChangePasswordResult, AuthEvent, AuthorizationResult, AuthEventType, AuthUser, Credentials, RenewResult, SessionCheck, SignInResult } from '../auth/backend';

export interface StubBackend extends AuthBackend {
  nextSignIn: SignInResult;
  signOutCalls: number;
  signOutError: Error | null;
  /** null: `ok` with the current user. */
  refreshResult: RenewResult | null;
  refreshCalls: number;
  /** A sign-in (user) or a sign-out (null), as Supabase reports them. */
  setUser(user: AuthUser | null): void;
  /** Any event without changing the session, e.g. a token refresh of the current user. */
  emit(type: Exclude<AuthEventType, 'SIGNED_OUT'>, user: AuthUser): void;
  emit(type: 'SIGNED_OUT', user: null): void;
  setCheck(next: SessionCheck): void;
  /** The next check() waits until the returned function answers it (identity not known yet). */
  holdCheck(): (check: SessionCheck) => void;
  /** The next getCredentials() waits until the returned function answers it. */
  holdCredentials(): (credentials: Credentials | null) => void;
  /** The next refresh() waits until the returned function answers it. */
  holdRefresh(): (result: RenewResult) => void;
  /** Answer of getAuthorization (a consent of «Claude Code» by default). */
  authorization: AuthorizationResult<AgentAuthorization>;
  /** Answer of decideAuthorization. */
  decision: AuthorizationResult<string>;
  decisions: { id: string; decision: 'approve' | 'deny' }[];
  /** The next getAuthorization() not yet held waits until the returned function answers it. */
  holdAuthorization(): (result: AuthorizationResult<AgentAuthorization>) => void;
  /** The next decideAuthorization() not yet held waits until the returned function answers it. */
  holdDecision(): (result: AuthorizationResult<string>) => void;
  /** Answer of changePassword ({ ok: true } by default). */
  nextChangePassword: ChangePasswordResult;
  changePasswordCalls: { current: string; next: string }[];
  /** The next changePassword() waits until the returned function answers it. */
  holdChangePassword(): (result: ChangePasswordResult) => void;
}

/** Controllable backend for tests: identity, check result, sign-in, sign-out and renewal outcomes. */
export function createStubBackend(initial: AuthUser | null, mode: 'fake' | 'supabase' = 'supabase'): StubBackend {
  let current: SessionCheck = initial ? { status: 'signedIn', user: initial } : { status: 'signedOut' };
  const listeners = new Set<(event: AuthEvent) => void>();
  const send = (event: AuthEvent) => listeners.forEach((listener) => listener(event));
  let heldCheck: Promise<SessionCheck> | null = null;
  let heldRefresh: Promise<RenewResult> | null = null;
  let heldCredentials: Promise<Credentials | null> | null = null;
  let heldChangePassword: Promise<ChangePasswordResult> | null = null;
  const heldAuthorizations: Promise<AuthorizationResult<AgentAuthorization>>[] = [];
  const heldDecisions: Promise<AuthorizationResult<string>>[] = [];
  const backend: StubBackend = {
    mode,
    nextSignIn: { ok: true },
    signOutCalls: 0,
    signOutError: null,
    refreshResult: null,
    refreshCalls: 0,
    authorization: {
      ok: true,
      value: { kind: 'consent', id: 'auth-1', clientName: 'Claude Code', clientId: 'client-1', redirectUri: 'http://127.0.0.1:9/callback', scopes: ['openid', 'email'] }
    },
    decision: { ok: true, value: 'http://127.0.0.1:9/callback?code=x' },
    decisions: [],
    nextChangePassword: { ok: true },
    changePasswordCalls: [],
    holdChangePassword() {
      let answer: (result: ChangePasswordResult) => void = () => {};
      heldChangePassword = new Promise<ChangePasswordResult>((resolve) => (answer = resolve));
      return answer;
    },
    changePassword(current, next) {
      backend.changePasswordCalls.push({ current, next });
      const pending = heldChangePassword;
      heldChangePassword = null;
      return pending ?? Promise.resolve(backend.nextChangePassword);
    },
    async getAuthorization() {
      return heldAuthorizations.shift() ?? backend.authorization;
    },
    async decideAuthorization(id, decision) {
      backend.decisions.push({ id, decision });
      return heldDecisions.shift() ?? backend.decision;
    },
    holdAuthorization() {
      let answer!: (result: AuthorizationResult<AgentAuthorization>) => void;
      heldAuthorizations.push(new Promise((resolve) => (answer = resolve)));
      return answer;
    },
    holdDecision() {
      let answer!: (result: AuthorizationResult<string>) => void;
      heldDecisions.push(new Promise((resolve) => (answer = resolve)));
      return answer;
    },
    setUser(user) {
      current = user ? { status: 'signedIn', user } : { status: 'signedOut' };
      send(user ? { type: 'SIGNED_IN', user } : { type: 'SIGNED_OUT', user: null });
    },
    emit(type: AuthEventType, user: AuthUser | null) {
      send({ type, user } as AuthEvent);
    },
    setCheck(next) {
      current = next;
    },
    holdCheck() {
      let answer: (check: SessionCheck) => void = () => {};
      heldCheck = new Promise<SessionCheck>((resolve) => (answer = resolve));
      return answer;
    },
    holdCredentials() {
      let answer: (credentials: Credentials | null) => void = () => {};
      heldCredentials = new Promise<Credentials | null>((resolve) => (answer = resolve));
      return answer;
    },
    holdRefresh() {
      let answer: (result: RenewResult) => void = () => {};
      heldRefresh = new Promise<RenewResult>((resolve) => (answer = resolve));
      return answer;
    },
    check() {
      const pending = heldCheck;
      heldCheck = null;
      return pending ?? Promise.resolve(current);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async signIn(email) {
      if (backend.nextSignIn.ok) backend.setUser({ id: `user-${email}`, email });
      return backend.nextSignIn;
    },
    async signOut() {
      backend.signOutCalls += 1;
      if (backend.signOutError) throw backend.signOutError;
      backend.setUser(null);
    },
    refresh() {
      backend.refreshCalls += 1;
      const pending = heldRefresh;
      heldRefresh = null;
      const fallback: RenewResult = current.status === 'signedOut' ? { kind: 'rejected' } : { kind: 'ok', userId: current.user.id };
      return pending ?? Promise.resolve(backend.refreshResult ?? fallback);
    },
    getCredentials() {
      const pending = heldCredentials;
      heldCredentials = null;
      const now: Credentials | null = current.status === 'signedOut' ? null : { accessToken: `token-of-${current.user.id}`, userId: current.user.id };
      return pending ?? Promise.resolve(now);
    }
  };
  return backend;
}

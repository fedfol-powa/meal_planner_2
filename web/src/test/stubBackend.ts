import type { AuthBackend, AuthUser, SessionCheck, SignInResult } from '../auth/backend';

export interface StubBackend extends AuthBackend {
  nextSignIn: SignInResult;
  signOutCalls: number;
  signOutError: Error | null;
  refreshResult: boolean;
  refreshCalls: number;
  setUser(user: AuthUser | null): void;
  setCheck(next: SessionCheck): void;
  /** The next check() waits until the returned function answers it (identity not known yet). */
  holdCheck(): (check: SessionCheck) => void;
  /** The next refresh() waits until the returned function answers it. */
  holdRefresh(): (ok: boolean) => void;
}

/** Controllable backend for tests: identity, check result, sign-in, sign-out and renewal outcomes. */
export function createStubBackend(initial: AuthUser | null, mode: 'fake' | 'supabase' = 'supabase'): StubBackend {
  let current: SessionCheck = initial ? { status: 'signedIn', user: initial } : { status: 'signedOut' };
  const listeners = new Set<(user: AuthUser | null) => void>();
  let heldCheck: Promise<SessionCheck> | null = null;
  let heldRefresh: Promise<boolean> | null = null;
  const backend: StubBackend = {
    mode,
    nextSignIn: { ok: true },
    signOutCalls: 0,
    signOutError: null,
    refreshResult: true,
    refreshCalls: 0,
    setUser(user) {
      current = user ? { status: 'signedIn', user } : { status: 'signedOut' };
      listeners.forEach((listener) => listener(user));
    },
    setCheck(next) {
      current = next;
    },
    holdCheck() {
      let answer: (check: SessionCheck) => void = () => {};
      heldCheck = new Promise<SessionCheck>((resolve) => (answer = resolve));
      return answer;
    },
    holdRefresh() {
      let answer: (ok: boolean) => void = () => {};
      heldRefresh = new Promise<boolean>((resolve) => (answer = resolve));
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
      return pending ?? Promise.resolve(backend.refreshResult);
    },
    getAccessToken: async () => (current.status === 'signedOut' ? null : 'token')
  };
  return backend;
}

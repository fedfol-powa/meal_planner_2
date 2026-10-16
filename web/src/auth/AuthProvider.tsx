import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { subscribeConnectivity } from '../lib/connectivity';
import { trackBusy } from '../pwa/busy';
import type { AuthBackend, AuthEvent, AuthUser, SessionCheck } from './backend';

/** loading: identity not known yet, nothing may be closed or deleted (second review, C1). */
export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser; verified: boolean };

/**
 * Told by the sign-in page after a session ended for this reason (spec W11): `accountDeleted` after
 * one's own deletion, `accountGone` when the account has no profile any more after a renewal.
 */
export type ExitNotice = 'accountDeleted' | 'accountGone';

interface AuthContextValue {
  state: AuthState;
  /** Why the last session ended, until the next sign-in; null after a plain sign-out. */
  notice: ExitNotice | null;
  backend: AuthBackend;
  /**
   * Ends the session of `userId` only if it is still the current identity: signed out at once,
   * `cleanup` (local data), then Supabase, unless another identity arrived meanwhile.
   */
  signOut: (userId: string, cleanup: () => Promise<void>, notice?: ExitNotice) => Promise<void>;
  /** Local only: another tab announced the sign-out of `userId`. */
  markSignedOut: (userId: string) => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

const fromCheck = (check: SessionCheck): AuthState =>
  check.status === 'signedOut' ? { status: 'signedOut' } : { status: 'signedIn', user: check.user, verified: check.status === 'signedIn' };

const sameState = (a: AuthState, b: AuthState) =>
  a.status === b.status && (a.status !== 'signedIn' || (b.status === 'signedIn' && a.user.id === b.user.id && a.verified === b.verified));

const currentUser = (state: AuthState) => (state.status === 'signedIn' ? state.user.id : null);

export function AuthProvider({ backend, children }: { backend: AuthBackend; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [notice, setNotice] = useState<ExitNotice | null>(null);
  const stateRef = useRef(state);
  // Identity events are numbered: a check that started before a newer event is dropped (second review, C2).
  const events = useRef(0);
  // The user whose «Esci» is in progress: their generation is closing, nothing of it may reopen it (PR review, C10).
  const closing = useRef<string | null>(null);

  const commit = useCallback((next: AuthState) => {
    events.current += 1;
    // Token refreshes repeat the same user: keep the state object so nothing re-renders.
    if (sameState(stateRef.current, next)) return;
    stateRef.current = next;
    setState(next);
    if (next.status === 'signedIn') setNotice(null);
  }, []);

  const runCheck = useCallback(
    (isActive: () => boolean = () => true) => {
      const started = events.current;
      void backend.check().then((check) => {
        if (isActive() && events.current === started) commit(fromCheck(check));
      });
    },
    [backend, commit]
  );

  useEffect(() => {
    let active = true;
    runCheck(() => active);
    const unsubscribe = backend.onChange((event: AuthEvent) => {
      // Renewals and repeats of the closing session are not sign-ins; another user is.
      if (event.user && event.user.id === closing.current) return;
      commit(event.user ? { status: 'signedIn', user: event.user, verified: true } : { status: 'signedOut' });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [backend, commit, runCheck]);

  // An unverified session is checked again when the network comes back; a refusal ends it.
  const unverified = state.status === 'signedIn' && !state.verified;
  useEffect(() => {
    if (!unverified) return;
    // The network may have come back before this listener existed (e.g. during the first check).
    if (navigator.onLine) runCheck();
    return subscribeConnectivity(() => {
      if (navigator.onLine) runCheck();
    });
  }, [unverified, runCheck]);

  const signOut = useCallback(
    (userId: string, cleanup: () => Promise<void>, reason?: ExitNotice) =>
      // From signedOut to the end of the cleanup and of backend.signOut(): busy (spec W8).
      trackBusy(
        (async () => {
          if (currentUser(stateRef.current) !== userId) return;
          closing.current = userId;
          setNotice(reason ?? null);
          commit({ status: 'signedOut' });
          try {
            await cleanup().catch(() => undefined);
            // Someone else signed in meanwhile (another tab): their session is not ours to end.
            if (stateRef.current.status !== 'signedOut') return;
            await backend.signOut();
          } catch {
            // Local data are already gone; the session is over on this device anyway.
          } finally {
            if (closing.current === userId) closing.current = null;
          }
        })()
      ),
    [backend, commit]
  );

  const markSignedOut = useCallback(
    (userId: string) => {
      if (currentUser(stateRef.current) === userId) commit({ status: 'signedOut' });
    },
    [commit]
  );

  const value = useMemo(() => ({ state, notice, backend, signOut, markSignedOut }), [state, notice, backend, signOut, markSignedOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}

import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { toApiError } from '../api/errors';
import { persistOptions, purgeOtherCopies, type KeyValueStore } from '../api/persister';
import { meQuery, useQueryDeps } from '../api/queries';
import type { Api } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import type { AuthUser } from '../auth/backend';
import { env } from '../env';
import { useLocale } from '../i18n/LocaleProvider';
import { initialLocale, type Locale } from '../i18n/translate';
import type { SessionChannel } from './channel';
import { readPreference, userScope, writePreference } from './localePreference';
import { createSession, persisterOf, wrapApi, type Session } from './session';

/**
 * Called once per session, then once per language: the clients share what the session knows
 * (PR review, C13), and a read keeps the language it started with, also when retried (C12).
 */
export type CreateApi = (user: AuthUser | null) => (locale: Locale) => Api;

interface SessionContextValue {
  session: Session;
  signOut: () => Promise<void>;
  chooseLocale: (locale: Locale) => void;
}
const SessionContext = createContext<SessionContextValue | null>(null);

interface Props {
  store: KeyValueStore;
  createApi: CreateApi;
  /** Revocations and sign-outs shared with the other tabs (second review, C4). */
  channel: SessionChannel;
  children: ReactNode;
}

export function SessionScope({ store, createApi, channel, children }: Props) {
  const { state, backend, signOut: endIdentity, markSignedOut } = useAuth();
  // undefined: identity not known yet, so no session and nothing deleted (second review, C1).
  const identity = state.status === 'loading' ? undefined : state.status === 'signedIn' ? state.user.id : null;
  const user = state.status === 'signedIn' ? state.user : null;
  const { locale, setLocale } = useLocale();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // One way out for «Esci», a refused renewal and a refusal after renewal: tell the other tabs,
  // close the session, then Supabase. Stale sessions are ignored by the auth state.
  const endRef = useRef<(session: Session) => Promise<void>>(async () => undefined);
  endRef.current = async (session) => {
    const userId = session.userId;
    if (!userId || session.isClosed()) return;
    await endIdentity(userId, async () => {
      channel.post({ type: 'signedOut', userId });
      await session.close();
    });
  };

  // The session is the generation of the identity shown (second review, C3).
  const session = useMemo(
    () =>
      identity === undefined
        ? null
        : createSession(identity, store, { refresh: () => backend.refresh(), end: (s) => endRef.current(s), channel }),
    [identity, store, backend, channel]
  );
  // The data client depends on the user and the language; answers in a language no longer shown are dropped (PR review, C12).
  const clients = useMemo(() => {
    const forLocale = session ? createApi(user) : null;
    const byLocale = new Map<Locale, Api>();
    return (current: Locale) => {
      if (!session || !forLocale) return null;
      let client = byLocale.get(current);
      if (!client) {
        client = wrapApi(forLocale(current), session, { locale: current, isCurrent: () => localeRef.current === current });
        byLocale.set(current, client);
      }
      return client;
    };
  }, [session, createApi]);
  const api = clients(locale);

  // One closing procedure for sign-out, sign-out elsewhere and change of user. Never in an
  // effect cleanup: StrictMode re-runs effects and would close a live session.
  const shown = useRef<Session | null>(null);
  useEffect(() => {
    if (!session) return;
    const previous = shown.current;
    shown.current = session;
    if (previous && previous !== session) void previous.close();
    // Identity known: other people's copies go; all of them after a confirmed sign-out.
    void purgeOtherCopies(store, session.userId);
  }, [session, store]);

  // Forbidden: the family leaves memory and disk, and the profile is read again.
  useEffect(() => {
    session?.setErrorHandler((error, scope) => {
      if (toApiError(error).code === 'forbidden' && scope.familyId) {
        session.revoke(scope.familyId);
        void session.queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    });
  }, [session]);

  // What the other tabs of the same person announce.
  useEffect(() => {
    if (!session?.userId) return;
    return channel.subscribe((message) => {
      if (message.userId !== session.userId || session.isClosed()) return;
      if (message.type === 'revoked') session.revoke(message.familyId, { announce: false });
      else markSignedOut(message.userId);
    });
  }, [session, channel, markSignedOut]);

  // Which language applies (spec, Lingua): device in fake mode, browser without a session,
  // otherwise the person's temporary choice or, once read, the profile language.
  useEffect(() => {
    if (identity === undefined) return;
    if (backend.mode === 'fake') {
      const device = readPreference('device');
      if (device) setLocale(device);
    } else if (!identity) {
      setLocale(initialLocale(navigator.languages));
    } else {
      const chosen = readPreference(userScope(identity));
      if (chosen) setLocale(chosen);
    }
  }, [identity, backend.mode, setLocale]);

  const chooseLocale = useCallback(
    (next: Locale) => {
      setLocale(next);
      if (backend.mode === 'fake') writePreference('device', next);
      else if (identity) writePreference(userScope(identity), next);
    },
    [backend.mode, identity, setLocale]
  );

  const signOut = useCallback(() => (session ? endRef.current(session) : Promise.resolve()), [session]);
  const value = useMemo(() => (session ? { session, signOut, chooseLocale } : null), [session, signOut, chooseLocale]);
  if (!session || !api || !value) return null;

  const content = (
    <ApiProvider api={api}>
      <SessionContext.Provider value={value}>
        {backend.mode === 'supabase' && identity && <ProfileLocale userId={identity} />}
        {children}
      </SessionContext.Provider>
    </ApiProvider>
  );
  const persister = persisterOf(session);
  if (!persister) return <QueryClientProvider client={session.queryClient}>{content}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider key={identity ?? ''} client={session.queryClient} persistOptions={persistOptions(persister, env.buildVersion)}>
      {content}
    </PersistQueryClientProvider>
  );
}

/** At each identity the profile language applies, unless this person chose another one meanwhile. */
function ProfileLocale({ userId }: { userId: string }) {
  const me = useQuery(meQuery(useQueryDeps()));
  const { setLocale } = useLocale();
  const profileLocale = me.data?.user.id === userId ? me.data.user.locale : undefined;
  useEffect(() => {
    if (profileLocale && !readPreference(userScope(userId))) setLocale(profileLocale);
  }, [profileLocale, userId, setLocale]);
  return null;
}

function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('session hooks outside SessionScope');
  return value;
}

export const useSession = () => useSessionContext().session;
export const useSignOut = () => useSessionContext().signOut;
export const useChooseLocale = () => useSessionContext().chooseLocale;

/** Re-renders when the session changes state (revoked family, closing). */
export function useSessionRevision(): number {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.revision, session.revision);
}

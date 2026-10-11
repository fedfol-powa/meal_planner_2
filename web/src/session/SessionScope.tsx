import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { toApiError } from '../api/errors';
import { runAreaMutation } from '../api/mutations';
import { persistOptions, purgeOtherCopies, type KeyValueStore } from '../api/persister';
import { profileQuery } from '../api/profile';
import { useQueryDeps } from '../api/queries';
import type { Api, ProfileView } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import type { AuthUser } from '../auth/backend';
import { env } from '../env';
import { useLocale } from '../i18n/LocaleProvider';
import { isOnline } from '../lib/connectivity';
import { initialLocale, type Locale } from '../i18n/translate';
import type { SessionChannel } from './channel';
import { clearPreference, readPreference, userScope, writePreference } from './localePreference';
import { createSession, persisterOf, wrapApi, type Session } from './session';

/**
 * Called once per session, then once per language: the clients share what the session knows
 * (PR review, C13), and a read keeps the language it started with, also when retried (C12).
 */
export type CreateApi = (user: AuthUser | null) => (locale: Locale) => Api;

interface SessionContextValue {
  session: Session;
  signOut: () => Promise<void>;
  /** Saved in the profile when online; rejects with the error of the server when it refuses. */
  chooseLocale: (locale: Locale) => Promise<void>;
  /** The language shown now, also after this render: mutations check it when their answer arrives. */
  currentLocale: () => Locale;
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

  // A sign-in of someone else or a sign-out ends this generation at once, before React replaces
  // the session in the effect above: no call of this session may leave with the new
  // credentials (PR #17 review). Same-user events (renewals) change nothing.
  useEffect(() => {
    if (!session) return;
    return backend.onChange((event) => {
      if ((event.user?.id ?? null) !== session.userId) void session.close();
    });
  }, [session, backend]);

  // Forbidden: the family leaves memory and disk, and the profile is read again.
  useEffect(() => {
    session?.setErrorHandler((error, scope) => {
      if (toApiError(error).code === 'forbidden' && scope.familyId) {
        session.revoke(scope.familyId);
        void session.queryClient.invalidateQueries({ queryKey: ['profile', 'get'] });
      }
    });
  }, [session]);

  // What the other tabs of the same person announce.
  useEffect(() => {
    if (!session?.userId) return;
    return channel.subscribe((message) => {
      if (message.userId !== session.userId || session.isClosed()) return;
      // Only these two are the session's; extension messages belong to their listeners.
      if (message.type === 'revoked') session.revoke(message.familyId, { announce: false });
      else if (message.type === 'signedOut') {
        // Closed at once, like the Supabase events above: an answer arriving before the re-render is stale (PR #31 review, finding 1).
        void session.close();
        markSignedOut(message.userId);
      }
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

  const currentLocale = useCallback(() => localeRef.current, []);
  // Spec, Lingua: saved in the profile and applied at the answer; offline (or without network)
  // the choice stays temporary on this device, as before.
  const choices = useRef(0);
  const chooseLocale = useCallback(
    async (next: Locale) => {
      const choice = ++choices.current;
      const temporary = () => {
        setLocale(next);
        if (backend.mode === 'fake') writePreference('device', next);
        else if (identity) writePreference(userScope(identity), next);
      };
      const client = clients(localeRef.current);
      if (!identity || !session || !client || !isOnline()) return temporary();
      try {
        const { view: saved, applied } = await runAreaMutation({ queryClient: session.queryClient, session, currentLocale }, 'profile.updateLocale', undefined, () =>
          client.profile.update({ locale: next })
        );
        // A superseded answer changes neither the language nor the copies of the profile (PR #21 review, finding 3).
        if (!applied) return;
        // The language is the same in every copy of the profile: none of them may bring the old one back.
        session.queryClient.setQueriesData<ProfileView>({ queryKey: ['profile', 'get'] }, (old) =>
          old && old.user.id === saved.user.id ? { ...old, user: { ...old.user, locale: saved.user.locale } } : old
        );
        if (identity) clearPreference(userScope(identity));
        if (backend.mode === 'fake') writePreference('device', saved.user.locale);
        setLocale(saved.user.locale);
      } catch (error) {
        // Only the latest choice falls back to a temporary one.
        if (toApiError(error).code === 'network') return choice === choices.current ? temporary() : undefined;
        throw error;
      }
    },
    [backend.mode, identity, session, clients, currentLocale, setLocale]
  );

  const signOut = useCallback(() => (session ? endRef.current(session) : Promise.resolve()), [session]);
  const value = useMemo(
    () => (session ? { session, signOut, chooseLocale, currentLocale } : null),
    [session, signOut, chooseLocale, currentLocale]
  );
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
  const profile = useQuery(profileQuery(useQueryDeps()));
  const { setLocale } = useLocale();
  const profileLocale = profile.data?.user.id === userId ? profile.data.user.locale : undefined;
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
export const useCurrentLocale = () => useSessionContext().currentLocale;

/** Re-renders when the session changes state (revoked family, closing). */
export function useSessionRevision(): number {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.revision, session.revision);
}

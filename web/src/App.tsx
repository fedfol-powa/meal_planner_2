import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { KeyValueStore } from './api/persister';
import type { AuthBackend } from './auth/backend';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LocaleProvider } from './i18n/LocaleProvider';
import { initialLocale, type Locale } from './i18n/translate';
import type { SessionChannel } from './session/channel';
import { createAppRouter } from './router';
import { SessionScope, type CreateApi } from './session/SessionScope';

export interface AppRootProps {
  backend: AuthBackend;
  store: KeyValueStore;
  createApi: CreateApi;
  channel: SessionChannel;
  history?: RouterHistory;
  initialLocale?: Locale;
  /** Rendered inside the session next to the router; tests use it to act on the session. */
  children?: ReactNode;
}

export function AppRoot({ backend, store, createApi, channel, history, initialLocale: locale, children }: AppRootProps) {
  // Above the session, which remounts its children at each change of person.
  const hadSession = useRef(false);
  return (
    <LocaleProvider initial={locale ?? initialLocale(navigator.languages)}>
      <AuthProvider backend={backend}>
        <SessionScope store={store} createApi={createApi} channel={channel}>
          <AppRouter history={history} hadSession={hadSession} />
          {children}
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
}

function AppRouter({ history, hadSession }: { history?: RouterHistory; hadSession: RefObject<boolean> }) {
  const { state } = useAuth();
  const router = useMemo(() => createAppRouter(history), [history]);
  // After Esci (or a session closed elsewhere) the last page belongs to the previous person (W6 real-stack test).
  if (state.status === 'signedIn') hadSession.current = true;
  // Signing in or out re-runs the guards, which redirect on their own.
  useEffect(() => {
    void router.invalidate();
  }, [state, router]);
  if (state.status === 'loading') return null;
  return <RouterProvider router={router} context={{ auth: state, sessionEnded: state.status === 'signedOut' && hadSession.current }} />;
}

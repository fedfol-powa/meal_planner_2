import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
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
  const exit = useRef<ExitMemory>({ signedIn: false, pending: false });
  return (
    <LocaleProvider initial={locale ?? initialLocale(navigator.languages)}>
      <AuthProvider backend={backend}>
        <SessionScope store={store} createApi={createApi} channel={channel}>
          <AppRouter history={history} exit={exit.current} />
          {children}
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
}

/** `pending`: a session just closed and the redirect it causes has not reached the sign-in page yet. */
interface ExitMemory { signedIn: boolean; pending: boolean }

function AppRouter({ history, exit }: { history?: RouterHistory; exit: ExitMemory }) {
  const { state } = useAuth();
  const router = useMemo(() => createAppRouter(history), [history]);
  // Esci (or a session closed elsewhere): the redirect it causes leaves out the last page, which belongs
  // to the previous person; later destinations asked for while signed out are kept (W6 real-stack test, PR #25 review).
  if (state.status === 'signedIn') exit.signedIn = true;
  else if (state.status === 'signedOut' && exit.signedIn) Object.assign(exit, { signedIn: false, pending: true });
  useEffect(
    () =>
      router.subscribe('onResolved', ({ toLocation }) => {
        if (toLocation.pathname === '/login') exit.pending = false;
      }),
    [router, exit]
  );
  // Signing in or out re-runs the guards, which redirect on their own.
  useEffect(() => {
    void router.invalidate();
  }, [state, router]);
  if (state.status === 'loading') return null;
  return <RouterProvider router={router} context={{ auth: state, exit }} />;
}

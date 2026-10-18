import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { KeyValueStore } from './api/persister';
import type { AuthBackend } from './auth/backend';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { GenericPageSkeleton } from './components/PageSkeletons';
import { LocaleProvider } from './i18n/LocaleProvider';
import { initialLocale, type Locale } from './i18n/translate';
import type { SessionChannel } from './session/channel';
import { createAppRouter } from './router';
import { MenuSkeleton } from './routes/menu/MenuSkeleton';
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
        <SessionScope store={store} createApi={createApi} channel={channel} waiting={<StartupSkeleton history={history} />}>
          <AppRouter history={history} exit={exit.current} />
          {children}
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
}

/** Before the router runs: the menu's shape on the menu (the usual start), a generic page elsewhere (W20). */
function StartupSkeleton({ history }: { history?: RouterHistory }) {
  const path = history?.location.pathname ?? window.location.pathname;
  return path === '/' || path === '/menu' ? <MenuSkeleton /> : <GenericPageSkeleton />;
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
  // While the access is checked, the page's shape instead of a blank screen (W20).
  if (state.status === 'loading') return <StartupSkeleton history={history} />;
  return <RouterProvider router={router} context={{ auth: state, exit }} />;
}

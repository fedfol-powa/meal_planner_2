import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
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
}

export function AppRoot({ backend, store, createApi, channel, history, initialLocale: locale }: AppRootProps) {
  return (
    <LocaleProvider initial={locale ?? initialLocale(navigator.languages)}>
      <AuthProvider backend={backend}>
        <SessionScope store={store} createApi={createApi} channel={channel}>
          <AppRouter history={history} />
        </SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
}

function AppRouter({ history }: { history?: RouterHistory }) {
  const { state } = useAuth();
  const router = useMemo(() => createAppRouter(history), [history]);
  // Signing in or out re-runs the guards, which redirect on their own.
  useEffect(() => {
    void router.invalidate();
  }, [state, router]);
  if (state.status === 'loading') return null;
  return <RouterProvider router={router} context={{ auth: state }} />;
}

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api } from '../api/types';
import { DEMO_USER, type AuthBackend } from '../auth/backend';
import type { Locale } from '../i18n/translate';
import type { Session } from '../session/session';
import { useSession } from '../session/SessionScope';
import { renderSession } from './sessionHarness';
import { createStubBackend } from './stubBackend';

/** One component inside the real session stack and a minimal router (for links). */
export function renderWithProviders(ui: ReactNode, options: { api?: Api; locale?: Locale; backend?: AuthBackend } = {}) {
  const locale = options.locale ?? 'it-IT';
  const api = options.api ?? createFakeApi({ getLocale: () => locale, latencyMs: 0 });
  let client: QueryClient | null = null;
  let current: Session | null = null;
  function Capture() {
    client = useQueryClient();
    current = useSession();
    return null;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <><Capture />{ui}</> }),
    history: createMemoryHistory({ initialEntries: ['/'] })
  });
  const result = renderSession(<RouterProvider router={router} />, {
    backend: options.backend ?? createStubBackend(DEMO_USER, 'fake'),
    api: () => api,
    locale
  });
  return {
    ...result,
    queryClient: () => client ?? (() => { throw new Error('not rendered yet'); })(),
    session: () => current ?? (() => { throw new Error('not rendered yet'); })()
  };
}

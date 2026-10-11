import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppRoot } from '../App';
import { createFakeApi } from '../api/fake/fakeApi';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import type { Api } from '../api/types';
import { DEMO_USER, type AuthBackend } from '../auth/backend';
import type { Locale } from '../i18n/translate';
import type { CreateApi } from '../session/SessionScope';
import { createMemoryHub } from './memoryChannel';
import { createStubBackend } from './stubBackend';

export function renderApp(path: string, options: { backend?: AuthBackend; api?: Api; createApi?: CreateApi; locale?: Locale; store?: KeyValueStore; extra?: ReactNode } = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const backend = options.backend ?? createStubBackend(DEMO_USER);
  const createApi: CreateApi = options.createApi ?? (options.api
    ? () => options.api!
    : (user, getLocale) => createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 0 }));
  const result = render(
    <AppRoot backend={backend} store={options.store ?? createMemoryStore()} createApi={createApi} channel={createMemoryHub().channel()} history={history} initialLocale={options.locale ?? 'it-IT'}>
      {options.extra}
    </AppRoot>
  );
  return { ...result, history };
}

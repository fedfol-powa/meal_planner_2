import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { AppRoot } from '../App';
import { fakeClients } from '../api/fake/fakeApi';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import type { Api } from '../api/types';
import { DEMO_USER, type AuthBackend } from '../auth/backend';
import type { Locale } from '../i18n/translate';
import type { SessionChannel } from '../session/channel';
import type { CreateApi } from '../session/SessionScope';
import { createMemoryHub } from './memoryChannel';
import { createStubBackend } from './stubBackend';

export function renderApp(path: string, options: { backend?: AuthBackend; api?: Api; createApi?: CreateApi; locale?: Locale; store?: KeyValueStore; channel?: SessionChannel; extra?: ReactNode; strict?: boolean } = {}) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const backend = options.backend ?? createStubBackend(DEMO_USER);
  const createApi: CreateApi = options.createApi ?? (options.api
    ? () => () => options.api!
    : fakeClients({ latencyMs: 0 }));
  const tree = (
    <AppRoot backend={backend} store={options.store ?? createMemoryStore()} createApi={createApi} channel={options.channel ?? createMemoryHub().channel()} history={history} initialLocale={options.locale ?? 'it-IT'}>
      {options.extra}
    </AppRoot>
  );
  const result = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { ...result, history };
}

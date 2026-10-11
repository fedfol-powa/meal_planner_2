import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { fakeClients } from '../api/fake/fakeApi';
import { createMemoryStore } from '../api/persister';
import type { Api } from '../api/types';
import type { AuthBackend } from '../auth/backend';
import { AuthProvider } from '../auth/AuthProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import type { SessionChannel } from '../session/channel';
import { SessionScope, type CreateApi } from '../session/SessionScope';
import { createMemoryHub } from './memoryChannel';

type MemoryStore = ReturnType<typeof createMemoryStore>;

export function renderSession(
  ui: ReactNode,
  options: { backend: AuthBackend; store?: MemoryStore; api?: (user: string | null) => Api; createApi?: CreateApi; locale?: Locale; channel?: SessionChannel }
) {
  const store = options.store ?? createMemoryStore();
  const createApi: CreateApi =
    options.createApi ??
    (options.api
      ? (user) => () => options.api!(user?.id ?? null)
      : fakeClients({ latencyMs: 0 }));
  const result = render(
    <LocaleProvider initial={options.locale ?? 'it-IT'}>
      <AuthProvider backend={options.backend}>
        <SessionScope store={store} createApi={createApi} channel={options.channel ?? createMemoryHub().channel()}>{ui}</SessionScope>
      </AuthProvider>
    </LocaleProvider>
  );
  return { ...result, store };
}

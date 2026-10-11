import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './design/fonts.css';
import './design/global.css';
import { AppRoot } from './App';
import { createFakeApi } from './api/fake/fakeApi';
import { createIndexedDbStore } from './api/persister';
import { createFakeBackend } from './auth/backend';
import { createSupabaseBackend } from './auth/supabaseBackend';
import { env } from './env';
import { createBroadcastChannel } from './session/channel';
import type { CreateApi } from './session/SessionScope';

const backend = env.supabase ? createSupabaseBackend(env.supabase.url, env.supabase.publishableKey) : createFakeBackend();
// Until W1's server exists, data come from the fake client in both modes (spec "Accesso e modalità").
const createApi: CreateApi = (user, getLocale) => createFakeApi({ getLocale, user: user ?? undefined, latencyMs: 150 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot backend={backend} store={createIndexedDbStore()} createApi={createApi} channel={createBroadcastChannel()} />
  </StrictMode>
);

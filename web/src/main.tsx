import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './design/fonts.css';
import './design/global.css';
import { AppRoot } from './App';
import { realClients } from './api/clients';
import { fakeClients } from './api/fake/fakeApi';
import { createRpcClient } from './api/rpc';
import { createIndexedDbStore } from './api/persister';
import { createFakeBackend } from './auth/backend';
import { createSupabaseBackend } from './auth/supabaseBackend';
import { env } from './env';
import { createBroadcastChannel } from './session/channel';
import { registerServiceWorker } from './pwa/register';
import type { CreateApi } from './session/SessionScope';

const backend = env.supabase ? createSupabaseBackend(env.supabase.url, env.supabase.publishableKey) : createFakeBackend();
// Real mode: the areas served by the Worker through oRPC, the others still fake (spec, «Seconda PR»).
const createApi: CreateApi = env.supabase
  ? realClients({ rpc: createRpcClient({ getAccessToken: () => backend.getAccessToken() }), latencyMs: 150 })
  : fakeClients({ latencyMs: 150 });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot backend={backend} store={createIndexedDbStore()} createApi={createApi} channel={createBroadcastChannel()} />
  </StrictMode>
);

registerServiceWorker();

import { describe, expect, it } from 'vitest';
import { createSupabaseBackend } from '../auth/supabaseBackend';
import { createSession, SessionClosedError, wrapApi } from '../session/session';
import { realClients } from './clients';
import { createMemoryStore } from './persister';
import { createRpcClient } from './rpc';

/**
 * Against a real local stack (second PR): Supabase Auth and the Worker of `server/` with
 * `wrangler dev`. Skipped without the variables, like the server tests without TEST_DATABASE_URL:
 * LIVE_SUPABASE_URL, LIVE_SUPABASE_PUBLISHABLE_KEY, LIVE_API_ORIGIN, LIVE_EMAIL, LIVE_PASSWORD.
 */
const live = {
  supabaseUrl: process.env.LIVE_SUPABASE_URL,
  publishableKey: process.env.LIVE_SUPABASE_PUBLISHABLE_KEY,
  apiOrigin: process.env.LIVE_API_ORIGIN,
  email: process.env.LIVE_EMAIL,
  password: process.env.LIVE_PASSWORD
};
const configured = Object.values(live).every(Boolean);

describe.skipIf(!configured)('real stack: sign-in, read, renewal, sign-out', () => {
  it('reads from the Worker with the token of the session and follows it through renewal and sign-out', async () => {
    const backend = createSupabaseBackend(live.supabaseUrl!, live.publishableKey!);
    // The page origin is jsdom's: requests go to the Worker as the Vite proxy would send them.
    const toWorker = async (request: Request) => {
      const { pathname, search } = new URL(request.url);
      const body = request.method === 'GET' ? undefined : await request.arrayBuffer();
      return fetch(new URL(pathname + search, live.apiOrigin), { method: request.method, headers: request.headers, body, signal: request.signal });
    };
    const rpc = createRpcClient({ getAccessToken: () => backend.getAccessToken(), fetch: toWorker });

    expect(await backend.signIn(live.email!, live.password!)).toEqual({ ok: true });
    const check = await backend.check();
    expect(check.status).toBe('signedIn');
    const userId = check.status === 'signedIn' ? check.user.id : '';

    const ended: string[] = [];
    const session = createSession(userId, createMemoryStore(), {
      refresh: () => backend.refresh(),
      end: async (s) => {
        ended.push('end');
        await s.close();
        await backend.signOut();
      }
    });
    const api = wrapApi(realClients({ rpc, latencyMs: 0 })(check.status === 'signedIn' ? check.user : null)('it-IT'), session);

    // A read: the server area from the Worker, the provisional ones still fake.
    const first = await api.session.whoami({});
    expect(first).toMatchObject({ userId, channel: 'web' });
    expect((await api.menu.getOpening({ familyId: 'family-main' })).unchanged).toBe(false);

    // Renewal: a new token from Supabase, accepted by the Worker.
    const before = await backend.getAccessToken();
    expect(await session.renew()).toEqual({ kind: 'ok', userId });
    const after = await backend.getAccessToken();
    expect(after).not.toBe(before);
    expect(await api.session.whoami({})).toMatchObject({ userId });

    // Sign-out of this device: the old token is refused by the Worker, and the closed session runs nothing.
    await backend.signOut();
    expect(await backend.getAccessToken()).toBeNull();
    const stale = createRpcClient({ getAccessToken: async () => after, fetch: toWorker });
    await expect(stale.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized' });
    // Unauthorized on the open session: the renewal is rejected and the single closing runs.
    await expect(api.session.whoami({})).rejects.toBeInstanceOf(SessionClosedError);
    expect(ended).toEqual(['end']);
    expect(session.isClosed()).toBe(true);
  });
});

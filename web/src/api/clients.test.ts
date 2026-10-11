import { ORPCError } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from './persister';
import { createRpcClient } from './rpc';
import { realClients } from './clients';
import { fakeClients, DEMO_FAMILY_ID } from './fake/fakeApi';
import type { Api } from './types';
import { createSession, SessionClosedError, wrapApi, type RenewResult } from '../session/session';
import { createRpcTestServer, WHOAMI } from '../test/rpcServer';

const user = { id: 'user-federico', email: 'federico@example.com' };

function setup() {
  const server = createRpcTestServer();
  const rpc = createRpcClient({ getCredentials: async () => ({ accessToken: 'token', userId: 'a' }), fetch: server.fetch });
  const api = realClients({ rpc, latencyMs: 0 })(user)('it-IT');
  return { server, api };
}

describe('clients by area (second PR)', () => {
  it('in real mode reads the server areas from the Worker and the others from the fake client', async () => {
    const { server, api } = setup();
    expect(await api.session.whoami({})).toEqual(WHOAMI);
    expect(server.fetch).toHaveBeenCalledTimes(1);
    // Recipes are still provisional: the fake client answers, nothing reaches the Worker.
    const list = await api.recipes.search({ familyId: DEMO_FAMILY_ID, query: {} });
    expect(list.unchanged).toBe(false);
    expect(server.fetch).toHaveBeenCalledTimes(1);
    // The menu is served (W1): its reads go to the Worker, which answers a valid family.
    const opening = await api.menu.getOpening({ familyId: '5eed0000-0000-4000-8000-000000000001', today: '2026-10-08' });
    expect(opening).toEqual({ unchanged: false, version: 'opening-1', data: { kind: 'no_weeks' } });
    expect(server.fetch).toHaveBeenCalledTimes(2);
  });
  it('in fake mode answers the server areas too, with the demo user', async () => {
    const api = fakeClients({ latencyMs: 0 })(user)('en-GB');
    expect(await api.session.whoami({})).toEqual({ userId: 'user-federico', channel: 'web', clientId: null, locale: 'en-GB' });
  });
});

describe('wrapApi on clients without keys (second PR)', () => {
  it('passes every argument and the family through session.call', async () => {
    const seen: unknown[][] = [];
    // Like the oRPC client: a Proxy whose areas and methods do not exist until asked for.
    const keyless = new Proxy({}, {
      get: (_target, area) => new Proxy({}, { get: (_t, method) => (...args: unknown[]) => (seen.push([area, method, ...args]), Promise.resolve('done')) })
    }) as Api;
    const session = createSession('a', createMemoryStore());
    const call = vi.spyOn(session, 'call');
    const api = wrapApi(keyless, session);
    const options = { signal: new AbortController().signal };
    expect(await (api.menu.getWeek as (...args: unknown[]) => Promise<unknown>)({ familyId: 'f1', weekStartsOn: '2026-10-05' }, options)).toBe('done');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.slice(0, 3)).toEqual(['menu', 'getWeek', { familyId: 'f1', weekStartsOn: '2026-10-05' }]);
    // The options go on with a signal that follows the caller's and the session's.
    const forwarded = (seen[0]![3] as { signal: AbortSignal }).signal;
    expect(forwarded.aborted).toBe(false);
    expect(call).toHaveBeenCalledWith(expect.any(Function), 'f1');
    expect(await api.session.whoami({})).toBe('done');
    expect(call).toHaveBeenLastCalledWith(expect.any(Function), undefined);
    void session.close();
    expect(forwarded.aborted).toBe(true);
  });
  it('renews once on unauthorized from the Worker and repeats the call with the same signal', async () => {
    const { server, api } = setup();
    let release: (result: RenewResult) => void = () => {};
    const refresh = vi.fn(() => new Promise<RenewResult>((resolve) => (release = resolve)));
    const session = createSession('a', createMemoryStore(), { refresh, end: vi.fn() });
    const wrapped = wrapApi(api, session);
    server.answer(() => {
      throw new ORPCError('unauthorized');
    });
    const controller = new AbortController();
    const call = wrapped.session.whoami({}, { signal: controller.signal });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // The repeated call hangs on the server until it is cancelled.
    server.answer(() => new Promise(() => {}));
    release({ kind: 'ok', userId: 'a' });
    await vi.waitFor(() => expect(server.signals).toHaveLength(2));
    controller.abort();
    const error = await call.catch((e: unknown) => e);
    expect(server.signals[1]!.aborted).toBe(true);
    expect((error as Error).name).toBe('AbortError');
  });
  it('lets a read be cancelled through the wrapper', async () => {
    const { server, api } = setup();
    server.answer(() => new Promise(() => {}));
    const wrapped = wrapApi(api, createSession('a', createMemoryStore()));
    const controller = new AbortController();
    const call = wrapped.session.whoami({}, { signal: controller.signal });
    await vi.waitFor(() => expect(server.signals).toHaveLength(1));
    controller.abort();
    await call.catch(() => undefined);
    expect(server.signals[0]!.aborted).toBe(true);
  });
  it('never sends a request of a session closed while its token was being read (PR #17 review, finding 1)', async () => {
    const server = createRpcTestServer();
    let releaseToken: (token: string) => void = () => {};
    const tokens: string[] = [];
    const rpc = createRpcClient({
      getCredentials: () =>
        new Promise((resolve) => (releaseToken = (token) => (tokens.push(token), resolve({ accessToken: token, userId: token === 'token-of-b' ? 'b' : 'a' })))),
      fetch: server.fetch
    });
    const session = createSession('a', createMemoryStore());
    const api = wrapApi(realClients({ rpc, latencyMs: 0 })(user)('it-IT'), session);
    const call = api.session.whoami({});
    await vi.waitFor(() => expect(releaseToken).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await session.close();
    // The token read ends after the closing, with the token of the next person.
    releaseToken('token-of-b');
    await expect(call).rejects.toBeInstanceOf(SessionClosedError);
    expect(server.fetch).not.toHaveBeenCalled();
    expect(server.seen).toEqual([]);
  });
  it('keeps the caller signal: an abort by the caller is still an abort', async () => {
    const { server, api } = setup();
    server.answer(() => new Promise(() => {}));
    const wrapped = wrapApi(api, createSession('a', createMemoryStore()));
    const controller = new AbortController();
    const call = wrapped.session.whoami({}, { signal: controller.signal });
    await vi.waitFor(() => expect(server.signals).toHaveLength(1));
    controller.abort();
    const error = await call.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(SessionClosedError);
    expect((error as Error).name).toBe('AbortError');
  });
  it('cancels a request in flight when its session closes, with the closed-session outcome', async () => {
    const { server, api } = setup();
    server.answer(() => new Promise(() => {}));
    const session = createSession('a', createMemoryStore());
    const call = wrapApi(api, session).session.whoami({});
    await vi.waitFor(() => expect(server.signals).toHaveLength(1));
    await session.close();
    await expect(call).rejects.toBeInstanceOf(SessionClosedError);
    expect(server.signals[0]!.aborted).toBe(true);
  });
});

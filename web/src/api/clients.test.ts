import { ORPCError } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from './persister';
import { createRpcClient } from './rpc';
import { realClients } from './clients';
import { fakeClients, DEMO_FAMILY_ID } from './fake/fakeApi';
import type { Api } from './types';
import { createSession, wrapApi, type RenewResult } from '../session/session';
import { createRpcTestServer, WHOAMI } from '../test/rpcServer';

const user = { id: 'user-federico', email: 'federico@example.com' };

function setup() {
  const server = createRpcTestServer();
  const rpc = createRpcClient({ getAccessToken: async () => 'token', fetch: server.fetch });
  const api = realClients({ rpc, latencyMs: 0 })(user)('it-IT');
  return { server, api };
}

describe('clients by area (second PR)', () => {
  it('in real mode reads the server areas from the Worker and the others from the fake client', async () => {
    const { server, api } = setup();
    expect(await api.session.whoami({})).toEqual(WHOAMI);
    expect(server.fetch).toHaveBeenCalledTimes(1);
    const week = await api.menu.getOpening({ familyId: DEMO_FAMILY_ID });
    expect(week.unchanged).toBe(false);
    expect(server.fetch).toHaveBeenCalledTimes(1);
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
    expect(seen).toEqual([['menu', 'getWeek', { familyId: 'f1', weekStartsOn: '2026-10-05' }, options]]);
    expect(call).toHaveBeenCalledWith(expect.any(Function), 'f1');
    expect(await api.session.whoami({})).toBe('done');
    expect(call).toHaveBeenLastCalledWith(expect.any(Function), undefined);
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
});

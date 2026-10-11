import { fakeClients } from './fake/fakeApi';
import type { RpcClient } from './rpc';
import { SERVER_AREAS, type Api } from './types';

/**
 * Real mode (second PR): the areas in SERVER_AREAS from the Worker, the others still from the
 * fake client with the signed-in user, until their producer adds them to the contract.
 */
export function realClients({ rpc, latencyMs }: { rpc: RpcClient; latencyMs?: number }) {
  const fake = fakeClients({ latencyMs });
  return (user: { id: string; email: string } | null) => {
    const forLocale = fake(user);
    return (locale: Parameters<typeof forLocale>[0]): Api => {
      const api: Record<string, unknown> = { ...forLocale(locale) };
      // The oRPC client is a Proxy without enumerable keys: areas are taken by name.
      for (const area of SERVER_AREAS) api[area] = rpc[area];
      return api as unknown as Api;
    };
  };
}

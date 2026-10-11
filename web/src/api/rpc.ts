import type { Contract } from '@app/contract';
import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { ApiError, isContractErrorCode } from './errors';

export type RpcClient = ContractRouterClient<Contract>;

interface RpcClientOptions {
  /** Read at every request (spec, «Client web»): Supabase renews the token in the background. */
  getAccessToken: () => Promise<string | null>;
  /** Tests only: the transport. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Errors as codes of the contract (spec, «Errori a codici»); an abort stays an abort for TanStack Query. */
function toApiErrors(error: unknown, signal: AbortSignal | undefined): unknown {
  if (error instanceof ApiError || signal?.aborted) return error;
  if (error instanceof ORPCError) return isContractErrorCode(error.code) ? new ApiError(error.code, error.data) : new ApiError('unknown');
  // fetch rejects with a TypeError when the request cannot leave the device.
  if (error instanceof TypeError) return new ApiError('network');
  return new ApiError('unknown');
}

/** The real client of the contract, towards the RPC route of the Worker on the same origin. */
export function createRpcClient({ getAccessToken, fetch }: RpcClientOptions): RpcClient {
  const link = new RPCLink({
    url: new URL('/api/rpc', location.origin).toString(),
    headers: async () => {
      const token = await getAccessToken();
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    interceptors: [
      async ({ next, signal }) => {
        try {
          return await next();
        } catch (error) {
          throw toApiErrors(error, signal);
        }
      }
    ],
    ...(fetch ? { fetch: (request: Request) => fetch(request) } : {})
  });
  return createORPCClient(link);
}

import type { Contract } from '@app/contract';
import { createORPCClient, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { Credentials } from '../auth/backend';
import { ApiError, isContractErrorCode, SessionClosedError } from './errors';

export type RpcClient = ContractRouterClient<Contract, RpcContext>;

interface RpcClientOptions {
  /** Read at every request (spec, «Client web»): Supabase renews the token in the background. */
  getCredentials: () => Promise<Credentials | null>;
  /** Tests only: the transport. */
  fetch?: (request: Request) => Promise<Response>;
}

/** Errors as codes of the contract (spec, «Errori a codici»); an abort stays an abort for TanStack Query. */
function toApiErrors(error: unknown, signal: AbortSignal | undefined): unknown {
  if (error instanceof ApiError || error instanceof SessionClosedError) return error;
  // Aborted by the closing of the session (its reason) or by the caller (the abort itself).
  if (signal?.aborted) return signal.reason instanceof SessionClosedError ? signal.reason : error;
  if (error instanceof ORPCError) return isContractErrorCode(error.code) ? new ApiError(error.code, error.data) : new ApiError('unknown');
  // fetch rejects with a TypeError when the request cannot leave the device.
  if (error instanceof TypeError) return new ApiError('network');
  return new ApiError('unknown');
}

/** The real client of the contract, towards the RPC route of the Worker on the same origin. */
/** Set by the session wrapper: the person whose session made the call (PR #17 review). */
export interface RpcContext { sessionUserId?: string | null }

export function createRpcClient({ getCredentials, fetch }: RpcClientOptions): RpcClient {
  const link = new RPCLink<RpcContext>({
    url: new URL('/api/rpc', location.origin).toString(),
    headers: async ({ context }) => {
      const credentials = await getCredentials();
      // The token may belong to someone who signed in meanwhile: never send it for another session's call.
      if (context.sessionUserId !== undefined && credentials && credentials.userId !== context.sessionUserId) throw new SessionClosedError();
      return credentials ? { authorization: `Bearer ${credentials.accessToken}` } : {};
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
    // Right before the transport, after the token was read: a closed session sends nothing.
    fetch: (request, init, options) => {
      if (options.signal?.aborted) return Promise.reject(options.signal.reason);
      return fetch ? fetch(request) : globalThis.fetch(request, init);
    }
  });
  return createORPCClient(link);
}

import { contract } from '@app/contract';
import { implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { vi } from 'vitest';

export const WHOAMI = { userId: '7c1f2e7e-3a7b-4f0a-9d55-1b2c3d4e5f60', channel: 'web' as const, clientId: null, locale: 'it-IT' as const };

/**
 * A server of the contract in this process: the RPC handler of the Worker, without the Worker.
 * `answer` sets how `session.whoami` answers (a value, a thrown ORPCError, a pending promise);
 * the transport honours the request signal like the browser's fetch.
 */
export function createRpcTestServer() {
  const seen: (string | null)[] = [];
  const signals: AbortSignal[] = [];
  let answer: () => unknown = () => WHOAMI;
  const os = implement({ session: contract.session });
  const router = os.router({
    session: {
      whoami: os.session.whoami.handler(async ({ context }) => {
        seen.push((context as { authorization: string | null }).authorization);
        return (await answer()) as typeof WHOAMI;
      })
    }
  });
  const handler = new RPCHandler(router);
  const fetch = vi.fn(
    (request: Request) =>
      new Promise<Response>((resolve, reject) => {
        signals.push(request.signal);
        request.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        handler
          .handle(request, { prefix: '/api/rpc', context: { authorization: request.headers.get('authorization') } })
          .then(({ matched, response }) => resolve(matched ? response : new Response('not found', { status: 404 })), reject);
      })
  );
  return { seen, signals, fetch, answer: (next: () => unknown) => (answer = next) };
}

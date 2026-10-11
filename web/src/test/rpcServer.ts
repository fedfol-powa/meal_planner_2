import { contract, type ProfileView } from '@app/contract';
import { implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { vi } from 'vitest';

export const WHOAMI = { userId: '7c1f2e7e-3a7b-4f0a-9d55-1b2c3d4e5f60', channel: 'web' as const, clientId: null, locale: 'it-IT' as const };

/** A profile only the server knows: nothing like the demo data of the fake client. */
export const SERVER_PROFILE: ProfileView = {
  user: { id: WHOAMI.userId, displayName: 'Persona dal server', email: 'server@example.test', locale: 'it-IT', globalRoles: [] },
  families: [{ id: '3b7e8f00-1d2c-4e5f-8a9b-0c1d2e3f4a5b', name: 'Famiglia dal server', role: 'member', timeZone: 'Europe/Rome', measurementSystem: 'metric' }],
  currentFamilyId: '3b7e8f00-1d2c-4e5f-8a9b-0c1d2e3f4a5b'
};

/**
 * A server of the contract in this process: the RPC handler of the Worker, without the Worker.
 * `answer` sets how `session.whoami` answers (a value, a thrown ORPCError, a pending promise),
 * `answerProfile` how `profile.get` answers, given the authorization header; the transport
 * honours the request signal like the browser's fetch.
 */
export function createRpcTestServer() {
  const seen: (string | null)[] = [];
  const signals: AbortSignal[] = [];
  let answer: () => unknown = () => WHOAMI;
  const profileSeen: (string | null)[] = [];
  let profile: (authorization: string | null) => unknown = () => SERVER_PROFILE;
  const os = implement({ session: contract.session, profile: contract.profile });
  const router = os.router({
    session: {
      whoami: os.session.whoami.handler(async ({ context }) => {
        seen.push((context as { authorization: string | null }).authorization);
        return (await answer()) as typeof WHOAMI;
      })
    },
    profile: {
      get: os.profile.get.handler(async ({ context }) => {
        const authorization = (context as { authorization: string | null }).authorization;
        profileSeen.push(authorization);
        return (await profile(authorization)) as ProfileView;
      }),
      update: os.profile.update.handler(() => SERVER_PROFILE),
      setCurrentFamily: os.profile.setCurrentFamily.handler(() => SERVER_PROFILE)
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
  return {
    seen,
    signals,
    fetch,
    answer: (next: () => unknown) => (answer = next),
    /** Authorization headers of the profile reads, in order. */
    profileSeen,
    answerProfile: (next: (authorization: string | null) => unknown) => (profile = next)
  };
}

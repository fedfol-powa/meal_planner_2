import { contract, type FamilyView, type ProfileView, type SettingsView } from '@app/contract';
import { resolveFamilySettings } from '@app/domain/family';
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

const SERVER_FAMILY_ID = SERVER_PROFILE.currentFamilyId!;

/** The family shown by SERVER_PROFILE, as the Worker reads it. */
export const SERVER_FAMILY: FamilyView = {
  id: SERVER_FAMILY_ID,
  name: 'Famiglia dal server',
  measurementSystem: 'metric',
  timeZone: 'Europe/Rome',
  myRole: 'member',
  members: [
    { userId: '9d0e1f2a-3b4c-4d5e-8f60-718293a4b5c6', displayName: 'Amministratrice dal server', role: 'family_admin', isMe: false, joinedAt: '2026-09-01T10:00:00+02:00' },
    { userId: WHOAMI.userId, displayName: 'Persona dal server', role: 'member', isMe: true, joinedAt: '2026-09-02T10:00:00+02:00' }
  ]
};

/** The planner defaults of a new family, no books or restrictions. */
export function serverSettings(): SettingsView {
  const { weights: _weights, ...settings } = resolveFamilySettings({});
  return { settings: settings as SettingsView['settings'], books: [], restrictions: [], canEdit: true };
}

/** What the family area of the test server answers: given the authorization, a value or a thrown ORPCError. */
export interface FamilyAnswers {
  get: (authorization: string | null) => unknown;
  getSettings: (authorization: string | null) => unknown;
  setMeal: (input: { mealType: 'lunch' | 'dinner'; weekday: number; servings: number }) => unknown;
}

/**
 * A server of the contract in this process: the RPC handler of the Worker, without the Worker.
 * `answer` sets how `session.whoami` answers (a value, a thrown ORPCError, a pending promise),
 * `answerProfile` how `profile.get` answers, given the authorization header, `answerFamily` the
 * family reads and one family write (the area of W2, through the real link); the transport
 * honours the request signal like the browser's fetch.
 */
export function createRpcTestServer() {
  const seen: (string | null)[] = [];
  const signals: AbortSignal[] = [];
  let answer: () => unknown = () => WHOAMI;
  const profileSeen: (string | null)[] = [];
  let profile: (authorization: string | null) => unknown = () => SERVER_PROFILE;
  const familySeen: { operation: string; authorization: string | null }[] = [];
  let version = 1;
  const family: FamilyAnswers = {
    get: () => ({ unchanged: false, version: `v${version}`, data: SERVER_FAMILY }),
    getSettings: () => ({ unchanged: false, version: `v${version}`, data: serverSettings() }),
    setMeal: ({ mealType, weekday, servings }) => {
      version += 1;
      const view = serverSettings();
      view.settings.slots[mealType][weekday] = { servings, fixedText: null, maxMinutes: null };
      return view;
    }
  };
  const familyApi = { get: contract.family.get, getSettings: contract.family.getSettings, setMeal: contract.family.setMeal };
  const os = implement({ session: contract.session, profile: contract.profile, family: familyApi });
  const seenBy = (operation: string, context: unknown) => {
    const authorization = (context as { authorization: string | null }).authorization;
    familySeen.push({ operation, authorization });
    return authorization;
  };
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
    },
    family: {
      get: os.family.get.handler(async ({ context }) => (await family.get(seenBy('get', context))) as never),
      getSettings: os.family.getSettings.handler(async ({ context }) => (await family.getSettings(seenBy('getSettings', context))) as never),
      setMeal: os.family.setMeal.handler(async ({ context, input }) => {
        seenBy('setMeal', context);
        return (await family.setMeal(input)) as never;
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
  return {
    seen,
    signals,
    fetch,
    answer: (next: () => unknown) => (answer = next),
    /** Authorization headers of the profile reads, in order. */
    profileSeen,
    answerProfile: (next: (authorization: string | null) => unknown) => (profile = next),
    /** Family operations received, in order, with their authorization header. */
    familySeen,
    answerFamily: (next: Partial<FamilyAnswers>) => Object.assign(family, next)
  };
}

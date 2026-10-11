import { contract, type FamilyView, type OpeningView, type ProfileView, type RecipeDetailView, type RecipeListItemView, type SettingsView, type WeekView } from '@app/contract';
import { resolveFamilySettings } from '@app/domain/family';
import { implement, ORPCError } from '@orpc/server';
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

/** A recipe only the server knows, in the family of SERVER_PROFILE. */
export const SERVER_RECIPE: RecipeListItemView = {
  recipe: {
    id: '5d0c1e2f-3a4b-4c5d-9e6f-7a8b9c0d1e2f', name: 'Ricetta dal server', description: null, durationMinutes: 25,
    sourceType: 'home', sourceUrl: null, bookTitle: null, bookPages: null, mealType: 'both', proteinGroup: 'legumes'
  },
  rating: { familyAverage: null, familyCount: 0, myStars: null },
  baseServings: 4,
  ingredients: [{ ingredientId: '6e1d2f3a-4b5c-4d6e-8f70-8b9cad0e1f2a', name: 'Ceci', amount: '400 g', preparation: null, optional: false }],
  addedOn: '2026-09-01', lastEatenOn: null, upcoming: []
};
const serverDetail: RecipeDetailView = {
  recipe: SERVER_RECIPE.recipe, status: 'published', baseServings: 4, servings: 4, ingredients: SERVER_RECIPE.ingredients,
  rating: SERVER_RECIPE.rating, history: [], upcoming: []
};

/**
 * A server of the contract in this process: the RPC handler of the Worker, without the Worker.
 * `answer` sets how `session.whoami` answers (a value, a thrown ORPCError, a pending promise),
 * `answerProfile` how `profile.get` answers, given the authorization header; the menu answers
 * `no_weeks` unless `answerMenu` gives an opening and a week, with the contract's validation of
 * input and output, and records the family and date of each opening; `answerFamily` sets the
 * family reads and one family write (the area of W2). The transport honours the request signal
 * like the browser's fetch.
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
  const seenBy = (operation: string, context: unknown) => {
    const authorization = (context as { authorization: string | null }).authorization;
    familySeen.push({ operation, authorization });
    return authorization;
  };
  /** Calls of the recipe book, with their input as the Worker received it. */
  const recipeCalls: { op: string; input: Record<string, unknown> }[] = [];
  const openingSeen: { familyId: string; today?: string }[] = [];
  let menuAnswer: { opening: OpeningView; week: WeekView | null } = { opening: { kind: 'no_weeks' }, week: null };
  const os = implement({ session: contract.session, profile: contract.profile, recipes: contract.recipes, ratings: contract.ratings, menu: contract.menu, family: familyApi });
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
    recipes: {
      search: os.recipes.search.handler(({ input }) => {
        recipeCalls.push({ op: 'recipes.search', input });
        return { unchanged: false as const, version: 'v1', data: { items: [SERVER_RECIPE] } };
      }),
      get: os.recipes.get.handler(({ input }) => {
        recipeCalls.push({ op: 'recipes.get', input });
        return { unchanged: false as const, version: 'v1', data: serverDetail };
      })
    },
    ratings: {
      set: os.ratings.set.handler(({ input }) => {
        recipeCalls.push({ op: 'ratings.set', input });
        return { familyAverage: input.stars, familyCount: input.stars === null ? 0 : 1, myStars: input.stars };
      })
    },
    menu: {
      getOpening: os.menu.getOpening.handler(({ input }) => {
        openingSeen.push({ familyId: input.familyId, today: input.today });
        return { unchanged: false as const, version: 'opening-1', data: menuAnswer.opening };
      }),
      getWeek: os.menu.getWeek.handler(({ input }) => {
        const week = menuAnswer.week;
        if (!week || week.startsOn !== input.weekStartsOn) throw new ORPCError('not_found');
        return { unchanged: false as const, version: 'week-1', data: week };
      }),
      getDates: os.menu.getDates.handler(({ input }) => ({
        unchanged: false as const,
        version: 'dates-1',
        data: menuAnswer.week?.days.filter((d) => d.meals.length && d.date.startsWith(input.month)).map((d) => d.date) ?? []
      }))
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
    recipeCalls,
    /** Family and date of the menu openings, in order. */
    openingSeen,
    answerProfile: (next: (authorization: string | null) => unknown) => (profile = next),
    answerMenu: (next: { opening: OpeningView; week: WeekView | null }) => (menuAnswer = next),
    /** Family operations received, in order, with their authorization header. */
    familySeen,
    answerFamily: (next: Partial<FamilyAnswers>) => Object.assign(family, next)
  };
}

import { contract, type FamilyView, type MealActionResult, type MealView, type OpeningView, type ProfileView, type RecipeDetailView, type RecipeListItemView, type SettingsView, type WeekView } from '@app/contract';
import { resolveFamilySettings } from '@app/domain/family';
import { implement, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { vi } from 'vitest';

export const WHOAMI = { userId: '7c1f2e7e-3a7b-4f0a-9d55-1b2c3d4e5f60', channel: 'web' as const, clientId: null, locale: 'it-IT' as const };

/** A profile only the server knows: nothing like the demo data of the fake client. */
export const SERVER_PROFILE: ProfileView = {
  user: { id: WHOAMI.userId, displayName: 'Persona dal server', email: 'server@example.test', locale: 'it-IT', menuEmails: true, globalRoles: [] },
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
    { userId: '9d0e1f2a-3b4c-4d5e-8f60-718293a4b5c6', displayName: 'Amministratrice dal server', role: 'family_admin', isMe: false, joinedAt: '2026-09-01T10:00:00+02:00', emailUnconfirmed: false },
    { userId: WHOAMI.userId, displayName: 'Persona dal server', role: 'member', isMe: true, joinedAt: '2026-09-02T10:00:00+02:00', emailUnconfirmed: false }
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

/** What the meals area of the test server answers, given the input: a value or a thrown ORPCError. */
export type MealHandlers = {
  [K in keyof typeof contract.meals]: (input: Record<string, unknown> & { id: string; familyId: string; slotId: string }) => unknown;
};

/**
 * A server of the contract in this process: the RPC handler of the Worker, without the Worker.
 * `answer` sets how `session.whoami` answers (a value, a thrown ORPCError, a pending promise),
 * `answerProfile` how `profile.get` answers, given the authorization header; the menu answers
 * `no_weeks` unless `answerMenu` gives an opening and a week, with the contract's validation of
 * input and output, and records the family and date of each opening; `answerFamily` sets the
 * family reads and one family write (the area of W2); the meals area writes into the stored weeks
 * unless `answerMeals` overrides an operation. The transport honours the request signal
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
  const familyApi = {
    get: contract.family.get, getSettings: contract.family.getSettings, setMeal: contract.family.setMeal,
    addExclusion: contract.family.addExclusion, removeExclusion: contract.family.removeExclusion
  };
  const seenBy = (operation: string, context: unknown) => {
    const authorization = (context as { authorization: string | null }).authorization;
    familySeen.push({ operation, authorization });
    return authorization;
  };
  /** Calls of the recipe book, with their input as the Worker received it. */
  const recipeCalls: { op: string; input: Record<string, unknown> }[] = [];
  const openingSeen: { familyId: string; today?: string }[] = [];
  let opening: OpeningView = { kind: 'no_weeks' };
  /** The weeks the menu answers, by Monday; the meals area writes into them. */
  const weeks = new Map<string, WeekView>();
  const weekReads: { weekStartsOn: string }[] = [];
  const weeksSeen: { familyId: string; weekStartsOn: string }[] = [];
  const mealCalls: { op: string; input: Record<string, unknown> }[] = [];
  /** The answer of `recipes.search` after recording the call: a value or a thrown ORPCError. */
  let search: () => unknown = () => ({ unchanged: false as const, version: 'v1', data: { items: [SERVER_RECIPE] } });
  /** Copies of the weeks taken before each action, for the undo. */
  const before = new Map<string, WeekView>();
  const mealsOf = (week: WeekView) => week.days.flatMap((d) => d.meals);
  const weekOf = (slotId: string) => {
    for (const week of weeks.values()) if (mealsOf(week).some((m) => m.slotId === slotId)) return week;
    throw new ORPCError('not_found');
  };
  /** Applies an action to the stored week: the changed meals get the action as their last change. */
  function apply(id: string, slotId: string, edit: (meal: MealView, all: MealView[]) => void, slotIds = [slotId]): MealActionResult {
    const week = weekOf(slotId);
    before.set(id, structuredClone(week));
    const all = mealsOf(week);
    edit(all.find((m) => m.slotId === slotId)!, all);
    for (const meal of all.filter((m) => slotIds.includes(m.slotId))) {
      meal.lastChange = { userName: 'Persona dal server', at: '2026-10-08T12:00', actionId: id, undoable: true, slotIds };
    }
    return { week: structuredClone(week), actionId: id, changed: true };
  }
  const asRecipe = (meal: MealView) =>
    Object.assign(meal, { kind: 'recipe', recipe: SERVER_RECIPE.recipe, freeText: null, ingredients: SERVER_RECIPE.ingredients, rating: SERVER_RECIPE.rating, canOpenRecipe: true });
  const defaultMeals: MealHandlers = {
    getSuggestions: (input) => ({ recipes: [{ recipe: SERVER_RECIPE.recipe, rating: SERVER_RECIPE.rating }], nextOffset: input.offset === 0 ? 5 : 0, freeTexts: ['Pizza'] }),
    setServings: (input) => apply(input.id, input.slotId, (m) => void (m.servings = input.servings as number)),
    setRecipe: (input) => apply(input.id, input.slotId, (m) => void asRecipe(m)),
    setFree: (input) =>
      apply(input.id, input.slotId, (m) => void Object.assign(m, { kind: 'free', recipe: null, freeText: input.text, ingredients: null, rating: null, canOpenRecipe: false })),
    setNote: (input) => apply(input.id, input.slotId, (m) => void (m.note = input.note as string | null)),
    swap: (input) => {
      const other = input.otherSlotId as string;
      return apply(input.id, input.slotId, (m, all) => {
        const o = all.find((x) => x.slotId === other)!;
        const moved = (x: MealView) => ({ kind: x.kind, recipe: x.recipe, freeText: x.freeText, ingredients: x.ingredients, note: x.note, rating: x.rating, canOpenRecipe: x.canOpenRecipe });
        const [a, b] = [moved(m), moved(o)];
        Object.assign(m, b);
        Object.assign(o, a);
      }, [input.slotId, other]);
    },
    undo: (input) => {
      const saved = before.get(input.actionId as string);
      if (!saved) throw new ORPCError('not_found');
      weeks.set(saved.startsOn, structuredClone(saved));
      return { week: structuredClone(saved), actionId: input.id, changed: true };
    }
  };
  const meals: MealHandlers = { ...defaultMeals };
  const os = implement({ session: contract.session, profile: contract.profile, recipes: contract.recipes, ratings: contract.ratings, menu: contract.menu, family: familyApi, meals: contract.meals });
  // One recorder for every operation; the union of their procedures is cast back per key.
  const mealHandler = <K extends keyof MealHandlers>(op: K) =>
    (os.meals[op] as typeof os.meals.undo).handler(async ({ input }) => {
      mealCalls.push({ op: `meals.${op}`, input: input as Record<string, unknown> });
      return (await meals[op](input as never)) as never;
    }) as never;
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
      // The language chosen comes back, as the Worker answers it.
      update: os.profile.update.handler(({ input }) => ({ ...SERVER_PROFILE, user: { ...SERVER_PROFILE.user, locale: input.locale ?? SERVER_PROFILE.user.locale } })),
      setCurrentFamily: os.profile.setCurrentFamily.handler(() => SERVER_PROFILE)
    },
    recipes: {
      search: os.recipes.search.handler(({ input }) => {
        recipeCalls.push({ op: 'recipes.search', input });
        return search() as { unchanged: false; version: string; data: { items: (typeof SERVER_RECIPE)[] } };
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
        return { unchanged: false as const, version: 'opening-1', data: opening };
      }),
      getWeek: os.menu.getWeek.handler(({ input }) => {
        weekReads.push({ weekStartsOn: input.weekStartsOn });
        const week = weeks.get(input.weekStartsOn);
        if (!week) throw new ORPCError('not_found');
        return { unchanged: false as const, version: 'week-1', data: structuredClone(week) };
      }),
      getDates: os.menu.getDates.handler(({ input }) => ({
        unchanged: false as const,
        version: 'dates-1',
        data: [...weeks.values()].flatMap((w) => w.days).filter((d) => d.meals.length && d.date.startsWith(input.month)).map((d) => d.date)
      })),
      // W24: no new week unless a test says otherwise.
      getNewWeek: os.menu.getNewWeek.handler(() => ({ weekStartsOn: null })),
      markWeekSeen: os.menu.markWeekSeen.handler(({ input }) => {
        weeksSeen.push(input);
        return { ok: true as const };
      })
    },
    meals: {
      getSuggestions: mealHandler('getSuggestions'),
      setServings: mealHandler('setServings'),
      setRecipe: mealHandler('setRecipe'),
      setFree: mealHandler('setFree'),
      setNote: mealHandler('setNote'),
      swap: mealHandler('swap'),
      undo: mealHandler('undo')
    },
    family: {
      get: os.family.get.handler(async ({ context }) => (await family.get(seenBy('get', context))) as never),
      getSettings: os.family.getSettings.handler(async ({ context }) => (await family.getSettings(seenBy('getSettings', context))) as never),
      setMeal: os.family.setMeal.handler(async ({ context, input }) => {
        seenBy('setMeal', context);
        return (await family.setMeal(input)) as never;
      }),
      addExclusion: os.family.addExclusion.handler(({ context }) => {
        seenBy('addExclusion', context);
        return [];
      }),
      removeExclusion: os.family.removeExclusion.handler(({ context }) => {
        seenBy('removeExclusion', context);
        return [];
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
    answerSearch: (next: () => unknown) => (search = next),
    /** Family and date of the menu openings, in order. */
    openingSeen,
    answerProfile: (next: (authorization: string | null) => unknown) => (profile = next),
    /** The opening and the weeks the menu answers (one `week` or several `weeks`). */
    answerMenu: (next: { opening: OpeningView; week?: WeekView | null; weeks?: WeekView[] }) => {
      opening = next.opening;
      weeks.clear();
      for (const week of [...(next.week ? [next.week] : []), ...(next.weeks ?? [])]) weeks.set(week.startsOn, structuredClone(week));
    },
    /** The stored week as the server has it now. */
    currentWeek: (startsOn: string) => structuredClone(weeks.get(startsOn)!),
    /** Inputs of menu.getWeek, in order. */
    weekReads,
    /** Inputs of menu.markWeekSeen, in order. */
    weeksSeen,
    /** Calls of the meals area, with their input as the Worker received it. */
    mealCalls,
    defaultMeals,
    answerMeals: (next: Partial<MealHandlers>) => Object.assign(meals, next),
    /** Family operations received, in order, with their authorization header. */
    familySeen,
    answerFamily: (next: Partial<FamilyAnswers>) => Object.assign(family, next)
  };
}

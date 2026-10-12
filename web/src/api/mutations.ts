import { useMutation, type Query, type QueryClient } from '@tanstack/react-query';
import { useCurrentLocale, useSession } from '../session/SessionScope';
import type { Session } from '../session/session';
import { familyOfKey } from './queries';
import type { MealActionResult } from './types';

/** The view a mutation answers with: the profile, one of the versioned views of a family, or a week of the menu. */
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week';
type Scope = 'all' | 'profile' | { area: string; operation?: string };

export interface Invalidation {
  target: MutationTarget;
  /** Other reads that depend on the changed value: 'all' = every query; area reads are of the same family. */
  stale: readonly Scope[];
}

const familyReads = (...scopes: { area: string; operation?: string }[]) => scopes;

/** Not versioned: every change the planner reads makes them stale (spec of the revision, 5). */
const SUGGESTIONS = { area: 'meals', operation: 'getSuggestions' } as const;
/** A changed meal moves the family counter: what reads the meals goes stale. */
const MEAL_STALE = familyReads(
  { area: 'menu', operation: 'getOpening' },
  { area: 'shopping', operation: 'getWeekList' },
  { area: 'recipes', operation: 'get' },
  { area: 'recipes', operation: 'search' },
  SUGGESTIONS
);

/** Spec «Viste aggiornate e invalidate per operazione»: the screens never decide this themselves. */
export const INVALIDATIONS = {
  // The name shows in the attributions of every family of the person (a rare gesture).
  'profile.updateName': { target: 'profile', stale: ['all'] },
  'profile.updateLocale': { target: 'profile', stale: [] },
  'profile.setCurrentFamily': { target: 'profile', stale: [] },
  'family.rename': { target: 'family', stale: ['profile'] },
  'family.setMeasurementSystem': {
    target: 'family',
    stale: ['profile', ...familyReads({ area: 'menu' }, { area: 'recipes' }, { area: 'shopping' })]
  },
  'family.setTimeZone': {
    target: 'family',
    stale: ['profile', ...familyReads({ area: 'menu' }, { area: 'recipes', operation: 'get' }, { area: 'shopping' })]
  },
  'family.setMeal': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.addRule': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.removeRule': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setKnownNew': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setGroupRange': { target: 'settings', stale: familyReads(SUGGESTIONS) },
  'family.setBookOwned': { target: 'settings', stale: familyReads({ area: 'recipes', operation: 'search' }, { area: 'recipes', operation: 'get' }, SUGGESTIONS) },
  'family.setIngredientRestriction': { target: 'settings', stale: familyReads({ area: 'shopping' }, SUGGESTIONS) },
  'family.addExclusion': { target: 'exclusions', stale: familyReads(SUGGESTIONS) },
  'family.removeExclusion': { target: 'exclusions', stale: familyReads(SUGGESTIONS) },
  'meals.setServings': { target: 'week', stale: MEAL_STALE },
  'meals.setRecipe': { target: 'week', stale: MEAL_STALE },
  'meals.setFree': { target: 'week', stale: MEAL_STALE },
  'meals.setNote': { target: 'week', stale: MEAL_STALE },
  'meals.swap': { target: 'week', stale: MEAL_STALE },
  'meals.undo': { target: 'week', stale: MEAL_STALE }
} as const satisfies Record<string, Invalidation>;
export type MutationName = keyof typeof INVALIDATIONS;

const TARGET_KEY: Record<Exclude<MutationTarget, 'profile'>, [string, string]> = {
  family: ['family', 'get'],
  settings: ['family', 'getSettings'],
  exclusions: ['family', 'listExclusions'],
  week: ['menu', 'getWeek']
};

const targetKey = (target: MutationTarget, familyId: string | undefined, locale: string, weekStartsOn?: string) =>
  target === 'profile'
    ? ['profile', 'get', { locale }]
    : target === 'week'
      ? [...TARGET_KEY.week, { familyId, weekStartsOn, locale }]
      : [...TARGET_KEY[target], { familyId, locale }];

function matches(scope: Scope, familyId: string | undefined) {
  return (query: Query) => {
    const [area, operation] = query.queryKey as [string, string];
    if (scope === 'all') return true;
    if (scope === 'profile') return area === 'profile' && operation === 'get';
    return area === scope.area && (!scope.operation || operation === scope.operation) && familyOfKey(query.queryKey) === familyId;
  };
}

export interface ApplyOptions {
  name: MutationName;
  familyId?: string;
  /** For a meal: the Monday of its week, the view written. */
  weekStartsOn?: string;
  /** The language the mutation was sent in. */
  locale: string;
  view: unknown;
  /** The session that sent the mutation is still open. */
  sessionOpen: () => boolean;
  /** Same language and latest mutation of this view: the answer may be written. */
  isLatest: () => boolean;
}

/**
 * The same view in another language: same area, operation, family and, for a week, Monday
 * (PR #21 review, finding 2).
 */
function sameView(target: MutationTarget, familyId: string | undefined, weekStartsOn?: string) {
  const [area, operation] = target === 'profile' ? ['profile', 'get'] : TARGET_KEY[target];
  return (query: Query) =>
    query.queryKey[0] === area &&
    query.queryKey[1] === operation &&
    (target === 'profile' || familyOfKey(query.queryKey) === familyId) &&
    (target !== 'week' || (query.queryKey[2] as { weekStartsOn?: string }).weekStartsOn === weekStartsOn);
}

/**
 * Model of applyRating (W5): cancel affected reads, check, write, invalidate, restart the empty ones.
 * Resolves true when the answer was written, false when it was dropped or superseded.
 */
export async function applyMutation(queryClient: QueryClient, options: ApplyOptions): Promise<boolean> {
  const { target, stale } = INVALIDATIONS[options.name] as Invalidation;
  const key = JSON.stringify(targetKey(target, options.familyId, options.locale, options.weekStartsOn));
  const isTarget = (query: Query) => JSON.stringify(query.queryKey) === key;
  // The answer is in the language it was sent in: the other languages of the view are only made stale.
  const isVariant = (query: Query) => !isTarget(query) && sameView(target, options.familyId, options.weekStartsOn)(query);
  const isStale = (query: Query) => !isTarget(query) && (isVariant(query) || stale.some((scope) => matches(scope, options.familyId)(query)));
  const affected = (query: Query) => isTarget(query) || isStale(query);
  const running = queryClient.getQueryCache().findAll({ predicate: affected, fetchStatus: 'fetching' });
  await queryClient.cancelQueries({ predicate: affected });
  // Closing clears the cache anyway.
  if (!options.sessionOpen()) return false;
  if (!options.isLatest()) {
    // Superseded answer of a successful write: not written, but everything it changed goes stale.
    void queryClient.invalidateQueries({ predicate: affected });
    return false;
  }
  // The old version stays: the next read gets fresh data (the counter grew), never a wrong «unchanged».
  // Without a cached version none is kept, and the next read sends no knownVersion (PR #21 review, finding 1).
  queryClient.setQueryData(JSON.parse(key) as unknown[], (old: { version?: string } | undefined) =>
    target === 'profile' ? options.view : old?.version ? { version: old.version, data: options.view } : { data: options.view }
  );
  void queryClient.invalidateQueries({ predicate: isStale });
  // Cancelled reads that had nothing to show start again, now after the write.
  const empty = running.filter((query) => query.state.data === undefined && !isStale(query));
  if (empty.length) void queryClient.invalidateQueries({ predicate: (query) => empty.includes(query) });
  return true;
}

const ratingsBySession = new WeakMap<Session, Map<string, number>>();

/** How many ratings of the family this session has confirmed: a meal answer prepared before one may carry the old rating. */
export const ratingsConfirmed = (session: Session, familyId: string) => ratingsBySession.get(session)?.get(familyId) ?? 0;

export function countRatingConfirmed(session: Session, familyId: string) {
  let counts = ratingsBySession.get(session);
  if (!counts) ratingsBySession.set(session, (counts = new Map()));
  counts.set(familyId, ratingsConfirmed(session, familyId) + 1);
}

export interface MutationDeps {
  queryClient: QueryClient;
  session: Session;
  /** The language shown now, read when the answer arrives. */
  currentLocale: () => string;
}

export interface MutationOutcome<T> {
  view: T;
  /** The answer is the latest of its view, in the current language, in an open session, and was written. */
  applied: boolean;
}

/**
 * Sends one mutation and applies its answer; the logic of useAreaMutation without React. Effects
 * beyond the cache (e.g. the language) belong only to an applied answer (PR #21 review, finding 3).
 */
export async function runAreaMutation<T>(deps: MutationDeps, name: MutationName, familyId: string | undefined, call: () => Promise<T>): Promise<MutationOutcome<T>> {
  const { target } = INVALIDATIONS[name] as Invalidation;
  const trackKey = target === 'profile' ? 'profile' : `${target}:${familyId}`;
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const view = await call();
  const applied = await applyMutation(deps.queryClient, {
    name,
    familyId,
    locale,
    view,
    sessionOpen: () => !deps.session.isClosed(),
    isLatest: () => deps.currentLocale() === locale && deps.session.isLatest(trackKey, token)
  });
  return { view, applied };
}

export type MealMutationName = Extract<MutationName, `meals.${string}`>;

/**
 * As runAreaMutation for the meals: the target is the week of the meal (spec of the revision, 5).
 * A rating confirmed meanwhile supersedes the answer, which may carry the old one: the week is
 * read again instead of written (PR #33 review, 3).
 */
export async function runMealMutation(
  deps: MutationDeps,
  name: MealMutationName,
  familyId: string,
  weekStartsOn: string,
  call: () => Promise<MealActionResult>
): Promise<MutationOutcome<MealActionResult>> {
  const trackKey = `week:${familyId}:${weekStartsOn}`;
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const ratings = ratingsConfirmed(deps.session, familyId);
  const result = await call();
  const applied = await applyMutation(deps.queryClient, {
    name,
    familyId,
    weekStartsOn,
    locale,
    view: result.week,
    sessionOpen: () => !deps.session.isClosed(),
    isLatest: () => deps.currentLocale() === locale && deps.session.isLatest(trackKey, token) && ratingsConfirmed(deps.session, familyId) === ratings
  });
  return { view: result, applied };
}

/**
 * The hook of every profile and family screen (model of useRateRecipe): no optimistic update,
 * the control shows the value sent until the answer, which replaces the cached view.
 */
export function useAreaMutation<I, T>(name: MutationName, familyId: string | undefined, call: (input: I) => Promise<T>) {
  const session = useSession();
  const currentLocale = useCurrentLocale();
  return useMutation({
    meta: familyId ? { familyId } : undefined,
    mutationFn: (input: I) => runAreaMutation({ queryClient: session.queryClient, session, currentLocale }, name, familyId, () => call(input))
  });
}

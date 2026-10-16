import { useMutation, type Query, type QueryClient } from '@tanstack/react-query';
import { useCurrentLocale, useSession } from '../session/SessionScope';
import type { Session } from '../session/session';
import { familyAccessOf, familyOfKey } from './queries';
import type { MealActionResult, ProfileView } from './types';

/** The view a mutation answers with: the profile, one of the versioned views of a family, a week of the menu, the app invitations or the users. */
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions' | 'week' | 'appInvitations' | 'users' | 'familyInvitations' | 'account';
/** Lists read again instead of written by the registry: their answer is never put in the cache here. */
const LIST_TARGETS = ['appInvitations', 'users', 'familyInvitations', 'account'] as const;
type ListTarget = (typeof LIST_TARGETS)[number];
const isListTarget = (target: MutationTarget): target is ListTarget => (LIST_TARGETS as readonly string[]).includes(target);
/** The targets whose answer is written in the cache. */
type CachedTarget = Exclude<MutationTarget, ListTarget>;
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
  // The answer is the profile with the new family shown (spec W9).
  'family.create': { target: 'profile', stale: [] },
  // Not written in the cache: the list is read again; the link only reaches a session still open.
  'appInvitations.create': { target: 'appInvitations', stale: [] },
  'appInvitations.revoke': { target: 'appInvitations', stale: [] },
  // Read again; the profile too, as one's own roles may have changed. `applied` only for the
  // latest answer for that user: the page may then write it as the confirmed detail (spec W10).
  'users.setRole': { target: 'users', stale: ['profile'] },
  // W11: links and joins are lists read again (not versioned); join, leave and delete answer the profile.
  'familyInvitations.create': { target: 'familyInvitations', stale: [] },
  'familyInvitations.revoke': { target: 'familyInvitations', stale: [] },
  'family.join': { target: 'profile', stale: [] },
  'family.leave': { target: 'profile', stale: [] },
  'family.delete': { target: 'profile', stale: [] },
  // The links of a demoted or removed person stop working; the joins show «ex membro».
  'family.setMemberRole': { target: 'family', stale: familyReads({ area: 'familyInvitations' }) },
  'family.removeMember': { target: 'family', stale: familyReads({ area: 'familyInvitations' }) },
  // The session closes after the answer: nothing to write.
  'account.delete': { target: 'account', stale: [] },
  // The administrator may be the successor named in a family of the deleted user: the profile too.
  'users.delete': { target: 'users', stale: ['profile'] },
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

const TARGET_KEY: Record<Exclude<CachedTarget, 'profile'>, [string, string]> = {
  family: ['family', 'get'],
  settings: ['family', 'getSettings'],
  exclusions: ['family', 'listExclusions'],
  week: ['menu', 'getWeek']
};

const targetKey = (target: CachedTarget, familyId: string | undefined, locale: string, weekStartsOn?: string) =>
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
  /**
   * When the mutation started (device clock of the session): the view written is produced then, and
   * a family revoked since then gets nothing written (spec W11, «Dati sul dispositivo»). Default: now.
   */
  startedAt?: number;
}

/**
 * The same view in another language: same area, operation, family and, for a week, Monday
 * (PR #21 review, finding 2).
 */
function sameView(target: CachedTarget, familyId: string | undefined, weekStartsOn?: string) {
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
  if (isListTarget(target)) {
    // Read again for every answer, also a superseded one; only a closed session drops it.
    if (!options.sessionOpen()) return false;
    void queryClient.invalidateQueries({ queryKey: [target] });
    if (stale.length) void queryClient.invalidateQueries({ predicate: (query) => stale.some((scope) => matches(scope, options.familyId)(query)) });
    // Invitations: showing a link is the sheet's decision (its own attempt), so any answer counts.
    // Users: only the latest answer for the user may be written by the page (spec W10).
    return target === 'users' ? options.isLatest() : true;
  }
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
  const access = familyAccessOf(queryClient);
  const startedAt = options.startedAt ?? access.now();
  // A view of a family revoked after the mutation started is never written, even once restored (stale_after_revocation).
  const startedBeforeRevocation = target !== 'profile' && !!options.familyId && access.revokedAt(options.familyId) >= startedAt;
  if (!options.isLatest() || startedBeforeRevocation) {
    // Superseded answer of a successful write: not written, but everything it changed goes stale.
    void queryClient.invalidateQueries({ predicate: affected });
    return false;
  }
  const written = JSON.parse(key) as unknown[];
  // Families gone from the profile are revoked, families back are restored (spec W11).
  if (target === 'profile') access.profileRead(queryClient.getQueryData<ProfileView>(written), options.view as ProfileView, startedAt, true);
  // The old version stays: the next read gets fresh data (the counter grew), never a wrong «unchanged».
  // Without a cached version none is kept, and the next read sends no knownVersion (PR #21 review, finding 1).
  queryClient.setQueryData(written, (old: { version?: string } | undefined) =>
    target === 'profile' ? options.view : old?.version ? { version: old.version, data: options.view, producedAt: startedAt } : { data: options.view, producedAt: startedAt }
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
export async function runAreaMutation<T>(
  deps: MutationDeps,
  name: MutationName,
  familyId: string | undefined,
  call: () => Promise<T>,
  options: { track?: string } = {}
): Promise<MutationOutcome<T>> {
  const { target } = INVALIDATIONS[name] as Invalidation;
  // `track` groups the answers that supersede each other (for users: one user), without touching familyId.
  const trackKey = options.track ?? (target === 'profile' || isListTarget(target) ? target : `${target}:${familyId}`);
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const startedAt = familyAccessOf(deps.queryClient).now();
  const view = await call();
  const applied = await applyMutation(deps.queryClient, {
    name,
    familyId,
    locale,
    view,
    startedAt,
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
  const startedAt = familyAccessOf(deps.queryClient).now();
  const result = await call();
  const applied = await applyMutation(deps.queryClient, {
    name,
    familyId,
    weekStartsOn,
    locale,
    view: result.week,
    startedAt,
    sessionOpen: () => !deps.session.isClosed(),
    isLatest: () => deps.currentLocale() === locale && deps.session.isLatest(trackKey, token) && ratingsConfirmed(deps.session, familyId) === ratings
  });
  return { view: result, applied };
}

/**
 * The hook of every profile and family screen (model of useRateRecipe): no optimistic update,
 * the control shows the value sent until the answer, which replaces the cached view.
 */
export function useAreaMutation<I, T>(name: MutationName, familyId: string | undefined, call: (input: I) => Promise<T>, options: { track?: string } = {}) {
  const session = useSession();
  const currentLocale = useCurrentLocale();
  return useMutation({
    meta: familyId ? { familyId, operation: name } : { operation: name },
    mutationFn: (input: I) => runAreaMutation({ queryClient: session.queryClient, session, currentLocale }, name, familyId, () => call(input), options)
  });
}

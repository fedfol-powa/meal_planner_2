import { useMutation, type Query, type QueryClient } from '@tanstack/react-query';
import { useCurrentLocale, useSession } from '../session/SessionScope';
import type { Session } from '../session/session';
import { familyOfKey } from './queries';

/** The view a mutation answers with: the profile, or one of the versioned views of a family. */
export type MutationTarget = 'profile' | 'family' | 'settings' | 'exclusions';
type Scope = 'all' | 'profile' | { area: string; operation?: string };

export interface Invalidation {
  target: MutationTarget;
  /** Other reads that depend on the changed value: 'all' = every query; area reads are of the same family. */
  stale: readonly Scope[];
}

const familyReads = (...scopes: { area: string; operation?: string }[]) => scopes;

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
  'family.setMeal': { target: 'settings', stale: [] },
  'family.addRule': { target: 'settings', stale: [] },
  'family.removeRule': { target: 'settings', stale: [] },
  'family.setKnownNew': { target: 'settings', stale: [] },
  'family.setGroupRange': { target: 'settings', stale: [] },
  'family.setBookOwned': { target: 'settings', stale: familyReads({ area: 'recipes', operation: 'search' }, { area: 'recipes', operation: 'get' }) },
  'family.setIngredientRestriction': { target: 'settings', stale: familyReads({ area: 'shopping' }) },
  'family.addExclusion': { target: 'exclusions', stale: [] },
  'family.removeExclusion': { target: 'exclusions', stale: [] }
} as const satisfies Record<string, Invalidation>;
export type MutationName = keyof typeof INVALIDATIONS;

const TARGET_KEY: Record<Exclude<MutationTarget, 'profile'>, [string, string]> = {
  family: ['family', 'get'],
  settings: ['family', 'getSettings'],
  exclusions: ['family', 'listExclusions']
};

const targetKey = (target: MutationTarget, familyId: string | undefined, locale: string) =>
  target === 'profile' ? ['profile', 'get', { locale }] : [...TARGET_KEY[target], { familyId, locale }];

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
  /** The language the mutation was sent in. */
  locale: string;
  view: unknown;
  /** The session that sent the mutation is still open. */
  sessionOpen: () => boolean;
  /** Same language and latest mutation of this view: the answer may be written. */
  isLatest: () => boolean;
}

/** Model of applyRating (W5): cancel affected reads, check, write, invalidate, restart the empty ones. */
export async function applyMutation(queryClient: QueryClient, options: ApplyOptions): Promise<void> {
  const { target, stale } = INVALIDATIONS[options.name] as Invalidation;
  const key = JSON.stringify(targetKey(target, options.familyId, options.locale));
  const isTarget = (query: Query) => JSON.stringify(query.queryKey) === key;
  const isStale = (query: Query) => !isTarget(query) && stale.some((scope) => matches(scope, options.familyId)(query));
  const affected = (query: Query) => isTarget(query) || isStale(query);
  const running = queryClient.getQueryCache().findAll({ predicate: affected, fetchStatus: 'fetching' });
  await queryClient.cancelQueries({ predicate: affected });
  // Closing clears the cache anyway.
  if (!options.sessionOpen()) return;
  if (!options.isLatest()) {
    // Superseded answer of a successful write: not written, but everything it changed goes stale.
    void queryClient.invalidateQueries({ predicate: affected });
    return;
  }
  // The old version stays: the next read gets fresh data (the counter grew), never a wrong «unchanged».
  queryClient.setQueryData(JSON.parse(key) as unknown[], (old: { version: string } | undefined) =>
    target === 'profile' ? options.view : { version: old?.version ?? '', data: options.view }
  );
  void queryClient.invalidateQueries({ predicate: isStale });
  // Cancelled reads that had nothing to show start again, now after the write.
  const empty = running.filter((query) => query.state.data === undefined && !isStale(query));
  if (empty.length) void queryClient.invalidateQueries({ predicate: (query) => empty.includes(query) });
}

export interface MutationDeps {
  queryClient: QueryClient;
  session: Session;
  /** The language shown now, read when the answer arrives. */
  currentLocale: () => string;
}

/** Sends one mutation and applies its answer; the logic of useAreaMutation without React. */
export async function runAreaMutation<T>(deps: MutationDeps, name: MutationName, familyId: string | undefined, call: () => Promise<T>): Promise<T> {
  const { target } = INVALIDATIONS[name] as Invalidation;
  const trackKey = target === 'profile' ? 'profile' : `${target}:${familyId}`;
  const locale = deps.currentLocale();
  const token = deps.session.track(trackKey);
  const view = await call();
  await applyMutation(deps.queryClient, {
    name,
    familyId,
    locale,
    view,
    sessionOpen: () => !deps.session.isClosed(),
    isLatest: () => deps.currentLocale() === locale && deps.session.isLatest(trackKey, token)
  });
  return view;
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

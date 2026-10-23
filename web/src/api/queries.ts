import { queryOptions, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useLocale } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import type { IsoDate } from '../lib/calendar';
import { useApi } from './ApiProvider';
import { StaleAfterRevocationError } from './errors';
import type { Api, ProfileView, Read, RecipeQuery } from './types';

/**
 * What the cache keeps: the view, its opaque version, sent back as knownVersion, and `producedAt`,
 * the instant the request that produced the data started (spec W11, «Dati sul dispositivo»): an
 * «unchanged» answer keeps it, absent counts as 0.
 */
export interface Versioned<T> { version: string; data: T; producedAt?: number }

/**
 * What the reads and the mutations ask the session about the families (spec W11): its clock, the
 * latest revocation known for a family and what a profile read says. Without a session (tests of
 * single reads) nothing is revoked.
 */
export interface FamilyAccess {
  now(): number;
  /** The latest revocation known for the family on this device, 0 if none. */
  revokedAt(familyId: string): number;
  /** A profile read, or answered by a mutation (`answer`), by a request started at `startedAt`. */
  profileRead(previous: ProfileView | undefined, next: ProfileView, startedAt: number, answer?: boolean): void;
}

const NO_ACCESS: FamilyAccess = { now: () => Date.now(), revokedAt: () => 0, profileRead: () => undefined };
const accesses = new WeakMap<QueryClient, FamilyAccess>();

export function attachFamilyAccess(queryClient: QueryClient, access: FamilyAccess): void {
  accesses.set(queryClient, access);
}

export const familyAccessOf = (queryClient: QueryClient): FamilyAccess => accesses.get(queryClient) ?? NO_ACCESS;

/** Throws when the family was revoked after the request started: the answer is dropped and the read repeated. */
function checkStarted(access: FamilyAccess, familyId: string | null, startedAt: number): void {
  if (familyId && access.revokedAt(familyId) >= startedAt) throw new StaleAfterRevocationError();
}

/** Wraps a read so screens never see «unchanged» (contract decided by W1). */
export async function readThrough<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: (knownVersion?: string) => Promise<Read<T>>
): Promise<Versioned<T>> {
  const access = familyAccessOf(queryClient);
  const familyId = familyOfKey(queryKey);
  const startedAt = access.now();
  const result = await read(queryClient.getQueryData<Versioned<T>>(queryKey)?.version);
  checkStarted(access, familyId, startedAt);
  if (!result.unchanged) return { version: result.version, data: result.data, producedAt: startedAt };
  // The cache as it is now, not before the wait: a confirmed mutation may have patched it (second review, C5).
  // Its producedAt stays: «unchanged» says nothing newer about when it was produced.
  const cached = queryClient.getQueryData<Versioned<T>>(queryKey);
  if (cached && cached.version === result.version) return cached;
  // Unchanged but nothing to show (cache cleared or replaced meanwhile): ask for the full view.
  const again = access.now();
  const fresh = await read(undefined);
  if (fresh.unchanged) throw new Error('unchanged answer to a read without version');
  checkStarted(access, familyId, again);
  return { version: fresh.version, data: fresh.data, producedAt: again };
}

export interface QueryDeps { api: Api; queryClient: QueryClient; locale: Locale }

export function useQueryDeps(): QueryDeps {
  return { api: useApi(), queryClient: useQueryClient(), locale: useLocale().locale };
}

export const queryKeys = {
  profile: (locale: Locale) => ['profile', 'get', { locale }] as const,
  /** today: the family's local date, part of the read (spec of the menu, 5.1). */
  opening: (familyId: string, today: IsoDate, locale: Locale) => ['menu', 'getOpening', { familyId, today, locale }] as const,
  week: (familyId: string, weekStartsOn: IsoDate, locale: Locale) => ['menu', 'getWeek', { familyId, weekStartsOn, locale }] as const,
  dates: (familyId: string, month: string, locale: Locale) => ['menu', 'getDates', { familyId, month, locale }] as const,
  /** W24: the same in every language, never saved on the device. */
  newWeek: (familyId: string) => ['menu', 'getNewWeek', { familyId }] as const,
  search: (familyId: string, query: RecipeQuery, locale: Locale) => ['recipes', 'search', { familyId, query, locale }] as const,
  recipe: (familyId: string, recipeId: string, locale: Locale, servings?: number, slotId?: string) =>
    ['recipes', 'get', { familyId, recipeId, locale, servings, slotId }] as const
};

/** The family a cached view belongs to, if any: ratings and revocations act per family. */
export function familyOfKey(queryKey: QueryKey): string | null {
  const input = queryKey[2];
  if (typeof input !== 'object' || input === null || !('familyId' in input)) return null;
  const familyId = (input as { familyId: unknown }).familyId;
  return typeof familyId === 'string' ? familyId : null;
}

/** The language a cached view was read in, if any. */
export function localeOfKey(queryKey: QueryKey): string | null {
  const input = queryKey[2];
  if (typeof input !== 'object' || input === null || !('locale' in input)) return null;
  const locale = (input as { locale: unknown }).locale;
  return typeof locale === 'string' ? locale : null;
}

/**
 * placeholderData that keeps the previous data only within the same view: same area, operation
 * and listed input fields. Never across languages, families, recipes or meals (second review, C7).
 */
export function keepPreviousWithin(queryKey: QueryKey, fields: readonly string[]) {
  const input = (key: QueryKey) => (typeof key[2] === 'object' && key[2] !== null ? (key[2] as Record<string, unknown>) : {});
  return <T,>(previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined): T | undefined => {
    if (!previousQuery) return undefined;
    const before = previousQuery.queryKey;
    if (before[0] !== queryKey[0] || before[1] !== queryKey[1]) return undefined;
    return fields.every((field) => input(before)[field] === input(queryKey)[field]) ? previous : undefined;
  };
}

const select = <T,>(value: Versioned<T>) => value.data;

export function openingQuery({ api, queryClient, locale }: QueryDeps, familyId: string, today: IsoDate) {
  const queryKey = queryKeys.opening(familyId, today, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getOpening({ familyId, today, knownVersion })), select });
}

export function weekQuery({ api, queryClient, locale }: QueryDeps, familyId: string, weekStartsOn: IsoDate) {
  const queryKey = queryKeys.week(familyId, weekStartsOn, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getWeek({ familyId, weekStartsOn, knownVersion })), select });
}

export function datesQuery({ api, queryClient, locale }: QueryDeps, familyId: string, month: string) {
  const queryKey = queryKeys.dates(familyId, month, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getDates({ familyId, month, knownVersion })), select });
}

/**
 * The visits of the new week (W24, spec 6.1), per family and week: «pending» while `markWeekSeen` is
 * running, «done» once confirmed (not sent again in this session). Next to the QueryClient like the
 * family access: the menu does not remount when the family changes.
 */
export interface WeekVisits {
  get(familyId: string, weekStartsOn: IsoDate): 'pending' | 'done' | undefined;
  set(familyId: string, weekStartsOn: IsoDate, state: 'pending' | 'done'): void;
  clear(familyId: string, weekStartsOn: IsoDate): void;
  /** The family was revoked: its visits are forgotten and the answers of the calls already sent no longer count. */
  revokeFamily(familyId: string): void;
  generation(familyId: string): number;
}

const visitsByClient = new WeakMap<QueryClient, WeekVisits>();

export function weekVisits(queryClient: QueryClient): WeekVisits {
  let visits = visitsByClient.get(queryClient);
  if (visits) return visits;
  const states = new Map<string, Map<IsoDate, 'pending' | 'done'>>();
  const generations = new Map<string, number>();
  visits = {
    get: (familyId, weekStartsOn) => states.get(familyId)?.get(weekStartsOn),
    set(familyId, weekStartsOn, state) {
      if (!states.has(familyId)) states.set(familyId, new Map());
      states.get(familyId)!.set(weekStartsOn, state);
    },
    clear: (familyId, weekStartsOn) => void states.get(familyId)?.delete(weekStartsOn),
    revokeFamily(familyId) {
      states.delete(familyId);
      generations.set(familyId, (generations.get(familyId) ?? 0) + 1);
    },
    generation: (familyId) => generations.get(familyId) ?? 0
  };
  visitsByClient.set(queryClient, visits);
  return visits;
}

/** The notice as cached: not versioned, with `producedAt` like every view of a family (spec W11). */
export interface NewWeek { weekStartsOn: IsoDate | null; producedAt: number }

/**
 * The new week not seen yet. The visits prevail over the answer, compared when it arrives: a read
 * started before `markWeekSeen` was recorded never brings the dot back (spec W24, 6.1).
 */
export function newWeekQuery({ api, queryClient }: QueryDeps, familyId: string) {
  return queryOptions({
    queryKey: queryKeys.newWeek(familyId),
    queryFn: async (): Promise<NewWeek> => {
      const access = familyAccessOf(queryClient);
      const startedAt = access.now();
      const { weekStartsOn } = await api.menu.getNewWeek({ familyId });
      checkStarted(access, familyId, startedAt);
      const visited = !!weekStartsOn && !!weekVisits(queryClient).get(familyId, weekStartsOn);
      return { weekStartsOn: visited ? null : weekStartsOn, producedAt: startedAt };
    }
  });
}

export function searchQuery({ api, queryClient, locale }: QueryDeps, familyId: string, query: RecipeQuery) {
  const queryKey = queryKeys.search(familyId, query, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.search({ familyId, query, knownVersion })), select });
}

export function recipeQuery({ api, queryClient, locale }: QueryDeps, familyId: string, recipeId: string, servings?: number, slotId?: string) {
  const queryKey = queryKeys.recipe(familyId, recipeId, locale, servings, slotId);
  return queryOptions({
    queryKey,
    queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.recipes.get({ familyId, recipeId, servings, slotId, knownVersion })),
    select
  });
}

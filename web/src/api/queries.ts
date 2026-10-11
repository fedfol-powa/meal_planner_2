import { queryOptions, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useLocale } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import type { IsoDate } from '../lib/calendar';
import { useApi } from './ApiProvider';
import type { Api, Read, RecipeQuery } from './types';

/** What the cache keeps: the view and its opaque version, sent back as knownVersion. */
export interface Versioned<T> { version: string; data: T }

/** Wraps a read so screens never see «unchanged» (contract decided by W1). */
export async function readThrough<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: (knownVersion?: string) => Promise<Read<T>>
): Promise<Versioned<T>> {
  const result = await read(queryClient.getQueryData<Versioned<T>>(queryKey)?.version);
  if (!result.unchanged) return { version: result.version, data: result.data };
  // The cache as it is now, not before the wait: a confirmed mutation may have patched it (second review, C5).
  const cached = queryClient.getQueryData<Versioned<T>>(queryKey);
  if (cached && cached.version === result.version) return cached;
  // Unchanged but nothing to show (cache cleared or replaced meanwhile): ask for the full view.
  const fresh = await read(undefined);
  if (fresh.unchanged) throw new Error('unchanged answer to a read without version');
  return { version: fresh.version, data: fresh.data };
}

export interface QueryDeps { api: Api; queryClient: QueryClient; locale: Locale }

export function useQueryDeps(): QueryDeps {
  return { api: useApi(), queryClient: useQueryClient(), locale: useLocale().locale };
}

export const queryKeys = {
  me: (locale: Locale) => ['me', 'get', { locale }] as const,
  opening: (familyId: string, locale: Locale) => ['menu', 'getOpening', { familyId, locale }] as const,
  week: (familyId: string, weekStartsOn: IsoDate, locale: Locale) => ['menu', 'getWeek', { familyId, weekStartsOn, locale }] as const,
  dates: (familyId: string, month: string, locale: Locale) => ['menu', 'getDates', { familyId, month, locale }] as const,
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

export function meQuery({ api, queryClient, locale }: QueryDeps) {
  const queryKey = queryKeys.me(locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.me.get({ knownVersion })), select });
}

export function openingQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = queryKeys.opening(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getOpening({ familyId, knownVersion })), select });
}

export function weekQuery({ api, queryClient, locale }: QueryDeps, familyId: string, weekStartsOn: IsoDate) {
  const queryKey = queryKeys.week(familyId, weekStartsOn, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getWeek({ familyId, weekStartsOn, knownVersion })), select });
}

export function datesQuery({ api, queryClient, locale }: QueryDeps, familyId: string, month: string) {
  const queryKey = queryKeys.dates(familyId, month, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.menu.getDates({ familyId, month, knownVersion })), select });
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

import { queryOptions } from '@tanstack/react-query';
import type { Locale } from '../i18n/translate';
import { readThrough, type QueryDeps, type Versioned } from './queries';

export const familyKeys = {
  family: (familyId: string, locale: Locale) => ['family', 'get', { familyId, locale }] as const,
  settings: (familyId: string, locale: Locale) => ['family', 'getSettings', { familyId, locale }] as const,
  exclusions: (familyId: string, locale: Locale) => ['family', 'listExclusions', { familyId, locale }] as const
};

const select = <T,>(value: Versioned<T>) => value.data;

export function familyQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = familyKeys.family(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.family.get({ familyId, knownVersion })), select });
}

export function settingsQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = familyKeys.settings(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.family.getSettings({ familyId, knownVersion })), select });
}

export function exclusionsQuery({ api, queryClient, locale }: QueryDeps, familyId: string) {
  const queryKey = familyKeys.exclusions(familyId, locale);
  return queryOptions({ queryKey, queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.family.listExclusions({ familyId, knownVersion })), select });
}

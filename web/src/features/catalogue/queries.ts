import { hashKey, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { ProfileView } from '../../api/types';
import { useCallback, useEffect } from 'react';
import { useApi } from '../../api/ApiProvider';
import { isBlocking, toApiError } from '../../api/errors';
import { useLocale } from '../../i18n/LocaleProvider';
import { profileQuery } from '../../api/profile';
import { useQueryDeps } from '../../api/queries';

export const catalogueKeys = {
  overview: (locale: string) => ['catalogue', 'overview', { locale }] as const,
  draft: (draftId: string, locale: string) => ['catalogue', 'getDraft', { draftId, locale }] as const
};
/** Prefix of the profile read (queryKeys.profile): its globalRoles say who curates. */
const PROFILE_KEY = ['profile', 'get'] as const;

/**
 * `recipe_curator` in the profile; false until the profile is read (spec section 1: global role,
 * no family). The sections read the profile the family gate keeps fresh: mounting them does not
 * read it again (a revocation invalidates it, see below).
 */
function useCachedProfile() {
  return useQuery({ ...profileQuery(useQueryDeps()), refetchOnMount: false });
}

export function useIsCurator(): boolean {
  return useCachedProfile().data?.user.globalRoles.includes('recipe_curator') ?? false;
}

/** The profile read itself: before it succeeds nobody is a curator yet, and a failed first read is an error, not a wait. */
export function useProfileRead() {
  return useCachedProfile();
}

/**
 * Role revoked while the profile is still cached (spec of W3, section 5): the profile is read
 * again first, then every catalogue view leaves memory and disk and the sections go away. If the
 * profile still says curator, the refused read keeps its error (which hides its data) instead of
 * being removed, so a server and a profile that disagree never loop.
 */
export function useCatalogueRevocation() {
  const queryClient = useQueryClient();
  return useCallback(
    async (error: unknown, failing?: QueryKey) => {
      if (toApiError(error).code !== 'forbidden') return;
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      const stillCurator = queryClient
        .getQueriesData<ProfileView>({ queryKey: PROFILE_KEY })
        .some(([, profile]) => profile?.user.globalRoles.includes('recipe_curator'));
      const kept = stillCurator && failing ? hashKey(failing) : null;
      queryClient.removeQueries({ queryKey: ['catalogue'], predicate: (query) => query.queryHash !== kept });
    },
    [queryClient]
  );
}

/** A catalogue read as the other screens do it: the stored copy stays only for a network error. */
function useCatalogueQuery<T>(options: { queryKey: QueryKey; queryFn: () => Promise<T> }, enabled: boolean) {
  const revoke = useCatalogueRevocation();
  const query = useQuery({ ...options, enabled });
  const { error, isError } = query;
  const key = hashKey(options.queryKey);
  useEffect(() => {
    if (isError) void revoke(error, JSON.parse(key) as QueryKey);
  }, [error, isError, key, revoke]);
  const blocked = query.isError && isBlocking(query.error, query.data !== undefined);
  return { query, data: blocked ? undefined : query.data, blocked };
}

export function useOverview(enabled: boolean) {
  const api = useApi();
  const { locale } = useLocale();
  return useCatalogueQuery({ queryKey: catalogueKeys.overview(locale), queryFn: () => api.catalogue.overview({}) }, enabled);
}

export function useDraft(draftId: string, enabled: boolean) {
  const api = useApi();
  const { locale } = useLocale();
  return useCatalogueQuery({ queryKey: catalogueKeys.draft(draftId, locale), queryFn: () => api.catalogue.getDraft({ draftId }) }, enabled);
}

/** No optimistic update: after the server answer the overview is read again and the recipe views go stale. */
export function useBringBack() {
  const api = useApi();
  const queryClient = useQueryClient();
  const revoke = useCatalogueRevocation();
  return useMutation({
    mutationFn: (recipeId: string) => api.catalogue.setArchived({ recipeId, archived: false }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['catalogue', 'overview'] });
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
    },
    onError: (error) => revoke(error)
  });
}

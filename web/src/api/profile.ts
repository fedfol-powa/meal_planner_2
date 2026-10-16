import { queryOptions } from '@tanstack/react-query';
import { familyAccessOf, queryKeys, type QueryDeps } from './queries';
import type { ProfileView } from './types';

export function profileQuery({ api, queryClient, locale }: QueryDeps) {
  const queryKey = queryKeys.profile(locale);
  // Not versioned on the server (spec, Profilo): the cache holds the view itself.
  return queryOptions({
    queryKey,
    queryFn: async () => {
      // Families gone are revoked on the device, families back are restored (spec W11, «Dati sul dispositivo»).
      const access = familyAccessOf(queryClient);
      const startedAt = access.now();
      const profile = await api.profile.get({});
      access.profileRead(queryClient.getQueryData<ProfileView>(queryKey), profile, startedAt);
      return profile;
    }
  });
}

import { queryOptions } from '@tanstack/react-query';
import { queryKeys, type QueryDeps } from './queries';

export function profileQuery({ api, locale }: QueryDeps) {
  // Not versioned on the server (spec, Profilo): the cache holds the view itself.
  return queryOptions({ queryKey: queryKeys.profile(locale), queryFn: () => api.profile.get({}) });
}

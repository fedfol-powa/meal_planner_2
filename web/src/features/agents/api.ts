import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';

/** Not versioned: the grants live in Supabase Auth, outside the version counters. */
export function agentsQuery({ api }: QueryDeps) {
  return queryOptions({ queryKey: ['agents', 'list', {}] as const, queryFn: () => api.agents.list({}) });
}

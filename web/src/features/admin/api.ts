import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';

/** Not versioned: read again after every creation or revocation (spec W9). */
export function appInvitationsQuery({ api }: QueryDeps) {
  return queryOptions({ queryKey: ['appInvitations', 'list', {}] as const, queryFn: () => api.appInvitations.list({}) });
}

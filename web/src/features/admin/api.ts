import { queryOptions } from '@tanstack/react-query';
import type { QueryDeps } from '../../api/queries';

/** Not versioned: read again after every creation or revocation (spec W9). */
export function appInvitationsQuery({ api }: QueryDeps) {
  return queryOptions({ queryKey: ['appInvitations', 'list', {}] as const, queryFn: () => api.appInvitations.list({}) });
}

/** Not versioned: read again after every role change (spec W10). */
export function usersQuery({ api }: QueryDeps, query: string) {
  return queryOptions({ queryKey: ['users', 'list', { query }] as const, queryFn: () => api.users.list(query ? { query } : {}) });
}

export function userQuery({ api }: QueryDeps, id: string) {
  return queryOptions({ queryKey: ['users', 'get', { id }] as const, queryFn: () => api.users.get({ id }) });
}

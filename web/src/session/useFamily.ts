import { useQuery } from '@tanstack/react-query';
import { isBlocking } from '../api/errors';
import { meQuery, useQueryDeps } from '../api/queries';
import type { FamilyView, MeView } from '../api/types';
import { useSession, useSessionRevision } from './SessionScope';

export type FamilyState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'none' }
  | { status: 'revoked' }
  | { status: 'ready'; family: FamilyView; me: MeView };

export function useMe() {
  return useQuery(meQuery(useQueryDeps()));
}

/** Loading, error, no family, revoked family or ready: screens never wait forever (review, finding 9). */
export function useFamily(): FamilyState {
  const me = useMe();
  const session = useSession();
  useSessionRevision();
  if (me.isError && isBlocking(me.error, !!me.data)) return { status: 'error', error: me.error, retry: () => void me.refetch() };
  if (!me.data) return { status: 'loading' };
  const family = me.data.families.find((f) => f.id === me.data.currentFamilyId);
  if (!family) return { status: 'none' };
  if (session.isRevoked(family.id)) return { status: 'revoked' };
  return { status: 'ready', family, me: me.data };
}

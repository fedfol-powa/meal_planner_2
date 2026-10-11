import { useQuery } from '@tanstack/react-query';
import { isBlocking } from '../api/errors';
import { profileQuery } from '../api/profile';
import { useQueryDeps } from '../api/queries';
import type { FamilyView, ProfileView } from '../api/types';
import { useSession, useSessionRevision } from './SessionScope';

export type FamilyState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'none' }
  | { status: 'revoked' }
  | { status: 'ready'; family: FamilyView; profile: ProfileView };

export function useProfile() {
  return useQuery(profileQuery(useQueryDeps()));
}

/** Loading, error, no family, revoked family or ready: screens never wait forever (review, finding 9). */
export function useFamily(): FamilyState {
  const profile = useProfile();
  const session = useSession();
  useSessionRevision();
  if (profile.isError && isBlocking(profile.error, !!profile.data)) return { status: 'error', error: profile.error, retry: () => void profile.refetch() };
  if (!profile.data) return { status: 'loading' };
  const family = profile.data.families.find((f) => f.id === profile.data.currentFamilyId);
  if (!family) return { status: 'none' };
  if (session.isRevoked(family.id)) return { status: 'revoked' };
  return { status: 'ready', family, profile: profile.data };
}

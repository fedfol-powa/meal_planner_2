import { useQuery } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { profileQuery } from '../api/profile';
import { useQueryDeps, weekQuery } from '../api/queries';
import type { Api, ProfileView } from '../api/types';
import { createStubBackend } from '../test/stubBackend';
import { renderSession } from '../test/sessionHarness';
import { useSession, useSessionRevision } from './SessionScope';

const A = { id: 'a', email: 'a@example.com' };
const FAMILY = 'f';

const profileOf = (patch: Partial<ProfileView> = {}): ProfileView => ({
  user: { id: 'a', displayName: 'Anna', email: 'a@example.com', locale: 'it-IT', globalRoles: [] },
  families: [{ id: FAMILY, name: 'Famiglia', role: 'member', timeZone: 'Europe/Rome', measurementSystem: 'metric' }],
  currentFamilyId: FAMILY,
  ...patch
});

/** Fake client whose profile answers come from a script, one per call; calls are noted. */
function scripted(answers: (() => Promise<ProfileView>)[], calls: string[], getWeek?: () => Promise<never>) {
  return (): Api => {
    const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    let next = 0;
    const get = () => {
      calls.push('profile.get');
      return answers[Math.min(next++, answers.length - 1)]!();
    };
    return { ...base, profile: { ...base.profile, get }, menu: { ...base.menu, getWeek: getWeek ?? base.menu.getWeek } } as Api;
  };
}

function ProfileProbe() {
  const session = useSession();
  useSessionRevision();
  const profile = useQuery(profileQuery(useQueryDeps()));
  const week = useQuery({ ...weekQuery(useQueryDeps(), FAMILY, '2026-10-05'), enabled: false });
  return (
    <>
      <p>current: {profile.data?.currentFamilyId ?? '-'}</p>
      <p>{session.isRevoked(FAMILY) ? 'revoked' : 'allowed'}</p>
      <button onClick={() => void week.refetch()}>week</button>
    </>
  );
}

describe('profile through the session', () => {
  it('reads the profile, renewing the session once on unauthorized', async () => {
    const backend = createStubBackend(A);
    const calls: string[] = [];
    renderSession(<ProfileProbe />, { backend, api: scripted([() => Promise.reject(new ApiError('unauthorized')), async () => profileOf()], calls) });
    await screen.findByText(`current: ${FAMILY}`);
    expect(calls).toEqual(['profile.get', 'profile.get']);
    expect(backend.refreshCalls).toBe(1);
  });
  it('revokes the family and reads the profile again after forbidden on a family call', async () => {
    const calls: string[] = [];
    const refuse = () => Promise.reject(new ApiError('forbidden')) as Promise<never>;
    const api = scripted([async () => profileOf(), async () => profileOf({ families: [], currentFamilyId: null })], calls, refuse);
    renderSession(<ProfileProbe />, { backend: createStubBackend(A), api });
    await screen.findByText(`current: ${FAMILY}`);
    fireEvent.click(screen.getByText('week'));
    await screen.findByText('revoked');
    await screen.findByText('current: -');
    expect(calls).toEqual(['profile.get', 'profile.get']);
  });
  it('keeps the view itself in the cache: the profile is not versioned', async () => {
    let cached: unknown;
    function CacheProbe() {
      const deps = useQueryDeps();
      const profile = useQuery(profileQuery(deps));
      if (profile.data) cached = deps.queryClient.getQueryData(profileQuery(deps).queryKey);
      return <p>{profile.data ? 'read' : 'waiting'}</p>;
    }
    renderSession(<CacheProbe />, { backend: createStubBackend(A), api: scripted([async () => profileOf()], []) });
    await screen.findByText('read');
    await waitFor(() => expect(cached).toMatchObject({ currentFamilyId: FAMILY, user: { displayName: 'Anna' } }));
  });
});

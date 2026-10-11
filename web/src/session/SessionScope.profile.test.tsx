import { useQuery } from '@tanstack/react-query';
import { ORPCError } from '@orpc/client';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { realClients } from '../api/clients';
import { ApiError } from '../api/errors';
import { createRpcClient } from '../api/rpc';
import { createRpcTestServer, SERVER_FAMILY, SERVER_PROFILE, serverSettings } from '../test/rpcServer';
import { familyQuery, settingsQuery } from '../api/family';
import { useAreaMutation } from '../api/mutations';
import { useFamily } from './useFamily';
import { createFakeApi } from '../api/fake/fakeApi';
import { profileQuery } from '../api/profile';
import { useQueryDeps, weekQuery } from '../api/queries';
import type { Api, ProfileView } from '../api/types';
import { createStubBackend } from '../test/stubBackend';
import { renderSession } from '../test/sessionHarness';
import { useLocale } from '../i18n/LocaleProvider';
import { useChooseLocale, useSession, useSessionRevision, type CreateApi } from './SessionScope';

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

/** Real clients on the test server; the token changes at each renewal, like Supabase's. */
function realSetup(user: { id: string; email: string } = A) {
  const server = createRpcTestServer();
  const backend = createStubBackend(user);
  const rpc = createRpcClient({
    getCredentials: async () => {
      const current = await backend.getCredentials();
      return current && { ...current, accessToken: `${current.accessToken}#${backend.refreshCalls}` };
    },
    fetch: server.fetch
  });
  const createApi = realClients({ rpc, latencyMs: 0 });
  return { server, backend, createApi };
}

/** The profile goes to the Worker in real mode (PR #18 review): realClients → RPC link → RPC handler. */
describe('profile from the Worker, through SessionScope', () => {
  const B = { id: 'b', email: 'b@example.com' };
  const named = (displayName: string): ProfileView => ({ ...SERVER_PROFILE, user: { ...SERVER_PROFILE.user, displayName } });

  function NameProbe() {
    const session = useSession();
    useSessionRevision();
    const profile = useQuery(profileQuery(useQueryDeps()));
    const week = useQuery({ ...weekQuery(useQueryDeps(), SERVER_PROFILE.currentFamilyId!, '2026-10-05'), enabled: false });
    return (
      <>
        <p>name: {profile.data?.user.displayName ?? '-'}</p>
        <p>current: {profile.data?.currentFamilyId ?? '-'}</p>
        <p>{session.isRevoked(SERVER_PROFILE.currentFamilyId!) ? 'revoked' : 'allowed'}</p>
        <button onClick={() => void week.refetch()}>week</button>
      </>
    );
  }

  it('shows the profile answered by the server, not the demo data', async () => {
    const { server, backend, createApi } = realSetup();
    server.answerProfile(() => named('Giulia dal Worker'));
    renderSession(<NameProbe />, { backend, createApi });
    await screen.findByText('name: Giulia dal Worker');
    expect(server.profileSeen).toEqual(['Bearer token-of-a#0']);
    expect(server.fetch.mock.calls.map(([request]) => new URL(request.url).pathname)).toContain('/api/rpc/profile/get');
  });

  it('renews once on unauthorized and reads again with the new credentials', async () => {
    const { server, backend, createApi } = realSetup();
    server.answerProfile((authorization) => {
      if (authorization === 'Bearer token-of-a#0') throw new ORPCError('unauthorized');
      return named('Dopo il rinnovo');
    });
    renderSession(<NameProbe />, { backend, createApi });
    await screen.findByText('name: Dopo il rinnovo');
    expect(backend.refreshCalls).toBe(1);
    expect(server.profileSeen).toEqual(['Bearer token-of-a#0', 'Bearer token-of-a#1']);
    expect(backend.signOutCalls).toBe(0);
  });

  it('never shows the answer for A that arrives after B signed in', async () => {
    const { server, backend, createApi } = realSetup();
    let releaseA: () => void = () => {};
    server.answerProfile((authorization) =>
      authorization?.startsWith('Bearer token-of-a') ? new Promise((resolve) => (releaseA = () => resolve(named('Profilo di A')))) : named('Profilo di B')
    );
    renderSession(<NameProbe />, { backend, createApi });
    await waitFor(() => expect(server.profileSeen).toEqual(['Bearer token-of-a#0']));
    act(() => backend.setUser(B));
    await screen.findByText('name: Profilo di B');
    await act(async () => releaseA());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('name: Profilo di B')).toBeTruthy();
    expect(screen.queryByText('name: Profilo di A')).toBeNull();
    expect(server.profileSeen).toEqual(['Bearer token-of-a#0', 'Bearer token-of-b#0']);
  });

  it('reads the profile again from the server after forbidden on a family call', async () => {
    const { server, backend, createApi } = realSetup();
    let reads = 0;
    server.answerProfile(() => (reads++ === 0 ? SERVER_PROFILE : { ...SERVER_PROFILE, families: [], currentFamilyId: null }));
    // The menu is still provisional (fake): it refuses, as the Worker would for a family left meanwhile.
    const refusing: CreateApi = (user) => {
      const forLocale = createApi(user);
      return (locale) => {
        const api = forLocale(locale);
        return { ...api, menu: { ...api.menu, getWeek: () => Promise.reject(new ApiError('forbidden')) } } as Api;
      };
    };
    renderSession(<NameProbe />, { backend, createApi: refusing });
    await screen.findByText(`current: ${SERVER_PROFILE.currentFamilyId}`);
    fireEvent.click(screen.getByText('week'));
    await screen.findByText('revoked');
    await screen.findByText('current: -');
    expect(server.profileSeen).toHaveLength(2);
  });
});

describe('language answers out of order (PR #21 review, finding 3)', () => {
  it('never goes back to a language whose answer was superseded', async () => {
    const answers: { locale: 'it-IT' | 'en-GB'; resolve: () => void }[] = [];
    // The server keeps the language of the last write it processed; answers are released by the test.
    let saved: 'it-IT' | 'en-GB' = 'it-IT';
    const withLocale = (locale: 'it-IT' | 'en-GB') => profileOf({ user: { ...profileOf().user, locale } });
    const createApi: CreateApi = () => () => {
      const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, user: A });
      const update = ((input: { locale: 'it-IT' | 'en-GB' }) => {
        saved = input.locale;
        return new Promise<ProfileView>((resolve) => answers.push({ locale: input.locale, resolve: () => resolve(withLocale(input.locale)) }));
      }) as unknown as Api['profile']['update'];
      return { ...base, profile: { ...base.profile, get: async () => withLocale(saved), update } } as Api;
    };
    let cachedLocales: string[] = [];
    function LocaleProbe() {
      const choose = useChooseLocale();
      const { locale } = useLocale();
      const deps = useQueryDeps();
      useQuery(profileQuery(deps));
      cachedLocales = deps.queryClient.getQueriesData<ProfileView>({ queryKey: ['profile', 'get'] }).map(([, data]) => data?.user.locale ?? '-');
      return (
        <>
          <p>locale: {locale}</p>
          <button onClick={() => void choose('en-GB')}>english</button>
          <button onClick={() => void choose('it-IT')}>italian</button>
        </>
      );
    }
    renderSession(<LocaleProbe />, { backend: createStubBackend(A), createApi });
    await screen.findByText('locale: it-IT');
    fireEvent.click(screen.getByText('english'));
    fireEvent.click(screen.getByText('english'));
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => answers[1]!.resolve());
    await screen.findByText('locale: en-GB');
    fireEvent.click(screen.getByText('italian'));
    await waitFor(() => expect(answers).toHaveLength(3));
    await act(async () => answers[2]!.resolve());
    await screen.findByText('locale: it-IT');
    // The first English answer arrives last: superseded, it changes nothing.
    await act(async () => answers[0]!.resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText('locale: it-IT')).toBeTruthy();
    expect(cachedLocales.every((locale) => locale !== 'en-GB')).toBe(true);
  });
});

const withSundayLunch = (servings: number) => {
  const view = serverSettings();
  view.settings.slots.lunch[6] = { servings, fixedText: null, maxMinutes: null };
  return view;
};

/** The family area goes to the Worker too, with the family of the real profile (PR #18 second review). */
describe('family from the Worker, through SessionScope', () => {
  const familyId = SERVER_FAMILY.id;

  function FamilyProbe() {
    const deps = useQueryDeps();
    const state = useFamily();
    const session = useSession();
    useSessionRevision();
    const ready = state.status === 'ready';
    const detail = useQuery({ ...familyQuery(deps, familyId), enabled: ready });
    const settings = useQuery({ ...settingsQuery(deps, familyId), enabled: ready });
    const setMeal = useAreaMutation('family.setMeal', familyId, (servings: number) =>
      deps.api.family.setMeal({ familyId, mealType: 'lunch', weekday: 6, servings, fixedText: null, maxMinutes: null })
    );
    return (
      <>
        <p>family: {ready ? state.family.name : state.status}</p>
        <p>members: {detail.data?.members.map((m) => m.displayName).join(', ') ?? '-'}</p>
        <p>sunday lunch: {settings.data?.settings.slots.lunch[6]?.servings ?? '-'}</p>
        <p>{session.isRevoked(familyId) ? 'revoked' : 'allowed'}</p>
        <button onClick={() => setMeal.mutate(3)}>three</button>
      </>
    );
  }

  it('reads the family of the real profile and its views from the server', async () => {
    const { server, backend, createApi } = realSetup();
    renderSession(<FamilyProbe />, { backend, createApi });
    await screen.findByText('family: Famiglia dal server');
    await screen.findByText('members: Amministratrice dal server, Persona dal server');
    await screen.findByText('sunday lunch: 2');
    expect(server.familySeen).toEqual(
      expect.arrayContaining([
        { operation: 'get', authorization: 'Bearer token-of-a#0' },
        { operation: 'getSettings', authorization: 'Bearer token-of-a#0' }
      ])
    );
  });

  it('renews once on unauthorized from a family read', async () => {
    const { server, backend, createApi } = realSetup();
    const settings = server.familySeen;
    server.answerFamily({
      getSettings: (authorization) => {
        if (authorization === 'Bearer token-of-a#0') throw new ORPCError('unauthorized');
        return { unchanged: false, version: 'v1', data: withSundayLunch(4) };
      }
    });
    renderSession(<FamilyProbe />, { backend, createApi });
    await screen.findByText('sunday lunch: 4');
    expect(backend.refreshCalls).toBe(1);
    expect(settings.filter((call) => call.operation === 'getSettings').map((call) => call.authorization)).toEqual(['Bearer token-of-a#0', 'Bearer token-of-a#1']);
  });

  it('revokes the family and reads the real profile again after forbidden from the server', async () => {
    const { server, backend, createApi } = realSetup();
    let reads = 0;
    server.answerProfile(() => (reads++ === 0 ? SERVER_PROFILE : { ...SERVER_PROFILE, families: [], currentFamilyId: null }));
    server.answerFamily({
      getSettings: () => {
        throw new ORPCError('forbidden');
      }
    });
    renderSession(<FamilyProbe />, { backend, createApi });
    await screen.findByText('revoked');
    await screen.findByText('family: none');
    expect(server.profileSeen).toHaveLength(2);
  });

  it('writes the answer of a family mutation sent through the real client', async () => {
    const { server, backend, createApi } = realSetup();
    renderSession(<FamilyProbe />, { backend, createApi });
    await screen.findByText('sunday lunch: 2');
    fireEvent.click(screen.getByText('three'));
    await screen.findByText('sunday lunch: 3');
    expect(server.familySeen.filter((call) => call.operation === 'setMeal')).toEqual([{ operation: 'setMeal', authorization: 'Bearer token-of-a#0' }]);
  });
});

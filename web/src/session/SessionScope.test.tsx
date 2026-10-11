import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { cacheKey, createMemoryStore } from '../api/persister';
import { meQuery, useQueryDeps, weekQuery } from '../api/queries';
import type { Api, MeView, Read, WeekView } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useLocale } from '../i18n/LocaleProvider';
import { createMemoryHub } from '../test/memoryChannel';
import { setOnline } from '../test/connectivity';
import { createStubBackend } from '../test/stubBackend';
import { renderSession } from '../test/sessionHarness';
import { readPreference, userScope, writePreference } from './localePreference';
import { useChooseLocale, useSession, useSessionRevision, useSignOut } from './SessionScope';

const A = { id: 'a', email: 'a@example.com' };
const B = { id: 'b', email: 'b@example.com' };

const meOf = (id: string | null, locale: 'it-IT' | 'en-GB' = 'it-IT'): Read<MeView> => ({
  unchanged: false,
  version: `me:${id}`,
  data: { user: { id: id ?? 'anon', displayName: (id ?? 'anon').toUpperCase(), email: '', locale }, families: [], currentFamilyId: null }
});

/** Fake data client whose profile read can be replaced per user. */
function api(me: (id: string | null) => Promise<Read<MeView>>) {
  return (id: string | null) => {
    const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    return { ...base, me: { get: () => me(id) } } as Api;
  };
}

function Probe() {
  const { state } = useAuth();
  const me = useQuery({ ...meQuery(useQueryDeps()), enabled: state.status === 'signedIn' });
  const signOut = useSignOut();
  const choose = useChooseLocale();
  const { locale } = useLocale();
  return (
    <>
      <p>auth: {state.status}</p>
      <p>name: {me.data?.user.displayName ?? '-'}</p>
      <p>locale: {locale}</p>
      <button onClick={() => void signOut()}>out</button>
      <button onClick={() => choose('en-GB')}>english</button>
    </>
  );
}

describe('closing the session', () => {
  it('cleans up locally on sign-out even when the service fails, and nothing comes back on reopening', async () => {
    const backend = createStubBackend(A);
    backend.signOutError = new Error('offline');
    const { store, unmount } = renderSession(<Probe />, { backend, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: A');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));
    fireEvent.click(screen.getByText('out'));
    await screen.findByText('auth: signedOut');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
    expect(backend.signOutCalls).toBe(1);
    unmount();
    // Reopen as A without network: no stored copy to restore.
    const reopened = createStubBackend(A);
    renderSession(<Probe />, { backend: reopened, store, api: api(() => new Promise(() => {})) });
    await screen.findByText('auth: signedIn');
    expect(screen.getByText('name: -')).toBeTruthy();
  });
  it('closes the session when another tab signs out', async () => {
    const backend = createStubBackend(A);
    const { store } = renderSession(<Probe />, { backend, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: A');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));
    act(() => backend.setUser(null));
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
    expect(screen.queryByText('name: A')).toBeNull();
  });
  it('drops answers still pending when the user changes and keeps only the new user on disk', async () => {
    let releaseA: (value: Read<MeView>) => void = () => {};
    const backend = createStubBackend(A);
    const { store } = renderSession(<Probe />, {
      backend,
      api: api((id) => (id === 'a' ? new Promise((resolve) => (releaseA = resolve)) : Promise.resolve(meOf(id))))
    });
    await screen.findByText('auth: signedIn');
    act(() => backend.setUser(B));
    await screen.findByText('name: B');
    await act(async () => releaseA(meOf('a')));
    expect(screen.queryByText('name: A')).toBeNull();
    await waitFor(() => expect([...store.entries.keys()]).toEqual([cacheKey('b')]));
  });
  it('removes copies of other users when it starts', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('old'), {});
    renderSession(<Probe />, { backend: createStubBackend(B), store, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: B');
    await waitFor(() => expect(store.entries.has(cacheKey('old'))).toBe(false));
  });
});

describe('access refused by the server', () => {
  it('renews the session once on unauthorized and reads again', async () => {
    const backend = createStubBackend(A);
    let calls = 0;
    renderSession(<Probe />, { backend, api: api(async (id) => (calls++ === 0 ? Promise.reject(new ApiError('unauthorized')) : meOf(id))) });
    await screen.findByText('name: A');
    expect(backend.refreshCalls).toBe(1);
    expect(backend.signOutCalls).toBe(0);
  });
  it('signs out when the renewal is refused', async () => {
    const backend = createStubBackend(A);
    backend.refreshResult = false;
    const { store } = renderSession(<Probe />, { backend, api: api(() => Promise.reject(new ApiError('unauthorized'))) });
    await screen.findByText('auth: signedOut');
    expect(backend.signOutCalls).toBe(1);
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
  });
  it('signs out when the server refuses again after a renewal', async () => {
    const backend = createStubBackend(A);
    renderSession(<Probe />, { backend, api: api(() => Promise.reject(new ApiError('unauthorized'))) });
    await screen.findByText('auth: signedOut');
    expect(backend.refreshCalls).toBe(1);
  });
  it('removes a forbidden family from memory and disk, also after reopening', async () => {
    const week = { startsOn: '2026-10-05', days: [] } as WeekView;
    let refuse = false;
    const familyApi = (id: string | null) => {
      const base = api(async () => meOf(id))(id);
      return { ...base, menu: { ...base.menu, getWeek: async () => (refuse ? Promise.reject(new ApiError('forbidden')) : { unchanged: false as const, version: 'w1', data: week }) } };
    };
    function WeekProbe({ enabled = true }: { enabled?: boolean }) {
      const session = useSession();
      useSessionRevision();
      // Like the real screens behind FamilyGate: no reads for a revoked family.
      const query = useQuery({ ...weekQuery(useQueryDeps(), 'f', '2026-10-05'), enabled: enabled && !session.isRevoked('f') });
      return (
        <>
          <p>week: {query.data ? 'shown' : 'none'}</p>
          <p>{session.isRevoked('f') ? 'revoked' : 'allowed'}</p>
          <button onClick={() => void query.refetch()}>reload</button>
        </>
      );
    }
    const backend = createStubBackend(A);
    const { store, unmount } = renderSession(<WeekProbe />, { backend, api: familyApi });
    await screen.findByText('week: shown');
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey('a')) ?? '')).toContain('getWeek'));
    refuse = true;
    fireEvent.click(screen.getByText('reload'));
    await screen.findByText('revoked');
    expect(screen.getByText('week: none')).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey('a')) ?? '')).not.toContain('getWeek'));
    unmount();
    renderSession(<WeekProbe enabled={false} />, { backend: createStubBackend(A), store, api: familyApi });
    await screen.findByText('allowed');
    expect(screen.getByText('week: none')).toBeTruthy();
  });
});

describe('language', () => {
  it('applies the profile language at each identity, forgetting the previous person\'s choice', async () => {
    const backend = createStubBackend(A);
    renderSession(<Probe />, { backend, api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('name: A');
    fireEvent.click(screen.getByText('english'));
    await screen.findByText('locale: en-GB');
    expect(readPreference(userScope('a'))).toBe('en-GB');
    fireEvent.click(screen.getByText('out'));
    await screen.findByText('auth: signedOut');
    expect(readPreference(userScope('a'))).toBeNull();
    act(() => backend.setUser(B));
    await screen.findByText('name: B');
    await screen.findByText('locale: it-IT');
  });
  it('ignores a device preference when a real profile exists, and uses it in fake mode', async () => {
    writePreference('device', 'en-GB');
    const real = renderSession(<Probe />, { backend: createStubBackend(B), api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('name: B');
    await screen.findByText('locale: it-IT');
    real.unmount();
    renderSession(<Probe />, { backend: createStubBackend(B, 'fake'), api: api(async (id) => meOf(id, 'it-IT')) });
    await screen.findByText('locale: en-GB');
  });
  it('never shows an answer in the previous language after a switch', async () => {
    let releaseItalian: (value: Read<WeekView>) => void = () => {};
    const weekIn = (label: string) => ({ startsOn: label, days: [] }) as WeekView;
    // Fake mode: no profile language to re-apply after the switch.
    const backend = createStubBackend(A, 'fake');
    function LanguageProbe() {
      const { setLocale } = useLocale();
      const week = useQuery(weekQuery(useQueryDeps(), 'f', '2026-10-05'));
      return <><p>week: {week.data?.startsOn ?? '-'}</p><button onClick={() => setLocale('en-GB')}>switch</button></>;
    }
    renderSession(<LanguageProbe />, {
      backend,
      locale: 'it-IT',
      api: (id) => {
        const base = api(async () => meOf(id))(id);
        let call = 0;
        return { ...base, menu: { ...base.menu, getWeek: () => (call++ === 0 ? new Promise((resolve) => (releaseItalian = resolve)) : Promise.resolve({ unchanged: false as const, version: 'en', data: weekIn('english') })) } };
      }
    });
    await screen.findByText('week: -');
    fireEvent.click(screen.getByText('switch'));
    await screen.findByText('week: english');
    await act(async () => releaseItalian({ unchanged: false, version: 'it', data: weekIn('italiano') }));
    expect(screen.queryByText('week: italiano')).toBeNull();
  });
});

const unauthorized = () => Promise.reject(new ApiError('unauthorized'));

describe('identity not known yet (second review, C1)', () => {
  async function storedCopyOfA() {
    const store = createMemoryStore();
    const first = renderSession(<Probe />, { backend: createStubBackend(A), store, api: api(async (id) => meOf(id)) });
    await screen.findByText('name: A');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(true));
    first.unmount();
    return store;
  }
  it.each(['signedIn', 'unverified'] as const)('keeps and shows the copy of the person coming back (%s)', async (status) => {
    const store = await storedCopyOfA();
    store.entries.set(cacheKey('someone-else'), {});
    const backend = createStubBackend(A);
    const answer = backend.holdCheck();
    act(() => setOnline(false));
    renderSession(<Probe />, { backend, store, api: api(() => Promise.reject(new ApiError('network'))) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Supabase has not answered: no session, nothing deleted.
    expect(screen.queryByText(/auth:/)).toBeNull();
    expect(store.entries.has(cacheKey('a'))).toBe(true);
    expect(store.entries.has(cacheKey('someone-else'))).toBe(true);
    await act(async () => answer({ status, user: A }));
    expect(await screen.findByText('name: A')).toBeTruthy();
    expect(store.entries.has(cacheKey('a'))).toBe(true);
    await waitFor(() => expect(store.entries.has(cacheKey('someone-else'))).toBe(false));
  });
  it('deletes every copy after a confirmed sign-out', async () => {
    const store = await storedCopyOfA();
    renderSession(<Probe />, { backend: createStubBackend(null), store, api: api(async (id) => meOf(id)) });
    await screen.findByText('auth: signedOut');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
  });
});

describe('renewals of a previous identity (second review, C3)', () => {
  it.each([true, false])('a renewal of A ending after B arrived leaves B signed in (renewed: %s)', async (ok) => {
    const backend = createStubBackend(A);
    const renew = backend.holdRefresh();
    renderSession(<Probe />, { backend, api: (id) => api(id === 'a' ? unauthorized : async () => meOf(id))(id) });
    await waitFor(() => expect(backend.refreshCalls).toBe(1));
    act(() => backend.setUser(B));
    await screen.findByText('name: B');
    await act(async () => renew(ok));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('name: B')).toBeTruthy();
    expect(screen.getByText('auth: signedIn')).toBeTruthy();
    expect(backend.signOutCalls).toBe(0);
  });
  it('signs out once when several reads are refused after the renewal', async () => {
    const backend = createStubBackend(A);
    function TwoReads() {
      const deps = useQueryDeps();
      useQuery(weekQuery(deps, 'f', '2026-10-05'));
      return <Probe />;
    }
    const familyApi = (id: string | null) => {
      const base = api(unauthorized)(id);
      return { ...base, menu: { ...base.menu, getWeek: unauthorized } } as Api;
    };
    renderSession(<TwoReads />, { backend, api: familyApi });
    await screen.findByText('auth: signedOut');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(backend.refreshCalls).toBe(1);
    expect(backend.signOutCalls).toBe(1);
  });
});

describe('other tabs of the same person (second review, C4)', () => {
  const week = { startsOn: '2026-10-05', days: [] } as WeekView;
  function tabApi(refuse: () => boolean) {
    return (id: string | null) => {
      const base = api(async () => meOf(id))(id);
      return { ...base, menu: { ...base.menu, getWeek: async () => (refuse() ? Promise.reject(new ApiError('forbidden')) : { unchanged: false as const, version: 'w1', data: week }) } } as Api;
    };
  }
  function WeekProbe() {
    const session = useSession();
    useSessionRevision();
    const query = useQuery({ ...weekQuery(useQueryDeps(), 'f', '2026-10-05'), enabled: !session.isRevoked('f') });
    const signOut = useSignOut();
    const { state } = useAuth();
    return (
      <>
        <p>week: {query.data ? 'shown' : 'none'}</p>
        <p>{session.isRevoked('f') ? 'revoked' : 'allowed'}</p>
        <p>auth: {state.status}</p>
        <button onClick={() => void query.refetch()}>reload</button>
        <button onClick={() => void signOut()}>out</button>
      </>
    );
  }
  it('a revocation in one tab removes the family in the other, and nothing writes it back', async () => {
    const store = createMemoryStore();
    const hub = createMemoryHub();
    let refuse = false;
    const one = renderSession(<WeekProbe />, { backend: createStubBackend(A), store, channel: hub.channel(), api: tabApi(() => refuse) });
    const two = renderSession(<WeekProbe />, { backend: createStubBackend(A), store, channel: hub.channel(), api: tabApi(() => false) });
    await within(one.container).findByText('week: shown');
    await within(two.container).findByText('week: shown');
    refuse = true;
    fireEvent.click(within(one.container).getByText('reload'));
    await within(one.container).findByText('revoked');
    // The other tab hears it and drops the family from memory.
    await within(two.container).findByText('revoked');
    expect(within(two.container).getByText('week: none')).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey('a')) ?? '')).not.toContain('getWeek'));
    one.unmount();
    two.unmount();
    // Reopening: the family is not restored.
    renderSession(<WeekProbe />, { backend: createStubBackend(A), store, channel: hub.channel(), api: tabApi(() => true) });
    await screen.findByText('auth: signedIn');
    expect(screen.getByText('week: none')).toBeTruthy();
  });
  it('a sign-out in one tab closes the session in the other, which does not write the copy again', async () => {
    const store = createMemoryStore();
    const hub = createMemoryHub();
    const one = renderSession(<WeekProbe />, { backend: createStubBackend(A), store, channel: hub.channel(), api: tabApi(() => false) });
    const two = renderSession(<WeekProbe />, { backend: createStubBackend(A), store, channel: hub.channel(), api: tabApi(() => false) });
    await within(one.container).findByText('week: shown');
    await within(two.container).findByText('week: shown');
    fireEvent.click(within(one.container).getByText('out'));
    await within(two.container).findByText('auth: signedOut');
    await waitFor(() => expect(store.entries.has(cacheKey('a'))).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(store.entries.has(cacheKey('a'))).toBe(false);
  });
});

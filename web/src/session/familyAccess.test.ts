import { dehydrate, QueryObserver } from '@tanstack/react-query';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaleAfterRevocationError } from '../api/errors';
import { familyKeys } from '../api/family';
import { runAreaMutation } from '../api/mutations';
import { CACHE_SCHEMA, cacheKey, createMemoryStore, revokedKey } from '../api/persister';
import { profileQuery } from '../api/profile';
import { queryKeys, readThrough, weekQuery, type QueryDeps, type Versioned } from '../api/queries';
import type { Api, FamilyDetailView, ProfileView, WeekView } from '../api/types';
import { createShoppingQueue } from '../features/shopping/queue/queue';
import { FAMILY, grams, MONDAY, ops, OTHER_FAMILY, RICE, TOMATO, USER } from '../features/shopping/fixtures';
import { setOnline } from '../test/connectivity';
import type { SessionChannel, SessionMessage } from './channel';
import { createSession, persisterOf, type Session } from './session';

type Store = ReturnType<typeof createMemoryStore>;
type Week = Versioned<WeekView>;

afterEach(() => setOnline(true));

/** The device clock, moved by the test. */
function clock(start = 10) {
  let time = start;
  return { now: () => time, at: (next: number) => void (time = next) };
}

/** What a tab posts, delivered to the other tabs only when the test says so. */
function outbox() {
  const sent: SessionMessage[] = [];
  const channel: SessionChannel = { post: (message) => void sent.push(structuredClone(message)), subscribe: () => () => undefined };
  return { sent, channel };
}
const deliver = (messages: SessionMessage[], tab: Session) => messages.forEach((message) => tab.receive(message));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const profileWith = (...families: string[]): ProfileView => ({
  user: { id: USER, displayName: 'Anna', email: 'anna@example.com', locale: 'it-IT', globalRoles: [] },
  families: families.map((id) => ({ id, name: id, role: 'member', timeZone: 'Europe/Rome', measurementSystem: 'metric' })),
  currentFamilyId: families[0] ?? null
});

/** The server: the families of the profile and one version of every week. */
function server() {
  let families = [FAMILY, OTHER_FAMILY];
  const version = 'v1';
  const getWeek = vi.fn(async ({ familyId, weekStartsOn, knownVersion }: { familyId: string; weekStartsOn: string; knownVersion?: string }) =>
    knownVersion === version ? { unchanged: true as const, version } : { unchanged: false as const, version, data: { familyId, weekStartsOn } as unknown as WeekView }
  );
  const getProfile = vi.fn(async () => profileWith(...families));
  const api = { profile: { get: getProfile }, menu: { getWeek } } as unknown as Api;
  return { api, getWeek, getProfile, families: (...next: string[]) => void (families = next) };
}

const depsOf = (session: Session, api: Api): QueryDeps => ({ api, queryClient: session.queryClient, locale: 'it-IT' });
const weekKey = (familyId = FAMILY, monday = MONDAY) => queryKeys.week(familyId, monday, 'it-IT');
const readProfile = (session: Session, api: Api) => session.queryClient.fetchQuery(profileQuery(depsOf(session, api)));
const readWeek = (session: Session, api: Api, familyId = FAMILY, monday = MONDAY) => session.queryClient.fetchQuery(weekQuery(depsOf(session, api), familyId, monday));
const cachedWeek = (session: Session, familyId = FAMILY, monday = MONDAY) => session.queryClient.getQueryData<Week>(weekKey(familyId, monday));
/** A screen showing the week: the query is active, so it is read again when invalidated. */
function watchWeek(session: Session, api: Api) {
  const observer = new QueryObserver(session.queryClient, weekQuery(depsOf(session, api), FAMILY, MONDAY));
  observer.subscribe(() => undefined);
  return observer;
}
const markOf = (store: Store) => store.entries.get(revokedKey(USER, FAMILY));
const saveCopy = (session: Session, state = dehydrate(session.queryClient)) =>
  persisterOf(session)!.persistClient({ timestamp: Date.now(), buster: CACHE_SCHEMA, clientState: state });
const savedFamilies = (store: Store) =>
  ((store.entries.get(cacheKey(USER)) as { clientState: ReturnType<typeof dehydrate> }).clientState.queries).map((query) => ({
    familyId: (query.queryKey[2] as { familyId?: string }).familyId,
    producedAt: (query.state.data as { producedAt?: number } | undefined)?.producedAt
  }));

describe('families gone from the profile (spec W11, «Dati sul dispositivo»)', () => {
  it('a family missing from a fresh profile is revoked: queries removed, mark written, shopping queue cleared', async () => {
    setOnline(false);
    const store = createMemoryStore();
    const time = clock();
    const session = createSession(USER, store, { now: time.now });
    const queue = createShoppingQueue({ session, send: vi.fn(), applyConfirmed: vi.fn(), locks: null, now: time.now });
    await queue.ready();
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.add(ops.tick(RICE, grams(300), OTHER_FAMILY), 'Riso');
    const { api, families } = server();
    await readProfile(session, api);
    await readWeek(session, api);
    await readWeek(session, api, OTHER_FAMILY);

    time.at(50);
    families(OTHER_FAMILY);
    await readProfile(session, api);

    expect(session.isRevoked(FAMILY)).toBe(true);
    expect(session.isRevoked(OTHER_FAMILY)).toBe(false);
    expect(cachedWeek(session)).toBeUndefined();
    expect(cachedWeek(session, OTHER_FAMILY)).toBeDefined();
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 50, restoredAt: 0 }));
    await vi.waitFor(() => expect(queue.record().ops.map((o) => o.label)).toEqual(['Riso']));
    queue.dispose();
  });
});

describe('restoring a family after an authorised return (decision 23)', () => {
  it('a second tab applies restored', async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const tabB = createSession(USER, store, { now: time.now });
    const { api } = server();
    time.at(100);
    tabA.revoke(FAMILY);
    deliver(a.sent.splice(0), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(true);

    time.at(200);
    await readProfile(tabA, api);
    expect(tabA.isRevoked(FAMILY)).toBe(false);
    expect(a.sent).toEqual([{ type: 'restored', userId: USER, familyId: FAMILY, startedAt: 200 }]);
    deliver(a.sent.splice(0), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(false);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));
  });

  it('a profile read started before a newer revocation does not restore', async () => {
    const store = createMemoryStore();
    const time = clock();
    const session = createSession(USER, store, { now: time.now });
    const { api, getProfile } = server();
    const late = deferred<ProfileView>();
    getProfile.mockImplementationOnce(() => late.promise);
    time.at(100);
    const reading = readProfile(session, api);
    time.at(150);
    session.revoke(FAMILY);
    time.at(160);
    late.resolve(profileWith(FAMILY, OTHER_FAMILY));
    await reading;
    expect(session.isRevoked(FAMILY)).toBe(true);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 150, restoredAt: 0 }));
    // A read started after the revocation is the server's confirmation.
    time.at(200);
    await readProfile(session, api);
    expect(session.isRevoked(FAMILY)).toBe(false);
  });

  it('delayed revoked then restored, and the reverse order, leave the family visible in the second tab', async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const inOrder = createSession(USER, store, { now: time.now });
    const reversed = createSession(USER, store, { now: time.now });
    const { api } = server();
    time.at(100);
    tabA.revoke(FAMILY);
    time.at(200);
    await readProfile(tabA, api);
    const messages = a.sent.splice(0);
    expect(messages.map((m) => m.type)).toEqual(['revoked', 'restored']);
    time.at(300);
    deliver(messages, inOrder);
    deliver([...messages].reverse(), reversed);
    expect(inOrder.isRevoked(FAMILY)).toBe(false);
    expect(reversed.isRevoked(FAMILY)).toBe(false);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));
    expect(inOrder.isRevoked(FAMILY)).toBe(false);
    expect(reversed.isRevoked(FAMILY)).toBe(false);
  });

  it('a confirmation read before the older revocation reaches the tab keeps the family, in both tabs (PR review, finding 3)', async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const b = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const tabB = createSession(USER, store, { now: time.now, channel: b.channel });
    const { api } = server();
    time.at(100);
    tabA.revoke(FAMILY);
    // Tab B reads the profile at 200, before the message of tab A arrives: the family is there.
    time.at(200);
    await readProfile(tabB, api);
    expect(tabB.isRevoked(FAMILY)).toBe(false);
    time.at(300);
    deliver(a.sent.splice(0), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(false);
    expect(b.sent).toEqual([{ type: 'restored', userId: USER, familyId: FAMILY, startedAt: 200 }]);
    deliver(b.sent.splice(0), tabA);
    expect(tabA.isRevoked(FAMILY)).toBe(false);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));
    // A revocation newer than the confirmation still wins.
    time.at(400);
    tabA.revoke(FAMILY);
    deliver(a.sent.splice(0), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(true);
  });

  it('a session whose profile is read before the marks of the device keeps the confirmed family', async () => {
    const store = createMemoryStore();
    const time = clock();
    const first = createSession(USER, store, { now: time.now });
    time.at(100);
    first.revoke(FAMILY);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 0 }));
    const { api } = server();
    const marks = deferred<void>();
    // The first read of the device (the marks, at the start of the session) waits for the test.
    let first_ = true;
    const slowStore: Store = {
      ...store,
      transact: async (prefixes, change) => {
        if (first_) {
          first_ = false;
          await marks.promise;
        }
        return store.transact(prefixes, change);
      }
    };
    time.at(200);
    const later = createSession(USER, slowStore, { now: time.now });
    await readProfile(later, api);
    marks.resolve();
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));
    expect(later.isRevoked(FAMILY)).toBe(false);
  });

  it('a real revocation after the rejoin wins in both tabs', async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const tabB = createSession(USER, store, { now: time.now });
    const { api } = server();
    time.at(100);
    tabA.revoke(FAMILY);
    time.at(200);
    await readProfile(tabA, api);
    time.at(300);
    tabA.revoke(FAMILY);
    const [revoked1, restored2, revoked3] = a.sent.splice(0);
    deliver([restored2!, revoked3!, revoked1!], tabB);
    expect(tabA.isRevoked(FAMILY)).toBe(true);
    expect(tabB.isRevoked(FAMILY)).toBe(true);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 300, restoredAt: 200 }));
    expect(tabB.isRevoked(FAMILY)).toBe(true);
  });

  it('reverse delivery removes the old queries and queued shopping operations from tab B and re-reads the family', async () => {
    setOnline(false);
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const tabB = createSession(USER, store, { now: time.now });
    const queue = createShoppingQueue({ session: tabB, send: vi.fn(), applyConfirmed: vi.fn(), locks: null, now: time.now });
    await queue.ready();
    const { api, getWeek } = server();
    watchWeek(tabB, api);
    await vi.waitFor(() => expect(cachedWeek(tabB)?.producedAt).toBe(10));
    await readWeek(tabB, api, FAMILY, '2026-10-05');
    time.at(20);
    await queue.add(ops.tick(TOMATO), 'Pomodori');

    time.at(100);
    tabA.revoke(FAMILY);
    time.at(200);
    await readProfile(tabA, api);
    time.at(250);
    await queue.add(ops.tick(RICE), 'Riso');

    time.at(300);
    deliver(a.sent.splice(0).reverse(), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(false);
    expect(cachedWeek(tabB, FAMILY, '2026-10-05')).toBeUndefined();
    // The week on screen is read again from the server, never kept from before the revocation.
    await vi.waitFor(() => expect(cachedWeek(tabB)?.producedAt).toBe(300));
    expect(getWeek).toHaveBeenLastCalledWith(expect.objectContaining({ familyId: FAMILY, knownVersion: undefined }), );
    await vi.waitFor(() => expect(queue.record().ops.map((o) => o.label)).toEqual(['Riso']));
    queue.dispose();
  });

  it('a late tab rewriting the old revocation keeps the family visible', async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const late = createSession(USER, store, { now: time.now });
    const { api } = server();
    time.at(100);
    tabA.revoke(FAMILY);
    time.at(200);
    await readProfile(tabA, api);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));
    // The late tab hears only of the old revocation, and writes it again.
    time.at(300);
    late.receive(a.sent[0]!);
    await vi.waitFor(() => expect(late.isRevoked(FAMILY)).toBe(false));
    expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 });
    expect(tabA.isRevoked(FAMILY)).toBe(false);
  });

  it('a third session started later does not restore queries older than the revocation and shows the family', async () => {
    const store = createMemoryStore();
    const time = clock();
    const first = createSession(USER, store, { now: time.now });
    const { api } = server();
    await readWeek(first, api);
    await readWeek(first, api, OTHER_FAMILY);
    await saveCopy(first);
    time.at(100);
    first.revoke(FAMILY);
    time.at(200);
    await readProfile(first, api);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));

    const third = createSession(USER, store, { now: time.now });
    await persistQueryClientRestore({ queryClient: third.queryClient, persister: persisterOf(third)!, buster: CACHE_SCHEMA });
    expect(cachedWeek(third)).toBeUndefined();
    expect(cachedWeek(third, OTHER_FAMILY)).toBeDefined();
    expect(third.isRevoked(FAMILY)).toBe(false);
  });

  it('a session started later reads the marks of the device: the family stays revoked until a confirmation', async () => {
    const store = createMemoryStore();
    store.entries.set(revokedKey(USER, FAMILY), 100);
    const time = clock(150);
    const session = createSession(USER, store, { now: time.now });
    await vi.waitFor(() => expect(session.isRevoked(FAMILY)).toBe(true));
    await readProfile(session, server().api);
    expect(session.isRevoked(FAMILY)).toBe(false);
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 150 }));
  });

  it('a server refusing a family its profile still lists does not restore it forever; a join answer always does', async () => {
    const time = clock();
    const session = createSession(USER, createMemoryStore(), { now: time.now });
    const { api } = server();
    for (let round = 1; round <= 4; round += 1) {
      time.at(round * 100);
      session.revoke(FAMILY);
      time.at(round * 100 + 10);
      await readProfile(session, api);
      expect(session.isRevoked(FAMILY)).toBe(round === 4);
    }
    time.at(500);
    session.observeProfile(undefined, profileWith(FAMILY), 500, true);
    expect(session.isRevoked(FAMILY)).toBe(false);
  });
});

describe('views produced before a revocation (fourth review, finding 1)', () => {
  it('an unchanged answer keeps producedAt', async () => {
    const time = clock();
    const session = createSession(USER, createMemoryStore(), { now: time.now });
    const { api } = server();
    await readWeek(session, api);
    expect(cachedWeek(session)?.producedAt).toBe(10);
    time.at(200);
    await session.queryClient.refetchQueries({ queryKey: weekKey() });
    expect(cachedWeek(session)?.producedAt).toBe(10);
    // A view that changed is produced when its read started.
    const changed = await readThrough(session.queryClient, weekKey(), async () => ({ unchanged: false, version: 'v2', data: 'new' }));
    expect(changed.producedAt).toBe(200);
  });

  it('a late answer started before the revocation is discarded', async () => {
    const time = clock();
    const session = createSession(USER, createMemoryStore(), { now: time.now });
    const { api, getWeek } = server();
    const late = deferred<Awaited<ReturnType<typeof getWeek>>>();
    time.at(100);
    const reading = readThrough(session.queryClient, weekKey(), () => late.promise);
    time.at(150);
    session.revoke(FAMILY);
    // Even after the family comes back, the answer started before the revocation is not taken.
    time.at(200);
    expect(session.restore(FAMILY, 200)).toBe(true);
    late.resolve({ unchanged: false, version: 'v1', data: { familyId: FAMILY } as unknown as WeekView });
    await expect(reading).rejects.toBeInstanceOf(StaleAfterRevocationError);
    expect(cachedWeek(session)).toBeUndefined();
    // Not shown: the read is repeated at once.
    const { retry, retryDelay } = session.queryClient.getDefaultOptions().queries as { retry: (count: number, error: unknown) => boolean; retryDelay: (count: number, error: unknown) => number };
    expect(retry(0, new StaleAfterRevocationError())).toBe(true);
    expect(retryDelay(1, new StaleAfterRevocationError())).toBe(0);
    await readWeek(session, api);
    expect(cachedWeek(session)?.producedAt).toBe(200);
  });

  it("the reviewer's sequence (read started before t1, unchanged answer after t1, restored(t2) then revoked(t1)) removes the old view from cache and saved copy, re-reads the family, and a later session does not restore the old view", async () => {
    const store = createMemoryStore();
    const time = clock();
    const a = outbox();
    const tabA = createSession(USER, store, { now: time.now, channel: a.channel });
    const tabB = createSession(USER, store, { now: time.now });
    const { api, getWeek } = server();
    const observer = watchWeek(tabB, api);
    await vi.waitFor(() => expect(cachedWeek(tabB)?.producedAt).toBe(10));
    await saveCopy(tabB);

    // B starts reading again before t1; the server will answer «unchanged».
    time.at(50);
    const answer = deferred<Awaited<ReturnType<typeof getWeek>>>();
    getWeek.mockImplementationOnce(() => answer.promise);
    const rereading = observer.refetch();
    time.at(100);
    tabA.revoke(FAMILY);
    time.at(120);
    answer.resolve({ unchanged: true, version: 'v1' });
    await rereading;
    expect(cachedWeek(tabB)?.producedAt).toBe(10);
    const before = dehydrate(tabB.queryClient);

    time.at(200);
    await readProfile(tabA, api);
    time.at(210);
    deliver(a.sent.splice(0).reverse(), tabB);
    expect(tabB.isRevoked(FAMILY)).toBe(false);
    await vi.waitFor(() => expect(cachedWeek(tabB)?.producedAt).toBe(210));
    await vi.waitFor(() => expect(markOf(store)).toEqual({ revokedAt: 100, restoredAt: 200 }));

    // A late write of the copy made before the cleanup does not bring the old view back.
    await saveCopy(tabB, before);
    expect(savedFamilies(store).filter((q) => q.familyId === FAMILY)).toEqual([]);
    const later = createSession(USER, store, { now: time.now });
    await persistQueryClientRestore({ queryClient: later.queryClient, persister: persisterOf(later)!, buster: CACHE_SCHEMA });
    expect(cachedWeek(later)).toBeUndefined();
    // The current copy has only the view read again.
    await saveCopy(tabB);
    expect(savedFamilies(store).filter((q) => q.familyId === FAMILY)).toEqual([{ familyId: FAMILY, producedAt: 210 }]);
  });

  it('a mutation started before the revocation does not write its view', async () => {
    const time = clock();
    const session = createSession(USER, createMemoryStore(), { now: time.now });
    const deps = { queryClient: session.queryClient, session, currentLocale: () => 'it-IT' };
    const view = { id: FAMILY, name: 'Famiglia' } as unknown as FamilyDetailView;
    const late = deferred<FamilyDetailView>();
    time.at(100);
    const sending = runAreaMutation(deps, 'family.rename', FAMILY, () => late.promise);
    time.at(150);
    session.revoke(FAMILY);
    time.at(200);
    session.restore(FAMILY, 200);
    late.resolve(view);
    expect((await sending).applied).toBe(false);
    expect(session.queryClient.getQueryData(familyKeys.family(FAMILY, 'it-IT'))).toBeUndefined();
    // Started after the revocation: written, produced when it started.
    time.at(300);
    expect((await runAreaMutation(deps, 'family.rename', FAMILY, async () => view)).applied).toBe(true);
    expect(session.queryClient.getQueryData(familyKeys.family(FAMILY, 'it-IT'))).toEqual({ data: view, producedAt: 300 });
  });
});

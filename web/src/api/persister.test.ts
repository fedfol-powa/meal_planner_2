import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import 'fake-indexeddb/auto';
import { cacheKey, clearRevoked, createIndexedDbStore, createMemoryStore, createPersister, createQueryClient, markRevoked, persistOptions, purgeOtherCopies, revokedKey, type KeyValueStore } from './persister';

const week = ['menu', 'getWeek', { familyId: 'f', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
const options = (buster: string) => persistOptions(createPersister(createMemoryStore(), 'x'), buster).dehydrateOptions;

async function saved(store = createMemoryStore(), buster = 'build-1') {
  const persister = createPersister(store, 'user-a');
  const client = createQueryClient();
  client.setQueryData(week, { version: 'v1', data: 'week' });
  await persistQueryClientSave({ queryClient: client, persister, buster, dehydrateOptions: options(buster) });
  return { store, persister };
}

/** A store whose writes wait until released, to reproduce writes still running during sign-out. */
function slowStore() {
  const inner = createMemoryStore();
  const pending: (() => void)[] = [];
  let held = true;
  const hold = (write: () => Promise<void>) =>
    held ? new Promise<void>((resolve) => pending.push(() => void write().then(resolve))) : write();
  const store: KeyValueStore = {
    ...inner,
    set: (key, value) => hold(() => inner.set(key, value)),
    transact: (prefixes, change) => hold(() => inner.transact(prefixes, change))
  };
  // After the release, writes run at once.
  const release = () => {
    held = false;
    pending.splice(0).forEach((run) => run());
  };
  return { store, entries: inner.entries, pending, release };
}

describe('persister', () => {
  it('saves one entry per user and restores it', async () => {
    const { store, persister } = await saved();
    expect([...store.entries.keys()]).toEqual([cacheKey('user-a')]);
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister, buster: 'build-1' });
    expect(restored.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('discards a copy made by another build', async () => {
    const { persister } = await saved();
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister, buster: 'build-2' });
    expect(restored.getQueryData(week)).toBeUndefined();
  });
  it('treats an unreadable copy as empty and removes it', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('user-a'), 'not a cache');
    expect(await createPersister(store, 'user-a').restoreClient()).toBeUndefined();
    expect(store.entries.has(cacheKey('user-a'))).toBe(false);
  });
  it('survives a store that fails', async () => {
    const fail = () => Promise.reject(new Error('blocked'));
    const persister = createPersister({ get: fail, set: fail, delete: fail, keys: fail, transact: fail }, 'user-a');
    expect(await persister.restoreClient()).toBeUndefined();
    await expect(persister.persistClient({ timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } })).resolves.toBeUndefined();
    await expect(persister.close()).resolves.toBeUndefined();
  });
  it('deletes the copy after a write still running at close, and writes nothing afterwards', async () => {
    const { store, entries, pending, release } = slowStore();
    const persister = createPersister(store, 'user-a');
    const client = { timestamp: 1, buster: 'b', clientState: { queries: [], mutations: [] } };
    const writing = persister.persistClient(client);
    // The write has reached the store and is still running when the session closes.
    await vi.waitFor(() => expect(pending.length).toBe(1));
    const closing = persister.close();
    await persister.persistClient(client);
    release();
    await Promise.all([writing, closing]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(entries.has(cacheKey('user-a'))).toBe(false);
    expect(await persister.restoreClient()).toBeUndefined();
  });
  it('removes the copies of every other user', async () => {
    const store = createMemoryStore();
    store.entries.set(cacheKey('a'), {});
    store.entries.set(cacheKey('b'), {});
    store.entries.set('unrelated', 1);
    await purgeOtherCopies(store, 'b');
    expect([...store.entries.keys()].sort()).toEqual([cacheKey('b'), 'unrelated']);
    await purgeOtherCopies(store, null);
    expect([...store.entries.keys()]).toEqual(['unrelated']);
  });
  it('treats the revocation marks of other users like their copies', async () => {
    const store = createMemoryStore();
    store.entries.set(revokedKey('a', 'f'), 1);
    store.entries.set(revokedKey('b', 'f'), 1);
    await purgeOtherCopies(store, 'b');
    expect([...store.entries.keys()]).toEqual([revokedKey('b', 'f')]);
  });
  it('keeps only successful queries', async () => {
    const store = createMemoryStore();
    const persister = createPersister(store, 'user-a');
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'week' });
    await client.fetchQuery({ queryKey: ['broken'], queryFn: () => Promise.reject(new ApiError('not_found')) }).catch(() => undefined);
    await persistQueryClientSave({ queryClient: client, persister, buster: 'b', dehydrateOptions: options('b') });
    const entry = store.entries.get(cacheKey('user-a')) as { clientState: { queries: { queryKey: unknown }[] } };
    expect(entry.clientState.queries.map((q) => q.queryKey)).toEqual([week]);
  });
  it('retries only network errors and reports every error with its family', async () => {
    const onError = vi.fn();
    const client = createQueryClient({ onError });
    const retry = client.getDefaultOptions().queries?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new ApiError('network'))).toBe(true);
    expect(retry(2, new ApiError('network'))).toBe(false);
    expect(retry(0, new ApiError('not_found'))).toBe(false);
    await client.fetchQuery({ queryKey: week, queryFn: () => Promise.reject(new ApiError('forbidden')) }).catch(() => undefined);
    expect(onError).toHaveBeenCalledWith(new ApiError('forbidden'), { queryKey: week, familyId: 'f' });
  });
});

describe('revoked families on the device (second review, C4)', () => {
  const otherWeek = ['menu', 'getWeek', { familyId: 'g', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
  const families = (entry: unknown) =>
    (entry as { clientState: { queries: { queryKey: unknown[] }[] } }).clientState.queries.map((q) => (q.queryKey[2] as { familyId: string }).familyId);
  async function saveBoth(store: KeyValueStore & { entries: Map<string, unknown> }, persister = createPersister(store, 'user-a')) {
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'f' });
    client.setQueryData(otherWeek, { version: 'v1', data: 'g' });
    await persistQueryClientSave({ queryClient: client, persister, buster: 'b', dehydrateOptions: options('b') });
  }

  it('a tab that does not know of the revocation yet cannot write the family back', async () => {
    const store = createMemoryStore();
    const tabA = createPersister(store, 'user-a');
    const tabB = createPersister(store, 'user-a');
    await saveBoth(store, tabB);
    // Tab A gets forbidden on family f and marks it; tab B still has f in memory and writes late.
    await markRevoked(store, 'user-a', 'f', 100);
    await saveBoth(store, tabB);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['g']);
    // Reopening offline: f does not come back.
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister: tabA, buster: 'b' });
    expect(restored.getQueryData(week)).toBeUndefined();
    expect(restored.getQueryData(otherWeek)).toEqual({ version: 'v1', data: 'g' });
  });
  it('drops a revoked family from a copy written before the mark', async () => {
    const store = createMemoryStore();
    await saveBoth(store);
    await markRevoked(store, 'user-a', 'f', 100);
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister: createPersister(store, 'user-a'), buster: 'b' });
    expect(restored.getQueryData(week)).toBeUndefined();
    expect(restored.getQueryData(otherWeek)).toBeDefined();
  });
  it('lifts the mark only for a read that started after the revocation', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await markRevoked(store, 'user-a', 'h', 100);
    await clearRevoked(store, 'user-a', 'f', 90);
    expect(store.entries.get(revokedKey('user-a', 'f'))).toBe(100);
    await clearRevoked(store, 'user-a', 'f', 120);
    expect(store.entries.has(revokedKey('user-a', 'f'))).toBe(false);
    expect(store.entries.get(revokedKey('user-a', 'h'))).toBe(100);
    await saveBoth(store);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['f', 'g']);
  });
  it('deletes the marks with the copy when the session closes', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await createPersister(store, 'user-a').close();
    expect(store.entries.has(revokedKey('user-a', 'f'))).toBe(false);
  });
});

describe('concurrent revocation marks (PR review, C11)', () => {
  const otherWeek = ['menu', 'getWeek', { familyId: 'g', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
  async function lateWriteAndRestore(store: KeyValueStore) {
    // A tab that knows nothing of the revocations writes both families, then the app reopens.
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'f' });
    client.setQueryData(otherWeek, { version: 'v1', data: 'g' });
    await persistQueryClientSave({ queryClient: client, persister: createPersister(store, 'user-a'), buster: 'b', dehydrateOptions: options('b') });
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister: createPersister(store, 'user-a'), buster: 'b' });
    return restored;
  }

  for (const [name, make] of [
    ['memory', () => createMemoryStore()],
    ['IndexedDB', () => createIndexedDbStore(`test-${Math.random()}`)]
  ] as const) {
    it(`keeps both marks of two families revoked at the same time (${name})`, async () => {
      const store: KeyValueStore = make();
      await Promise.all([markRevoked(store, 'user-a', 'f', 100), markRevoked(store, 'user-a', 'g', 101)]);
      const restored = await lateWriteAndRestore(store);
      expect(restored.getQueryData(week)).toBeUndefined();
      expect(restored.getQueryData(otherWeek)).toBeUndefined();
    });
    it(`keeps a new revocation that races the lifting of the old one (${name})`, async () => {
      const store: KeyValueStore = make();
      await markRevoked(store, 'user-a', 'f', 100);
      // Both orders: the lifting may read before or after the new mark is written.
      await Promise.all([markRevoked(store, 'user-a', 'f', 200), clearRevoked(store, 'user-a', 'f', 150)]);
      await Promise.all([clearRevoked(store, 'user-a', 'f', 250), markRevoked(store, 'user-a', 'f', 300)]);
      const restored = await lateWriteAndRestore(store);
      expect(restored.getQueryData(week)).toBeUndefined();
      expect(restored.getQueryData(otherWeek)).toBeDefined();
      // The later mark stays; an older one never replaces it.
      await markRevoked(store, 'user-a', 'f', 120);
      await clearRevoked(store, 'user-a', 'f', 180);
      expect((await lateWriteAndRestore(store)).getQueryData(week)).toBeUndefined();
      await clearRevoked(store, 'user-a', 'f', 350);
      expect((await lateWriteAndRestore(store)).getQueryData(week)).toBeDefined();
    });
  }
  it('runs a whole transaction of the IndexedDB store before any other one', async () => {
    const store = createIndexedDbStore(`test-${Math.random()}`);
    // Many read-and-increment steps at once: none may read a value another step is replacing.
    await Promise.all(
      Array.from({ length: 20 }, () =>
        store.transact(['counter'], (entries) => [['counter', ((entries.get('counter') as number | undefined) ?? 0) + 1]])
      )
    );
    expect(await store.get('counter')).toBe(20);
    await store.transact(['counter'], () => [['counter', undefined]]);
    expect(await store.keys()).toEqual([]);
  });
});

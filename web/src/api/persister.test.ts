import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import 'fake-indexeddb/auto';
import { queryKeys } from './queries';
import { CACHE_SCHEMA, cacheKey, createIndexedDbStore, registerUserKeyPrefix, resetUserKeyPrefixes, createMemoryStore, createPersister, createQueryClient, markRestored, markRevoked, persistOptions, readMarks, purgeOtherCopies, revokedKey, type KeyValueStore } from './persister';

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
  it('never saves the notice of the new week (W24): an old dot must not come back at startup', () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.newWeek('f'), { weekStartsOn: '2026-10-26', producedAt: 1 });
    client.setQueryData(week, { version: 'v1', data: 'week' });
    const query = (key: readonly unknown[]) => client.getQueryCache().find({ queryKey: key, exact: true })!;
    expect(options('b')!.shouldDehydrateQuery!(query(queryKeys.newWeek('f')))).toBe(false);
    expect(options('b')!.shouldDehydrateQuery!(query(week))).toBe(true);
  });
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
    expect(onError).toHaveBeenCalledWith(new ApiError('forbidden'), { queryKey: week, familyId: 'f', operation: 'menu.getWeek' });
  });
  it('keeps the copy across builds: the buster is the shape of the data (spec W8)', async () => {
    const { store } = await saved(createMemoryStore(), CACHE_SCHEMA);
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('restores a copy saved before W8, whose buster is the build date, as schema 1', async () => {
    const { store } = await saved(createMemoryStore(), '2026-10-13T08:12:30.123Z');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: '1' });
    expect(after.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('drops a pre-W8 copy once the schema is 2: no migration', async () => {
    const { store } = await saved(createMemoryStore(), '2026-10-13T08:12:30.123Z');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: '2' });
    expect(after.getQueryData(week)).toBeUndefined();
  });
  it('drops a copy of another schema', async () => {
    const { store } = await saved(createMemoryStore(), '0');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toBeUndefined();
  });
});

describe('revoked families on the device (second review, C4)', () => {
  const otherWeek = ['menu', 'getWeek', { familyId: 'g', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
  const families = (entry: unknown) =>
    (entry as { clientState: { queries: { queryKey: unknown[] }[] } }).clientState.queries.map((q) => (q.queryKey[2] as { familyId: string }).familyId);
  async function saveBoth(store: KeyValueStore & { entries: Map<string, unknown> }, persister = createPersister(store, 'user-a'), producedAt?: number) {
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'f', producedAt });
    client.setQueryData(otherWeek, { version: 'v1', data: 'g', producedAt });
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
  it('restores the family only for a read that started after the revocation, keeping the record', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await markRevoked(store, 'user-a', 'h', 100);
    await markRestored(store, 'user-a', 'f', 90);
    expect(store.entries.get(revokedKey('user-a', 'f'))).toEqual({ revokedAt: 100, restoredAt: 90 });
    await markRestored(store, 'user-a', 'f', 120);
    expect(store.entries.get(revokedKey('user-a', 'f'))).toEqual({ revokedAt: 100, restoredAt: 120 });
    expect(store.entries.get(revokedKey('user-a', 'h'))).toEqual({ revokedAt: 100, restoredAt: 0 });
    await saveBoth(store, undefined, 200);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['f', 'g']);
  });
  it('never writes nor restores views of a family produced up to its revocation, even once restored', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await markRestored(store, 'user-a', 'f', 150);
    // Views without producedAt (saved by the previous version) count as produced at 0.
    for (const producedAt of [undefined, 50, 100]) {
      await saveBoth(store, undefined, producedAt);
      expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['g']);
    }
    await saveBoth(store, undefined, 101);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['f', 'g']);
    // A copy written before the marks loses the old views on restoring.
    const clean = createMemoryStore();
    const old = createQueryClient();
    old.setQueryData(week, { version: 'v1', data: 'f', producedAt: 60 });
    old.setQueryData(otherWeek, { version: 'v1', data: 'g', producedAt: 60 });
    await persistQueryClientSave({ queryClient: old, persister: createPersister(clean, 'user-a'), buster: 'b', dehydrateOptions: options('b') });
    store.entries.set(cacheKey('user-a'), clean.entries.get(cacheKey('user-a')));
    const restored = createQueryClient();
    await persistQueryClientRestore({ queryClient: restored, persister: createPersister(store, 'user-a'), buster: 'b' });
    expect(restored.getQueryData(week)).toBeUndefined();
    expect(restored.getQueryData(otherWeek)).toBeDefined();
  });
  it('a numeric mark from the previous version reads as revokedAt', async () => {
    const store = createMemoryStore();
    store.entries.set(revokedKey('user-a', 'f'), 100);
    expect(await readMarks(store, 'user-a')).toEqual(new Map([['f', { revokedAt: 100, restoredAt: 0 }]]));
    await saveBoth(store, undefined, 200);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['g']);
    await markRestored(store, 'user-a', 'f', 150);
    expect(store.entries.get(revokedKey('user-a', 'f'))).toEqual({ revokedAt: 100, restoredAt: 150 });
    await saveBoth(store, undefined, 200);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['f', 'g']);
  });
  it('merges every write of the record with the maximum of each field', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await markRestored(store, 'user-a', 'f', 200);
    // A late tab writes the old revocation again: the restoration stays.
    expect(await markRevoked(store, 'user-a', 'f', 100)).toEqual({ revokedAt: 100, restoredAt: 200 });
    expect(await markRestored(store, 'user-a', 'f', 150)).toEqual({ revokedAt: 100, restoredAt: 200 });
    expect(store.entries.get(revokedKey('user-a', 'f'))).toEqual({ revokedAt: 100, restoredAt: 200 });
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
    // A tab that knows nothing of the revocations writes both families (views read after every
    // instant of these tests), then the app reopens.
    const client = createQueryClient();
    client.setQueryData(week, { version: 'v1', data: 'f', producedAt: 1000 });
    client.setQueryData(otherWeek, { version: 'v1', data: 'g', producedAt: 1000 });
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
    it(`keeps a new revocation that races the restoration after the old one (${name})`, async () => {
      const store: KeyValueStore = make();
      await markRevoked(store, 'user-a', 'f', 100);
      // Both orders: the lifting may read before or after the new mark is written.
      await Promise.all([markRevoked(store, 'user-a', 'f', 200), markRestored(store, 'user-a', 'f', 150)]);
      await Promise.all([markRestored(store, 'user-a', 'f', 250), markRevoked(store, 'user-a', 'f', 300)]);
      const restored = await lateWriteAndRestore(store);
      expect(restored.getQueryData(week)).toBeUndefined();
      expect(restored.getQueryData(otherWeek)).toBeDefined();
      // The later mark stays; an older one never replaces it.
      await markRevoked(store, 'user-a', 'f', 120);
      await markRestored(store, 'user-a', 'f', 180);
      expect((await lateWriteAndRestore(store)).getQueryData(week)).toBeUndefined();
      await markRestored(store, 'user-a', 'f', 350);
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

describe('registered per-user prefixes (second PR, W4 interface)', () => {
  it('deletes the keys of every other user, or all of them after a confirmed sign-out', async () => {
    resetUserKeyPrefixes();
    // Registered at start-up, before any session exists.
    registerUserKeyPrefix('shopping-queue:');
    registerUserKeyPrefix('shopping-queue:');
    const store = createMemoryStore();
    store.entries.set('shopping-queue:a', { ops: [] });
    store.entries.set('shopping-queue:b', { ops: [] });
    store.entries.set('shopping-queue:ab', { ops: [] });
    store.entries.set('elsewhere:a', 1);
    await purgeOtherCopies(store, 'b');
    expect([...store.entries.keys()].sort()).toEqual(['elsewhere:a', 'shopping-queue:b']);
    await purgeOtherCopies(store, null);
    expect([...store.entries.keys()]).toEqual(['elsewhere:a']);
    resetUserKeyPrefixes();
  });
  it('reads the prefixes at each call', async () => {
    resetUserKeyPrefixes();
    const store = createMemoryStore();
    store.entries.set('later:a', 1);
    await purgeOtherCopies(store, 'b');
    expect(store.entries.has('later:a')).toBe(true);
    registerUserKeyPrefix('later:');
    await purgeOtherCopies(store, 'b');
    expect(store.entries.has('later:a')).toBe(false);
    resetUserKeyPrefixes();
  });
});

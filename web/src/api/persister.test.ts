import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { cacheKey, clearRevoked, createMemoryStore, createPersister, createQueryClient, markRevoked, persistOptions, purgeOtherCopies, revokedKey, type KeyValueStore } from './persister';

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
  const store: KeyValueStore = {
    ...inner,
    set: (key, value) => new Promise<void>((resolve) => pending.push(() => void inner.set(key, value).then(resolve)))
  };
  return { store, entries: inner.entries, pending, release: () => pending.splice(0).forEach((run) => run()) };
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
    const persister = createPersister({ get: fail, set: fail, delete: fail, keys: fail }, 'user-a');
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
    release();
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
    store.entries.set(revokedKey('a'), { f: 1 });
    store.entries.set(revokedKey('b'), { f: 1 });
    await purgeOtherCopies(store, 'b');
    expect([...store.entries.keys()]).toEqual([revokedKey('b')]);
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
    expect(store.entries.get(revokedKey('user-a'))).toEqual({ f: 100, h: 100 });
    await clearRevoked(store, 'user-a', 'f', 120);
    expect(store.entries.get(revokedKey('user-a'))).toEqual({ h: 100 });
    await saveBoth(store);
    expect(families(store.entries.get(cacheKey('user-a')))).toEqual(['f', 'g']);
  });
  it('deletes the marks with the copy when the session closes', async () => {
    const store = createMemoryStore();
    await markRevoked(store, 'user-a', 'f', 100);
    await createPersister(store, 'user-a').close();
    expect(store.entries.has(revokedKey('user-a'))).toBe(false);
  });
});

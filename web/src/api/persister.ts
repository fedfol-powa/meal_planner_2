import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { toApiError } from './errors';
import { familyOfKey } from './queries';

/** Minimal storage used by the persister: IndexedDB in the app, memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const CACHE_PREFIX = 'query-cache:';
export const REVOKED_PREFIX = 'revoked:';

export function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** Families revoked for a user on this device, with the time of the revocation (second review, C4). */
export function revokedKey(userId: string): string {
  return `${REVOKED_PREFIX}${userId}`;
}

type RevocationMarks = Record<string, number>;

async function readMarks(store: KeyValueStore, userId: string): Promise<RevocationMarks> {
  const value = await store.get(revokedKey(userId)).catch(() => undefined);
  return typeof value === 'object' && value !== null ? (value as RevocationMarks) : {};
}

/** Shared by every tab of the user: no persister writes or restores this family any more. */
export async function markRevoked(store: KeyValueStore, userId: string, familyId: string, at: number): Promise<void> {
  const marks = await readMarks(store, userId);
  await store.set(revokedKey(userId), { ...marks, [familyId]: at }).catch(() => undefined);
}

/** The server gave the family back: only a read that started after the revocation proves it. */
export async function clearRevoked(store: KeyValueStore, userId: string, familyId: string, startedAt: number): Promise<void> {
  const marks = await readMarks(store, userId);
  const revokedAt = marks[familyId];
  if (revokedAt === undefined || revokedAt >= startedAt) return;
  const { [familyId]: _lifted, ...rest } = marks;
  await (Object.keys(rest).length ? store.set(revokedKey(userId), rest) : store.delete(revokedKey(userId))).catch(() => undefined);
}

function withoutRevoked(client: PersistedClient, marks: RevocationMarks): PersistedClient {
  if (Object.keys(marks).length === 0) return client;
  const queries = client.clientState.queries.filter((query) => {
    const familyId = familyOfKey(query.queryKey);
    return familyId === null || !(familyId in marks);
  });
  return { ...client, clientState: { ...client.clientState, queries } };
}

export function createMemoryStore(): KeyValueStore & { entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: async (key) => structuredClone(entries.get(key)),
    set: async (key, value) => void entries.set(key, structuredClone(value)),
    delete: async (key) => void entries.delete(key),
    keys: async () => [...entries.keys()]
  };
}

/** One database, one object store, one entry per user. */
export function createIndexedDbStore(dbName = 'cosasimangia'): KeyValueStore {
  const storeName = 'kv';
  let opening: Promise<IDBDatabase> | undefined;
  const open = () =>
    (opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  const run = async <T,>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    set: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
    delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String)
  };
}

const isPersistedClient = (value: unknown): value is PersistedClient =>
  typeof value === 'object' && value !== null &&
  typeof (value as PersistedClient).timestamp === 'number' &&
  typeof (value as PersistedClient).buster === 'string' &&
  typeof (value as PersistedClient).clientState === 'object';

export interface SessionPersister extends Persister {
  /** Stops writing and deletes the copy once the writes already running are done. */
  close(): Promise<void>;
}

/** Storage errors never break the app: the cache is only a faster start (spec, cache persistita). */
export function createPersister(store: KeyValueStore, userId: string): SessionPersister {
  const key = cacheKey(userId);
  let closed = false;
  // Operations run one after the other, so a delete never races a write that started earlier.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<unknown>) => {
    queue = queue.then(operation).then(() => undefined, () => undefined);
    return queue;
  };
  return {
    persistClient(client) {
      return closed ? Promise.resolve() : enqueue(async () => {
        // Marks are read inside the queued operation, right before writing.
        if (!closed) await store.set(key, withoutRevoked(client, await readMarks(store, userId)));
      });
    },
    async restoreClient() {
      if (closed) return undefined;
      const value = await store.get(key).catch(() => undefined);
      if (value === undefined) return undefined;
      if (isPersistedClient(value)) return withoutRevoked(value, await readMarks(store, userId));
      await enqueue(() => store.delete(key));
      return undefined;
    },
    removeClient() {
      return enqueue(() => store.delete(key));
    },
    close() {
      closed = true;
      return enqueue(() => Promise.all([store.delete(key), store.delete(revokedKey(userId))]));
    }
  };
}

/**
 * Deletes the copies and marks of every user but the one kept, once the identity is known;
 * null after a confirmed sign-out deletes them all (second review, C1).
 */
export async function purgeOtherCopies(store: KeyValueStore, keepUserId: string | null): Promise<void> {
  const keep = keepUserId ? [cacheKey(keepUserId), revokedKey(keepUserId)] : [];
  const keys = await store.keys().catch(() => [] as string[]);
  const others = keys.filter((k) => (k.startsWith(CACHE_PREFIX) || k.startsWith(REVOKED_PREFIX)) && !keep.includes(k));
  await Promise.all(others.map((k) => store.delete(k).catch(() => undefined)));
}

type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void;

export function createQueryClient(handlers: { onError?: ErrorHandler } = {}): QueryClient {
  const report: ErrorHandler = (error, scope) => handlers.onError?.(error, scope);
  return new QueryClient({
    // One place sees every failure: the session turns unauthorized and forbidden into actions.
    queryCache: new QueryCache({ onError: (error, query) => report(error, { queryKey: query.queryKey, familyId: familyOfKey(query.queryKey) ?? undefined }) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        const familyId = mutation.options.meta?.familyId;
        report(error, { familyId: typeof familyId === 'string' ? familyId : undefined });
      }
    }),
    defaultOptions: {
      queries: {
        gcTime: PERSIST_MAX_AGE,
        // Show the stored copy at once, then check the version (spec section 1).
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => toApiError(error).code === 'network' && count < 2
      },
      // No queue: offline a mutation fails at once (spec, voto).
      mutations: { networkMode: 'always' }
    }
  });
}

export function persistOptions(persister: Persister, buster: string): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister,
    buster,
    maxAge: PERSIST_MAX_AGE,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === 'success',
      shouldDehydrateMutation: () => false
    }
  };
}

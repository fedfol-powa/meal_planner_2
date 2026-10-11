import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { toApiError } from './errors';
import { familyOfKey } from './queries';

/** Writes of one transaction: undefined deletes the key. */
export type Writes = Iterable<readonly [key: string, value: unknown]>;

/** Minimal storage used by the persister: IndexedDB in the app, memory in tests. */
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /**
   * Reads the entries whose key starts with one of `prefixes` and applies the writes `change`
   * returns, as one step no other operation of any tab can interleave (PR review, C11).
   * `change` runs synchronously.
   */
  transact(prefixes: string[], change: (entries: Map<string, unknown>) => Writes | void): Promise<void>;
}

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const CACHE_PREFIX = 'query-cache:';
export const REVOKED_PREFIX = 'revoked:';

export function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** Marks of the families revoked for a user on this device (second review, C4). */
function marksPrefix(userId: string): string {
  return `${REVOKED_PREFIX}${userId}:`;
}

/** One record per user and family, holding the time of the latest revocation (PR review, C11). */
export function revokedKey(userId: string, familyId: string): string {
  return `${marksPrefix(userId)}${familyId}`;
}

function revokedFamilies(entries: Map<string, unknown>, userId: string): Set<string> {
  const prefix = marksPrefix(userId);
  const families = new Set<string>();
  for (const [key, at] of entries) if (key.startsWith(prefix) && typeof at === 'number') families.add(key.slice(prefix.length));
  return families;
}

/** Shared by every tab of the user: no persister writes or restores this family any more. */
export async function markRevoked(store: KeyValueStore, userId: string, familyId: string, at: number): Promise<void> {
  const key = revokedKey(userId, familyId);
  await store
    .transact([key], (entries) => {
      const saved = entries.get(key);
      return [[key, typeof saved === 'number' ? Math.max(saved, at) : at]];
    })
    .catch(() => undefined);
}

/** The server gave the family back: only a read that started after the latest revocation proves it. */
export async function clearRevoked(store: KeyValueStore, userId: string, familyId: string, startedAt: number): Promise<void> {
  const key = revokedKey(userId, familyId);
  await store
    .transact([key], (entries) => {
      const revokedAt = entries.get(key);
      return typeof revokedAt === 'number' && revokedAt < startedAt ? [[key, undefined]] : [];
    })
    .catch(() => undefined);
}

function withoutRevoked(client: PersistedClient, revoked: Set<string>): PersistedClient {
  if (revoked.size === 0) return client;
  const queries = client.clientState.queries.filter((query) => {
    const familyId = familyOfKey(query.queryKey);
    return familyId === null || !revoked.has(familyId);
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
    keys: async () => [...entries.keys()],
    // Read and writes happen without awaiting in between: atomic like the IndexedDB transaction.
    transact: async (prefixes, change) => {
      const read = new Map<string, unknown>();
      for (const [key, value] of entries) if (prefixes.some((prefix) => key.startsWith(prefix))) read.set(key, structuredClone(value));
      for (const [key, value] of change(read) ?? []) {
        if (value === undefined) entries.delete(key);
        else entries.set(key, structuredClone(value));
      }
    }
  };
}

/** One database, one object store, one entry per user plus one per revoked family. */
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
    keys: async () => (await run('readonly', (s) => s.getAllKeys())).map(String),
    // readwrite transactions on the same store run one at a time, also across tabs.
    async transact(prefixes, change) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const objects = transaction.objectStore(storeName);
        const read = new Map<string, unknown>();
        let pending = prefixes.length;
        const write = () => {
          try {
            for (const [key, value] of change(read) ?? []) {
              if (value === undefined) objects.delete(key);
              else objects.put(value, key);
            }
          } catch (error) {
            transaction.abort();
            reject(error);
          }
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
        if (pending === 0) write();
        for (const prefix of prefixes) {
          const cursor = objects.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
          cursor.onsuccess = () => {
            if (cursor.result) {
              read.set(String(cursor.result.key), cursor.result.value);
              cursor.result.continue();
            } else if (--pending === 0) write();
          };
        }
      });
    }
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
        // Marks are read in the same transaction that writes the copy.
        if (!closed) await store.transact([marksPrefix(userId)], (entries) => [[key, withoutRevoked(client, revokedFamilies(entries, userId))]]);
      });
    },
    async restoreClient() {
      if (closed) return undefined;
      let value: unknown;
      let revoked = new Set<string>();
      await store
        .transact([key, marksPrefix(userId)], (entries) => {
          value = entries.get(key);
          revoked = revokedFamilies(entries, userId);
        })
        .catch(() => undefined);
      if (value === undefined) return undefined;
      if (isPersistedClient(value)) return withoutRevoked(value, revoked);
      await enqueue(() => store.delete(key));
      return undefined;
    },
    removeClient() {
      return enqueue(() => store.delete(key));
    },
    close() {
      closed = true;
      return enqueue(() =>
        store.transact([marksPrefix(userId)], (entries) => [[key, undefined], ...[...entries.keys()].map((mark) => [mark, undefined] as const)])
      );
    }
  };
}

const userKeyPrefixes = new Set<string>();

/** Adds a per-user key prefix (`<prefix><userId>`) that purgeOtherCopies also deletes for every other user. */
export function registerUserKeyPrefix(prefix: string): void {
  userKeyPrefixes.add(prefix);
}

/** Tests only: forgets the registered prefixes. */
export function resetUserKeyPrefixes(): void {
  userKeyPrefixes.clear();
}

/**
 * Deletes the copies, marks and registered per-user keys of every user but the one kept, once
 * the identity is known; null after a confirmed sign-out deletes them all (second review, C1).
 */
export async function purgeOtherCopies(store: KeyValueStore, keepUserId: string | null): Promise<void> {
  const kept = (k: string) => keepUserId !== null && (k === cacheKey(keepUserId) || k.startsWith(marksPrefix(keepUserId)));
  const keys = await store.keys().catch(() => [] as string[]);
  // Registered prefixes are read now: they may have been added after the module loaded.
  const registered = [...userKeyPrefixes].filter((k) => k !== '');
  const isOtherUsers = (k: string) =>
    ((k.startsWith(CACHE_PREFIX) || k.startsWith(REVOKED_PREFIX)) && !kept(k)) ||
    registered.some((prefix) => k.startsWith(prefix) && (keepUserId === null || k !== `${prefix}${keepUserId}`));
  const others = keys.filter(isOtherUsers);
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

import { MutationCache, QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import type { PersistedClient, Persister, PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { StaleAfterRevocationError, toApiError } from './errors';
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
/**
 * Shape of the copy on the device, its buster. Change it only when the saved data or the query
 * keys change in an incompatible way (a field removed or renamed, a type changed, another key for
 * the same read): exactly when the rule of additive-only changes is broken (spec section 1). The
 * copy is then dropped, with no migration: the only exception to keeping the shopping list offline.
 * The compatibility period of the API is still required: this protects the copy, not queued
 * requests or agents. A release alone never drops it: online every read checks the server again.
 */
export const CACHE_SCHEMA = '1';
/** Copies saved before W8 have the build date as buster: they are schema '1', whatever the current one. */
const PRE_SCHEMA_BUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

/** Marks of the families revoked for a user on this device (second review, C4). */
function marksPrefix(userId: string): string {
  return `${REVOKED_PREFIX}${userId}:`;
}

/** One record per user and family: the latest revocation and the latest restoration (PR review, C11; spec W11). */
export function revokedKey(userId: string, familyId: string): string {
  return `${marksPrefix(userId)}${familyId}`;
}

/**
 * Device clock instants of one family (spec W11, «Dati sul dispositivo»): the family is revoked on
 * the device while `revokedAt > restoredAt`. Every write takes the maximum of each field.
 */
export interface RevocationMark { revokedAt: number; restoredAt: number }

export const isRevokedMark = (mark: RevocationMark | null | undefined): boolean => !!mark && mark.revokedAt > mark.restoredAt;

/** The saved record; a number saved by the previous version is its revocation instant. */
export function readMark(value: unknown): RevocationMark | null {
  if (typeof value === 'number') return { revokedAt: value, restoredAt: 0 };
  if (typeof value !== 'object' || value === null) return null;
  const { revokedAt, restoredAt } = value as Partial<RevocationMark>;
  return { revokedAt: typeof revokedAt === 'number' ? revokedAt : 0, restoredAt: typeof restoredAt === 'number' ? restoredAt : 0 };
}

export function mergeMarks(a: RevocationMark | null | undefined, b: RevocationMark): RevocationMark {
  return a ? { revokedAt: Math.max(a.revokedAt, b.revokedAt), restoredAt: Math.max(a.restoredAt, b.restoredAt) } : { ...b };
}

function marksOf(entries: Map<string, unknown>, userId: string): Map<string, RevocationMark> {
  const prefix = marksPrefix(userId);
  const marks = new Map<string, RevocationMark>();
  for (const [key, value] of entries) {
    const mark = key.startsWith(prefix) ? readMark(value) : null;
    if (mark) marks.set(key.slice(prefix.length), mark);
  }
  return marks;
}

/** The instant the read that produced a cached view started; absent (older copies, unversioned views) = 0. */
export function producedAtOf(data: unknown): number {
  const producedAt = typeof data === 'object' && data !== null ? (data as { producedAt?: unknown }).producedAt : undefined;
  return typeof producedAt === 'number' ? producedAt : 0;
}

/** A view of a family the device must not keep: the family is revoked, or the view predates its latest revocation. */
export function isWithdrawn(mark: RevocationMark | null | undefined, data: unknown): boolean {
  return !!mark && (isRevokedMark(mark) || (mark.revokedAt > 0 && producedAtOf(data) <= mark.revokedAt));
}

/** Merges one write into the record, atomically for every tab; resolves with the record saved, null if the store failed. */
async function mergeMark(store: KeyValueStore, userId: string, familyId: string, write: RevocationMark): Promise<RevocationMark | null> {
  const key = revokedKey(userId, familyId);
  let saved: RevocationMark | null = null;
  try {
    await store.transact([key], (entries) => {
      const merged = mergeMarks(readMark(entries.get(key)), write);
      saved = merged;
      return [[key, merged]];
    });
  } catch {
    return null;
  }
  return saved;
}

/** Shared by every tab of the user: no persister writes or restores this family any more until a later restoration. */
export function markRevoked(store: KeyValueStore, userId: string, familyId: string, at: number): Promise<RevocationMark | null> {
  return mergeMark(store, userId, familyId, { revokedAt: at, restoredAt: 0 });
}

/**
 * The server gave the family back to a request started at `startedAt`: it counts only when it
 * started after the latest revocation. The record is never deleted here, only at sign-out.
 */
export function markRestored(store: KeyValueStore, userId: string, familyId: string, startedAt: number): Promise<RevocationMark | null> {
  return mergeMark(store, userId, familyId, { revokedAt: 0, restoredAt: startedAt });
}

/** The records of a user on this device, read when a session starts. */
export async function readMarks(store: KeyValueStore, userId: string): Promise<Map<string, RevocationMark>> {
  let marks = new Map<string, RevocationMark>();
  await store.transact([marksPrefix(userId)], (entries) => void (marks = marksOf(entries, userId))).catch(() => undefined);
  return marks;
}

function withoutRevoked(client: PersistedClient, marks: Map<string, RevocationMark>): PersistedClient {
  if (marks.size === 0) return client;
  const queries = client.clientState.queries.filter((query) => {
    const familyId = familyOfKey(query.queryKey);
    return familyId === null || !isWithdrawn(marks.get(familyId), query.state.data);
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
        if (!closed) await store.transact([marksPrefix(userId)], (entries) => [[key, withoutRevoked(client, marksOf(entries, userId))]]);
      });
    },
    async restoreClient() {
      if (closed) return undefined;
      let value: unknown;
      let marks = new Map<string, RevocationMark>();
      await store
        .transact([key, marksPrefix(userId)], (entries) => {
          value = entries.get(key);
          marks = marksOf(entries, userId);
        })
        .catch(() => undefined);
      if (value === undefined) return undefined;
      if (isPersistedClient(value)) {
        const client = PRE_SCHEMA_BUSTER.test(value.buster) ? { ...value, buster: '1' } : value;
        return withoutRevoked(client, marks);
      }
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

type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string; operation?: string }) => void;

export function createQueryClient(handlers: { onError?: ErrorHandler } = {}): QueryClient {
  const report: ErrorHandler = (error, scope) => handlers.onError?.(error, scope);
  return new QueryClient({
    // One place sees every failure: the session turns unauthorized and forbidden into actions.
    queryCache: new QueryCache({
      onError: (error, query) => {
        const [area, operation] = query.queryKey;
        report(error, {
          queryKey: query.queryKey,
          familyId: familyOfKey(query.queryKey) ?? undefined,
          operation: typeof area === 'string' && typeof operation === 'string' ? `${area}.${operation}` : undefined
        });
      }
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => {
        const { familyId, operation } = mutation.options.meta ?? {};
        report(error, { familyId: typeof familyId === 'string' ? familyId : undefined, operation: typeof operation === 'string' ? operation : undefined });
      }
    }),
    defaultOptions: {
      queries: {
        gcTime: PERSIST_MAX_AGE,
        // Show the stored copy at once, then check the version (spec section 1).
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (count, error) => (error instanceof StaleAfterRevocationError ? count < 3 : toApiError(error).code === 'network' && count < 2),
        // An answer started before a revocation is never shown: the read is repeated at once (spec W11).
        retryDelay: (count, error) => (error instanceof StaleAfterRevocationError ? 0 : Math.min(1000 * 2 ** count, 30_000))
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

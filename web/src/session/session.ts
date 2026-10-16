import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError, SessionClosedError, toApiError } from '../api/errors';
import {
  createPersister,
  createQueryClient,
  isRevokedMark,
  markRestored,
  markRevoked,
  mergeMarks,
  producedAtOf,
  readMarks,
  type KeyValueStore,
  type RevocationMark,
  type SessionPersister
} from '../api/persister';
import { attachFamilyAccess, familyOfKey, localeOfKey } from '../api/queries';
import { trackBusy } from '../pwa/busy';
import type { Api, ProfileView } from '../api/types';
import type { RenewResult } from '../auth/backend';

export type { RenewResult } from '../auth/backend';
import type { SessionChannel, SessionMessage } from './channel';
import { clearPreference, userScope } from './localePreference';

export { SessionClosedError } from '../api/errors';

const REJECTED: RenewResult = { kind: 'rejected' };

export type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void;

export interface SessionDeps {
  /** One renewal of the sign-in session. */
  refresh?: () => Promise<RenewResult>;
  /** Ends this session (sign-in page); called at most once, never once the session is closed. Its promise is awaited by `renew`. */
  end?: (session: Session) => void | Promise<void>;
  /** Tells the other tabs about revocations. */
  channel?: SessionChannel;
  now?: () => number;
}

export interface Session {
  readonly userId: string | null;
  readonly queryClient: QueryClient;
  isClosed(): boolean;
  /** Always the same promise: repeated calls wait for the same closing. */
  close(): Promise<void>;
  /**
   * The family leaves the device (spec W11, «Dati sul dispositivo»): its views produced up to `at`
   * (default now) and its queued shopping operations up to `at` go, the record is merged with
   * `revokedAt = at`. announce: false when the revocation comes from another tab.
   */
  revoke(familyId: string, options?: { announce?: boolean; at?: number }): void;
  /**
   * The server confirmed the family to a request started at `startedAt` (decision 23): merged as
   * `restoredAt`; resolves whether the family is accessible now. announce: false from another tab.
   */
  restore(familyId: string, startedAt: number, options?: { announce?: boolean }): boolean;
  /** Revoked on this device: the latest revocation is newer than the latest restoration. */
  isRevoked(familyId: string): boolean;
  /** A message of another tab about this person's families (`revoked`, `restored`); the others are ignored. */
  receive(message: SessionMessage): void;
  /**
   * A profile read by a request started at `startedAt` (`answer`: returned by a mutation, such as
   * family.join or family.create): families gone are revoked, families back restored.
   */
  observeProfile(previous: ProfileView | undefined, next: ProfileView, startedAt: number, answer?: boolean): void;
  subscribe(listener: () => void): () => void;
  revision(): number;
  track(key: string): number;
  isLatest(key: string, token: number): boolean;
  setErrorHandler(handler: ErrorHandler): void;
  /**
   * Runs one Api call with the unauthorized protocol (second review, C3). On a closed session it
   * rejects with SessionClosedError without running `run`, also before the retry after a renewal.
   */
  call<T>(run: () => Promise<T>, familyId?: string): Promise<T>;
  /**
   * Explicit renewal, unique per session: concurrent callers (and the renewal inside `call`)
   * share the same attempt. `rejected` runs the single closing procedure before resolving;
   * `network` changes nothing. On a closed session it resolves `{ kind: 'rejected' }` without
   * contacting Supabase. `userId` is the user of the renewed token.
   */
  renew(): Promise<RenewResult>;
  /**
   * Hook awaited by `close()` after the query persister has finished, before `close()` resolves;
   * a failing hook does not stop the others. Returns the unsubscribe function.
   */
  onClose(hook: () => Promise<void>): () => void;
  /**
   * Hook called by `revoke(familyId)`, local or announced by another tab, with the revocation
   * instant; it may return a promise, not awaited by `revoke`.
   */
  onRevoke(hook: (familyId: string, revokedAt: number) => void | Promise<void>): () => void;
  /** The device store and the cross-tab channel of this session, for the queue. */
  readonly store: KeyValueStore;
  readonly channel: SessionChannel | null;
  /** Aborted by `close()` with SessionClosedError as reason: requests of this session never leave afterwards (PR #17 review). */
  readonly signal: AbortSignal;
}

const persisters = new WeakMap<Session, SessionPersister>();

export function persisterOf(session: Session): SessionPersister | null {
  return persisters.get(session) ?? null;
}

/**
 * Everything one signed-in person has on this device; closing it leaves nothing behind.
 * The session is also the generation of its identity: once closed, late renewals, answers
 * and sign-outs have no effect on the next one.
 */
export function createSession(userId: string | null, store: KeyValueStore, deps: SessionDeps = {}): Session {
  const now = deps.now ?? tabClock;
  let closed = false;
  let closing: Promise<void> | null = null;
  let handler: ErrorHandler = () => {};
  let rev = 0;
  // The copy in memory of the records of this person's families (spec W11): updated by every write and message.
  const marks = new Map<string, RevocationMark>();
  // The start of the latest profile read applied: an older one says nothing new about the families.
  let profileStartedAt = -Infinity;
  // When profile reads restored each family lately: see observeProfile.
  const profileRestores = new Map<string, number[]>();
  const listeners = new Set<() => void>();
  const requests = new Map<string, number>();
  const closeHooks = new Set<() => Promise<void>>();
  const lifetime = new AbortController();
  const revokeHooks = new Set<(familyId: string, revokedAt: number) => void | Promise<void>>();
  const queryClient = createQueryClient({ onError: (error, scope) => !closed && handler(error, scope) });
  const persister = userId ? createPersister(store, userId) : null;
  const changed = () => {
    rev += 1;
    listeners.forEach((listener) => listener());
  };

  const ofFamily = (familyId: string) => (query: { queryKey: QueryKey }) => familyOfKey(query.queryKey) === familyId;
  const isRevoked = (familyId: string) => isRevokedMark(marks.get(familyId));
  /** Reads the family again: every query invalidated, the ones in use read from the server. */
  const reread = (familyId: string) => void queryClient.invalidateQueries({ predicate: ofFamily(familyId) });
  /**
   * The views of the family produced up to `at` leave the tab: removed while the family is revoked;
   * once it is accessible again, emptied and the ones in use read again (third review, finding 3).
   */
  const withdraw = (familyId: string, at: number) => {
    const old = (query: { queryKey: QueryKey; state: { data: unknown } }) => ofFamily(familyId)(query) && producedAtOf(query.state.data) <= at;
    if (isRevoked(familyId)) queryClient.removeQueries({ predicate: old });
    else {
      void queryClient.resetQueries({ predicate: old }).catch(() => undefined);
      reread(familyId);
    }
  };
  /** Merges a record into memory and applies what changed: a newer revocation withdraws, a restoration reads again. */
  const apply = (familyId: string, write: RevocationMark): boolean => {
    const before = marks.get(familyId);
    const after = mergeMarks(before, write);
    marks.set(familyId, after);
    const wasRevoked = isRevokedMark(before);
    const newer = after.revokedAt > (before?.revokedAt ?? 0);
    if (newer) withdraw(familyId, after.revokedAt);
    else if (wasRevoked && !isRevokedMark(after)) reread(familyId);
    if (wasRevoked !== isRevokedMark(after)) changed();
    return newer;
  };
  const settle = (familyId: string, saved: RevocationMark | null) => {
    if (saved && !closed) apply(familyId, saved);
  };

  // Token epochs: a renewal that succeeded after a call started answers that call at once.
  let epoch = 0;
  let renewing: Promise<RenewResult> | null = null;
  let ending: Promise<void> | null = null;
  const end = (): Promise<void> => {
    if (closed) return Promise.resolve();
    ending ??= Promise.resolve()
      .then(() => deps.end?.(session))
      .catch(() => undefined);
    return ending;
  };
  // One attempt at a time, shared by `renew()` and by the refused calls (W4 interface).
  const renewOnce = (): Promise<RenewResult> => {
    // Nobody to renew, or already on the way out.
    if (closed || !userId || ending) return Promise.resolve(REJECTED);
    renewing ??= (async () => {
      let result: RenewResult;
      try {
        result = deps.refresh ? await deps.refresh() : REJECTED;
      } catch {
        result = REJECTED;
      }
      renewing = null;
      if (closed) return REJECTED;
      // Renewed for someone else (another tab signed in): this generation is over, nothing repeats
      // under the new identity, and it is not ours to sign out (PR #17 review, finding 2).
      if (result.kind === 'ok' && result.userId !== userId) {
        await session.close();
        return result;
      }
      if (result.kind === 'ok') epoch += 1;
      else if (result.kind === 'rejected') await end();
      return result;
    })();
    return renewing;
  };

  const session: Session = {
    userId,
    queryClient,
    store,
    channel: deps.channel ?? null,
    signal: lifetime.signal,
    isClosed: () => closed,
    close() {
      closed = true;
      if (!lifetime.signal.aborted) lifetime.abort(new SessionClosedError());
      closing ??= (async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        queryClient.getMutationCache().clear();
        if (userId) clearPreference(userScope(userId));
        await persister?.close();
        // Each hook inside its own promise: a synchronous throw does not skip the next ones.
        await Promise.allSettled([...closeHooks].map((hook) => Promise.resolve().then(hook)));
        changed();
      })();
      return closing;
    },
    revoke(familyId, { announce = true, at } = {}) {
      if (closed) return;
      const revokedAt = at ?? now();
      // The same cleanup also when the instant is not newer than the one known: this tab may still hold old views.
      if (!apply(familyId, { revokedAt, restoredAt: 0 })) withdraw(familyId, revokedAt);
      if (userId) {
        // The record keeps the family's copy off the device: busy until it is written (spec W8).
        void trackBusy(markRevoked(store, userId, familyId, revokedAt).then((saved) => settle(familyId, saved)));
        if (announce) deps.channel?.post({ type: 'revoked', userId, familyId, revokedAt });
      }
      changed();
      for (const hook of revokeHooks) {
        try {
          void Promise.resolve(hook(familyId, revokedAt)).catch(() => undefined);
        } catch {
          // A broken hook does not stop the others.
        }
      }
    },
    restore(familyId, startedAt, { announce = true } = {}) {
      if (closed) return false;
      apply(familyId, { revokedAt: 0, restoredAt: startedAt });
      if (userId) {
        void trackBusy(markRestored(store, userId, familyId, startedAt).then((saved) => settle(familyId, saved)));
        if (announce) deps.channel?.post({ type: 'restored', userId, familyId, startedAt });
      }
      return !isRevoked(familyId);
    },
    receive(message) {
      if (closed || !userId || message.userId !== userId) return;
      // A tab of the previous version sends no instant: the revocation is now.
      if (message.type === 'revoked') session.revoke(message.familyId, { announce: false, at: typeof message.revokedAt === 'number' ? message.revokedAt : undefined });
      else if (message.type === 'restored') session.restore(message.familyId, message.startedAt, { announce: false });
    },
    observeProfile(previous, next, startedAt, answer = false) {
      if (closed || startedAt < profileStartedAt || !Array.isArray(next?.families)) return;
      profileStartedAt = startedAt;
      const present = new Set(next.families.map((family) => family.id));
      for (const family of previous?.families ?? []) {
        // Gone from the profile: removed, left or deleted, also by someone else.
        if (!present.has(family.id) && startedAt > (marks.get(family.id)?.restoredAt ?? 0)) session.revoke(family.id);
      }
      for (const familyId of present) {
        const mark = marks.get(familyId);
        if (!isRevokedMark(mark) || startedAt <= mark!.revokedAt) continue;
        // A server refusing a family its profile still lists (a role check, a stale fake) would make
        // forbidden → revoke → profile → restore turn forever: reads restore a few times a minute at most.
        // The answer of a join or a creation always counts.
        const recent = (profileRestores.get(familyId) ?? []).filter((at) => startedAt - at < RESTORE_WINDOW_MS);
        if (!answer && recent.length >= RESTORES_PER_WINDOW) continue;
        profileRestores.set(familyId, [...recent, startedAt]);
        session.restore(familyId, startedAt);
      }
    },
    renew: renewOnce,
    onClose(hook) {
      closeHooks.add(hook);
      return () => void closeHooks.delete(hook);
    },
    onRevoke(hook) {
      revokeHooks.add(hook);
      return () => void revokeHooks.delete(hook);
    },
    isRevoked,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    revision: () => rev,
    track(key) {
      const token = (requests.get(key) ?? 0) + 1;
      requests.set(key, token);
      return token;
    },
    isLatest: (key, token) => requests.get(key) === token,
    setErrorHandler(next) {
      handler = next;
    },
    async call(run) {
      if (closed) throw new SessionClosedError();
      const startedEpoch = epoch;
      try {
        return await run();
      } catch (error) {
        if (toApiError(error).code !== 'unauthorized') throw error;
        if (closed) throw new SessionClosedError();
        const result: RenewResult = epoch > startedEpoch ? { kind: 'ok', userId: userId ?? '' } : await renewOnce();
        if (closed) throw new SessionClosedError();
        // Offline the session stays: the call fails like any call without network.
        if (result.kind === 'network') throw new ApiError('network');
        if (result.kind === 'rejected') throw error;
        try {
          return await run();
        } catch (again) {
          // Refused again after a renewal: the session is over.
          if (toApiError(again).code === 'unauthorized') void end();
          throw again;
        }
      }
    }
  };
  if (persister) persisters.set(session, persister);
  attachFamilyAccess(queryClient, {
    now,
    revokedAt: (familyId) => marks.get(familyId)?.revokedAt ?? 0,
    profileRead: (previous, next, startedAt, answer) => session.observeProfile(previous, next, startedAt, answer)
  });
  // A new session reads the records of the device first (spec W11): the persister reads them again with the copy.
  if (userId) {
    void readMarks(store, userId).then((saved) => {
      for (const [familyId, mark] of saved) settle(familyId, mark);
    });
  }
  return session;
}

const RESTORE_WINDOW_MS = 60_000;
const RESTORES_PER_WINDOW = 3;

let lastInstant = 0;
/** The device clock, strictly increasing in this tab: a revocation and a later confirmation never share an instant. */
function tabClock(): number {
  lastInstant = Math.max(Date.now(), lastInstant + 1);
  return lastInstant;
}

/** The language an Api client was made for, and whether it is still the one shown. */
export interface ClientLanguage {
  locale: string;
  isCurrent: () => boolean;
}

/**
 * Every Api method goes through the session: unauthorized protocol and family marks. The client
 * speaks one language, also in the retries; an answer that arrives after the language changed
 * cancels the reads of that language, so it never reaches the cache (PR review, C12).
 */
export function wrapApi(api: Api, session: Session, language?: ClientLanguage): Api {
  const dropIfStale = <T,>(value: T): T => {
    if (language && !language.isCurrent()) {
      void session.queryClient.cancelQueries({ predicate: (query) => localeOfKey(query.queryKey) === language.locale });
    }
    return value;
  };
  const familyOf = (input: unknown) => {
    const familyId = typeof input === 'object' && input !== null ? (input as { familyId?: unknown }).familyId : undefined;
    return typeof familyId === 'string' ? familyId : undefined;
  };
  // The client options get a signal aborted by the caller or by the closing of the session, so a
  // request still being prepared (token read) never leaves once the session is closed (PR #17 review).
  const withSessionSignal = (args: unknown[]): unknown[] => {
    const options = (typeof args[1] === 'object' && args[1] !== null ? args[1] : {}) as { signal?: AbortSignal; context?: object };
    const signal = options.signal ? AbortSignal.any([options.signal, session.signal]) : session.signal;
    // The link checks that the credentials it reads belong to this session's person.
    const context = { ...options.context, sessionUserId: session.userId };
    return [args[0], { ...options, signal, context }, ...args.slice(2)];
  };
  // A Proxy at every level: the oRPC client has no keys to enumerate (second PR). Every
  // argument is passed on, the client options with `signal` too, also in the retry.
  const wrap = (target: object): unknown =>
    new Proxy(target, {
      get(object, key, receiver) {
        const value: unknown = Reflect.get(object, key, receiver);
        // Not wrapped: symbols, and `then`, so that a client never looks like a promise.
        if (typeof key !== 'string' || key === 'then' || value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
        return typeof value === 'function' ? wrapMethod(value as (...args: unknown[]) => Promise<unknown>, object) : wrap(value);
      }
    });
  const wrapMethod = (method: ((...args: unknown[]) => Promise<unknown>) & object, owner: object) =>
    new Proxy(method, {
      get: (target, key, receiver) => (typeof key === 'string' && key !== 'then' ? (wrap(target) as Record<string, unknown>)[key] : Reflect.get(target, key, receiver)),
      apply: (target, _thisArg, args: unknown[]) => {
        const forwarded = withSessionSignal(args);
        return session.call(() => Reflect.apply(target, owner, forwarded), familyOf(args[0])).then(dropIfStale);
      }
    });
  return wrap(api) as Api;
}

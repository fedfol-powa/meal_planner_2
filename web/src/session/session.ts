import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError, toApiError } from '../api/errors';
import { clearRevoked, createPersister, createQueryClient, markRevoked, type KeyValueStore, type SessionPersister } from '../api/persister';
import { familyOfKey, localeOfKey } from '../api/queries';
import type { Api } from '../api/types';
import type { RenewResult } from '../auth/backend';

export type { RenewResult } from '../auth/backend';
import type { SessionChannel } from './channel';
import { clearPreference, userScope } from './localePreference';

/** Thrown by `call` on a closed session (or one superseded by a new identity): `run` is not executed. */
export class SessionClosedError extends Error {
  constructor() {
    super('session closed');
    this.name = 'SessionClosedError';
  }
}

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
  /** announce: false when the revocation comes from another tab. */
  revoke(familyId: string, options?: { announce?: boolean }): void;
  isRevoked(familyId: string): boolean;
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
  /** Hook called by `revoke(familyId)`, local or announced by another tab; it may return a promise, not awaited by `revoke`. */
  onRevoke(hook: (familyId: string) => void | Promise<void>): () => void;
  /** The device store and the cross-tab channel of this session, for the queue. */
  readonly store: KeyValueStore;
  readonly channel: SessionChannel | null;
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
  const now = deps.now ?? Date.now;
  let closed = false;
  let closing: Promise<void> | null = null;
  let handler: ErrorHandler = () => {};
  let rev = 0;
  const revoked = new Set<string>();
  const listeners = new Set<() => void>();
  const requests = new Map<string, number>();
  const closeHooks = new Set<() => Promise<void>>();
  const revokeHooks = new Set<(familyId: string) => void | Promise<void>>();
  const queryClient = createQueryClient({ onError: (error, scope) => !closed && handler(error, scope) });
  const persister = userId ? createPersister(store, userId) : null;
  const changed = () => {
    rev += 1;
    listeners.forEach((listener) => listener());
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
    isClosed: () => closed,
    close() {
      closed = true;
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
    revoke(familyId, { announce = true } = {}) {
      if (closed) return;
      revoked.add(familyId);
      queryClient.removeQueries({ predicate: (query) => familyOfKey(query.queryKey) === familyId });
      if (userId) {
        void markRevoked(store, userId, familyId, now());
        if (announce) deps.channel?.post({ type: 'revoked', userId, familyId });
      }
      changed();
      for (const hook of revokeHooks) {
        try {
          void Promise.resolve(hook(familyId)).catch(() => undefined);
        } catch {
          // A broken hook does not stop the others.
        }
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
    isRevoked: (familyId) => revoked.has(familyId),
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
    async call(run, familyId) {
      if (closed) throw new SessionClosedError();
      const startedEpoch = epoch;
      const startedAt = now();
      const succeeded = <T,>(value: T): T => {
        // A read that started after a revocation and succeeded: the server gave the family back.
        if (familyId && userId && !closed && !revoked.has(familyId)) void clearRevoked(store, userId, familyId, startedAt);
        return value;
      };
      try {
        return succeeded(await run());
      } catch (error) {
        if (toApiError(error).code !== 'unauthorized') throw error;
        if (closed) throw new SessionClosedError();
        const result: RenewResult = epoch > startedEpoch ? { kind: 'ok', userId: userId ?? '' } : await renewOnce();
        if (closed) throw new SessionClosedError();
        // Offline the session stays: the call fails like any call without network.
        if (result.kind === 'network') throw new ApiError('network');
        if (result.kind === 'rejected') throw error;
        try {
          return succeeded(await run());
        } catch (again) {
          // Refused again after a renewal: the session is over.
          if (toApiError(again).code === 'unauthorized') void end();
          throw again;
        }
      }
    }
  };
  if (persister) persisters.set(session, persister);
  return session;
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
  const wrapArea = <T extends object>(area: T): T =>
    Object.fromEntries(
      Object.entries(area).map(([name, method]) => [
        name,
        (input?: { familyId?: unknown }) =>
          session
            .call(
              () => (method as (input: unknown) => Promise<unknown>).call(area, input),
              typeof input?.familyId === 'string' ? input.familyId : undefined
            )
            .then(dropIfStale)
      ])
    ) as T;
  return { me: wrapArea(api.me), menu: wrapArea(api.menu), recipes: wrapArea(api.recipes), ratings: wrapArea(api.ratings) };
}

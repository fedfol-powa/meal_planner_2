import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { toApiError } from '../api/errors';
import { clearRevoked, createPersister, createQueryClient, markRevoked, type KeyValueStore, type SessionPersister } from '../api/persister';
import { familyOfKey, localeOfKey } from '../api/queries';
import type { Api } from '../api/types';
import type { SessionChannel } from './channel';
import { clearPreference, userScope } from './localePreference';

export type ErrorHandler = (error: unknown, scope: { queryKey?: QueryKey; familyId?: string }) => void;

export interface SessionDeps {
  /** One renewal of the sign-in session; false when refused or impossible. */
  refresh?: () => Promise<boolean>;
  /** Ends this session (sign-in page); called at most once, never once the session is closed. */
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
  /** Runs one Api call with the unauthorized protocol (second review, C3). */
  call<T>(run: () => Promise<T>, familyId?: string): Promise<T>;
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
  const queryClient = createQueryClient({ onError: (error, scope) => !closed && handler(error, scope) });
  const persister = userId ? createPersister(store, userId) : null;
  const changed = () => {
    rev += 1;
    listeners.forEach((listener) => listener());
  };

  // Token epochs: a renewal that succeeded after a call started answers that call at once.
  let epoch = 0;
  let renewing: Promise<boolean> | null = null;
  let ending = false;
  const end = () => {
    if (closed || ending) return;
    ending = true;
    void deps.end?.(session);
  };
  const renew = (startedAt: number): Promise<boolean> => {
    if (epoch > startedAt) return Promise.resolve(true);
    // Nobody to renew, or already on the way out.
    if (!userId || ending) return Promise.resolve(false);
    renewing ??= (deps.refresh ?? (async () => false))()
      .catch(() => false)
      .then((ok) => {
        renewing = null;
        if (closed) return false;
        if (ok) epoch += 1;
        else end();
        return ok;
      });
    return renewing;
  };

  const session: Session = {
    userId,
    queryClient,
    isClosed: () => closed,
    close() {
      closed = true;
      closing ??= (async () => {
        await queryClient.cancelQueries();
        queryClient.clear();
        queryClient.getMutationCache().clear();
        if (userId) clearPreference(userScope(userId));
        await persister?.close();
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
        if (toApiError(error).code !== 'unauthorized' || closed) throw error;
        if (!(await renew(startedEpoch)) || closed) throw error;
        try {
          return succeeded(await run());
        } catch (again) {
          // Refused again after a renewal: the session is over.
          if (toApiError(again).code === 'unauthorized') end();
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

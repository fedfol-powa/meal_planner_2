import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toApiError } from '../../api/errors';
import { profileQuery } from '../../api/profile';
import { useQueryDeps, type QueryDeps } from '../../api/queries';
import { Loading } from '../../components/Loading';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { hasAppAdmin } from './access';

type AccessState = { status: 'ok' } | { status: 'checking' } | { status: 'error'; error: unknown };
interface Snapshot {
  state: AccessState;
  /** Remounts the content when access is confirmed again: its views are read from scratch. */
  generation: number;
}
interface AdminAccess extends Snapshot {
  /** Handles a `forbidden` of a users operation (true); any other error is the caller's (false). */
  report(error: unknown): boolean;
  retry(): void;
  /** Whether answers may still be written into the administration's views (live, not the last render). */
  allowed(): boolean;
}
interface Store extends Omit<AdminAccess, keyof Snapshot> {
  deps: QueryDeps;
  subscribe(listener: () => void): () => void;
  snapshot(): Snapshot;
}

/** The administration's views: dropped at a `forbidden`, read from scratch once access is confirmed. */
const isAdminView = (key: QueryKey) => key[0] === 'users' || key[0] === 'appInvitations';
const isForbidden = (error: unknown) => toApiError(error).code === 'forbidden';

/**
 * «Accesso da verificare» (spec W10): after a `forbidden` nothing of the administration is shown
 * until a fresh read of the profile says whether app_admin remains. The cached profile is never
 * trusted for that, and a failed read never reuses the old permission. The state belongs to the
 * session's QueryClient, not to a page: leaving and reopening keeps it, a new session starts clean.
 */
function createStore(queryClient: QueryClient, deps: QueryDeps): Store {
  let current: Snapshot = { state: { status: 'ok' }, generation: 0 };
  const listeners = new Set<() => void>();
  const set = (next: Partial<Snapshot>) => {
    current = { ...current, ...next };
    listeners.forEach((listener) => listener());
  };
  // Answers still pending land in detached queries: nothing is shown again before a confirmation.
  const dropViews = () => queryClient.removeQueries({ predicate: (query) => isAdminView(query.queryKey) });
  let running = false;
  let reportedAgain = false;

  async function verify() {
    if (running) return;
    running = true;
    try {
      do {
        reportedAgain = false;
        const deps = store.deps;
        // fetchQuery rejects when the read fails (refetchQueries would swallow it).
        await deps.queryClient.fetchQuery({ ...profileQuery(deps), staleTime: 0 });
      } while (reportedAgain); // a forbidden during the read: the answer may predate it
      // Anything written meanwhile goes too; without app_admin the gate shows «Non hai accesso».
      dropViews();
      set({ state: { status: 'ok' }, generation: current.generation + 1 });
    } catch (error) {
      set({ state: { status: 'error', error } });
    } finally {
      running = false;
    }
  }

  const store: Store = {
    deps,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => current,
    report(error) {
      if (!isForbidden(error)) return false;
      dropViews();
      if (current.state.status !== 'checking') set({ state: { status: 'checking' } });
      reportedAgain = running;
      void verify();
      return true;
    },
    retry: () => void verify(),
    allowed: () => current.state.status === 'ok'
  };
  // A forbidden read hides the views in the same pass that would show its error next to the old data.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'error' && isAdminView(event.query.queryKey)) store.report(event.action.error);
  });
  return store;
}

const stores = new WeakMap<QueryClient, Store>();

export function useAdminAccess(): AdminAccess {
  const deps = useQueryDeps();
  let store = stores.get(deps.queryClient);
  if (!store) stores.set(deps.queryClient, (store = createStore(deps.queryClient, deps)));
  // The latest api and language for the profile check.
  store.deps = deps;
  const { state, generation } = useSyncExternalStore(store.subscribe, store.snapshot);
  return { state, generation, report: store.report, retry: store.retry, allowed: store.allowed };
}

/**
 * The content of an administration page, only with access settled and app_admin in the profile;
 * otherwise loading, the check's error with «Riprova», or «Non hai accesso a questa pagina».
 * A new generation remounts the content, so nothing of the earlier answers stays in the page.
 * The profile is read here: when a check ends, this render must see the profile it read, not
 * the one a parent got before (that would mount the content again and repeat the forbidden).
 */
export function AdminAccessGate({ fallbackHeader, children }: {
  /** Shown above loading, the check's error and «Non hai accesso» (the detail page's header). */
  fallbackHeader?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const profile = useProfile();
  const { state, generation, retry } = useAdminAccess();
  const instead = (content: ReactNode) => <>{fallbackHeader}{content}</>;
  if (state.status === 'checking') return instead(<Loading />);
  if (state.status === 'error') return instead(<QueryError error={state.error} onRetry={retry} />);
  if (!profile.data) return instead(profile.isError ? <QueryError error={profile.error} onRetry={() => void profile.refetch()} /> : <Loading />);
  if (!hasAppAdmin(profile.data)) {
    return instead(
      <StateNotice title={t('admin.noAccess')}>
        <Link to="/profile" className="text-button">{t('nav.profile')}</Link>
      </StateNotice>
    );
  }
  return <Fragment key={generation}>{children}</Fragment>;
}

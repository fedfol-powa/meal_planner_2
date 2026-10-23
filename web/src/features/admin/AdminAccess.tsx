import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ProfileView } from '@app/contract';
import { toApiError } from '../../api/errors';
import { profileQuery } from '../../api/profile';
import { familyAccessOf, useQueryDeps, type QueryDeps } from '../../api/queries';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { hasAppAdmin } from './access';

/**
 * `profile`: no forbidden yet in this session, the profile decides. After a forbidden only the
 * outcome of a check started after it counts (`verified`), in any language, until the next one.
 */
type AccessState =
  | { status: 'profile' }
  | { status: 'checking' }
  | { status: 'error'; error: unknown }
  | { status: 'verified'; admin: boolean };
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
 * until a read of the profile started after it says whether app_admin remains; from then on that
 * outcome decides, not a cached profile (of this language or another), until the next check. A
 * failed read never reuses the old permission. The state belongs to the session's QueryClient,
 * not to a page: leaving and reopening keeps it, a new session starts clean.
 */
function createStore(queryClient: QueryClient, deps: QueryDeps): Store {
  let current: Snapshot = { state: { status: 'profile' }, generation: 0 };
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
      let profile: ProfileView;
      do {
        reportedAgain = false;
        const deps = store.deps;
        // A request of its own, started now: fetchQuery would join a read already in flight,
        // begun before the forbidden. The cache gets it too, for the rest of the app.
        const access = familyAccessOf(deps.queryClient);
        const startedAt = access.now();
        profile = await deps.api.profile.get({});
        const profileKey = profileQuery(deps).queryKey;
        access.profileRead(deps.queryClient.getQueryData(profileKey), profile, startedAt);
        deps.queryClient.setQueryData(profileKey, profile);
      } while (reportedAgain); // a forbidden during the read: the answer may predate it
      // Anything written meanwhile goes too.
      dropViews();
      set({ state: { status: 'verified', admin: hasAppAdmin(profile) }, generation: current.generation + 1 });
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
    allowed: () => current.state.status === 'profile' || (current.state.status === 'verified' && current.state.admin)
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
 * The content of an administration page, only with access settled and app_admin in the profile
 * (or, after a forbidden, in the check's outcome);
 * otherwise the page's waiting layout (W22: `waiting`, also during the check after a forbidden, paused when
 * the profile waits for the network), the check's error with «Riprova», or «Non hai accesso a questa pagina».
 * A new generation remounts the content, so nothing of the earlier answers stays in the page.
 * The profile is read here: when a check ends, this render must see the profile it read, not
 * the one a parent got before (that would mount the content again and repeat the forbidden).
 */
export function AdminAccessGate({ fallbackHeader, waiting, children }: {
  /** Shown above the check's error and «Non hai accesso» (the detail page's header). */
  fallbackHeader?: ReactNode;
  /** The page's waiting layout, with its own header. */
  waiting: (paused: boolean) => ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const profile = useProfile();
  const { state, generation, retry } = useAdminAccess();
  const instead = (content: ReactNode) => <>{fallbackHeader}{content}</>;
  if (state.status === 'checking') return <>{waiting(false)}</>;
  if (state.status === 'error') return instead(<QueryError error={state.error} onRetry={retry} />);
  if (state.status === 'profile' && !profile.data) {
    return profile.isError ? instead(<QueryError error={profile.error} onRetry={() => void profile.refetch()} />) : <>{waiting(profile.fetchStatus === 'paused')}</>;
  }
  if (state.status === 'verified' ? !state.admin : !hasAppAdmin(profile.data)) {
    return instead(
      <StateNotice title={t('admin.noAccess')}>
        <Link to="/profile" className="text-button">{t('nav.profile')}</Link>
      </StateNotice>
    );
  }
  return <Fragment key={generation}>{children}</Fragment>;
}

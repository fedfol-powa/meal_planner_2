import { Fragment, createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { ProfileView } from '@app/contract';
import { toApiError } from '../../api/errors';
import { profileQuery } from '../../api/profile';
import { useQueryDeps } from '../../api/queries';
import { Loading } from '../../components/Loading';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { hasAppAdmin } from './access';

type AccessState = { status: 'ok' } | { status: 'checking' } | { status: 'denied' } | { status: 'error'; error: unknown };
interface AdminAccess {
  state: AccessState;
  /** Remounts the content when access is confirmed again: its views are read from scratch. */
  generation: number;
  /** Handles a `forbidden` of a users operation (true); any other error is the caller's (false). */
  report(error: unknown): boolean;
  retry(): void;
}

const Context = createContext<AdminAccess | null>(null);

/**
 * «Accesso da verificare» (spec W10): after a `forbidden` nothing of the administration is shown
 * until a fresh read of the profile says whether app_admin remains. The cached profile is never
 * trusted for that, and a failed read never reuses the old permission. SessionScope is not involved.
 */
export function AdminAccessProvider({ children }: { children: ReactNode }) {
  // useQueryDeps answers a new object at every render: kept in a ref, so report stays stable.
  const depsNow = useQueryDeps();
  const depsRef = useRef(depsNow);
  depsRef.current = depsNow;
  const [state, setState] = useState<AccessState>({ status: 'ok' });
  const [generation, setGeneration] = useState(0);
  const running = useRef(false);
  const verify = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setState({ status: 'checking' });
    const deps = depsRef.current;
    try {
      // fetchQuery rejects when the read fails (refetchQueries would swallow it).
      const profile = await deps.queryClient.fetchQuery({ ...profileQuery(deps), staleTime: 0 });
      deps.queryClient.removeQueries({ queryKey: ['users'] });
      deps.queryClient.removeQueries({ queryKey: ['appInvitations'] });
      if (hasAppAdmin(profile)) {
        setGeneration((current) => current + 1);
        setState({ status: 'ok' });
      } else {
        setState({ status: 'denied' });
      }
    } catch (error) {
      setState({ status: 'error', error });
    } finally {
      running.current = false;
    }
  }, []);
  const report = useCallback((error: unknown) => {
    if (toApiError(error).code !== 'forbidden') return false;
    void verify();
    return true;
  }, [verify]);
  const value = useMemo(() => ({ state, generation, report, retry: () => void verify() }), [state, generation, report, verify]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminAccess(): AdminAccess {
  const value = useContext(Context);
  if (!value) throw new Error('useAdminAccess outside AdminAccessProvider');
  return value;
}

/**
 * The content of an administration page, only with access settled and app_admin in the profile;
 * otherwise loading, the check's error with «Riprova», or «Non hai accesso a questa pagina».
 * A new generation remounts the content, so nothing of the earlier answers stays in the page.
 */
export function AdminAccessGate({ profile, fallbackHeader, children }: {
  profile: { data?: ProfileView; isError: boolean; error: unknown; refetch: () => unknown };
  /** Shown above loading, the check's error and «Non hai accesso» (the detail page's header). */
  fallbackHeader?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const { state, generation, retry } = useAdminAccess();
  const instead = (content: ReactNode) => <>{fallbackHeader}{content}</>;
  if (state.status === 'checking') return instead(<Loading />);
  if (state.status === 'error') return instead(<QueryError error={state.error} onRetry={retry} />);
  if (!profile.data) return instead(profile.isError ? <QueryError error={profile.error} onRetry={() => void profile.refetch()} /> : <Loading />);
  if (state.status === 'denied' || !hasAppAdmin(profile.data)) {
    return instead(
      <StateNotice title={t('admin.noAccess')}>
        <Link to="/profile" className="text-button">{t('nav.profile')}</Link>
      </StateNotice>
    );
  }
  return <Fragment key={generation}>{children}</Fragment>;
}

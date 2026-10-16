import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState, type ReactNode } from 'react';
import type { GlobalRole } from '@app/contract';
import { errorKey, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import danger from '../../components/Danger.module.css';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { AdminAccessGate, useAdminAccess } from './AdminAccess';
import { userQuery } from './api';
import styles from './AdminPage.module.css';

type Change = { role: GlobalRole; granted: boolean };
const route = getRouteApi('/_app/admin/users/$userId');

/**
 * One user (spec W10): the two global roles, families by name and role only. Appointing an
 * administrator and giving up one's own role ask first; the last administrator's switch is locked.
 * The switches show only confirmed states and stay locked from the tap until one is shown.
 * Below the families the way to delete another user (spec W11); a deletion in progress takes the
 * place of the switches, with «Completa la cancellazione».
 */
export function UserPage() {
  const t = useT();
  const back = (
    <Link to="/admin" className="page-back"><Icon name="chevron-left" />{t('admin.title')}</Link>
  );
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        {/* Loading, check error and «Non hai accesso» keep a header; the detail has its own, with the name. */}
        <AdminAccessGate fallbackHeader={<PageHeader back={back} title={t('admin.users')} />}>
          <UserDetailView back={back} />
        </AdminAccessGate>
      </div>
    </section>
  );
}

function UserDetailView({ back }: { back: ReactNode }) {
  const t = useT();
  const deps = useQueryDeps();
  const online = useOnline();
  const navigate = useNavigate();
  const profile = useProfile();
  const { locale } = useLocale();
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(iso));
  const { report, allowed } = useAdminAccess();
  const { userId } = route.useParams();
  const detailQuery = userQuery(deps, userId);
  const user = useQuery(detailQuery);
  const [confirming, setConfirming] = useState<'appoint' | 'dropSelf' | null>(null);
  // From the tap until a confirmed state is shown; the ref also blocks taps before the next render.
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  // Answers that supersede each other are those for this user, in this session (also across remounts).
  const setRole = useAreaMutation('users.setRole', undefined, (change: Change) => deps.api.users.setRole({ id: userId, ...change }), { track: `users:${userId}` });
  // Completing a deletion in progress: the plan is empty, the server finishes what it started.
  const complete = useAreaMutation('users.delete', undefined, () => deps.api.users.delete({ id: userId, successors: {}, deletedFamilies: [] }), { track: `users:${userId}` });
  const isSelf = profile.data?.user.id === userId;

  async function apply(change: Change) {
    setConfirming(null);
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const outcome = await setRole.mutateAsync(change);
      if (outcome.applied) {
        // The answer is the confirmed detail: shown at once, whatever the reread started by the registry does;
        // never written into a view no longer allowed (a forbidden meanwhile, also after leaving the page).
        if (allowed()) deps.queryClient.setQueryData(detailQuery.queryKey, outcome.view);
      } else {
        await deps.queryClient.refetchQueries({ queryKey: detailQuery.queryKey }).catch(() => undefined);
      }
      // Giving up one's own app_admin closes this page: the profile, read again, no longer offers it.
      if (outcome.applied && isSelf && change.role === 'app_admin' && !change.granted) void navigate({ to: '/profile' });
    } catch (error) {
      // forbidden: AdminAccess hides the page and checks the profile; other errors show below the card,
      // and the detail is read again: the change may have happened (answer lost) or the state moved
      // (e.g. now the last administrator), and the switches show only confirmed states.
      if (!report(error)) {
        await deps.queryClient.refetchQueries({ queryKey: detailQuery.queryKey }).catch(() => undefined);
        void deps.queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  async function completeDeletion(name: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const outcome = await complete.mutateAsync(undefined);
      if (outcome.view.completed) {
        void navigate({ to: '/admin', replace: true, state: { userDeleted: name } });
        return;
      }
      // Still waiting for Auth: the detail tells the attempts again.
      await deps.queryClient.refetchQueries({ queryKey: detailQuery.queryKey }).catch(() => undefined);
    } catch (error) {
      if (!report(error)) await deps.queryClient.refetchQueries({ queryKey: detailQuery.queryKey }).catch(() => undefined);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function toggle(role: GlobalRole, granted: boolean) {
    if (sending.current) return;
    if (role === 'app_admin' && granted) return setConfirming('appoint');
    if (role === 'app_admin' && !granted && isSelf) return setConfirming('dropSelf');
    void apply({ role, granted });
  }

  const notFound = user.isError && toApiError(user.error).code === 'not_found';
  const detail = user.data;
  const mutationError = setRole.isError && toApiError(setRole.error).code !== 'forbidden';
  const completeError = complete.isError && toApiError(complete.error).code !== 'forbidden';
  const deletion = detail?.user.deletion ?? null;
  return (
    <>
      <PageHeader back={back} title={detail?.user.displayName ?? t('admin.users')} />
      {!detail && !user.isError && <Loading />}
      {notFound && <StateNotice title={t('errors.not_found')} />}
      {/* A failed (re)read: with a confirmed detail the switches keep it, and the error offers a retry. */}
      {user.isError && !notFound && toApiError(user.error).code !== 'forbidden' && <QueryError error={user.error} onRetry={() => void user.refetch()} />}
      {detail && (
        <>
          <p className={`meta-line ${styles.userEmail}`}>{detail.user.email}</p>
          {isSelf && <p className="meta-line">{t('admin.yourAccount')}</p>}
          {deletion ? (
            <section className="settings-card" aria-labelledby="deletion-title">
              <h2 id="deletion-title">{t('admin.deletionSince', { date: date(deletion.requestedAt) })}</h2>
              {deletion.attempts > 0 && <p className="meta-line">{t('admin.deletionAttempts', { count: deletion.attempts })}</p>}
              {completeError && <p className="form-error" role="alert">{t(errorKey(complete.error))}</p>}
              <button type="button" className={`text-button wide ${danger.danger}`} disabled={!online || busy} onClick={() => void completeDeletion(detail.user.displayName)}>
                {t('admin.completeDeletion')}
              </button>
            </section>
          ) : (
            <section className="settings-card" aria-labelledby="roles-title">
              <h2 id="roles-title">{t('admin.roles')}</h2>
              {(['recipe_curator', 'app_admin'] as const).map((role) => {
                const locked = role === 'app_admin' && detail.user.lastAppAdmin;
                const on = detail.user.roles.includes(role);
                return (
                  <label key={role} className={styles.switch}>
                    <input type="checkbox" role="switch" checked={on} disabled={locked || !online || busy} onChange={() => toggle(role, !on)} />
                    <span>
                      {t(role === 'app_admin' ? 'admin.appAdmin' : 'admin.curator')}
                      <small>{locked ? t('admin.lastAppAdmin') : t(role === 'app_admin' ? 'admin.appAdminHint' : 'admin.curatorHint')}</small>
                    </span>
                  </label>
                );
              })}
              {mutationError && <p className="form-error" role="alert">{t(errorKey(setRole.error))}</p>}
            </section>
          )}
          <section className="settings-card" aria-labelledby="families-title">
            <h2 id="families-title">{t('admin.families')}</h2>
            {detail.families.length === 0 ? (
              <p>{t('admin.noFamilies')}</p>
            ) : (
              <ul className="row-list">
                {detail.families.map((family, index) => (
                  <li key={index}><span className="row-main">{family.name}<small>{t(`profile.role.${family.role}`)}</small></span></li>
                ))}
              </ul>
            )}
            <p className="meta-line">{t('admin.familiesNote')}</p>
          </section>
          {!deletion && (
            <div className={danger.dangerZone}>
              {isSelf ? (
                <p className="meta-line">
                  {t('admin.deleteSelf')} <Link to="/profile/preferences" className="link-inline">{t('profile.preferences')}</Link>
                </p>
              ) : (
                <Link to="/admin/users/$userId/delete" params={{ userId }} className={`text-button wide ${danger.dangerOutline}`}>{t('admin.deleteUser')}</Link>
              )}
            </div>
          )}
          <BottomSheet
            open={confirming !== null}
            title={confirming === 'dropSelf' ? t('admin.dropSelfTitle') : t('admin.appointTitle', { name: detail.user.displayName })}
            onClose={() => setConfirming(null)}
          >
            <p>{t(confirming === 'dropSelf' ? 'admin.dropSelfBody' : 'admin.appointBody')}</p>
            <div className={styles.sheetActions}>
              <button type="button" className="text-button" onClick={() => setConfirming(null)}>{t('admin.cancel')}</button>
              <button
                type="button"
                className={`text-button ${confirming === 'dropSelf' ? styles.danger : 'primary'}`}
                disabled={!online || busy}
                onClick={() => void apply({ role: 'app_admin', granted: confirming === 'appoint' })}
              >
                {t(confirming === 'dropSelf' ? 'admin.dropSelf' : 'admin.appoint')}
              </button>
            </div>
          </BottomSheet>
        </>
      )}
    </>
  );
}

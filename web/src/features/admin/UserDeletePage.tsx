import type { DeletionFamily, DeletionInput } from '@app/contract';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { errorKey, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps, type QueryDeps } from '../../api/queries';
import type { Api } from '../../api/types';
import danger from '../../components/Danger.module.css';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { DeletionFamilies, successorsComplete, validSuccessors } from '../account/DeletionFamilies';
import styles from '../account/Deletion.module.css';
import { AdminAccessGate, useAdminAccess } from './AdminAccess';
import adminStyles from './AdminPage.module.css';

type UserDeletionPlan = Awaited<ReturnType<Api['users']['getDeletionPlan']>>;
const route = getRouteApi('/_app/admin/users/$userId/delete');

/** What deleting a user does (not versioned: read again at every opening); under `users`, so the access check covers it. */
const userDeletionPlanQuery = ({ api }: QueryDeps, id: string) =>
  queryOptions({ queryKey: ['users', 'getDeletionPlan', { id }] as const, queryFn: () => api.users.getDeletionPlan({ id }) });

/** The plan changed under the page: the server refused the choices shown. */
const PLAN_CHANGED = ['conflict', 'invalid', 'last_app_admin'];

/**
 * `/admin/users/$userId/delete` (spec W11, «Cancellazione di un utente»): the account deletion
 * page told in the third person. Opening it only reads. The administrator's session stays open:
 * after the answer the page gives way to /admin, which says «Utente cancellato».
 */
export function UserDeletePage() {
  const t = useT();
  const { userId } = route.useParams();
  const back = (
    <Link to="/admin/users/$userId" params={{ userId }} className="page-back"><Icon name="chevron-left" />{t('admin.users')}</Link>
  );
  return (
    <section className="secondary-view app-view" aria-labelledby="user-delete-title">
      <div className="page-column">
        <AdminAccessGate fallbackHeader={<PageHeader back={back} title={t('admin.deleteUser')} titleId="user-delete-title" />}>
          <UserDeleteView userId={userId} back={back} />
        </AdminAccessGate>
      </div>
    </section>
  );
}

function UserDeleteView({ userId, back }: { userId: string; back: ReactNode }) {
  const t = useT();
  const plan = useQuery(userDeletionPlanQuery(useQueryDeps(), userId));
  // From the answer on, the page only waits to give way: a reread of the plan (now not_found) is not shown.
  const [leaving, setLeaving] = useState(false);
  const code = plan.isError ? toApiError(plan.error).code : null;

  let body;
  if (plan.data && (leaving || !plan.isError)) body = <Plan plan={plan.data} readAgain={() => void plan.refetch()} onLeaving={() => setLeaving(true)} />;
  else if (code === 'not_allowed') {
    body = (
      <p className="meta-line">
        {t('admin.deleteSelf')} <Link to="/profile/preferences" className="link-inline">{t('profile.preferences')}</Link>
      </p>
    );
  } else if (code === 'not_found') body = <StateNotice title={t('errors.not_found')} />;
  // forbidden: the access check takes over the page.
  else if (plan.isError && code !== 'forbidden') body = <QueryError error={plan.error} onRetry={() => void plan.refetch()} />;
  else body = <Loading />;

  const name = plan.data?.user.displayName;
  return (
    <>
      <PageHeader back={back} title={name ? t('admin.deleteTitle', { name }) : t('admin.deleteUser')} titleId="user-delete-title" />
      {body}
    </>
  );
}

function Plan({ plan, readAgain, onLeaving }: { plan: UserDeletionPlan; readAgain: () => void; onLeaving: () => void }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const navigate = useNavigate();
  const { report } = useAdminAccess();
  const { user } = plan;
  // Kept across new reads of the plan: only the choices still valid count (see validSuccessors).
  const [successors, setSuccessors] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState(false);
  const remove = useAreaMutation('users.delete', undefined, (input: DeletionInput) => api.users.delete({ id: user.id, ...input }), { track: `users:${user.id}` });
  const errorCode = remove.isError ? toApiError(remove.error).code : null;
  const ready = !plan.lastAppAdmin && successorsComplete(plan.families, successors);

  async function confirm() {
    const input: DeletionInput = {
      successors: validSuccessors(plan.families, successors),
      deletedFamilies: plan.families.filter((family) => family.outcome === 'deleted').map((family) => family.familyId)
    };
    try {
      // completed: false only means Auth is not done yet: the user is gone for the app anyway.
      await remove.mutateAsync(input);
    } catch (error) {
      if (report(error)) return;
      if (PLAN_CHANGED.includes(toApiError(error).code)) readAgain();
      return;
    }
    setLeaving(true);
    onLeaving();
    void navigate({ to: '/admin', replace: true, state: { userDeleted: user.displayName } });
  }

  const outcomeText = (family: DeletionFamily) => t(`admin.outcome.${family.outcome}`, { name: user.displayName });
  return (
    <>
      <p className={`meta-line ${adminStyles.userEmail}`}>{user.email}</p>
      {plan.lastAppAdmin && <StateNotice title={t('admin.lastAppAdminDelete')} />}
      <DeletionFamilies title={t('admin.deleteFamilies')} families={plan.families} outcomeText={outcomeText} successors={successors} onChange={setSuccessors} />
      <section className={`settings-card ${styles.card}`} aria-labelledby="user-what-goes">
        <h2 id="user-what-goes" className={styles.cardTitle}>{t('account.whatGoes')}</h2>
        <p>{t('admin.deleteWhatGoes')}</p>
        {plan.openInvitations > 0 && <p>{t('admin.deleteInvitations', { count: plan.openInvitations })}</p>}
        <p className="meta-line">{t('account.whatStays')}</p>
        {errorCode && errorCode !== 'forbidden' && (
          <p className="form-error" role="alert">{PLAN_CHANGED.includes(errorCode) ? t('admin.deleteConflict') : t(errorKey(remove.error))}</p>
        )}
        <button
          type="button"
          className={`text-button wide ${danger.danger} ${styles.confirm}`}
          disabled={!online || !ready || remove.isPending || leaving}
          onClick={() => void confirm()}
        >
          {t('admin.deleteConfirm', { name: user.displayName })}
        </button>
      </section>
    </>
  );
}

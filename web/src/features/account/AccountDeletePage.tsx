import type { DeletionFamily, DeletionInput } from '@app/contract';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { errorKey, isBlocking, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps, type QueryDeps } from '../../api/queries';
import type { Api } from '../../api/types';
import danger from '../../components/Danger.module.css';
import { Icon } from '../../components/Icon';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingArea } from '../../components/Skeleton';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { useSignOut } from '../../session/SessionScope';
import { DeletionFamilies, DeletionFamilySkeleton, successorsComplete, validSuccessors, WhatGoesSkeleton } from './DeletionFamilies';
import styles from './Deletion.module.css';

type DeletionPlanView = Awaited<ReturnType<Api['account']['getDeletionPlan']>>;

/** What deleting the account does, family by family (not versioned: read again at every opening). */
const deletionPlanQuery = ({ api }: QueryDeps) =>
  queryOptions({ queryKey: ['account', 'getDeletionPlan'] as const, queryFn: () => api.account.getDeletionPlan({}) });

/** The plan changed under the page: the server refused the choices shown. */
const PLAN_CHANGED = ['conflict', 'invalid', 'last_app_admin'];

/**
 * `/profile/account/delete` (spec W11, «Cancellazione dell'account»): opening it only reads; the
 * red button stays disabled offline, for the last app administrator and while a family lacks its
 * successor. After the answer, completed or not, the person is already out: the session closes
 * with the copy on the device, and the sign-in page says «Account cancellato.».
 */
export function AccountDeletePage() {
  const t = useT();
  const plan = useQuery(deletionPlanQuery(useQueryDeps()));

  let body;
  if (plan.isError && isBlocking(plan.error, !!plan.data)) body = <QueryError error={plan.error} onRetry={() => void plan.refetch()} />;
  else if (!plan.data) {
    // While the plan loads (W22): the families' title, a family and «Cosa sparisce» with the red button.
    body = (
      <LoadingArea
        loading
        paused={plan.fetchStatus === 'paused'}
        skeleton={
          <>
            <h2 className={`${styles.sectionTitle} skeleton-line`} />
            <DeletionFamilySkeleton />
            <WhatGoesSkeleton />
          </>
        }
      />
    );
  }
  else body = <Plan plan={plan.data} readAgain={() => void plan.refetch()} />;

  return (
    <section className="secondary-view app-view" aria-labelledby="account-delete-title">
      <div className="page-column">
        <PageHeader
          back={
            <Link to="/profile/preferences" className="page-back">
              <Icon name="chevron-left" />{t('profile.preferences')}
            </Link>
          }
          title={t('account.delete')}
          titleId="account-delete-title"
        />
        {body}
      </div>
    </section>
  );
}

function Plan({ plan, readAgain }: { plan: DeletionPlanView; readAgain: () => void }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const signOut = useSignOut();
  // Kept across new reads of the plan: only the choices still valid count (see validSuccessors).
  const [successors, setSuccessors] = useState<Record<string, string>>({});
  const [leaving, setLeaving] = useState(false);
  const remove = useAreaMutation('account.delete', undefined, (input: DeletionInput) => api.account.delete(input));
  const changed = remove.isError && PLAN_CHANGED.includes(toApiError(remove.error).code);
  const ready = !plan.lastAppAdmin && successorsComplete(plan.families, successors);

  async function confirm() {
    const input: DeletionInput = {
      successors: validSuccessors(plan.families, successors),
      deletedFamilies: plan.families.filter((family) => family.outcome === 'deleted').map((family) => family.familyId)
    };
    try {
      // completed: false only means Auth is not done yet: the account is gone for the app anyway.
      await remove.mutateAsync(input);
    } catch (error) {
      if (PLAN_CHANGED.includes(toApiError(error).code)) readAgain();
      return;
    }
    setLeaving(true);
    await signOut('accountDeleted');
  }

  const outcomeText = (family: DeletionFamily) => t(`account.outcome.${family.outcome}`);
  return (
    <>
      {plan.lastAppAdmin && <StateNotice title={t('account.lastAppAdmin')} body={t('account.lastAppAdminBody')} />}
      <DeletionFamilies title={t('account.families')} families={plan.families} outcomeText={outcomeText} successors={successors} onChange={setSuccessors} />
      <section className={`settings-card ${styles.card}`} aria-labelledby="account-what-goes">
        <h2 id="account-what-goes" className={styles.cardTitle}>{t('account.whatGoes')}</h2>
        <p>{t('account.whatGoesBody')}</p>
        {plan.connectedAgents > 0 && <p>{t('account.agents', { count: plan.connectedAgents })}</p>}
        {plan.openInvitations > 0 && <p>{t('account.invitations', { count: plan.openInvitations })}</p>}
        <p className="meta-line">{t('account.whatStays')}</p>
        {remove.isError && <p className="form-error" role="alert">{changed ? t('account.conflict') : t(errorKey(remove.error))}</p>}
        <button
          type="button"
          className={`text-button wide ${danger.danger} ${styles.confirm}`}
          disabled={!online || !ready || remove.isPending || leaving}
          onClick={() => void confirm()}
        >
          {t('account.delete')}
        </button>
      </section>
    </>
  );
}

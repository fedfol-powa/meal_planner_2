import { queryOptions, useQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { errorKey, isBlocking } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { readThrough, useQueryDeps, type QueryDeps, type Versioned } from '../../api/queries';
import type { Api } from '../../api/types';
import danger from '../../components/Danger.module.css';
import { Icon } from '../../components/Icon';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { ButtonSkeleton } from '../../components/PageSkeletons';
import { LoadingArea } from '../../components/Skeleton';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { useSession, useSessionRevision } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import styles from './FamilyDeletePage.module.css';

const route = getRouteApi('/_app/profile/family/delete');

type FamilyDeletionView = Extract<Awaited<ReturnType<Api['family']['getDeletion']>>, { unchanged: false }>['data'];

/** What deleting the family removes (versioned, read only: nothing is deleted on opening). */
const deletionQuery = ({ api, queryClient, locale }: QueryDeps, familyId: string) => {
  const queryKey = ['family', 'getDeletion', { familyId, locale }] as const;
  return queryOptions({
    queryKey,
    queryFn: () => readThrough(queryClient, queryKey, (knownVersion) => api.family.getDeletion({ familyId, knownVersion })),
    select: (value: Versioned<FamilyDeletionView>) => value.data
  });
};

/**
 * `/profile/family/delete?family=<id>` (spec W11, «Eliminazione della famiglia»): the page the
 * settings and the agents link to. Opening it only reads; the server checks the role again at
 * the confirmation. A family no longer accessible shows the state of revoked access.
 */
export function FamilyDeletePage() {
  const t = useT();
  const { family: requested } = route.useSearch();
  const profile = useProfile();
  const session = useSession();
  useSessionRevision();
  const familyId = requested ?? profile.data?.currentFamilyId ?? null;
  const allowed = !!familyId && !session.isRevoked(familyId);
  const summary = useQuery({ ...deletionQuery(useQueryDeps(), familyId ?? ''), enabled: allowed });

  let body;
  if (!familyId && !profile.data) body = <SummarySkeleton paused={profile.fetchStatus === 'paused'} />;
  else if (!familyId || !allowed) body = <StateNotice title={t('errors.forbidden')} />;
  else if (summary.isError && isBlocking(summary.error, !!summary.data)) body = <QueryError error={summary.error} onRetry={() => void summary.refetch()} />;
  else if (!summary.data) body = <SummarySkeleton paused={summary.fetchStatus === 'paused'} />;
  else body = <Summary familyId={familyId} view={summary.data} />;

  return (
    <section className="secondary-view app-view" aria-labelledby="delete-title">
      <div className="page-column">
        <PageHeader
          back={
            <Link to="/profile/family/settings" className="page-back">
              <Icon name="chevron-left" />{t('profile.settings')}
            </Link>
          }
          title={t('deleteFamily.title')}
          titleId="delete-title"
        />
        {body}
      </div>
    </section>
  );
}

/** The summary while the profile or the summary loads (W22): name, text, two facts, the note, the red button. */
function SummarySkeleton({ paused }: { paused: boolean }) {
  return (
    <LoadingArea
      loading
      paused={paused}
      skeleton={
        <section className="settings-card skeleton-card">
          <h2 className="skeleton-line" />
          <p><span className="skeleton-line" /></p>
          <ul className={styles.facts}>
            <li><span className="skeleton-line" /></li>
            <li><span className="skeleton-line" /></li>
          </ul>
          <p className="meta-line"><span className="skeleton-line" /></p>
          <ButtonSkeleton wide className={styles.confirm} />
        </section>
      }
    />
  );
}

function Summary({ familyId, view }: { familyId: string; view: FamilyDeletionView }) {
  const t = useT();
  const { api } = useQueryDeps();
  const online = useOnline();
  const session = useSession();
  const navigate = useNavigate();
  const remove = useAreaMutation('family.delete', familyId, () => api.family.delete({ familyId }));

  async function confirm() {
    try {
      const { view: profile } = await remove.mutateAsync(undefined);
      // The family's data leaves the device before the next page; then as after leaving.
      session.revoke(familyId);
      void navigate({ to: profile.families.some((f) => f.id !== familyId) ? '/profile' : '/menu' });
    } catch {
      // Shown below; forbidden revokes the family through the session and shows the revoked state.
    }
  }

  return (
    <section className="settings-card">
      <h2>{view.name}</h2>
      <p>{t('deleteFamily.removed', { members: view.memberNames.join(', ') })}</p>
      <ul className={styles.facts}>
        <li>{t('deleteFamily.weeks', { count: view.weekCount })}</li>
        <li>{t('deleteFamily.data')}</li>
      </ul>
      <p className="meta-line">{t('deleteFamily.kept')}</p>
      {view.canDelete ? (
        <>
          {remove.isError && <p className="form-error" role="alert">{t(errorKey(remove.error))}</p>}
          <button type="button" className={`text-button wide ${danger.danger} ${styles.confirm}`} disabled={!online || remove.isPending} onClick={() => void confirm()}>
            {t('deleteFamily.confirm', { family: view.name })}
          </button>
        </>
      ) : (
        <p className={styles.blocked} role="status">{t('deleteFamily.adminOnly')}</p>
      )}
    </section>
  );
}

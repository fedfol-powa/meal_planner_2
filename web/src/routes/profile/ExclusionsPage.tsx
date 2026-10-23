import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { errorKey, isBlocking } from '../../api/errors';
import { exclusionsQuery } from '../../api/family';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import type { FamilyView } from '../../api/types';
import { FamilyGate } from '../../components/FamilyGate';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { ButtonSkeleton, SettingsCardSkeleton, SkeletonRows } from '../../components/PageSkeletons';
import { BusyArea, LoadingScope, Skeleton } from '../../components/Skeleton';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { formatDayMonth } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from './BackToProfile';
import type { ReactNode } from 'react';
import styles from './profile.module.css';

/** «Non proporre più» (spec section 2): every member reads it and brings recipes back. */
export function ExclusionsPage() {
  return <FamilyGate waiting={(paused) => <ExclusionsLayout loading paused={paused} />}>{(family) => <Exclusions family={family} />}</FamilyGate>;
}

/** The page around its content; while loading (profile or list, W22) a card of three rows of one wait. */
function ExclusionsLayout({ loading = false, paused = false, children }: { loading?: boolean; paused?: boolean; children?: ReactNode }) {
  const t = useT();
  return (
    <section className="secondary-view app-view" aria-labelledby="exclusions-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('profile.exclusions')} titleId="exclusions-title" />
        {loading ? (
          <LoadingScope loading paused={paused}>
            <BusyArea>
              <Skeleton>
                <SettingsCardSkeleton title={false}>
                  <SkeletonRows count={3} className={styles.wrap} action={<ButtonSkeleton className={styles.small} />} />
                </SettingsCardSkeleton>
              </Skeleton>
            </BusyArea>
          </LoadingScope>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Exclusions({ family }: { family: FamilyView }) {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const online = useOnline();
  const list = useQuery(exclusionsQuery(deps, family.id));
  const include = useAreaMutation('family.removeExclusion', family.id, (recipeId: string) => deps.api.family.removeExclusion({ familyId: family.id, recipeId }));
  const blocked = list.isError && isBlocking(list.error, !!list.data);

  if (!blocked && !list.data) return <ExclusionsLayout loading paused={list.fetchStatus === 'paused'} />;

  return (
    <ExclusionsLayout>
      {blocked && <QueryError error={list.error} onRetry={() => void list.refetch()} />}
      {list.data && list.data.length === 0 && <StateNotice title={t('exclusions.empty')} body={t('exclusions.emptyBody')} />}
      {list.data && list.data.length > 0 && (
        <section className="settings-card">
          <ul className="row-list">
            {list.data.map((item) => (
              <li key={item.recipe.id} className={styles.wrap}>
                <span className="row-main">
                  <Link to="/recipes/$recipeId" params={{ recipeId: item.recipe.id }} className="link-inline">{item.recipe.name}</Link>
                  <small>
                    {t('exclusions.by', { name: item.createdByName ?? t('meal.formerMember'), time: formatDayMonth(locale, item.createdAt.slice(0, 10)) })}
                  </small>
                  {item.reason && <small>{item.reason}</small>}
                </span>
                <button
                  type="button"
                  className={`text-button ${styles.small}`}
                  aria-label={t('exclusions.includeLabel', { name: item.recipe.name })}
                  disabled={!online || include.isPending}
                  onClick={() => include.mutate(item.recipe.id)}
                >
                  {t('exclusions.include')}
                </button>
              </li>
            ))}
          </ul>
          {include.isError && <p className="meta-line" role="alert">{t(errorKey(include.error))}</p>}
        </section>
      )}
    </ExclusionsLayout>
  );
}

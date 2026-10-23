import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { errorKey, isBlocking } from '../api/errors';
import { exclusionsQuery, familyQuery } from '../api/family';
import { useAreaMutation } from '../api/mutations';
import { useQueryDeps } from '../api/queries';
import { hasAppAdmin } from '../features/admin/access';
import { agentsQuery } from '../features/agents/api';
import type { FamilyView } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useOnline } from '../components/OfflineBanner';
import { Icon } from '../components/Icon';
import { SettingsCardSkeleton, SkeletonRows, TitleSkeleton } from '../components/PageSkeletons';
import { BusyArea, LoadingScope, Skeleton } from '../components/Skeleton';
import { QueryError } from '../components/QueryError';
import { useT } from '../i18n/LocaleProvider';
import { useFamily, useProfile } from '../session/useFamily';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const t = useT();
  const { state, backend } = useAuth();
  const read = useProfile();
  const family = useFamily();
  const online = useOnline();
  const deps = useQueryDeps();
  const agents = useQuery(agentsQuery(deps));
  const blocked = read.isError && isBlocking(read.error, !!read.data);
  // No cached profile next to a blocking error (second review, C8).
  const profile = blocked ? undefined : read.data;
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');
  const choose = useAreaMutation('profile.setCurrentFamily', undefined, (familyId: string) => deps.api.profile.setCurrentFamily({ familyId }));
  const waiting = !blocked && !read.data;

  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <LoadingScope loading={waiting} paused={read.fetchStatus === 'paused'}>
          <header className={styles.header}>
            {/* While the profile loads (W22) name and email are blocks of the page's wait. */}
            <h1 className={styles.name} aria-hidden={waiting || undefined}>{waiting ? <TitleSkeleton width="50%" /> : (profile?.user.displayName ?? email)}</h1>
            {waiting ? <Skeleton as="p" className={`${styles.email} skeleton-block`} style={{ width: '40%', height: '1lh' }} /> : profile && <p className={styles.email}>{email}</p>}
          </header>
          {blocked && <QueryError error={read.error} onRetry={() => void read.refetch()} />}
          {waiting && (
            <BusyArea>
              <Skeleton>
                <SettingsCardSkeleton>
                  <SkeletonRows count={3} link lead trail small={0} />
                </SettingsCardSkeleton>
                <SettingsCardSkeleton>
                  <SkeletonRows count={1} link className={styles.family} />
                  {/* An inline link in the real card: an invisible space keeps its line box. */}
                  <span className="link-inline">{'\u00a0'}</span>
                </SettingsCardSkeleton>
              </Skeleton>
            </BusyArea>
          )}
          {family.status === 'ready' && <FamilyCard family={family.family} />}
          {profile && profile.families.length > 0 && (
            <section className="settings-card" aria-labelledby="families-title">
              <h2 id="families-title">{t('profile.families')}</h2>
              <ul className="row-list">
                {profile.families.map((item) => {
                  const current = item.id === profile.currentFamilyId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`row-link ${styles.family}`}
                        aria-pressed={current}
                        disabled={!online || choose.isPending}
                        onClick={() => !current && choose.mutate(item.id)}
                      >
                        <span className="row-main">{item.name}<small>{t(`profile.role.${item.role}`)}</small></span>
                        {current && <span className={styles.current} role="img" aria-label={t('profile.current')}><Icon name="check" /></span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {choose.isError && <p className="meta-line" role="alert">{t(errorKey(choose.error))}</p>}
              <Link to="/family/new" className="link-inline">{t('profile.newFamily')}</Link>
            </section>
          )}
          {/* Always reachable: language and sign-out must work even without a profile or a family. */}
          <section className="settings-card" aria-labelledby="account-title">
            <h2 id="account-title">{t('profile.account')}</h2>
            <ul className="row-list">
              <li>
                <Link to="/profile/preferences" className="row-link">
                  <Icon name="user" />
                  <span className="row-main">{t('profile.preferences')}<small>{t('profile.preferencesHint')}</small></span>
                  <Icon name="chevron-right" />
                </Link>
              </li>
              {backend.mode === 'supabase' && (
                <li>
                  <Link to="/profile/password" className="row-link">
                    <Icon name="lock" />
                    <span className="row-main">{t('profile.password')}<small>{t('profile.passwordHint')}</small></span>
                    <Icon name="chevron-right" />
                  </Link>
                </li>
              )}
              <li>
                <Link to="/profile/agents" className="row-link">
                  <Icon name="link" />
                  <span className="row-main">
                    {t('profile.agents')}
                    <small>{agents.data?.length ? t('profile.agentsCount', { count: agents.data.length }) : t('profile.agentsHint')}</small>
                  </span>
                  <Icon name="chevron-right" />
                </Link>
              </li>
              {hasAppAdmin(profile) && (
                <li>
                  <Link to="/admin" className="row-link">
                    <Icon name="gear" />
                    <span className="row-main">{t('profile.admin')}<small>{t('profile.adminHint')}</small></span>
                    <Icon name="chevron-right" />
                  </Link>
                </li>
              )}
            </ul>
          </section>
        </LoadingScope>
      </div>
    </section>
  );
}

/** The family shown, with its pages; the counts come from the family's own reads. */
function FamilyCard({ family }: { family: FamilyView }) {
  const t = useT();
  const deps = useQueryDeps();
  const detail = useQuery(familyQuery(deps, family.id));
  const exclusions = useQuery(exclusionsQuery(deps, family.id));
  return (
    <section className="settings-card" aria-labelledby="family-title">
      <h2 id="family-title">{family.name}</h2>
      <ul className="row-list">
        <li>
          <Link to="/profile/family" className="row-link">
            <Icon name="users" />
            <span className="row-main">
              {t('profile.members')}
              {detail.data && <small>{t('profile.membersCount', { count: detail.data.members.length })}</small>}
            </span>
            <Icon name="chevron-right" />
          </Link>
        </li>
        <li>
          <Link to="/profile/family/settings" className="row-link">
            <Icon name="gear" />
            <span className="row-main">{t('profile.settings')}</span>
            <Icon name="chevron-right" />
          </Link>
        </li>
        <li>
          <Link to="/profile/family/exclusions" className="row-link">
            <Icon name="ban" />
            <span className="row-main">
              {t('profile.exclusions')}
              {exclusions.data && <small>{t('profile.exclusionsCount', { count: exclusions.data.length })}</small>}
            </span>
            <Icon name="chevron-right" />
          </Link>
        </li>
      </ul>
    </section>
  );
}

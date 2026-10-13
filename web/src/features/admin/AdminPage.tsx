import { Link } from '@tanstack/react-router';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { QueryError } from '../../components/QueryError';
import { StateNotice } from '../../components/StateNotice';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { useProfile } from '../../session/useFamily';
import { hasAppAdmin } from './access';
import { InvitationsSection } from './InvitationsSection';

/**
 * App administration (spec section 7, W9): its sections in sequence. Only «Inviti all'app» for
 * now; the users (B) go above it, the restore (E) after. No placeholders.
 */
export function AdminPage() {
  const t = useT();
  const profile = useProfile();
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('admin.title')} />
        {!profile.data && !profile.isError && <Loading />}
        {!profile.data && profile.isError && <QueryError error={profile.error} onRetry={() => void profile.refetch()} />}
        {profile.data && !hasAppAdmin(profile.data) && (
          <StateNotice title={t('admin.noAccess')}>
            <Link to="/profile" className="text-button">{t('nav.profile')}</Link>
          </StateNotice>
        )}
        {hasAppAdmin(profile.data) && <InvitationsSection />}
      </div>
    </section>
  );
}

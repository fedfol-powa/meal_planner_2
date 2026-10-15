import { PageHeader } from '../../components/PageHeader';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { useProfile } from '../../session/useFamily';
import { AdminAccessGate, AdminAccessProvider } from './AdminAccess';
import { InvitationsSection } from './InvitationsSection';
import { UsersSection } from './UsersSection';

/**
 * App administration (spec section 7, W9 and W10): its sections in sequence, Utenti (B) then
 * «Inviti all'app»; the restore (E) goes after. No placeholders.
 */
export function AdminPage() {
  const t = useT();
  const profile = useProfile();
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('admin.title')} />
        <AdminAccessProvider>
          <AdminAccessGate profile={profile}>
            <UsersSection />
            <InvitationsSection />
          </AdminAccessGate>
        </AdminAccessProvider>
      </div>
    </section>
  );
}

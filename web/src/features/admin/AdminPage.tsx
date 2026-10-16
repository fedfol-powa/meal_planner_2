import { useLocation } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { AdminAccessGate } from './AdminAccess';
import { InvitationsSection } from './InvitationsSection';
import { UsersSection } from './UsersSection';

/**
 * App administration (spec section 7, W9 and W10): its sections in sequence, Utenti (B) then
 * «Inviti all'app»; the restore (E) goes after. No placeholders.
 */
export function AdminPage() {
  const t = useT();
  // Set by the deletion of a user, which this page replaced in the history.
  const deleted = useLocation({ select: (location) => location.state.userDeleted });
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('admin.title')} />
        <AdminAccessGate>
          {deleted && <p className="state-notice" role="status">{t('admin.deleted', { name: deleted })}</p>}
          <UsersSection />
          <InvitationsSection />
        </AdminAccessGate>
      </div>
    </section>
  );
}

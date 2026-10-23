import { useLocation } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { LoadingArea, LoadingScope } from '../../components/Skeleton';
import { useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { AdminAccessGate } from './AdminAccess';
import { InvitationsCardSkeleton, InvitationsSection } from './InvitationsSection';
import { UsersCardSkeleton, UsersSection } from './UsersSection';

/**
 * App administration (spec section 7, W9 and W10): its sections in sequence, Utenti (B) then
 * «Inviti all'app»; the restore (E) goes after. No placeholders. The access check and the two lists are
 * one wait of the page (W22): one announcement, the deletion notice keeps its own status.
 */
export function AdminPage() {
  const t = useT();
  // Set by the deletion of a user, which this page replaced in the history.
  const deleted = useLocation({ select: (location) => location.state.userDeleted });
  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('admin.title')} />
        <LoadingScope gather>
          <AdminAccessGate
            waiting={(paused) => (
              <LoadingArea
                loading
                paused={paused}
                skeleton={
                  <>
                    <UsersCardSkeleton />
                    <InvitationsCardSkeleton />
                  </>
                }
              />
            )}
          >
            {deleted && <p className="state-notice" role="status">{t('admin.deleted', { name: deleted })}</p>}
            <UsersSection />
            <InvitationsSection />
          </AdminAccessGate>
        </LoadingScope>
      </div>
    </section>
  );
}

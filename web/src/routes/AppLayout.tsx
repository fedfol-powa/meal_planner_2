import { Outlet, useLocation } from '@tanstack/react-router';
import { BottomNav } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';
import { ShoppingQueueProvider } from '../features/shopping/ShoppingQueueProvider';
import { useT } from '../i18n/LocaleProvider';

export function AppLayout() {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    // The shopping queue lives with the session's screens: it also sends when the list is not open.
    <ShoppingQueueProvider>
      <div className="shell">
        <a className="skip-link" href="#app-content">{t('skip')}</a>
        <OfflineBanner pathname={pathname} />
        <main className="app-content" id="app-content" tabIndex={-1}>
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </ShoppingQueueProvider>
  );
}

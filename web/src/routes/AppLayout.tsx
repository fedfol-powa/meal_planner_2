import { Outlet, useLocation } from '@tanstack/react-router';
import { BottomNav } from '../components/BottomNav';
import { OfflineBanner } from '../components/OfflineBanner';
import { useT } from '../i18n/LocaleProvider';

export function AppLayout() {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <div className="shell">
      <a className="skip-link" href="#app-content">{t('skip')}</a>
      <OfflineBanner pathname={pathname} />
      <main className="app-content" id="app-content" tabIndex={-1}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

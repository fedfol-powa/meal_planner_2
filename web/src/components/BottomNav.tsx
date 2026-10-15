import { Link, useLocation } from '@tanstack/react-router';
import { useT } from '../i18n/LocaleProvider';
import { rememberedMenuDay } from '../routes/menu/lastDay';
import { Icon } from './Icon';

const underProfile = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/family/new';

export function BottomNav() {
  const t = useT();
  const pathname = useLocation({ select: (location) => location.pathname });
  // A tap on Menu while the menu is open goes back to the opening day; from elsewhere it keeps the day.
  const day = pathname === '/menu' ? undefined : rememberedMenuDay();
  return (
    <nav className="bottom-navigation" aria-label={t('nav.main')}>
      <Link to="/menu" search={day ? { day } : {}} className="navigation-item" aria-label={t('nav.menu')} activeOptions={{ includeSearch: false }}>
        <span className="navigation-icon"><Icon name="calendar" /></span>
      </Link>
      <Link to="/recipes" className="navigation-item" aria-label={t('nav.recipes')} activeOptions={{ includeSearch: false }}>
        <span className="navigation-icon"><Icon name="book" /></span>
      </Link>
      {/* The administration and the new family wizard are reached from the profile: it stays marked there. */}
      <Link to="/profile" className="navigation-item" aria-label={t('nav.profile')} {...(underProfile(pathname) ? { 'aria-current': 'page' as const } : {})}>
        <span className="navigation-icon"><Icon name="user" /></span>
      </Link>
    </nav>
  );
}

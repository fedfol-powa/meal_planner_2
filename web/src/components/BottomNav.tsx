import { Link, useLocation } from '@tanstack/react-router';
import { useT } from '../i18n/LocaleProvider';
import { rememberedMenuDay } from '../routes/menu/lastDay';
import { Icon } from './Icon';

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
      <Link to="/profile" className="navigation-item" aria-label={t('nav.profile')}>
        <span className="navigation-icon"><Icon name="user" /></span>
      </Link>
    </nav>
  );
}

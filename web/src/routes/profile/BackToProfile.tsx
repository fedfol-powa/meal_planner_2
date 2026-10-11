import { Link } from '@tanstack/react-router';
import { Icon } from '../../components/Icon';
import { useT } from '../../i18n/LocaleProvider';

/** Back link of the profile's secondary pages. */
export function BackToProfile() {
  const t = useT();
  return (
    <Link to="/profile" className="page-back">
      <Icon name="chevron-left" />{t('nav.profile')}
    </Link>
  );
}

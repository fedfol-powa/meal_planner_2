import { useT } from '../i18n/LocaleProvider';

export function ProfilePage() {
  const t = useT();
  return <section className="secondary-view app-view"><h1 className="page-title">{t('nav.profile')}</h1></section>;
}

import { useT } from '../i18n/LocaleProvider';

export function LoginPage() {
  const t = useT();
  return <main className="entry-page"><h1 className="page-title">{t('auth.title')}</h1></main>;
}

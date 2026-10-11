import { Link } from '@tanstack/react-router';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';

export function NotFound() {
  const t = useT();
  return (
    <main className="secondary-view app-view" id="app-content">
      <StateNotice title={t('notFound.title')}>
        <Link to="/menu" className="text-button">{t('notFound.action')}</Link>
      </StateNotice>
    </main>
  );
}

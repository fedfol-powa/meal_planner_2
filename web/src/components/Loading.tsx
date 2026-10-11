import { useT } from '../i18n/LocaleProvider';

export function Loading() {
  const t = useT();
  return <p className="loading" role="status">{t('common.loading')}</p>;
}

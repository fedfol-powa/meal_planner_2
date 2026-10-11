import { errorKey } from '../api/errors';
import { useT } from '../i18n/LocaleProvider';
import { StateNotice } from './StateNotice';

/** A failed read with a way out: «Riprova» repeats it (review, finding 9). */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  return (
    <StateNotice title={t(errorKey(error))}>
      <button type="button" className="text-button" onClick={onRetry}>{t('common.retry')}</button>
    </StateNotice>
  );
}

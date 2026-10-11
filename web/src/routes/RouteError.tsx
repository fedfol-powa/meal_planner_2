import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { errorKey } from '../api/errors';
import { StateNotice } from '../components/StateNotice';
import { useT } from '../i18n/LocaleProvider';

export function RouteError({ error, reset }: ErrorComponentProps) {
  const t = useT();
  const router = useRouter();
  const queryReset = useQueryErrorResetBoundary();
  return (
    <section className="secondary-view app-view">
      <StateNotice title={t(errorKey(error))}>
        <button type="button" className="text-button" onClick={() => { queryReset.reset(); reset(); void router.invalidate(); }}>
          {t('common.retry')}
        </button>
      </StateNotice>
    </section>
  );
}

import type { ReactNode } from 'react';
import type { FamilyView } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import { useFamily } from '../session/useFamily';
import { Loading } from './Loading';
import { QueryError } from './QueryError';
import { StateNotice } from './StateNotice';

/**
 * In front of every family screen: its reads start only with a family that is still allowed.
 * `before` and `after`: what the screen shows also without a family (the curator's sections of
 * the recipe book), placed around the notice.
 */
export function FamilyGate({ children, before, after }: { children: (family: FamilyView) => ReactNode; before?: ReactNode; after?: ReactNode }) {
  const t = useT();
  const state = useFamily();
  if (state.status === 'ready') return <>{children(state.family)}</>;
  return (
    <section className="secondary-view app-view">
      {before}
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <QueryError error={state.error} onRetry={state.retry} />}
      {state.status === 'none' && <StateNotice title={t('family.none.title')} body={t('family.none.body')} />}
      {state.status === 'revoked' && <StateNotice title={t('errors.forbidden')} />}
      {after}
    </section>
  );
}

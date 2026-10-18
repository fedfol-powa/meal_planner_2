import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { FamilyView } from '../api/types';
import { useT } from '../i18n/LocaleProvider';
import { useFamily, type FamilyState } from '../session/useFamily';
import { Loading } from './Loading';
import { QueryError } from './QueryError';
import { StateNotice } from './StateNotice';

/**
 * In front of every family screen: its reads start only with a family that is still allowed.
 * `waiting`: the page's own waiting layout (W20), shown instead of «Caricamento…» while the profile loads,
 * so the page keeps its shape; `paused` when the read waits for the network.
 * `before` and `after`: what the screen shows also without a family (the curator's sections of
 * the recipe book), placed around the notice.
 */
export function FamilyGate({ children, waiting, before, after }: { children: (family: FamilyView) => ReactNode; waiting?: (paused: boolean) => ReactNode; before?: ReactNode; after?: ReactNode }) {
  const state = useFamily();
  if (state.status === 'ready') return <>{children(state.family)}</>;
  if (state.status === 'loading' && waiting) return <>{waiting(state.paused)}</>;
  return (
    <section className="secondary-view app-view">
      {before}
      {state.status === 'loading' ? <Loading /> : <FamilyNotice state={state} />}
      {after}
    </section>
  );
}

/** The notices of a profile that cannot show a family: failed read, no family, revoked family. */
export function FamilyNotice({ state }: { state: Exclude<FamilyState, { status: 'ready' } | { status: 'loading' }> }) {
  const t = useT();
  if (state.status === 'error') return <QueryError error={state.error} onRetry={state.retry} />;
  if (state.status === 'none') {
    return (
      <StateNotice title={t('family.none.title')} body={t('family.none.body')}>
        <Link to="/family/new" className="text-button primary">{t('family.none.create')}</Link>
        <p className="state-notice-hint">{t('family.none.invitation')}</p>
      </StateNotice>
    );
  }
  return <StateNotice title={t('errors.forbidden')} />;
}

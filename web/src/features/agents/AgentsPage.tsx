import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { errorKey, isBlocking } from '../../api/errors';
import { useQueryDeps } from '../../api/queries';
import type { ConnectedAgent } from '@app/contract';
import { BottomSheet } from '../../components/BottomSheet';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { ButtonSkeleton, SkeletonRows } from '../../components/PageSkeletons';
import { LoadingArea } from '../../components/Skeleton';
import { QueryError } from '../../components/QueryError';
import { env } from '../../env';
import { formatDayMonth, formatDayMonthYear } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { BackToProfile } from '../../routes/profile/BackToProfile';
import { useProfile } from '../../session/useFamily';
import { agentsQuery } from './api';
import { ClientGuide } from './ClientGuide';
import { CLIENT_GUIDES, guideFor, mcpUrl } from './clientGuides';
import { CopyField } from './CopyField';
import { formatRenewal } from './format';
import styles from './AgentsPage.module.css';

const SKILL_ZIP = '/downloads/cosa-si-mangia.zip';
const SKILL_STEPS = ['agents.skillStep1', 'agents.skillStep2', 'agents.skillStep3', 'agents.skillStep4'] as const;

/** «Collega un agente» (spec section 13, round 6): address, clients, sign-in, examples, the Claude skill (W17), connected agents. */
export function AgentsPage() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const queryClient = useQueryClient();
  const online = useOnline();
  const curator = useProfile().data?.user.globalRoles.includes('recipe_curator') ?? false;
  // Production: the Worker serves the SPA and /mcp on one origin. Vite dev: the Worker it forwards /api to (review, finding 9).
  const url = mcpUrl(env.serviceOrigin ?? window.location.origin);
  const agents = useQuery(agentsQuery(deps));
  const [leaving, setLeaving] = useState<ConnectedAgent | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // A second click arrives before the re-render: the ref keeps it to one call.
  const sending = useRef(false);
  const nameOf = (agent: ConnectedAgent) => agent.name || t('agents.unnamed');
  const disconnect = useMutation({
    mutationFn: (agent: ConnectedAgent) => deps.api.agents.disconnect({ clientId: agent.clientId }),
    onSuccess: (_result, agent) => {
      setLeaving(null);
      setDone(t('agents.disconnected', { client: nameOf(agent) }));
      // No optimistic update: the list is read again from the server.
      void queryClient.invalidateQueries({ queryKey: ['agents', 'list'] });
    }
  });
  const blocked = agents.isError && isBlocking(agents.error, !!agents.data);
  const confirm = (agent: ConnectedAgent) => {
    if (sending.current) return;
    sending.current = true;
    disconnect.mutate(agent, { onSettled: () => (sending.current = false) });
  };
  // Each opening starts clean: no error of an earlier attempt, no old «scollegato».
  const open = (agent: ConnectedAgent) => {
    disconnect.reset();
    setDone(null);
    setLeaving(agent);
  };
  const removal = (agent: ConnectedAgent) => {
    const key = guideFor(agent.name);
    return key ? t(CLIENT_GUIDES[key].remove) : t('agents.removeGeneric');
  };

  return (
    <section className="secondary-view app-view" aria-labelledby="agents-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('agents.title')} titleId="agents-title" />

        <section className="settings-card" aria-labelledby="address-title">
          <h2 id="address-title">{t('agents.address')}</h2>
          <CopyField value={url} label={t('agents.address')} />
        </section>

        <section className="settings-card" aria-labelledby="client-title">
          <h2 id="client-title">{t('agents.choose')}</h2>
          <ClientGuide url={url} />
        </section>

        <section className="settings-card" aria-labelledby="sign-in-title">
          <h2 id="sign-in-title">{t('agents.signIn')}</h2>
          <p>{t('agents.signInBody')}</p>
        </section>

        <section className="settings-card" aria-labelledby="try-title">
          <h2 id="try-title">{t('agents.try')}</h2>
          <p>{t('agents.tryBody')}</p>
          <ul className={styles.examples}>
            <li>{t('agents.tryExample1')}</li>
            <li>{t('agents.tryExample2')}</li>
          </ul>
          {curator && (
            <>
              <h3 className={styles.subheading}>{t('agents.curatorExample')}</h3>
              <ul className={styles.examples}><li>{t('agents.curatorExampleBody')}</li></ul>
              <p className="meta-line">{t('agents.curatorGuide')}</p>
            </>
          )}
          <p className="meta-line">{t('agents.familyDeletion')}</p>
        </section>

        <section className="settings-card" aria-labelledby="skill-title">
          <h2 id="skill-title">{t('agents.skill')}</h2>
          <p>{t('agents.skillBody')}</p>
          {/* Built from agent-skill/ by sync-assets; outside the service worker's cache (sw-rules). */}
          <a className={`text-button ${styles.download}`} href={SKILL_ZIP} download>{t('agents.skillDownload')}</a>
          <ol className={styles.steps}>
            {SKILL_STEPS.map((key) => <li key={key}>{t(key)}</li>)}
          </ol>
          <p className="meta-line">{t('agents.skillVersion', { date: formatDayMonthYear(locale, env.skillVersion) })}</p>
        </section>

        <section className="settings-card" aria-labelledby="connected-title">
          <h2 id="connected-title">{t('agents.connected')}</h2>
          {done && <p className="meta-line" role="status">{done}</p>}
          {blocked && <QueryError error={agents.error} onRetry={() => void agents.refetch()} />}
          {!blocked && !agents.data && (
            <LoadingArea
              loading
              paused={agents.fetchStatus === 'paused'}
              skeleton={<SkeletonRows count={1} filled className={styles.agent} action={<ButtonSkeleton />} />}
            />
          )}
          {agents.data && agents.data.length === 0 && <p className="meta-line">{t('agents.none')}</p>}
          {agents.data && agents.data.length > 0 && (
            <ul className="row-list">
              {agents.data.map((agent) => (
                <li key={agent.clientId} className={styles.agent}>
                  <span className="row-main">
                    {nameOf(agent)}
                    <small>
                      {agent.lastRenewedAt
                        ? t('agents.connectedOnRenewed', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)), last: formatRenewal(locale, agent.lastRenewedAt) })
                        : t('agents.connectedOn', { date: formatDayMonth(locale, agent.connectedAt.slice(0, 10)) })}
                    </small>
                  </span>
                  <button type="button" className="text-button" disabled={!online} onClick={() => open(agent)}>{t('agents.disconnect')}</button>
                </li>
              ))}
            </ul>
          )}
          {agents.data && agents.data.length > 0 && <p className="meta-line">{t('agents.renewalNote')}</p>}
        </section>
      </div>

      <BottomSheet open={leaving !== null} title={leaving ? t('agents.disconnectTitle', { client: nameOf(leaving) }) : ''} onClose={() => setLeaving(null)}>
        {leaving && (
          <>
            <p>{t('agents.disconnectBody', { client: nameOf(leaving), how: removal(leaving) })}</p>
            {disconnect.isError && <p className="meta-line" role="alert">{t(errorKey(disconnect.error))}</p>}
            <div className={styles.sheetActions}>
              <button type="button" className="text-button" onClick={() => setLeaving(null)}>{t('agents.cancel')}</button>
              <button type="button" className="text-button primary" disabled={!online || disconnect.isPending} onClick={() => confirm(leaving)}>{t('agents.disconnect')}</button>
            </div>
          </>
        )}
      </BottomSheet>
    </section>
  );
}

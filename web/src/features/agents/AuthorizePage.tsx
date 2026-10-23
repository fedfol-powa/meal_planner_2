import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useRouter } from '@tanstack/react-router';
import { profileQuery } from '../../api/profile';
import { useQueryDeps } from '../../api/queries';
import { useAuth } from '../../auth/AuthProvider';
import type { AgentAuthorization, AuthorizationFailure } from '../../auth/backend';
import { useOnline } from '../../components/OfflineBanner';
import { LoadingArea } from '../../components/Skeleton';
import { useT } from '../../i18n/LocaleProvider';
import { trackBusy } from '../../pwa/busy';
import { useSession, useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import { leavePage } from './leave';
import { scopeKey } from './scopes';
import styles from './AuthorizePage.module.css';

const route = getRouteApi('/authorize');

type ConsentRequest = Extract<AgentAuthorization, { kind: 'consent' }>;
type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'failed' }
  | { kind: 'leaving' }
  | { kind: 'switched' }
  | { kind: 'consent'; request: ConsentRequest };

/** Consent opened by an agent in the browser (spec section 13, round 6): who asks, as whom, allow or cancel. */
export function AuthorizePage() {
  const t = useT();
  const { state, backend } = useAuth();
  const session = useSession();
  const signOut = useSignOut();
  const router = useRouter();
  const online = useOnline();
  const { authorization_id: id, switched } = route.useSearch();
  const userId = state.status === 'signedIn' ? state.user.id : null;
  const usable = online && state.status === 'signedIn' && state.verified;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [deciding, setDeciding] = useState(false);
  const [decisionFailure, setDecisionFailure] = useState<AuthorizationFailure | null>(null);
  // Generation of (session, request): an answer of an older one changes nothing and never
  // navigates (review, finding 2). The session is closed synchronously by SessionScope when
  // Supabase reports another person or a sign-out, before React re-renders: an answer arriving
  // right after the event is already stale (second review, finding 1). A second click arrives
  // before the re-render: the ref, not the state, keeps the decision to one call.
  const generation = useRef(0);
  const sending = useRef(false);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    const of = session;
    sending.current = false;
    setDeciding(false);
    setDecisionFailure(null);
    if (switched) return setPhase({ kind: 'switched' });
    if (!id) return setPhase({ kind: 'invalid' });
    setPhase({ kind: 'loading' });
    // Not just a read: with a consent already given Supabase approves the request here and the
    // way back to the agent is in the answer, once. Busy until the answer is handled (spec W8).
    await trackBusy(
      (async () => {
        const result = await backend.getAuthorization(id);
        if (generation.current !== mine || of.isClosed()) return;
        if (!result.ok) return setPhase({ kind: result.reason === 'not_found' ? 'invalid' : 'failed' });
        if (result.value.kind === 'redirect') {
          setPhase({ kind: 'leaving' });
          return leavePage.to(result.value.url);
        }
        setPhase({ kind: 'consent', request: result.value });
      })()
    );
  }, [backend, id, switched, session]);

  useEffect(() => {
    if (!usable || !userId) return;
    void load();
    // Any navigation ends this generation at once: the router unmounts the page only after
    // its asynchronous transition, and a late answer must not act in between.
    // A history event that stays on this request (same path and id) leaves it running.
    const unsubscribe = router.history.subscribe(() => {
      const at = router.history.location;
      if (at.pathname !== '/authorize' || new URLSearchParams(at.search).get('authorization_id') !== id) generation.current += 1;
    });
    // Leaving the page, another session or another request: this generation ends.
    return () => {
      unsubscribe();
      generation.current += 1;
    };
  }, [usable, userId, load, router, id]);

  async function decide(decision: 'approve' | 'deny', canAllow: boolean) {
    if (phase.kind !== 'consent' || sending.current || session.isClosed()) return;
    // The button may be stale for one render: `canAllow` is read from the query at the click (PR #31 review, finding 2).
    if (decision === 'approve' && !canAllow) return;
    const mine = generation.current;
    const of = session;
    sending.current = true;
    setDeciding(true);
    setDecisionFailure(null);
    const request = phase.request.id;
    // Busy until the answer is handled, the way back to the agent included (spec W8).
    await trackBusy(
      (async () => {
        const result = await backend.decideAuthorization(request, decision);
        if (generation.current !== mine || of.isClosed()) return;
        if (!result.ok) {
          sending.current = false;
          setDeciding(false);
          if (result.reason === 'not_found') return setPhase({ kind: 'invalid' });
          return setDecisionFailure(result.reason);
        }
        setPhase({ kind: 'leaving' });
        leavePage.to(result.value);
      })()
    );
  }

  // Supabase binds the request to the first person who read it (gotrue v2.197.0): another
  // account cannot continue it. The way back after sign-in asks to start again from the agent,
  // then the common sign-out of «Esci» (review, finding 4; PR #31 review, finding 3).
  async function switchAccount() {
    await router.navigate({ to: '/authorize', search: { switched: true }, replace: true });
    await signOut();
  }

  return (
    <main className="entry-page" id="app-content">
      <p className="entry-brand">{t('auth.brand')}</p>
      {!usable && <p className="meta-line">{t('authorize.offline')}</p>}
      {usable && phase.kind === 'loading' && (
        // The consent's first screen while the request is read (W22).
        <LoadingArea
          loading
          skeleton={
            <>
              <span className={`entry-title ${styles.title} skeleton-block`} style={{ width: '85%', height: '2lh' }} />
              <p className="meta-line skeleton-block" style={{ height: '1lh' }} />
              <div className={`${styles.account} skeleton-block`}>
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
              <h2 className={`${styles.heading} skeleton-block`} style={{ width: '40%', height: '1lh' }} />
              <p className="skeleton-block" style={{ height: '1lh' }} />
              <p className="skeleton-block" style={{ height: '1lh' }} />
            </>
          }
        />
      )}
      {usable && phase.kind === 'leaving' && <p className="meta-line">{t('authorize.leaving')}</p>}
      {usable && phase.kind === 'invalid' && (
        <>
          <h1 className="entry-title">{t('authorize.invalid')}</h1>
          <p className="meta-line">{t('authorize.invalidBody')}</p>
        </>
      )}
      {usable && phase.kind === 'failed' && (
        <>
          <p className="form-error" role="alert">{t('authorize.failed')}</p>
          <button type="button" className="text-button wide" onClick={() => void load()}>{t('authorize.retry')}</button>
        </>
      )}
      {usable && phase.kind === 'switched' && (
        <>
          <h1 className="entry-title">{t('authorize.switched')}</h1>
          <p className="meta-line">{t('authorize.switchedBody')}</p>
        </>
      )}
      {usable && phase.kind === 'consent' && userId && (
        <Consent request={phase.request} userId={userId} deciding={deciding} failure={decisionFailure} onDecide={decide} onSwitch={() => void switchAccount()} />
      )}
    </main>
  );
}

function Consent(props: {
  request: ConsentRequest;
  userId: string;
  deciding: boolean;
  failure: AuthorizationFailure | null;
  onDecide: (decision: 'approve' | 'deny', canAllow: boolean) => void;
  onSwitch: () => void;
}) {
  const t = useT();
  const { state } = useAuth();
  const read = useProfile();
  const queryClient = useQueryClient();
  const profileKey = profileQuery(useQueryDeps()).queryKey;
  // The roles shown must be those of this person, from a successful read: a cached profile
  // whose re-read failed may be out of date, so «Consenti» waits (review finding 3, second review finding 2).
  const profile = read.data?.user.id === props.userId ? read.data : undefined;
  const failed = read.isError;
  // A re-read in flight may bring other roles: until it lands, the cached ones do not allow (final review).
  const canAllow = !!profile && read.status === 'success' && !read.isFetching;
  // The same rule on the query as it is now: a re-read started after the last render already forbids (PR #31 review, finding 2).
  const canAllowNow = () => {
    const current = queryClient.getQueryState(profileKey);
    return current?.status === 'success' && current.fetchStatus === 'idle' && current.data?.user.id === props.userId;
  };
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');
  const roles = canAllow ? profile.user.globalRoles : [];
  const { request } = props;
  return (
    <>
      <h1 className={`entry-title ${styles.title}`}>{t('authorize.title', { client: request.clientName || '?' })}</h1>
      <p className="meta-line">{t('authorize.nameNote')}</p>
      <div className={styles.account}>
        <span className={styles.label}>{t('authorize.account')}</span>
        {profile && <strong>{profile.user.displayName}</strong>}
        <span>{email}</span>
        <button type="button" className={styles.plain} onClick={props.onSwitch}>{t('authorize.notYou')}</button>
        <span className={styles.switchNote}>{t('authorize.switchNote')}</span>
      </div>
      <h2 className={styles.heading}>{t('authorize.can')}</h2>
      <p>{t('authorize.acts')}</p>
      {!canAllow && !failed && <p className="meta-line" aria-busy="true">{t('authorize.profileLoading')}</p>}
      {failed && (
        <>
          <p className="form-error" role="alert">{t('authorize.profileFailed')}</p>
          <button type="button" className="text-button" onClick={() => void read.refetch()}>{t('authorize.retry')}</button>
        </>
      )}
      {roles.includes('recipe_curator') && <p>{t('authorize.actsCurator')}</p>}
      {roles.includes('app_admin') && <p>{t('authorize.actsAdmin')}</p>}
      <p>{t('authorize.authPowers')}</p>
      <p>{t('authorize.familyDeletion')}</p>
      <h2 className={styles.heading}>{t('authorize.data')}</h2>
      <ul className={styles.scopes}>
        {request.scopes.map((scope) => {
          const key = scopeKey(scope);
          return <li key={scope}>{key ? t(key) : scope}</li>;
        })}
      </ul>
      <p className="meta-line">{t('authorize.dataNote')}</p>
      <details className={styles.details}>
        <summary>{t('authorize.details')}</summary>
        <dl>
          <dt>{t('authorize.clientId')}</dt>
          <dd>{request.clientId}</dd>
          <dt>{t('authorize.redirectUri')}</dt>
          <dd>{request.redirectUri}</dd>
        </dl>
      </details>
      <p>{t('authorize.disconnect')}</p>
      {props.failure && <p className="form-error" role="alert">{t(props.failure === 'network' ? 'errors.network' : 'errors.unknown')}</p>}
      <div className={styles.actions}>
        <button type="button" className="text-button primary wide" disabled={props.deciding || !canAllow} onClick={() => props.onDecide('approve', canAllow && canAllowNow())}>{t('authorize.allow')}</button>
        <button type="button" className="text-button wide" disabled={props.deciding} onClick={() => props.onDecide('deny', false)}>{t('authorize.deny')}</button>
      </div>
    </>
  );
}

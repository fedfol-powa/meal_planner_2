import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useApi } from '../../api/ApiProvider';
import { errorKey, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useAuth } from '../../auth/AuthProvider';
import type { AuthUser } from '../../auth/backend';
import { useOnline } from '../../components/OfflineBanner';
import { ButtonSkeleton, FieldSkeleton } from '../../components/PageSkeletons';
import { LoadingArea } from '../../components/Skeleton';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { LOCALES, type MessageKey } from '../../i18n/messages';
import { trackBusy } from '../../pwa/busy';
import { useChooseLocale, useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import styles from '../app-invitations/InvitePage.module.css';
import own from './InvitePage.module.css';
import { PasswordEmailNotice, type AcceptOutcome } from '../app-invitations/PasswordEmailNotice';
import { accountFormErrors, fragment, TOKEN, type AccountField as Field } from '../app-invitations/token';
import { familyInvitationClient } from './client';

const PATH = '/invite';

type Phase =
  | { kind: 'loading' }
  /** Nobody signed in: the account form (when the link still registers people) and the sign-in link. */
  | { kind: 'signedOut'; familyName: string; invitedBy: string | null; accountsAvailable: boolean }
  /** Someone signed in: joining with that account, or already a member. */
  | { kind: 'signedIn'; familyId: string; familyName: string; invitedBy: string | null; alreadyMember: boolean }
  | { kind: 'unavailable' }
  | { kind: 'limited' }
  | { kind: 'failed'; error: unknown }
  /** The account is ready (spec W15): the outcome of the first email; `joined` false: the link no longer lets it in. */
  | { kind: 'mail'; email: string; outcome: AcceptOutcome; joined: boolean; link: SignedOutLink };

type SignedOutLink = Omit<Extract<Phase, { kind: 'signedOut' }>, 'kind'>;
type FormError = { kind: 'message'; key: MessageKey } | { kind: 'accountExists'; email: string };

/**
 * Family invitation (spec W11, «Pagina dell'invito `/invite#<token>`»): public, the token in the
 * fragment, as the app invitation. Signed out: a new account that joins (it then picks its password
 * from the email, spec W15), or sign-in and back here;
 * signed in: joining with the account open, or «Esci e continua».
 */
export function InvitePage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state } = useAuth();
  const api = useApi();
  const router = useRouter();
  const online = useOnline();
  const token = useRouterState({ select: (s) => s.location.hash });
  const identity = state.status === 'signedIn' ? state.user.id : null;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [values, setValues] = useState({ email: '', name: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();

  // Generation of (page, link, identity): an older answer changes nothing. A ref keeps one
  // submission at a time.
  const generation = useRef(0);
  const sending = useRef(false);
  const signedOut = useRef(state.status === 'signedOut');
  signedOut.current = state.status === 'signedOut';

  const load = useCallback(async () => {
    const mine = generation.current;
    if (!TOKEN.test(token)) return setPhase({ kind: 'unavailable' });
    setPhase({ kind: 'loading' });
    try {
      if (identity) {
        const view = await api.familyInvitations.status({ token });
        if (generation.current === mine) setPhase({ kind: 'signedIn', ...view });
      } else {
        const view = await familyInvitationClient.get({ token });
        if (generation.current === mine) setPhase({ kind: 'signedOut', ...view });
      }
    } catch (error) {
      if (generation.current !== mine) return;
      const code = toApiError(error).code;
      setPhase(code === 'invitation_unavailable' ? { kind: 'unavailable' } : code === 'rate_limited' ? { kind: 'limited' } : { kind: 'failed', error });
    }
  }, [token, identity, api]);

  useEffect(() => {
    void load();
    // Leaving /invite or changing the fragment ends this generation at once (the router unmounts
    // the page only after its transition); so do a change of identity and unmounting.
    const unsubscribe = router.history.subscribe(() => {
      const at = router.history.location;
      if (at.pathname !== PATH || fragment(at.hash) !== token) generation.current += 1;
    });
    return () => {
      unsubscribe();
      generation.current += 1;
    };
  }, [router, token, load]);

  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !signedOut.current) return;
    const errors = accountFormErrors(values);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;
    sending.current = true;
    setBusy(true);
    const mine = generation.current;
    // Busy until the answer is handled (spec W8). The answer of an older generation (page left,
    // another link) changes nothing.
    await trackBusy(
      (async () => {
        try {
          const { email, joined, passwordEmail } = await familyInvitationClient.accept({ token, email: values.email.trim(), displayName: values.name.trim(), locale });
          if (generation.current !== mine) return;
          setPhase((current) => (current.kind === 'signedOut' ? { kind: 'mail', email, outcome: passwordEmail, joined, link: current } : current));
        } catch (error) {
          if (generation.current !== mine) return;
          const failure = toApiError(error);
          const issues = (failure.data as { issues?: { path: (string | number)[]; code: string }[] } | undefined)?.issues ?? [];
          const issue = (field: string) => issues.find((i) => i.path[0] === field)?.code;
          if (failure.code === 'invitation_unavailable') setPhase({ kind: 'unavailable' });
          else if (failure.code === 'rate_limited') setFormError({ kind: 'message', key: 'invite.limited' });
          else if (failure.code === 'invalid' && issue('email')) setFieldErrors({ email: 'invite.emailInvalid' });
          else if (failure.code === 'not_allowed') setFormError({ kind: 'accountExists', email: values.email.trim() });
          else setFormError({ kind: 'message', key: errorKey(error) });
        } finally {
          sending.current = false;
          setBusy(false);
        }
      })()
    );
  }

  /** «Email sbagliata? Ricomincia»: the empty form on the same link, in memory (no reload). */
  function restart(link: SignedOutLink) {
    setValues({ email: '', name: '' });
    setFieldErrors({});
    setFormError(null);
    setPhase({ kind: 'signedOut', ...link });
  }

  const field = (name: Field, label: MessageKey, input: { type: string; autoComplete: string; autoCapitalize?: string }, help?: MessageKey) => {
    const id = `${ids}-${name}`;
    const error = fieldErrors[name];
    const described = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <div className="field">
        <label htmlFor={id}>{t(label)}</label>
        <input id={id} required value={values[name]} onChange={(e) => set(name)(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={described} {...input} />
        {help && <span id={`${id}-help`} className={styles.help}>{t(help)}</span>}
        {error && <span id={`${id}-error`} className={styles.error} role="alert">{t(error)}</span>}
      </div>
    );
  };

  const toLogin = (email?: string) => (
    <Link to="/login" search={email ? { email } : {}} className="text-button primary wide">{t('invite.toLogin')}</Link>
  );
  const heading = (familyName: string, invitedBy: string | null) => (
    <>
      <h1 className="entry-title">{t('familyInvite.title', { family: familyName })}</h1>
      <p>{invitedBy ? t('familyInvite.from', { name: invitedBy }) : t('invite.fromUnknown')}</p>
    </>
  );

  return (
    <main className="entry-page" id="app-content">
      <div className={styles.top}>
        <p className="entry-brand">{t('auth.brand')}</p>
        <div className={styles.languages} role="group" aria-label={t('profile.language')}>
          {LOCALES.map((option) => (
            <button key={option} type="button" className={styles.language} aria-pressed={option === locale} onClick={() => void chooseLocale(option)}>
              {t(`profile.language.${option}`)}
            </button>
          ))}
        </div>
      </div>
      {!online && <p className="offline-banner" role="status">{t('offline.banner')}</p>}
      {phase.kind === 'loading' && (
        // The shape of what usually arrives (W22): the form without an account, the join button with one.
        <LoadingArea
          loading
          skeleton={
            <>
              <span className="entry-title skeleton-block" style={{ width: '70%', height: '1lh' }} />
              <p><span className="skeleton-line" /></p>
              {identity ? (
                <ButtonSkeleton wide />
              ) : (
                <>
                  <FieldSkeleton />
                  <FieldSkeleton hint={styles.help} />
                  <p className={styles.help}><span className="skeleton-line" /></p>
                  <ButtonSkeleton wide />
                  <p><span className="skeleton-line" /></p>
                </>
              )}
            </>
          }
        />
      )}
      {phase.kind === 'unavailable' && (
        <>
          <h1 className="entry-title">{t('invite.unavailable')}</h1>
          <p>{t('familyInvite.askNew')}</p>
          {identity ? <Link to="/menu" className="text-button wide">{t('familyInvite.openMenu')}</Link> : toLogin()}
        </>
      )}
      {phase.kind === 'limited' && (
        <>
          <p className="form-error" role="alert">{t('invite.limited')}</p>
          <button type="button" className="text-button wide" onClick={() => void load()}>{t('authorize.retry')}</button>
        </>
      )}
      {phase.kind === 'failed' && (
        <>
          <p className="form-error" role="alert">{t(errorKey(phase.error))}</p>
          <button type="button" className="text-button wide" onClick={() => void load()}>{t('authorize.retry')}</button>
        </>
      )}
      {phase.kind === 'mail' && (
        <PasswordEmailNotice
          email={phase.email}
          outcome={phase.outcome}
          note={phase.joined ? undefined : (
            <>
              <h1 className="entry-title">{t('invite.ready')}</h1>
              <p>{t('familyInvite.notJoined')}</p>
            </>
          )}
          resend={() => familyInvitationClient.resendPasswordEmail({ token, email: phase.email, locale })}
          onRestart={phase.joined ? () => restart(phase.link) : undefined}
        />
      )}
      {phase.kind === 'signedIn' && state.status === 'signedIn' && (
        <SignedIn
          link={phase}
          token={token}
          user={state.user}
          isCurrent={(mine) => generation.current === mine}
          generation={() => generation.current}
          onUnavailable={() => setPhase({ kind: 'unavailable' })}
          heading={heading(phase.familyName, phase.invitedBy)}
        />
      )}
      {phase.kind === 'signedOut' && (
        <>
          {heading(phase.familyName, phase.invitedBy)}
          {phase.accountsAvailable ? (
            <form onSubmit={(event) => void submit(event)} noValidate>
              {formError?.kind === 'message' && <p className="form-error" role="alert">{t(formError.key)}</p>}
              {formError?.kind === 'accountExists' && (
                <p className="form-error" role="alert">
                  {t('invite.accountExists')} <Link to="/login" search={{ email: formError.email, redirect: PATH }} hash={token}>{t('invite.toLogin')}</Link>
                </p>
              )}
              {field('email', 'invite.email', { type: 'email', autoComplete: 'email', autoCapitalize: 'none' })}
              {field('name', 'invite.name', { type: 'text', autoComplete: 'name' }, 'invite.nameHelp')}
              <p className={styles.help}>{t('invite.passwordNote')}</p>
              <button type="submit" className="text-button primary wide" disabled={busy || !online}>{t('familyInvite.submit')}</button>
            </form>
          ) : (
            <p>{t('familyInvite.noAccounts')}</p>
          )}
          {/* The token stays in the fragment of the sign-in page, never in its query (sent to the server
              on a reload): after signing in the person comes back to this link. */}
          <p>
            {t('familyInvite.haveAccount')} <Link to="/login" search={{ redirect: PATH }} hash={token}>{t('familyInvite.signIn')}</Link>
          </p>
        </>
      )}
    </main>
  );
}

type LinkStatus = Extract<Phase, { kind: 'signedIn' }>;

/**
 * Someone signed in (spec W11): joins with that account («Entra nella famiglia»), signs out for
 * another person («Esci e continua»), or, already a member, opens the family's menu.
 */
function SignedIn({ link, token, user, generation, isCurrent, onUnavailable, heading }: {
  link: LinkStatus;
  token: string;
  user: AuthUser;
  generation: () => number;
  isCurrent: (generation: number) => boolean;
  onUnavailable: () => void;
  heading: ReactNode;
}) {
  const t = useT();
  const api = useApi();
  const router = useRouter();
  const online = useOnline();
  const signOut = useSignOut();
  const profile = useProfile();
  const [error, setError] = useState<MessageKey | null>(null);
  // No optimistic update: the profile of the answer is written by the registry.
  const join = useAreaMutation('family.join', undefined, (input: { token: string }) => api.family.join(input));
  const choose = useAreaMutation('profile.setCurrentFamily', undefined, (familyId: string) => api.profile.setCurrentFamily({ familyId }));
  const toMenu = () => void router.navigate({ to: '/menu', replace: true });

  function enter() {
    if (join.isPending) return;
    const mine = generation();
    setError(null);
    join.mutate(
      { token },
      {
        // The family becomes the one shown: the server set it, the profile of the answer says so.
        onSuccess: () => {
          if (isCurrent(mine)) toMenu();
        },
        onError: (failure) => {
          if (!isCurrent(mine)) return;
          if (toApiError(failure).code === 'invitation_unavailable') onUnavailable();
          else setError(errorKey(failure));
        }
      }
    );
  }

  /** «Apri il menu» of a member: the family of the link becomes the one shown. */
  function openFamily() {
    if (profile.data?.currentFamilyId === link.familyId) return toMenu();
    const mine = generation();
    setError(null);
    choose.mutate(link.familyId, {
      onSuccess: () => {
        if (isCurrent(mine)) toMenu();
      },
      onError: (failure) => {
        if (isCurrent(mine)) setError(errorKey(failure));
      }
    });
  }

  const alert = error && <p className="form-error" role="alert">{t(error)}</p>;
  if (link.alreadyMember) {
    const switching = profile.data?.currentFamilyId !== link.familyId;
    return (
      <>
        <h1 className="entry-title">{t('familyInvite.already', { family: link.familyName })}</h1>
        {alert}
        <button type="button" className="text-button primary wide" disabled={choose.isPending || (switching && !online)} onClick={openFamily}>
          {t('familyInvite.openMenu')}
        </button>
      </>
    );
  }
  return (
    <>
      {heading}
      <p>{t('familyInvite.as', { name: profile.data?.user.displayName ?? user.email })}</p>
      {alert}
      <div className={own.actions}>
        <button type="button" className="text-button primary wide" disabled={join.isPending || !online} onClick={enter}>{t('familyInvite.join')}</button>
        {/* Another person's account open on this device: «Esci e continua» of A. */}
        <button type="button" className="text-button wide" disabled={join.isPending} onClick={() => void signOut()}>{t('invite.signOut')}</button>
      </div>
    </>
  );
}

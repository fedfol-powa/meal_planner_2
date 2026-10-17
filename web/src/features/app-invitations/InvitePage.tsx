import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import type { GlobalRole } from '@app/contract';
import { errorKey, toApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { useOnline } from '../../components/OfflineBanner';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { LOCALES, type MessageKey } from '../../i18n/messages';
import { trackBusy } from '../../pwa/busy';
import { useChooseLocale, useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import { invitationClient } from './client';
import styles from './InvitePage.module.css';
import { PasswordEmailNotice, type AcceptOutcome } from './PasswordEmailNotice';
import { accountFormErrors, fragment, TOKEN, type AccountField as Field } from './token';

type Phase =
  | { kind: 'loading' }
  | { kind: 'form'; invitedBy: string | null; roles: GlobalRole[] }
  | { kind: 'unavailable' }
  | { kind: 'limited' }
  | { kind: 'failed'; error: unknown }
  /** The account is ready: «Controlla la posta» and the other outcomes of the first email. */
  | { kind: 'mail'; email: string; outcome: AcceptOutcome; roles: GlobalRole[] };

type FormError = { kind: 'message'; key: MessageKey } | { kind: 'accountExists'; email: string };

/**
 * App invitation (spec W9 and W15, «Pagine d'invito»): public, the token in the fragment. Email and
 * name in one form; the server creates the account and emails the link to choose the password. This
 * page never signs in.
 */
export function InvitePage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state } = useAuth();
  const signOut = useSignOut();
  const router = useRouter();
  const online = useOnline();
  const token = useRouterState({ select: (s) => s.location.hash });
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
      const view = await invitationClient.get({ token });
      if (generation.current === mine) setPhase({ kind: 'form', invitedBy: view.invitedBy, roles: view.roles });
    } catch (error) {
      if (generation.current !== mine) return;
      const code = toApiError(error).code;
      setPhase(code === 'invitation_unavailable' ? { kind: 'unavailable' } : code === 'rate_limited' ? { kind: 'limited' } : { kind: 'failed', error });
    }
  }, [token]);

  useEffect(() => {
    void load();
    // Leaving /invite/app or changing the fragment ends this generation at once (the router
    // unmounts the page only after its transition); so does unmounting.
    const unsubscribe = router.history.subscribe(() => {
      const at = router.history.location;
      if (at.pathname !== '/invite/app' || fragment(at.hash) !== token) generation.current += 1;
    });
    return () => {
      unsubscribe();
      generation.current += 1;
    };
  }, [router, token, load]);
  // Any sign-in (another tab, or ours) ends the generation too; an account already open at
  // the start does not (the reading of the link stays valid, the form is not shown).
  const previousStatus = useRef(state.status);
  useEffect(() => {
    if (previousStatus.current === 'signedOut' && state.status !== 'signedOut') generation.current += 1;
    previousStatus.current = state.status;
  }, [state.status]);

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
          const { email, passwordEmail } = await invitationClient.accept({ token, email: values.email.trim(), displayName: values.name.trim(), locale });
          if (generation.current !== mine) return;
          setPhase((current) => (current.kind === 'form' ? { kind: 'mail', email, outcome: passwordEmail, roles: current.roles } : current));
        } catch (error) {
          if (generation.current !== mine) return;
          const failure = toApiError(error);
          const issues = (failure.data as { issues?: { path: (string | number)[]; code: string }[] } | undefined)?.issues ?? [];
          const issue = (field: string) => issues.find((i) => i.path[0] === field)?.code;
          if (failure.code === 'invitation_unavailable') setPhase({ kind: 'unavailable' });
          else if (failure.code === 'rate_limited') setFormError({ kind: 'message', key: 'invite.limited' });
          else if (failure.code === 'invalid' && issue('email')) setFieldErrors({ email: issue('email') === 'email_mismatch' ? 'invite.wrongEmail' : 'invite.emailInvalid' });
          else if (failure.code === 'not_allowed') setFormError({ kind: 'accountExists', email: values.email.trim() });
          else setFormError({ kind: 'message', key: errorKey(error) });
        } finally {
          sending.current = false;
          setBusy(false);
        }
      })()
    );
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
      {phase.kind === 'loading' && <p className="meta-line" aria-busy="true">…</p>}
      {phase.kind === 'unavailable' && (
        <>
          <h1 className="entry-title">{t('invite.unavailable')}</h1>
          <p>{t('invite.askNew')}</p>
          {toLogin()}
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
          roles={phase.roles}
          resend={() => invitationClient.resendPasswordEmail({ token, email: phase.email, locale })}
        />
      )}
      {phase.kind === 'form' && (
        <>
          <h1 className="entry-title">{t('invite.title')}</h1>
          <p>{phase.invitedBy ? t('invite.from', { name: phase.invitedBy }) : t('invite.fromUnknown')}</p>
          {phase.roles.length > 0 && <p>{t('invite.roles', { roles: phase.roles.map((role) => t(`role.${role}`)).join(', ') })}</p>}
          {state.status === 'signedIn' ? (
            <OtherAccount
              email={state.user.email}
              onSignOut={() => void signOut()}
            />
          ) : (
            <form onSubmit={(event) => void submit(event)} noValidate>
              {formError?.kind === 'message' && <p className="form-error" role="alert">{t(formError.key)}</p>}
              {formError?.kind === 'accountExists' && (
                <p className="form-error" role="alert">
                  {t('invite.accountExists')} <Link to="/login" search={{ email: formError.email }}>{t('invite.toLogin')}</Link>
                </p>
              )}
              {field('email', 'invite.email', { type: 'email', autoComplete: 'email', autoCapitalize: 'none' }, 'invite.emailHelp')}
              {field('name', 'invite.name', { type: 'text', autoComplete: 'name' }, 'invite.nameHelp')}
              <p className={styles.help}>{t('invite.passwordNote')}</p>
              <button type="submit" className="text-button primary wide" disabled={busy || !online}>{t('invite.submit')}</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}

/** Another account is open on this device: the link is for a new person (spec W9). */
function OtherAccount({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const t = useT();
  const profile = useProfile();
  return (
    <>
      <p>{t('invite.otherAccount', { name: profile.data?.user.displayName ?? email })}</p>
      <button type="button" className="text-button primary wide" onClick={onSignOut}>{t('invite.signOut')}</button>
    </>
  );
}

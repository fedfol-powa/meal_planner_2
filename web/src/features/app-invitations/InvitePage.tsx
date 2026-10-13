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

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** The fragment of the router's history, without `#` (the router state has it without). */
const fragment = (hash: string) => hash.replace(/^#/, '');
const PASSWORD_MIN = 8;
/** bcrypt's limit, in UTF-8 bytes (spec W9). */
const PASSWORD_MAX_BYTES = 72;

type Phase =
  | { kind: 'loading' }
  | { kind: 'form'; invitedBy: string | null; roles: GlobalRole[] }
  | { kind: 'unavailable' }
  | { kind: 'limited' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'signInFailed'; email: string };

/**
 * Accounts closed from this page with «Esci e continua»: Supabase may report them once more while
 * ending them, which is not someone signing in. Module state: the page remounts when the identity changes.
 */
const closedAccounts = new Set<string>();

type Field = 'email' | 'name' | 'password' | 'again';
type FormError = { kind: 'message'; key: MessageKey } | { kind: 'accountExists'; email: string };

/**
 * App invitation (spec W9, «Pagina dell'invito»): public, the token in the fragment. Email, name
 * and password in one form; the server creates the account, then this page signs in.
 */
export function InvitePage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const router = useRouter();
  const online = useOnline();
  const token = useRouterState({ select: (s) => s.location.hash });
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [values, setValues] = useState({ email: '', name: '', password: '', again: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();

  // Generation of (page, link, identity): an answer of an older one changes nothing and never
  // signs in or navigates. The ref, not the state, keeps one submission even with two taps
  // before the next render.
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

  function localErrors(): Partial<Record<Field, MessageKey>> {
    const errors: Partial<Record<Field, MessageKey>> = {};
    if (!values.name.trim()) errors.name = 'invite.nameMissing';
    if (values.password.length < PASSWORD_MIN) errors.password = 'invite.passwordShort';
    else if (new TextEncoder().encode(values.password).length > PASSWORD_MAX_BYTES) errors.password = 'invite.passwordLong';
    else if (values.password !== values.again) errors.again = 'invite.passwordMismatch';
    return errors;
  }

  async function submit(event: FormEvent, roles: GlobalRole[]) {
    event.preventDefault();
    if (sending.current || !signedOut.current) return;
    const errors = localErrors();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length) return;
    sending.current = true;
    setBusy(true);
    const mine = generation.current;
    // A sign-in reported meanwhile (another tab) ends the attempt at once, before React re-renders.
    // Watched here, not through the signed-out session: Supabase may report the account just
    // closed once more while ending it, and that must not block the form.
    let foreign = false;
    const stopWatching = backend.onChange((event) => {
      if (event.user && !closedAccounts.has(event.user.id)) foreign = true;
    });
    const { password } = values;
    // Before the sign-in: same page, same link, still nobody signed in.
    const current = () => generation.current === mine && signedOut.current && !foreign;
    // After our own sign-in the identity changes on purpose: only page and link still count.
    const onThisLink = () => router.history.location.pathname === '/invite/app' && fragment(router.history.location.hash) === token;
    // Busy until the answer is handled, the sign-in included (spec W8).
    await trackBusy(
      (async () => {
        try {
          const { email } = await invitationClient.accept({ token, email: values.email.trim(), displayName: values.name.trim(), password, locale });
          if (!current()) return; // left, another link, or someone signed in meanwhile: no sign-in
          stopWatching(); // our own sign-in follows
          const result = await backend.signIn(email, password);
          if (!onThisLink()) return;
          if (result.ok) {
            // Supabase reports the new session after signIn() resolves (and the page may be remounted
            // then): the sign-in route forwards to the wizard once the app sees the session.
            const granted = roles.length ? `?granted=${roles.join(',')}` : '';
            await router.navigate({ to: '/login', search: { redirect: `/family/new${granted}` }, replace: true });
          } else setPhase({ kind: 'signInFailed', email });
        } catch (error) {
          if (!current()) return;
          const failure = toApiError(error);
          const issues = (failure.data as { issues?: { path: (string | number)[]; code: string }[] } | undefined)?.issues ?? [];
          if (failure.code === 'invitation_unavailable') setPhase({ kind: 'unavailable' });
          else if (failure.code === 'rate_limited') setFormError({ kind: 'message', key: 'invite.limited' });
          else if (failure.code === 'invalid' && issues.some((i) => i.path[0] === 'email')) setFieldErrors({ email: 'invite.wrongEmail' });
          else if (failure.code === 'invalid' && issues.some((i) => i.path[0] === 'password' && i.code === 'weak_password')) setFieldErrors({ password: 'invite.passwordWeak' });
          else if (failure.code === 'invalid' && issues.some((i) => i.path[0] === 'password')) setFieldErrors({ password: 'invite.passwordLong' });
          else if (failure.code === 'not_allowed') setFormError({ kind: 'accountExists', email: values.email.trim() });
          else setFormError({ kind: 'message', key: errorKey(error) });
        } finally {
          stopWatching();
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
      {phase.kind === 'limited' && <p className="form-error" role="alert">{t('invite.limited')}</p>}
      {phase.kind === 'failed' && (
        <>
          <p className="form-error" role="alert">{t(errorKey(phase.error))}</p>
          <button type="button" className="text-button wide" onClick={() => void load()}>{t('authorize.retry')}</button>
        </>
      )}
      {phase.kind === 'signInFailed' && (
        <>
          <h1 className="entry-title">{t('invite.ready')}</h1>
          <p>{t('invite.signInFailed')}</p>
          {toLogin(phase.email)}
        </>
      )}
      {phase.kind === 'form' && (
        <>
          <h1 className="entry-title">{t('invite.title')}</h1>
          <p>{phase.invitedBy ? t('invite.from', { name: phase.invitedBy }) : t('invite.fromUnknown')}</p>
          {phase.roles.length > 0 && <p>{t('invite.roles', { roles: phase.roles.map((role) => t(`role.${role}`)).join(', ') })}</p>}
          {state.status === 'signedIn' ? (
            <OtherAccount
              email={state.user.email}
              onSignOut={() => {
                closedAccounts.add(state.user.id);
                void signOut();
              }}
            />
          ) : (
            <form onSubmit={(event) => void submit(event, phase.roles)} noValidate>
              {formError?.kind === 'message' && <p className="form-error" role="alert">{t(formError.key)}</p>}
              {formError?.kind === 'accountExists' && (
                <p className="form-error" role="alert">
                  {t('invite.accountExists')} <Link to="/login" search={{ email: formError.email }}>{t('invite.toLogin')}</Link>
                </p>
              )}
              {field('email', 'invite.email', { type: 'email', autoComplete: 'email', autoCapitalize: 'none' }, 'invite.emailHelp')}
              {field('name', 'invite.name', { type: 'text', autoComplete: 'name' }, 'invite.nameHelp')}
              {field('password', 'invite.password', { type: 'password', autoComplete: 'new-password' })}
              {field('again', 'invite.passwordAgain', { type: 'password', autoComplete: 'new-password' })}
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

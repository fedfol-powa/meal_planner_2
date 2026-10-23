import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { useAuth } from '../../auth/AuthProvider';
import { PASSWORD_MIN_LENGTH, validateNewPassword, type PasswordFieldErrors } from '../../auth/passwordChange';
import { useOnline } from '../../components/OfflineBanner';
import { ButtonSkeleton, FieldSkeleton } from '../../components/PageSkeletons';
import { LoadingArea } from '../../components/Skeleton';
import { useT } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { useBusyCheck } from '../../pwa/busy';
import { useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import { needsHomeScreenHint } from '../family-new/ios';
import { EntryTop } from './EntryTop';
import styles from './EntryPage.module.css';
import { forgetLink, markInvalid, readLink, saveWithLink, startVerification, subscribeLink, type LinkState, type SaveFailure } from './linkClient';

const PATH = '/password';

/** Save failures shown under the new password, with the Profile's texts. */
const FIELD_FAILURES = new Set<SaveFailure>(['weak_length', 'weak_characters', 'weak', 'same_password']);
/**
 * Every failure of the save to a text: the Profile's where they apply to a recovery, the generic
 * one for reasons that cannot happen here (current password, account changed…). `invalid_link`
 * and `session_expired` never reach the form: they end the link.
 */
function failureText(failure: SaveFailure): MessageKey {
  if (FIELD_FAILURES.has(failure)) return `password.error.${failure as 'weak_length' | 'weak_characters' | 'weak' | 'same_password'}`;
  if (failure === 'network') return 'password.error.network';
  if (failure === 'rate_limited') return 'password.error.rate_limited';
  return 'errors.unknown';
}

/** `token_hash` and `type` of the fragment; the router keeps the hash without `#`. */
function readFragment(hash: string): { tokenHash: string | null; type: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return { tokenHash: params.get('token_hash') || null, type: params.get('type') };
}

/**
 * «Scegli la password» (spec W15, `/password`): verification and save are direct calls to Auth,
 * no session is adopted or stored (decision 14). The code is used only with nobody signed in
 * here and online; the fragment stays in the address until the verification succeeds.
 */
export function ChoosePasswordPage() {
  const { state, backend } = useAuth();
  const router = useRouter();
  const online = useOnline();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const link = useSyncExternalStore(subscribeLink, readLink);
  // Busy while a verified token can still be used (spec, point 3); requests count through trackBusy.
  useBusyCheck(() => readLink()?.status === 'verified');

  const { tokenHash, type } = readFragment(hash);
  const wrongType = tokenHash !== null && type !== 'recovery';
  // Fake mode is always signed in as the demo person: the demo link must still be usable.
  const accountOpen = state.status === 'signedIn' && backend.mode !== 'fake';
  // What this page shows: the memory of this code, or of the one verified before the fragment went.
  const mine: LinkState | null = tokenHash ? (link?.tokenHash === tokenHash ? link : null) : link;

  useEffect(() => {
    if (wrongType) {
      if (readLink()?.status !== 'invalid' || readLink()?.tokenHash !== tokenHash) markInvalid(tokenHash);
      return;
    }
    const now = readLink();
    if (!tokenHash) {
      // Reloaded after the verification, or opened by hand: nothing to use.
      if (!now) markInvalid(null);
      return;
    }
    if (now?.tokenHash === tokenHash) return; // the same code, before or after a remount
    if (accountOpen || !online) return; // the code is not used: someone is signed in, or offline
    startVerification(tokenHash);
  }, [tokenHash, wrongType, accountOpen, online, link]);

  // Verified: the code leaves the address bar (it may be used once, and is no use any more).
  const verified = mine?.status === 'verified' || mine?.status === 'done';
  useEffect(() => {
    if (verified && tokenHash) router.history.replace(PATH);
  }, [verified, tokenHash, router]);

  // Leaving the page drops the token; a remount (another person on this device) does not.
  useEffect(
    () => () => {
      if (router.history.location.pathname !== PATH) forgetLink();
    },
    [router]
  );

  let body;
  if (wrongType || (!mine && !tokenHash) || mine?.status === 'invalid') body = <Invalid />;
  else if (!mine) body = accountOpen ? <OtherAccount email={state.status === 'signedIn' ? state.user.email : ''} /> : <Waiting />;
  else if (mine.status === 'verifying') body = <Waiting />;
  else if (mine.status === 'unverified') body = <Unverified />;
  else if (mine.status === 'done') body = <Done email={mine.email} />;
  else body = <ChooseForm state={mine} />;

  return (
    <main className="entry-page" id="app-content">
      <EntryTop />
      {body}
    </main>
  );
}

function ChooseForm({ state }: { state: Extract<LinkState, { status: 'verified' }> }) {
  const t = useT();
  const online = useOnline();
  const ids = useId();
  const [values, setValues] = useState({ next: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  const { failure, saving } = state;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !online) return;
    const errors = validateNewPassword(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void saveWithLink(values.next);
  }

  const serverOnField = failure && FIELD_FAILURES.has(failure) ? failure : null;
  const input = (name: 'next' | 'confirm', label: MessageKey, hint?: string) => {
    const id = `${ids}-${name}`;
    const local = fieldErrors[name];
    const error = local ? t(`password.field.${local}`, { min: PASSWORD_MIN_LENGTH }) : name === 'next' && serverOnField ? t(failureText(serverOnField)) : null;
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <div className="field">
        <label htmlFor={id}>{t(label)}</label>
        <input
          id={id}
          type="password"
          autoComplete="new-password"
          value={values[name]}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
        />
        {hint && <span id={`${id}-hint`} className={styles.help}>{hint}</span>}
        {error && <span id={`${id}-error`} className={styles.error} role="alert">{error}</span>}
      </div>
    );
  };

  return (
    <>
      <h1 className="entry-title">{t('password.choose.title')}</h1>
      <p>{t('password.choose.account', { email: state.link.email })}</p>
      <form onSubmit={submit} noValidate>
        {input('next', 'password.choose.password', t('password.hint', { min: PASSWORD_MIN_LENGTH }))}
        {input('confirm', 'password.choose.again')}
        <p className="meta-line">{t('password.choose.warning')}</p>
        {failure && !serverOnField && <p className="form-error" role="alert">{t(failureText(failure))}</p>}
        <button type="submit" className="text-button primary wide" disabled={saving || !online}>
          {t(failure === 'network' ? 'password.choose.retry' : 'password.choose.submit')}
        </button>
      </form>
    </>
  );
}

/**
 * The form's shape while the link is verified (W22), announced as the verification. Offline the code is
 * not used yet: nothing is in flight, the blocks stand still under the banner and the announcement is the
 * plain one, since nothing is being verified.
 */
function Waiting() {
  const t = useT();
  const online = useOnline();
  return (
    <LoadingArea
      loading
      paused={!online}
      label={online ? t('password.choose.verifying') : undefined}
      skeleton={
        <>
          <span className="entry-title skeleton-block" style={{ width: '70%', height: '1lh' }} />
          <p><span className="skeleton-line" /></p>
          <FieldSkeleton hint={styles.help} />
          <FieldSkeleton />
          <p className="meta-line"><span className="skeleton-line" /></p>
          <ButtonSkeleton wide />
        </>
      }
    />
  );
}

function AskNew() {
  const t = useT();
  return (
    <div className={styles.actions}>
      <Link to="/password/forgot" className="text-button primary wide">{t('password.choose.askNew')}</Link>
    </div>
  );
}

function Invalid() {
  const t = useT();
  return (
    <>
      <div role="alert"><h1 className="entry-title">{t('password.choose.invalid')}</h1></div>
      <AskNew />
    </>
  );
}

/** Network or a lost answer: Auth may have used the code already, so no promise it still works. */
function Unverified() {
  const t = useT();
  return (
    <>
      <div role="alert"><h1 className="entry-title">{t('password.choose.verifyFailed')}</h1></div>
      <AskNew />
    </>
  );
}

function Done({ email }: { email: string }) {
  const t = useT();
  return (
    <>
      <div role="alert"><h1 className="entry-title">{t('password.choose.done')}</h1></div>
      <p>{t('password.choose.doneNext')}</p>
      {needsHomeScreenHint() && <p>{t('password.choose.homeScreen')}</p>}
      <div className={styles.actions}>
        <Link to="/login" search={{ email }} className="text-button primary wide">{t('password.choose.signIn')}</Link>
      </div>
    </>
  );
}

/** Another account is open here: the link is for someone else, and is not used until it is closed. */
function OtherAccount({ email }: { email: string }) {
  const t = useT();
  const signOut = useSignOut();
  const online = useOnline();
  const profile = useProfile();
  return (
    <>
      <p>{t('password.choose.otherAccount', { name: profile.data?.user.displayName ?? email })}</p>
      <div className={styles.actions}>
        <button type="button" className="text-button primary wide" disabled={!online} onClick={() => void signOut()}>{t('password.choose.signOut')}</button>
      </div>
    </>
  );
}

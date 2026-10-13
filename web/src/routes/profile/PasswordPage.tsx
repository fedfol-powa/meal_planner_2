import { useRef, useState, type FormEvent } from 'react';
import { useAuth, type AuthState } from '../../auth/AuthProvider';
import type { ChangePasswordFailure } from '../../auth/backend';
import { PASSWORD_MIN_LENGTH, validatePasswordChange, type PasswordField, type PasswordFieldErrors } from '../../auth/passwordChange';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { useT } from '../../i18n/LocaleProvider';
import { trackBusy } from '../../pwa/busy';
import { useSignOut } from '../../session/SessionScope';
import { BackToProfile } from './BackToProfile';
import styles from './PasswordPage.module.css';

const EMPTY: Record<PasswordField, string> = { current: '', next: '', confirm: '' };
const AUTOCOMPLETE: Record<PasswordField, string> = { current: 'current-password', next: 'new-password', confirm: 'new-password' };
const LABEL = { current: 'password.current', next: 'password.next', confirm: 'password.confirm' } as const;
/** Server outcomes shown under a field; the others go above the button. */
const FIELD_OF: Partial<Record<ChangePasswordFailure, PasswordField>> = {
  current_invalid: 'current',
  weak_length: 'next',
  weak_characters: 'next',
  weak: 'next',
  same_password: 'next'
};
const userOf = (state: AuthState) => (state.status === 'signedIn' ? state.user.id : null);

/** Password change (spec «Cambio della password»): checked here, sent to Supabase Auth only. */
export function PasswordPage() {
  const t = useT();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const online = useOnline();
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  // The reason, not the text: a change of language translates it again.
  const [failure, setFailure] = useState<ChangePasswordFailure | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap or Enter before React re-renders must not send twice.
  const sending = useRef(false);
  // The person shown now: an answer for someone else is dropped.
  const shown = useRef(userOf(state));
  shown.current = userOf(state);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !online) return;
    const errors = validatePasswordChange(values);
    setFieldErrors(errors);
    setFailure(null);
    setDone(false);
    if (Object.keys(errors).length > 0) return;
    const asker = shown.current;
    sending.current = true;
    setBusy(true);
    const result = await trackBusy(backend.changePassword(values.current, values.next));
    sending.current = false;
    setBusy(false);
    // Someone else is on this device now: nothing of the previous account stays on screen.
    if (shown.current !== asker) return setValues(EMPTY);
    if (result.ok) {
      setValues(EMPTY);
      setDone(true);
      return;
    }
    // The previous account's password must not stay on screen for the next one.
    if (result.reason === 'account_changed') setValues(EMPTY);
    setFailure(result.reason);
  }

  const serverField = failure ? FIELD_OF[failure] : undefined;
  const errorOf = (name: PasswordField): string | null => {
    const local = fieldErrors[name];
    if (local) return t(`password.field.${local}`, { min: PASSWORD_MIN_LENGTH });
    return failure && serverField === name ? t(`password.error.${failure}`) : null;
  };
  const input = (name: PasswordField, hint?: string) => {
    const id = `password-${name}`;
    const error = errorOf(name);
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <>
        <div className="field">
          <label htmlFor={id}>{t(LABEL[name])}</label>
          <input
            id={id}
            type="password"
            name={name}
            autoComplete={AUTOCOMPLETE[name]}
            value={values[name]}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
          />
        </div>
        {hint && <p id={`${id}-hint`} className={styles.note}>{hint}</p>}
        {error && <p id={`${id}-error`} className={styles.fieldError} role="alert">{error}</p>}
      </>
    );
  };

  return (
    <section className="secondary-view app-view" aria-labelledby="password-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('password.title')} titleId="password-title" />
        <form className={`settings-card ${styles.form}`} onSubmit={submit} noValidate>
          {input('current')}
          {input('next', t('password.hint', { min: PASSWORD_MIN_LENGTH }))}
          {input('confirm')}
          <p className="meta-line">{t('password.warning')}</p>
          {failure && !serverField && <p className="form-error" role="alert">{t(`password.error.${failure}`)}</p>}
          {failure === 'session_expired' && (
            <button type="button" className="text-button" onClick={() => void signOut()}>{t('password.signInAgain')}</button>
          )}
          {done && <p className="meta-line" role="status">{t('password.done')}</p>}
          {!online && <p className="meta-line">{t('password.offline')}</p>}
          <button type="submit" className="text-button primary wide" disabled={busy || !online}>
            {busy ? t('password.submitting') : t('password.submit')}
          </button>
        </form>
      </div>
    </section>
  );
}

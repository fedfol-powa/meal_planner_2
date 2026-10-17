import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useAuth } from '../../auth/AuthProvider';
import type { PasswordEmailResult } from '../../auth/backend';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { trackBusy } from '../../pwa/busy';
import { EntryTop } from './EntryTop';
import styles from './EntryPage.module.css';

const route = getRouteApi('/password/forgot');
/** Supabase sends at most one recovery email a minute to one address (max_frequency). */
const RESEND_AFTER_MS = 60_000;

type Failure = Exclude<PasswordEmailResult, { ok: true }>['reason'];
const FAILURE_TEXT: Record<Failure, MessageKey> = {
  project_limit: 'password.forgot.error.project_limit',
  network: 'password.forgot.error.network',
  unknown: 'errors.unknown'
};

/**
 * «Password dimenticata» (spec W15, `/password/forgot`): the answer is the same whether the
 * account exists or not (decision 17).
 */
export function ForgotPage() {
  const t = useT();
  const { backend } = useAuth();
  const online = useOnline();
  const search = route.useSearch();
  const id = useId();
  const [email, setEmail] = useState(search.email ?? '');
  /** The address the link went to; null while the form is shown. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** Changes at every successful sending, which restarts the 60 seconds. */
  const [sentAt, setSentAt] = useState(0);
  const [canResend, setCanResend] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    if (!sentAt) return;
    setCanResend(false);
    const timer = setTimeout(() => setCanResend(true), RESEND_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sentAt]);

  function send(address: string) {
    if (sending.current || !online || !address) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    // Busy until the answer is handled (spec W8).
    void trackBusy(
      (async () => {
        try {
          const result = await backend.requestPasswordEmail(address);
          if (!result.ok) return setFailure(result.reason);
          setSentTo(address);
          setSentAt(Date.now());
        } catch {
          setFailure('unknown');
        } finally {
          sending.current = false;
          setBusy(false);
        }
      })()
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(email.trim());
  }

  const error = failure && <p className="form-error" role="alert">{t(FAILURE_TEXT[failure])}</p>;

  return (
    <main className="entry-page" id="app-content">
      <EntryTop />
      <h1 className="entry-title">{t('password.forgot.title')}</h1>
      {sentTo === null ? (
        <>
          <p>{t('password.forgot.intro')}</p>
          {error}
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor={`${id}-email`}>{t('password.forgot.email')}</label>
              <input id={`${id}-email`} type="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="text-button primary wide" disabled={busy || !online}>{t('password.forgot.submit')}</button>
          </form>
          <div className={styles.actions}>
            <Link to="/login" className="text-button wide">{t('password.forgot.back')}</Link>
          </div>
        </>
      ) : (
        <>
          <p role="status">{t('password.forgot.sent')}</p>
          <p>{t('password.forgot.validity')}</p>
          {error}
          <div className={styles.actions}>
            {canResend && (
              <button type="button" className="text-button wide" disabled={busy || !online} onClick={() => send(sentTo)}>{t('password.forgot.again')}</button>
            )}
            <Link to="/login" search={{ email: sentTo }} className="text-button primary wide">{t('password.forgot.back')}</Link>
          </div>
        </>
      )}
    </main>
  );
}

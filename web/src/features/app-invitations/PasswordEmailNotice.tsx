import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { GlobalRole } from '@app/contract';
import { errorKey } from '../../api/errors';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';

export type AcceptOutcome = 'sent' | 'failed' | 'too_soon' | 'not_needed' | 'not_sent' | 'unavailable';
export type ResendOutcome = Exclude<AcceptOutcome, 'not_sent'>;

/** What the person has seen last; `gone` is the account that vanished during the acceptance. */
type Status = Exclude<AcceptOutcome, 'unavailable'> | 'noResend' | 'gone';

/** Seconds between two sends: the server's limit per person (spec W15), repeated here. */
const WAIT_MS = 60_000;
/** After these answers a send was recorded (also a failed one, spec W15 §2): the next one waits. */
const waits = (status: Status) => status === 'sent' || status === 'too_soon' || status === 'failed';

const TEXTS: Partial<Record<Status, MessageKey>> = {
  failed: 'invite.mail.failed',
  too_soon: 'invite.mail.tooSoon',
  not_needed: 'invite.mail.notNeeded',
  noResend: 'invite.mail.noResend',
  not_sent: 'invite.mail.notSent',
  gone: 'invite.mail.gone'
};

/**
 * The page after the acceptance of an invitation (spec W15, «Pagine d'invito»): the outcome of
 * the first email and «Rimanda l'email». `email` is the one of the acceptance's answer, already
 * normalised. `note` (family link no longer valid) replaces the title; `onRestart` is only for the
 * family page.
 */
export function PasswordEmailNotice({ email, outcome, roles = [], note, resend, onRestart }: {
  email: string;
  outcome: AcceptOutcome;
  roles?: GlobalRole[];
  note?: ReactNode;
  resend: () => Promise<{ passwordEmail: ResendOutcome }>;
  onRestart?: () => void;
}) {
  const t = useT();
  const online = useOnline();
  const [status, setStatus] = useState<Status>(outcome === 'unavailable' ? 'gone' : outcome);
  const [locked, setLocked] = useState(waits(status));
  // Each send starts the wait again, also when the previous one is still running.
  const [round, setRound] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!locked) return;
    const timer = setTimeout(() => setLocked(false), WAIT_MS);
    return () => clearTimeout(timer);
  }, [locked, round]);

  async function again() {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const { passwordEmail } = await resend();
      if (!mounted.current) return;
      const next: Status = passwordEmail === 'unavailable' ? 'noResend' : passwordEmail;
      setStatus(next);
      setLocked(waits(next));
      setRound((r) => r + 1);
    } catch (failure) {
      if (mounted.current) setError(errorKey(failure));
    } finally {
      sending.current = false;
      if (mounted.current) setPending(false);
    }
  }

  const toLogin = (
    <Link to="/login" search={{ email }} className="text-button primary wide">{t('invite.toLogin')}</Link>
  );
  const resendButton = (
    <button type="button" className="text-button wide" disabled={locked || pending || !online} onClick={() => void again()}>
      {t('invite.mail.resend')}
    </button>
  );
  const restart = onRestart && (
    <button type="button" className="text-button wide" onClick={onRestart}>{t('invite.mail.restart')}</button>
  );

  const title = note || status === 'gone' ? null : <h1 className="entry-title">{t(status === 'sent' ? 'invite.mail.title' : 'invite.ready')}</h1>;
  return (
    <>
      {title}
      {note}
      {status === 'sent' ? (
        <>
          <p role="status">{t('invite.mail.sent', { email })}</p>
          <p>{t('invite.mail.valid')}</p>
          {roles.includes('recipe_curator') && <p>{t('invite.mail.rolesAfter')}</p>}
        </>
      ) : (
        <p role="status">{t(TEXTS[status]!)}</p>
      )}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {(status === 'sent' || status === 'failed' || status === 'too_soon' || status === 'not_sent') && resendButton}
      {(status === 'not_needed' || status === 'noResend' || status === 'not_sent') && toLogin}
      {status !== 'gone' && status !== 'not_needed' && status !== 'noResend' && restart}
    </>
  );
}

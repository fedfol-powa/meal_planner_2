import { Link } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { GlobalRole } from '@app/contract';
import { errorKey, toApiError } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import { useOnline } from '../../components/OfflineBanner';
import { useT } from '../../i18n/LocaleProvider';
import { CopyField } from '../agents/CopyField';
import { useAdminAccess } from './AdminAccess';
import styles from './AdminPage.module.css';

/**
 * «Nuovo invito» (spec W9). Mounted once per opening. A retry with the same email and roles keeps the
 * id (the first write may have happened, its answer lost); other data are a new invitation, a new id.
 * The link is shown only for this attempt and only while the session that asked is open (`applied`);
 * it is never shown again.
 */
export function InviteSheet({ again, onClose }: { again?: { email: string; roles: GlobalRole[] }; onClose: () => void }) {
  const t = useT();
  const deps = useQueryDeps();
  const online = useOnline();
  const ids = useId();
  const attempt = useRef<{ id: string; data: string } | null>(null);
  const [email, setEmail] = useState(again?.email ?? '');
  const [roles, setRoles] = useState<GlobalRole[]>(again?.roles ?? []);
  const [link, setLink] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  /** The user who has the email of the latest attempt; only the latest attempt's search may set it (spec W10). */
  const [existingUser, setExistingUser] = useState<string | null>(null);
  const attemptNumber = useRef(0);
  const access = useAdminAccess();
  const create = useAreaMutation('appInvitations.create', undefined, (input: { id: string; email: string; roles: GlobalRole[] }) => deps.api.appInvitations.create(input));
  // A ref blocks a second tap before the next render; `alive` drops the answer of a closed sheet.
  const sending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function send() {
    if (sending.current || !email.trim()) return;
    sending.current = true;
    const attemptNow = ++attemptNumber.current;
    setExistingUser(null);
    setFailure(null);
    const data = JSON.stringify([email.trim().toLowerCase(), [...roles].sort()]);
    if (attempt.current?.data !== data) attempt.current = { id: crypto.randomUUID(), data };
    try {
      const outcome = await create.mutateAsync({ id: attempt.current.id, email: email.trim(), roles });
      // The list is read again in any case (mutations.ts); the link only for this attempt, same session.
      if (outcome.applied && alive.current) setLink(outcome.view.url);
    } catch (error) {
      if (!alive.current) return;
      setFailure(error);
      const apiError = toApiError(error);
      if (apiError.code === 'not_allowed' && (apiError.data as { reason?: string } | undefined)?.reason === 'account_exists') {
        // The account is found by its email; an answer of an older attempt is dropped.
        const wanted = email.trim().toLowerCase();
        void deps.api.users
          .list({ query: wanted })
          .then(({ users }) => {
            if (!alive.current || attemptNow !== attemptNumber.current) return;
            setExistingUser(users.find((user) => user.email.toLowerCase() === wanted)?.id ?? null);
          })
          // forbidden goes to AdminAccess like any users operation; other errors leave only the text.
          .catch((searchError: unknown) => void access.report(searchError));
      }
    } finally {
      sending.current = false;
    }
  }

  // «Nuovo link»: same email and roles, a new id, sent at once.
  const sentAgain = useRef(false);
  useEffect(() => {
    if (again && !sentAgain.current) {
      sentAgain.current = true;
      void send();
    }
  });

  const toggle = (role: GlobalRole) => setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };
  const accountExists = failure !== null && toApiError(failure).code === 'not_allowed';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <BottomSheet open title={t('admin.new')} onClose={onClose}>
      {link ? (
        <>
          <CopyField value={link} label={t('admin.link')} />
          {canShare && (
            <button type="button" className="text-button wide" onClick={() => void navigator.share({ url: link }).catch(() => undefined)}>{t('admin.share')}</button>
          )}
          <p className="meta-line">{t('admin.linkOnce')}</p>
        </>
      ) : (
        <form onSubmit={submit}>
          {failure !== null && (
            <p className="form-error" role="alert">
              {accountExists ? t('admin.accountExists') : t(errorKey(failure))}
              {accountExists && existingUser && (
                <> <Link to="/admin/users/$userId" params={{ userId: existingUser }} className="link-inline" onClick={onClose}>{t('admin.openUser')}</Link></>
              )}
            </p>
          )}
          <div className="field">
            <label htmlFor={`${ids}-email`}>{t('invite.email')}</label>
            <input
              id={`${ids}-email`}
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                // A new email: the link goes, and a search still running is superseded.
                attemptNumber.current += 1;
                setExistingUser(null);
              }}
            />
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={roles.includes('recipe_curator')} onChange={() => toggle('recipe_curator')} />
            {t('admin.curator')}
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={roles.includes('app_admin')} onChange={() => toggle('app_admin')} />
            {t('admin.appAdmin')}
          </label>
          <button type="submit" className="text-button primary wide" disabled={!online || !email.trim() || create.isPending}>{t('admin.create')}</button>
        </form>
      )}
    </BottomSheet>
  );
}

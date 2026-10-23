import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AppInvitationView, GlobalRole } from '@app/contract';
import { errorKey } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { BottomSheet } from '../../components/BottomSheet';
import { useOnline } from '../../components/OfflineBanner';
import { ButtonSkeleton, SettingsCardSkeleton } from '../../components/PageSkeletons';
import { QueryError } from '../../components/QueryError';
import { LoadingArea } from '../../components/Skeleton';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { appInvitationsQuery } from './api';
import { InviteSheet } from './InviteSheet';
import styles from './AdminPage.module.css';

/** What opens the sheet: empty, or «Nuovo link» with the email and roles of an invitation. */
type Opening = { key: number; again?: { email: string; roles: GlobalRole[] } };

/** «Inviti all'app» (spec W9): list with state and expiry, new invitation, new link, revocation. */
export function InvitationsSection() {
  const t = useT();
  const { locale } = useLocale();
  const deps = useQueryDeps();
  const online = useOnline();
  const list = useQuery(appInvitationsQuery(deps));
  const [opening, setOpening] = useState<Opening | null>(null);
  const [revoking, setRevoking] = useState<AppInvitationView | null>(null);
  const revoke = useAreaMutation('appInvitations.revoke', undefined, (id: string) => deps.api.appInvitations.revoke({ id }));
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(iso));
  // Each opening is its own attempt: a new key remounts the sheet, so a late answer of a closed one shows nothing.
  const open = (again?: Opening['again']) => setOpening((current) => ({ key: (current?.key ?? 0) + Date.now(), again }));
  // Each confirmation starts clean: the outcome of an earlier revocation is not about this one.
  const confirmRevoke = (invitation: AppInvitationView) => {
    revoke.reset();
    setRevoking(invitation);
  };

  function status(invitation: AppInvitationView): string {
    switch (invitation.status) {
      case 'pending': return t('admin.expires', { date: date(invitation.expiresAt) });
      case 'expired': return t('admin.expired', { date: date(invitation.expiresAt) });
      case 'accepted': return t('admin.acceptedBy', { name: invitation.acceptedByName ?? '?', date: date(invitation.acceptedAt ?? invitation.createdAt) });
      case 'revoked': return t('admin.revokedOn', { date: date(invitation.revokedAt ?? invitation.createdAt) });
    }
  }

  return (
    <section className="settings-card" aria-labelledby="invitations-title">
      <div className={styles.heading}>
        <h2 id="invitations-title">{t('admin.invitations')}</h2>
        <button type="button" className="text-button primary" disabled={!online} onClick={() => open()}>{t('admin.new')}</button>
      </div>
      {list.isError && <QueryError error={list.error} onRetry={() => void list.refetch()} />}
      {!list.data && !list.isError && (
        <LoadingArea
          loading
          paused={list.fetchStatus === 'paused'}
          skeleton={
            <ul className={styles.list}>
              <InvitationItemSkeleton filled />
              <InvitationItemSkeleton filled />
            </ul>
          }
        />
      )}
      {list.data && (
        <ul className={styles.list}>
          {list.data.invitations.map((invitation) => {
            // An expired invitation is still pending in the database and, if reserved, can still be closed: it must be stoppable.
            const open_ = invitation.status === 'pending' || invitation.status === 'expired';
            // Only an invitation whose account was deleted has no email, and it is never pending.
            const email = invitation.email;
            return (
              <li key={invitation.id} className={styles.item}>
                <span className={styles.email}>{invitation.email ?? t('admin.deletedAccount')}</span>
                <span className={styles.roles}>
                  {invitation.roles.length === 0 ? <span className={styles.role}>{t('admin.noRoles')}</span> : invitation.roles.map((role) => <span key={role} className={styles.role}>{t(`role.${role}`)}</span>)}
                </span>
                <span className="meta-line">{status(invitation)}</span>
                {invitation.createdByName && <span className="meta-line">{t('admin.by', { name: invitation.createdByName })}</span>}
                {open_ && email !== null && (
                  <span className={styles.actions}>
                    <button type="button" className="text-button" disabled={!online} onClick={() => open({ email, roles: invitation.roles })}>{t('admin.newLink')}</button>
                    <button type="button" className="text-button" disabled={!online} onClick={() => confirmRevoke(invitation)}>{t('admin.revoke')}</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {opening && <InviteSheet key={opening.key} again={opening.again} onClose={() => setOpening(null)} />}
      <BottomSheet open={revoking !== null} title={t('admin.revokeConfirm')} onClose={() => setRevoking(null)}>
        {revoking && <p>{revoking.email}</p>}
        {revoke.isError && <p className="form-error" role="alert">{t(errorKey(revoke.error))}</p>}
        <button
          type="button"
          className={`text-button wide ${styles.danger}`}
          disabled={!online || revoke.isPending}
          onClick={() => revoking && revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
        >
          {t('admin.revoke')}
        </button>
      </BottomSheet>
    </section>
  );
}

/**
 * An invitation while the list loads (W22), with the children and classes of an accepted one (the most
 * frequent in a growing list): email, a role label, state and author. One structure for the two phases:
 * inside the card of blocks of the access check (transparent) and inside the real card (`filled`).
 */
export function InvitationItemSkeleton({ filled = false }: { filled?: boolean }) {
  const block = filled ? ' skeleton-block' : '';
  return (
    <li className={styles.item}>
      <span className={`${styles.email} skeleton-line${block}`} />
      <span className={styles.roles}>
        <span className={`${styles.role}${block}`} style={{ width: '6em' }}><span className="skeleton-line" /></span>
      </span>
      <span className={`meta-line skeleton-line${block}`} />
      <span className={`meta-line skeleton-line${block}`} />
    </li>
  );
}

/** The invitations' card while the access is checked: heading with the button, two invitations. */
export function InvitationsCardSkeleton() {
  return (
    <SettingsCardSkeleton title={false}>
      <div className={styles.heading}>
        <h2 className="skeleton-line" />
        <ButtonSkeleton className="primary" />
      </div>
      <ul className={styles.list}>
        <InvitationItemSkeleton />
        <InvitationItemSkeleton />
      </ul>
    </SettingsCardSkeleton>
  );
}

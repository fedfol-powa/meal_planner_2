import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { USER_QUERY_MAX } from '@app/contract';
import { useQueryDeps } from '../../api/queries';
import { Icon } from '../../components/Icon';
import { SettingsCardSkeleton, SkeletonRows } from '../../components/PageSkeletons';
import { QueryError } from '../../components/QueryError';
import { LoadingArea } from '../../components/Skeleton';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { usersQuery } from './api';
import styles from './AdminPage.module.css';

/** The search starts this long after the last keystroke. */
export const SEARCH_DELAY_MS = 250;

/** «Utenti» (spec W10): search by name or email, roles and a deletion in progress (W11) as labels, a row per user. */
export function UsersSection() {
  const t = useT();
  const deps = useQueryDeps();
  const me = useProfile().data?.user.id;
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  // The previous answer stays while the next one loads: the page does not jump on the phone.
  const list = useQuery({ ...usersQuery(deps, query), placeholderData: keepPreviousData });

  return (
    <section className="settings-card" aria-labelledby="users-title">
      <h2 id="users-title">{t('admin.users')}</h2>
      <input
        className={styles.search}
        type="search"
        enterKeyHint="search"
        autoCapitalize="none"
        maxLength={USER_QUERY_MAX}
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {list.isError && <QueryError error={list.error} onRetry={() => void list.refetch()} />}
      {!list.data && !list.isError && (
        <LoadingArea loading paused={list.fetchStatus === 'paused'} skeleton={<SkeletonRows count={3} link trail filled />} />
      )}
      {list.data && list.data.users.length === 0 && <p className="meta-line">{t('admin.noUsers')}</p>}
      {list.data && list.data.users.length > 0 && (
        <ul className="row-list">
          {list.data.users.map((user) => (
            <li key={user.id}>
              <Link to="/admin/users/$userId" params={{ userId: user.id }} className="row-link">
                <span className="row-main">
                  <span>{user.displayName}{user.id === me && <span className={styles.you}>{` · ${t('admin.you')}`}</span>}</span>
                  <small>{user.email}</small>
                  {(user.roles.length > 0 || user.deletion || user.emailUnconfirmed) && (
                    <span className={styles.roles}>
                      {user.roles.map((role) => <span key={role} className={styles.role}>{t(`role.${role}`)}</span>)}
                      {user.deletion && <span className={styles.role}>{t('admin.deletionPending')}</span>}
                      {user.emailUnconfirmed && <span className={styles.role}>{t('members.emailUnconfirmed')}</span>}
                    </span>
                  )}
                </span>
                <Icon name="chevron-right" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.data?.more && <p className="meta-line">{t('admin.moreUsers')}</p>}
    </section>
  );
}

/** The users' card while the access is checked (W22): title, search field, three rows with name and email. */
export function UsersCardSkeleton() {
  return (
    <SettingsCardSkeleton>
      <span className={`${styles.search} skeleton-block`} style={{ height: 44 }} />
      <SkeletonRows count={3} link trail />
    </SettingsCardSkeleton>
  );
}

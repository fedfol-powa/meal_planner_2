import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQueryDeps } from '../../api/queries';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { QueryError } from '../../components/QueryError';
import { useT } from '../../i18n/LocaleProvider';
import { useProfile } from '../../session/useFamily';
import { useAdminAccess } from './AdminAccess';
import { usersQuery } from './api';
import styles from './AdminPage.module.css';

/** The search starts this long after the last keystroke. */
export const SEARCH_DELAY_MS = 250;

/** «Utenti» (spec W10): search by name or email, roles as labels, a row per user. */
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
  const { report } = useAdminAccess();
  useEffect(() => {
    if (list.error) report(list.error);
  }, [list.error, report]);

  return (
    <section className="settings-card" aria-labelledby="users-title">
      <h2 id="users-title">{t('admin.users')}</h2>
      <input
        className={styles.search}
        type="search"
        enterKeyHint="search"
        autoCapitalize="none"
        placeholder={t('admin.search')}
        aria-label={t('admin.search')}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {list.isError && <QueryError error={list.error} onRetry={() => void list.refetch()} />}
      {!list.data && !list.isError && <Loading />}
      {list.data && list.data.users.length === 0 && <p className="meta-line">{t('admin.noUsers')}</p>}
      {list.data && list.data.users.length > 0 && (
        <ul className="row-list">
          {list.data.users.map((user) => (
            <li key={user.id}>
              <Link to="/admin/users/$userId" params={{ userId: user.id }} className="row-link">
                <span className="row-main">
                  <span>{user.displayName}{user.id === me && <span className={styles.you}>{` · ${t('admin.you')}`}</span>}</span>
                  <small>{user.email}</small>
                  {user.roles.length > 0 && (
                    <span className={styles.roles}>{user.roles.map((role) => <span key={role} className={styles.role}>{t(`role.${role}`)}</span>)}</span>
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

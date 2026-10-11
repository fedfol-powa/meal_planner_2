import { isBlocking } from '../api/errors';
import { useAuth } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { Loading } from '../components/Loading';
import { QueryError } from '../components/QueryError';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { LOCALES, type MessageKey } from '../i18n/translate';
import { useChooseLocale, useSignOut } from '../session/SessionScope';
import { useFamily, useMe } from '../session/useFamily';
import styles from './ProfilePage.module.css';

// Destinations that arrive with wave 2 (spec, Profilo): visible, disabled.
const PLACEHOLDERS: { icon: IconName; label: MessageKey }[] = [
  { icon: 'users', label: 'profile.members' },
  { icon: 'gear', label: 'profile.settings' },
  { icon: 'ban', label: 'profile.exclusions' }
];

export function ProfilePage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const me = useMe();
  const family = useFamily();
  const meBlocked = me.isError && isBlocking(me.error, !!me.data);
  // No cached profile next to a blocking error (second review, C8).
  const profile = meBlocked ? undefined : me.data;
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');

  return (
    <section className="secondary-view app-view">
      <div className="page-column">
        <header className={styles.header}>
          <h1 className={styles.name}>{profile?.user.displayName ?? email}</h1>
          {profile && <p className={styles.email}>{email}</p>}
        </header>
        {meBlocked && <QueryError error={me.error} onRetry={() => void me.refetch()} />}
        {!meBlocked && !me.data && <Loading />}
        {family.status === 'ready' && (
          <section className="settings-card" aria-labelledby="family-title">
            <h2 id="family-title">{t('profile.family')}</h2>
            <ul className="row-list">
              <li>
                <span className="row-main">{family.family.name}<small>{t(`profile.role.${family.family.role}`)}</small></span>
              </li>
              {PLACEHOLDERS.map((row) => (
                <li key={row.label}>
                  <button type="button" className="row-link" disabled>
                    <Icon name={row.icon} />
                    <span className="row-main">{t(row.label)}<small>{t('common.soon')}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* Always available: language and sign-out must work even without a profile or a family. */}
        <section className="settings-card" aria-labelledby="account-title">
          <h2 id="account-title">{t('profile.account')}</h2>
          <fieldset className={styles.language}>
            <legend className={styles.legend}>{t('profile.language')}</legend>
            {LOCALES.map((option) => (
              <label key={option} className="choice">
                <input type="radio" name="locale" checked={locale === option} onChange={() => chooseLocale(option)} />
                {t(`profile.language.${option}`)}
              </label>
            ))}
          </fieldset>
          {backend.mode === 'supabase' && (
            <button type="button" className="text-button" onClick={() => void signOut()}>{t('profile.signOut')}</button>
          )}
        </section>
      </div>
    </section>
  );
}

import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { errorKey, isBlocking } from '../../api/errors';
import { useAreaMutation } from '../../api/mutations';
import { useQueryDeps } from '../../api/queries';
import { useAuth } from '../../auth/AuthProvider';
import danger from '../../components/Danger.module.css';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { FieldSkeleton, SettingsCardSkeleton, TextSkeleton } from '../../components/PageSkeletons';
import { LoadingArea, LoadingScope } from '../../components/Skeleton';
import { QueryError } from '../../components/QueryError';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { LOCALES } from '../../i18n/translate';
import { useChooseLocale, useSignOut } from '../../session/SessionScope';
import { useProfile } from '../../session/useFamily';
import { BackToProfile } from './BackToProfile';
import styles from './profile.module.css';

const NAME_MAX = 60;

/** Personal preferences (spec section 7): name and language, independent of the family. */
export function PreferencesPage() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const { state, backend } = useAuth();
  const signOut = useSignOut();
  const online = useOnline();
  const { api } = useQueryDeps();
  const read = useProfile();
  const blocked = read.isError && isBlocking(read.error, !!read.data);
  const profile = blocked ? undefined : read.data;
  const loading = !blocked && !read.data;
  const paused = read.fetchStatus === 'paused';
  const saved = profile?.user.displayName ?? '';
  const [name, setName] = useState(saved);
  const [languageError, setLanguageError] = useState<unknown>(null);
  const [sendingLocale, setSendingLocale] = useState(false);
  const rename = useAreaMutation('profile.updateName', undefined, (displayName: string) => api.profile.update({ displayName }));
  // The field follows the server while nothing is being typed or sent.
  useEffect(() => {
    if (!rename.isPending) setName(saved);
  }, [saved, rename.isPending]);

  const saveName = () => {
    if (name.trim() === saved) return setName(saved);
    // No optimistic update: the text stays as typed until the answer, then shows the server value.
    rename.mutate(name, { onError: () => setName(saved) });
  };
  // The choice waits for the profile: one at a time, the radios show the language until the answer.
  const choose = (next: (typeof LOCALES)[number]) => {
    setLanguageError(null);
    setSendingLocale(true);
    chooseLocale(next)
      .catch(setLanguageError)
      .finally(() => setSendingLocale(false));
  };
  const menuEmails = useAreaMutation('profile.updateMenuEmails', undefined, (value: boolean) => api.profile.update({ menuEmails: value }));
  const email = profile?.user.email ?? (state.status === 'signedIn' ? state.user.email : '');

  return (
    <section className="secondary-view app-view" aria-labelledby="preferences-title">
      <div className="page-column">
        <PageHeader back={<BackToProfile />} title={t('profile.preferences')} titleId="preferences-title" />
        {blocked && <QueryError error={read.error} onRetry={() => void read.refetch()} />}
        {/* The two cards of the profile are one wait of the page (W22, W24): one delay, one announcement. */}
        <LoadingScope gather>
          {loading && (
            // The name card in its place while the profile loads (W22): field, then email label and value.
            <LoadingArea
              loading
              paused={paused}
              skeleton={
                <SettingsCardSkeleton title={false}>
                  <FieldSkeleton />
                  <p className={styles.static}><span className="skeleton-line" /><em className="skeleton-line" /></p>
                </SettingsCardSkeleton>
              }
            />
          )}
          {profile && (
            <section className="settings-card">
              <label className="field">
                {t('preferences.name')}
                <input
                  type="text"
                  maxLength={NAME_MAX}
                  value={name}
                  disabled={!online || rename.isPending}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={saveName}
                />
              </label>
              {rename.isError && <p className="meta-line" role="alert">{t(errorKey(rename.error))}</p>}
              <p className={styles.static}><span>{t('preferences.email')}</span>{email}</p>
            </section>
          )}
          <section className="settings-card" aria-labelledby="language-title">
            <h2 id="language-title">{t('profile.language')}</h2>
            {LOCALES.map((option) => (
              <label key={option} className="choice" lang={option}>
                <input type="radio" name="locale" checked={locale === option} disabled={sendingLocale} onChange={() => choose(option)} />
                {t(`profile.language.${option}`)}
              </label>
            ))}
            <p className="meta-line">{t(online ? 'preferences.languageHint' : 'preferences.offline')}</p>
            {sendingLocale && <p className="meta-line" role="status">{t('settings.saving')}</p>}
            {languageError !== null && <p className="meta-line" role="alert">{t(errorKey(languageError))}</p>}
          </section>
          {loading && (
            // The menu emails card in its place (W24): the checkbox row, then the hint (two lines on a phone).
            <LoadingArea
              loading
              paused={paused}
              skeleton={
                <SettingsCardSkeleton title={false}>
                  <TextSkeleton as="div" className="choice" />
                  <TextSkeleton className="meta-line" lines={2} />
                </SettingsCardSkeleton>
              }
            />
          )}
          {profile && (
            <section className="settings-card" aria-labelledby="menu-emails-title">
              <label className="choice">
                <input
                  type="checkbox"
                  // The value sent while saving; the saved one again after an error.
                  checked={menuEmails.isPending ? menuEmails.variables : profile.user.menuEmails}
                  disabled={!online || menuEmails.isPending}
                  aria-describedby="menu-emails-hint"
                  onChange={(event) => menuEmails.mutate(event.target.checked)}
                />
                <span id="menu-emails-title">{t('preferences.menuEmails')}</span>
              </label>
              <p id="menu-emails-hint" className="meta-line">{t('preferences.menuEmailsHint')}</p>
              {menuEmails.isPending && <p className="meta-line" role="status">{t('settings.saving')}</p>}
              {menuEmails.isSuccess && <p className="meta-line" role="status">{t('preferences.menuEmailsSaved')}</p>}
              {menuEmails.isError && <p className="meta-line" role="alert">{t(errorKey(menuEmails.error))}</p>}
            </section>
          )}
        </LoadingScope>
        {backend.mode === 'supabase' && (
          <button type="button" className="text-button" onClick={() => void signOut()}>{t('profile.signOut')}</button>
        )}
        {/* Only navigation: the page reads the plan, the red button deletes (spec W11). */}
        <div className={danger.dangerZone}>
          <Link to="/profile/account/delete" className={`text-button wide ${danger.dangerOutline}`}>{t('account.delete')}</Link>
        </div>
      </div>
    </section>
  );
}

import { useOnline } from '../../components/OfflineBanner';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { LOCALES } from '../../i18n/messages';
import { useChooseLocale } from '../../session/SessionScope';
import styles from './EntryPage.module.css';

/** Top of the entry pages, as on the invitation pages: brand, language switch, «Sei offline». */
export function EntryTop() {
  const t = useT();
  const { locale } = useLocale();
  const chooseLocale = useChooseLocale();
  const online = useOnline();
  return (
    <>
      <div className={styles.top}>
        <p className="entry-brand">{t('auth.brand')}</p>
        <div className={styles.languages} role="group" aria-label={t('profile.language')}>
          {LOCALES.map((option) => (
            <button key={option} type="button" className={styles.language} aria-pressed={option === locale} onClick={() => void chooseLocale(option)}>
              {t(`profile.language.${option}`)}
            </button>
          ))}
        </div>
      </div>
      {!online && <p className="offline-banner" role="status">{t('offline.banner')}</p>}
    </>
  );
}

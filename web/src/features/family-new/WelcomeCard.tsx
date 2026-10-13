import { Link } from '@tanstack/react-router';
import { useT } from '../../i18n/LocaleProvider';
import { needsHomeScreenHint } from './ios';
import styles from './WelcomeCard.module.css';

/**
 * After the wizard (spec W9, round 4): the first menu is ready. Only «Sistema le impostazioni»
 * until family invitations arrive (activity C); on iOS in Safari, how to use it from the Home Screen.
 */
export function WelcomeCard({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <aside className={styles.card} aria-labelledby="welcome-title">
      <p className={styles.title} id="welcome-title">{t('onboarding.ready')}</p>
      <Link to="/profile/family/settings" className="link-inline" onClick={onClose}>{t('onboarding.settings')}</Link>
      {needsHomeScreenHint() && <p className={styles.note}>{t('onboarding.homeScreen')}</p>}
      <button type="button" className={styles.close} aria-label={t('common.close')} onClick={onClose}>×</button>
    </aside>
  );
}

import { useSyncExternalStore } from 'react';
import { formatDayLong } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useSession } from '../../session/SessionScope';
import { noticesOf } from './sessionState';
import styles from './meals.module.css';

/** Failed saves of servings after the card unmounted and meals gone from an open sheet: shown in the Menu until dismissed. */
export function SaveNotices() {
  const t = useT();
  const { locale } = useLocale();
  const notices = noticesOf(useSession());
  const items = useSyncExternalStore(notices.subscribe, notices.list, notices.list);
  return (
    <>
      {items.map((n) => (
        <div key={n.id} role="status" className={styles.notice}>
          <span>{n.kind === 'servings' ? t('meals.servingsNotSaved', { meal: n.mealLabel, date: formatDayLong(locale, n.date) }) : t('meals.gone')}</span>
          <button type="button" onClick={() => notices.dismiss(n.id)}>{t('meals.dismiss')}</button>
        </div>
      ))}
    </>
  );
}

import { DaySelector } from '../../components/DaySelector';
import { RecipeCardSkeleton } from '../../components/PageSkeletons';
import { BusyArea, LoadingScope, Skeleton } from '../../components/Skeleton';
import { formatMonthYear } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { addDays, type IsoDate } from '../../lib/calendar';
import styles from '../MenuPage.module.css';

/**
 * The menu while its week loads (W20): month bar and day row as on the loaded page, two meal cards as blocks.
 * With the week known (a day in the address, the saved opening, a change of week) the month and the days are
 * real and the days can be chosen; otherwise (first start, no opening yet) they are blocks of the same size.
 * No router needed: it is also the startup skeleton on /menu.
 */
export function MenuSkeleton({ weekStartsOn, selected, onSelect, paused }: { weekStartsOn?: IsoDate; selected?: IsoDate; onSelect?: (date: IsoDate) => void; paused?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const known = weekStartsOn && selected && onSelect;
  return (
    <LoadingScope loading paused={paused}>
      <section className="calendar app-view" aria-label={t('nav.menu')}>
        <nav className="day-navigation" aria-label={t('menu.days')}>
          <div className={styles.toolbar}>
            {known ? (
              <p className={`${styles.month} ${styles.monthWaiting}`}>{formatMonthYear(locale, selected)}</p>
            ) : (
              <Skeleton as="p" className={`${styles.month} ${styles.monthWaiting} skeleton-block`} style={{ width: '9rem' }} />
            )}
            <div className={styles.actions}>
              <Skeleton className={`${styles.action} skeleton-block`} />
              <Skeleton className={`${styles.action} skeleton-block`} />
            </div>
          </div>
          {known ? (
            <DaySelector dates={Array.from({ length: 7 }, (_, i) => addDays(weekStartsOn, i))} selected={selected} onSelect={onSelect} />
          ) : (
            <Skeleton className="day-links skeleton-card">
              <div className="day-week">
                {Array.from({ length: 7 }, (_, i) => <span key={i} className="day-link" />)}
              </div>
            </Skeleton>
          )}
        </nav>
        <BusyArea className="week-track">
          <Skeleton as="section" className="day">
            <RecipeCardSkeleton />
            <RecipeCardSkeleton />
          </Skeleton>
        </BusyArea>
      </section>
    </LoadingScope>
  );
}

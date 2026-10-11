import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { datesQuery, useQueryDeps } from '../api/queries';
import { formatDayLong, formatMonthYear } from '../i18n/dates';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { addDays, mondayOf, type IsoDate } from '../lib/calendar';
import { addMonths } from '../routes/menu/selection';
import styles from './DatePicker.module.css';
import { Icon } from './Icon';

interface Props {
  familyId: string;
  selected: IsoDate;
  open: boolean;
  /** Opens or closes from a toggle (this icon or the month): the opener gets focus back on closing. */
  onToggle: (opener: HTMLElement) => void;
  /** The only way to close: choice, Escape or a tap outside. */
  onClose: () => void;
  onSelect: (date: IsoDate) => void;
}

/** A browsable month where only days with a menu can be chosen (round 1). */
export function DatePicker({ familyId, selected, open, onToggle, onClose, onSelect }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const [browsed, setBrowsed] = useState<string | null>(null);
  const month = browsed ?? selected.slice(0, 7);
  const dates = useQuery({ ...datesQuery(useQueryDeps(), familyId, month), enabled: open });
  const available = new Set(dates.data ?? []);
  const panel = useRef<HTMLDivElement>(null);
  const focusedThisOpening = useRef(false);

  useEffect(() => {
    if (!open) return;
    setBrowsed(null);
    focusedThisOpening.current = false;
  }, [open]);

  // Initial focus on the chosen day, once per opening: later reads (other months) never move it.
  useEffect(() => {
    if (!open || focusedThisOpening.current || !dates.data) return;
    focusedThisOpening.current = true;
    panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)')?.focus();
  }, [open, dates.data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!panel.current?.contains(target) && !target.closest?.('[data-date-picker-toggle]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [open, onClose]);

  // Six Monday-first weeks from the Monday on or before the 1st.
  const start = mondayOf(`${month}-01`);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${addDays('2026-10-05', i)}T00:00:00Z`))
  );

  return (
    <div className={styles.picker}>
      <button type="button" className={styles.toggle} data-date-picker-toggle aria-expanded={open} aria-label={t('menu.pickDate')} onClick={(e) => onToggle(e.currentTarget)}>
        <Icon name="calendar" />
      </button>
      {open && (
        <div ref={panel} className={styles.panel} role="dialog" aria-label={t('menu.pickDate')}>
          <div className={styles.month}>
            <button type="button" className={styles.nav} aria-label={t('menu.previousMonth')} onClick={() => setBrowsed(addMonths(month, -1))}>
              <Icon name="chevron-left" />
            </button>
            <strong>{formatMonthYear(locale, `${month}-01`)}</strong>
            <button type="button" className={styles.nav} aria-label={t('menu.nextMonth')} onClick={() => setBrowsed(addMonths(month, 1))}>
              <Icon name="chevron-right" />
            </button>
          </div>
          <div className={styles.grid}>
            {weekdays.map((weekday, i) => <span key={i} className={styles.weekday} aria-hidden="true">{weekday}</span>)}
            {cells.map((date) =>
              date.slice(0, 7) === month ? (
                <button
                  key={date}
                  type="button"
                  className={styles.day}
                  aria-pressed={date === selected}
                  aria-label={formatDayLong(locale, date)}
                  disabled={!available.has(date)}
                  onClick={() => {
                    onSelect(date);
                    onClose();
                  }}
                >
                  {Number(date.slice(8, 10))}
                </button>
              ) : (
                <span key={date} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

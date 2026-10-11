import { formatDayLong, formatDayNumber, formatDayShort } from '../i18n/dates';
import { useLocale } from '../i18n/LocaleProvider';
import type { IsoDate } from '../lib/calendar';

export function DaySelector({ dates, selected, onSelect }: { dates: IsoDate[]; selected: IsoDate; onSelect: (date: IsoDate) => void }) {
  const { locale } = useLocale();
  return (
    <div className="day-links">
      {dates.map((date) => (
        <a
          key={date}
          className="day-link"
          href={`#day-${date}`}
          aria-current={date === selected ? 'location' : undefined}
          aria-label={formatDayLong(locale, date)}
          onClick={(event) => {
            event.preventDefault();
            onSelect(date);
          }}
        >
          <span>{formatDayShort(locale, date)}</span>
          <strong>{formatDayNumber(locale, date)}</strong>
        </a>
      ))}
    </div>
  );
}

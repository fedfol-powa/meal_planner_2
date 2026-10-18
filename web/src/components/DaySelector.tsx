import { useRef, type TouchEvent } from 'react';
import { formatDayLong, formatDayNumber, formatDayShort } from '../i18n/dates';
import { useLocale } from '../i18n/LocaleProvider';
import type { IsoDate } from '../lib/calendar';
import { bounce, swipeStep } from '../routes/menu/weekSwipe';

interface Props {
  dates: IsoDate[];
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  /** A horizontal swipe on the row (touch only): true if the week changed, false to bounce. */
  onSwipe?: (step: -1 | 1) => boolean;
}

export function DaySelector({ dates, selected, onSelect, onSwipe }: Props) {
  const { locale } = useLocale();
  const row = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // Until then, the click some browsers send to the day under the finger belongs to the swipe.
  const swipedUntil = useRef(0);

  // Passive listeners: vertical scrolling and system gestures stay native.
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    start.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    const from = start.current;
    start.current = null;
    if (!onSwipe || !from || !touch || event.touches.length > 0) return;
    const step = swipeStep(touch.clientX - from.x, touch.clientY - from.y);
    if (!step) return;
    swipedUntil.current = performance.now() + 400;
    if (!onSwipe(step)) bounce(row.current, step);
  };

  return (
    <div
      ref={row}
      className="day-links"
      onTouchStart={onSwipe && onTouchStart}
      onTouchEnd={onSwipe && onTouchEnd}
      onTouchCancel={() => (start.current = null)}
      onClickCapture={(event) => {
        if (performance.now() < swipedUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
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

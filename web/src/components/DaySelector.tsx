import { useEffect, useRef, type TouchEvent } from 'react';
import { formatDayLong, formatDayNumber, formatDayShort } from '../i18n/dates';
import { useLocale } from '../i18n/LocaleProvider';
import type { IsoDate } from '../lib/calendar';
import { bounce, stopMotion, swipeStep } from '../routes/menu/weekSwipe';

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
  // The finger that started on the row; null once the gesture is over or has more fingers.
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const stopWatching = useRef(() => {});
  // Until then, the click the browser sends to the day under the finger belongs to the swipe.
  const swipedUntil = useRef(0);

  useEffect(() => {
    const element = row.current;
    return () => {
      stopWatching.current();
      stopMotion(element);
    };
  }, []);

  const cancel = () => {
    gesture.current = null;
    stopWatching.current();
  };

  // Passive listeners: vertical scrolling and system gestures stay native.
  const onTouchStart = (event: TouchEvent) => {
    cancel();
    swipedUntil.current = 0;
    const touch = event.touches.length === 1 ? event.changedTouches[0] : undefined;
    if (!touch) return;
    gesture.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
    // A second finger anywhere on the screen ends the swipe, also when it lands outside the row.
    document.addEventListener('touchstart', cancel, { capture: true, passive: true });
    stopWatching.current = () => {
      document.removeEventListener('touchstart', cancel, { capture: true });
      stopWatching.current = () => {};
    };
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) cancel();
  };
  const onTouchEnd = (event: TouchEvent) => {
    const from = gesture.current;
    const touch = from && Array.from(event.changedTouches).find((t) => t.identifier === from.id);
    cancel();
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
      onTouchMove={onSwipe && onTouchMove}
      onTouchEnd={onSwipe && onTouchEnd}
      onTouchCancel={onSwipe && cancel}
      // A new mouse press is a new interaction: its click is never the swipe's (Safari before 18.2
      // sends that click without a pointer type).
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') swipedUntil.current = 0;
      }}
      onClickCapture={(event) => {
        // Keyboard activation (detail 0) and the mouse are never the swipe's click.
        const pointerType = (event.nativeEvent as Partial<PointerEvent>).pointerType;
        if (performance.now() >= swipedUntil.current || event.detail === 0 || pointerType === 'mouse') return;
        swipedUntil.current = 0;
        event.preventDefault();
        event.stopPropagation();
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

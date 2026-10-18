import { useEffect, useLayoutEffect, useRef } from 'react';
import { formatDayLong, formatDayNumber, formatDayShort } from '../i18n/dates';
import { useLocale } from '../i18n/LocaleProvider';
import { addDays, type IsoDate } from '../lib/calendar';
import { AXIS_SLOP, moveStrip, releaseStep, resist, stopMotion, stripOffset, unresist, velocityOf, type Sample } from '../routes/menu/weekSwipe';

interface Props {
  dates: IsoDate[];
  selected: IsoDate;
  onSelect: (date: IsoDate) => void;
  /** The weeks either side that exist: the row follows the finger towards them, else resists. */
  adjacent?: { previous: boolean; next: boolean };
  /** A drag released towards an existing week (touch only): true if the week changed, false to go back. */
  onSwipe?: (step: -1 | 1) => boolean;
}

/** The line between two weeks side by side, as between two days. */
const DIVIDER = 1;
const COMMIT_MS = 220;
const BACK_MS = 200;

interface Gesture {
  id: number;
  x: number;
  y: number;
  /** Where the strip was when the finger came down (halfway back from an earlier drag), as a move of the finger before any resistance. */
  base: number;
  width: number;
  axis: 'x' | 'y' | null;
  samples: Sample[];
}

export function DaySelector({ dates, selected, onSelect, adjacent, onSwipe }: Props) {
  const { locale } = useLocale();
  const row = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const latest = useRef({ adjacent, onSwipe });
  latest.current = { adjacent, onSwipe };
  // Until then, the click the browser sends to the day under the finger belongs to the drag.
  const swipedUntil = useRef(0);
  // A week change is on its way: the row stays on the week alongside until its days arrive.
  const changing = useRef(false);
  const swipes = !!onSwipe;

  useEffect(() => {
    const element = row.current;
    const moving = strip.current;
    if (!swipes || !element || !moving) return;
    // The finger that started on the row; null once the gesture is over, vertical or has more fingers.
    let gesture: Gesture | null = null;
    let stopWatching = () => {};

    const exists = (step: -1 | 1) => !!(step < 0 ? latest.current.adjacent?.previous : latest.current.adjacent?.next);
    // dx < 0 drags towards the next week.
    const position = (g: Gesture, dx: number) => {
      const x = g.base + dx;
      const reach = g.width + DIVIDER;
      return exists(x < 0 ? 1 : -1) ? Math.max(-reach, Math.min(reach, x)) : resist(x, g.width);
    };
    // The finger's move that shows the strip at `offset`: on a side without a week, before the resistance.
    const moveFor = (offset: number, width: number) => (offset === 0 || exists(offset < 0 ? 1 : -1) ? offset : unresist(offset, width));
    const back = (from: number) => moveStrip(moving, from, 0, BACK_MS);
    const end = () => {
      const g = gesture;
      gesture = null;
      stopWatching();
      return g;
    };
    const abandon = () => {
      const g = end();
      if (g && (g.axis === 'x' || g.base !== 0)) back(stripOffset(moving));
    };

    const onStart = (event: TouchEvent) => {
      abandon();
      // While the row completes a week change, a touch is neither a drag nor the choice of a day:
      // its click is ignored too, whenever it comes (a new touch afterwards resets this).
      if (changing.current) {
        swipedUntil.current = Infinity;
        return;
      }
      swipedUntil.current = 0;
      const touch = event.touches.length === 1 ? event.changedTouches[0] : undefined;
      if (!touch) return;
      // A touch during the way back holds the row where it is.
      const shown = stripOffset(moving);
      stopMotion(moving);
      moving.style.transform = shown ? `translateX(${shown}px)` : '';
      const width = element.clientWidth;
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, base: moveFor(shown, width), width, axis: null, samples: [{ t: performance.now(), x: 0 }] };
      // A second finger anywhere on the screen ends the drag, also when it lands outside the row.
      document.addEventListener('touchstart', abandon, { capture: true, passive: true });
      stopWatching = () => {
        document.removeEventListener('touchstart', abandon, { capture: true });
        stopWatching = () => {};
      };
    };
    const onMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g) return;
      if (event.touches.length > 1) return abandon();
      const touch = Array.from(event.changedTouches).find((t) => t.identifier === g.id);
      if (!touch) return;
      const dx = touch.clientX - g.x;
      const dy = touch.clientY - g.y;
      if (!g.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_SLOP) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        // Vertical: the page's own scrolling, untouched.
        if (g.axis === 'y') return abandon();
      }
      // Horizontal: the page does not also bounce vertically under the finger.
      if (event.cancelable) event.preventDefault();
      g.samples.push({ t: performance.now(), x: dx });
      moving.style.transform = `translateX(${position(g, dx)}px)`;
    };
    const onEnd = (event: TouchEvent) => {
      const g = gesture;
      const touch = g && Array.from(event.changedTouches).find((t) => t.identifier === g.id);
      if (!g || !touch) return;
      end();
      const dx = touch.clientX - g.x;
      const from = position(g, g.axis === 'x' ? dx : 0);
      if (g.axis !== 'x') {
        if (from !== 0) back(from);
        return;
      }
      swipedUntil.current = performance.now() + 400;
      g.samples.push({ t: performance.now(), x: dx });
      const step = releaseStep(from, velocityOf(g.samples), g.width);
      if (!step || !exists(step)) return back(from);
      const alongside = -step * (g.width + DIVIDER);
      changing.current = true;
      moveStrip(moving, from, alongside, COMMIT_MS, () => {
        if (latest.current.onSwipe?.(step)) return;
        changing.current = false;
        back(alongside);
      });
    };

    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd, { passive: true });
    element.addEventListener('touchcancel', abandon, { passive: true });
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', abandon);
      stopWatching();
      stopMotion(moving);
    };
  }, [swipes]);

  // The new week's days are in the middle: the strip goes back to rest before they are painted.
  useLayoutEffect(() => {
    changing.current = false;
    stopMotion(strip.current);
    if (strip.current) strip.current.style.transform = '';
  }, [dates[0]]);

  const index = dates.indexOf(selected);
  // Only the dates of the weeks alongside, hidden from assistive technologies: the calendar is their way there.
  const alongside = (step: -1 | 1, shown: boolean | undefined) => (
    <div className={`day-week day-week-${step < 0 ? 'previous' : 'next'}`} aria-hidden="true">
      {shown &&
        dates.map((date, i) => {
          const day = addDays(date, step * 7);
          return (
            <span key={day} className="day-link" aria-current={i === index ? 'location' : undefined}>
              <span>{formatDayShort(locale, day)}</span>
              <strong>{formatDayNumber(locale, day)}</strong>
            </span>
          );
        })}
    </div>
  );

  return (
    <div
      ref={row}
      className="day-links"
      // A new mouse press is a new interaction: its click is never the drag's (Safari before 18.2
      // sends that click without a pointer type).
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') swipedUntil.current = 0;
      }}
      onClickCapture={(event) => {
        // Keyboard activation (detail 0) and the mouse are never the drag's click.
        const pointerType = (event.nativeEvent as Partial<PointerEvent>).pointerType;
        if (performance.now() >= swipedUntil.current || event.detail === 0 || pointerType === 'mouse') return;
        swipedUntil.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={strip} className="day-strip">
        {swipes && alongside(-1, adjacent?.previous)}
        <div className="day-week">
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
        {swipes && alongside(1, adjacent?.next)}
      </div>
    </div>
  );
}

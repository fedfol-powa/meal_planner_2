import { useEffect, useState } from 'react';
import { nextBoundary, type MealOccurrence } from './mealTime';

// setTimeout holds about 24.8 days at most; a later boundary waits for an intermediate tick.
const MAX_DELAY = 2 ** 31 - 1;

/**
 * Current time as state, moved forward when a meal of the views passes: one timer, set again
 * after each tick and cleared on unmount. Pass a stable array (useMemo on the views).
 */
export function useMealClock(upcomingLists: MealOccurrence[][]): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const next = nextBoundary(upcomingLists, now);
    if (!next) return;
    const timer = setTimeout(() => setNow(new Date()), Math.min(next.getTime() - Date.now(), MAX_DELAY));
    return () => clearTimeout(timer);
  }, [upcomingLists, now]);
  return now;
}

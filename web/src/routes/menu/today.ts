import { useEffect, useState } from 'react';
import { localNow, type IsoDate } from '../../lib/calendar';

/**
 * The family's local date, read at every render. No timer: when the app comes back to the
 * foreground (`visibilitychange`, or `pageshow` for a page restored from the cache) on another
 * day, a state holding the date changes and forces a render even if no read answers anything new.
 */
export function useFamilyToday(timeZone: string): IsoDate {
  const today = localNow(timeZone).slice(0, 10);
  const [, setSeen] = useState(today);
  useEffect(() => {
    const check = () => setSeen(localNow(timeZone).slice(0, 10));
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', check);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', check);
    };
  }, [timeZone]);
  return today;
}

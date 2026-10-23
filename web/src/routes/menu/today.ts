import { useCallback, useEffect, useState } from 'react';
import { localNow, type IsoDate } from '../../lib/calendar';

/**
 * The family's local date, read at every render. No timer: when the app comes back to the
 * foreground (`visibilitychange`, or `pageshow` for a page restored from the cache) on another
 * day, a state holding the date changes and forces a render even if no read answers anything new.
 */
export function useFamilyToday(timeZone: string): { today: IsoDate; recheck: () => void } {
  const today = localNow(timeZone).slice(0, 10);
  const [, setSeen] = useState(today);
  // Also for a navigation to the same address (the tap after midnight with no day asked).
  const recheck = useCallback(() => setSeen(localNow(timeZone).slice(0, 10)), [timeZone]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', recheck);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', recheck);
    };
  }, [recheck]);
  return { today, recheck };
}

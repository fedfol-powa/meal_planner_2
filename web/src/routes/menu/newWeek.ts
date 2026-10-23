import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useMarkWeekSeen } from '../../api/mutations';
import { familyAccessOf, familyOfKey, newWeekQuery, queryKeys, useQueryDeps, weekVisits, type NewWeek } from '../../api/queries';
import { useOnline } from '../../components/OfflineBanner';
import { mondayOf, type IsoDate } from '../../lib/calendar';

/**
 * The new week not seen yet (W24, spec 6.1), only online: the dot and the green days. Showing a day
 * of it (`selected`, however it was reached) marks it seen at once, before the server answers.
 */
export function useNewWeek(familyId: string, selected: IsoDate | null): { weekStartsOn: IsoDate | null } {
  const deps = useQueryDeps();
  const { queryClient } = deps;
  const online = useOnline();
  const notice = useQuery(newWeekQuery(deps, familyId));
  const { mutateAsync: markWeekSeen } = useMarkWeekSeen();
  const weekStartsOn = online ? (notice.data?.weekStartsOn ?? null) : null;
  const shown = selected ? mondayOf(selected) : null;

  // The menu reads that may generate the week: a fresh answer reads the notice again (lazy generation).
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success' || event.action.manual) return;
        const [area, operation] = event.query.queryKey;
        if (area !== 'menu' || (operation !== 'getOpening' && operation !== 'getWeek') || familyOfKey(event.query.queryKey) !== familyId) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.newWeek(familyId) });
      }),
    [queryClient, familyId]
  );

  // One call per arrival in the week: after an error it is repeated at the next visit, not at once.
  const attempted = useRef<string | null>(null);
  const visit = shown ? `${familyId}:${shown}` : null;
  useEffect(() => {
    if (attempted.current !== visit) attempted.current = null;
    if (!online || !shown || weekStartsOn !== shown || attempted.current === visit) return;
    const visits = weekVisits(queryClient);
    if (visits.get(familyId, shown)) return;
    attempted.current = visit;
    const generation = visits.generation(familyId);
    const current = () => visits.generation(familyId) === generation;
    const queryKey = queryKeys.newWeek(familyId);
    const seen = (): NewWeek => ({ weekStartsOn: null, producedAt: familyAccessOf(queryClient).now() });
    visits.set(familyId, shown, 'pending');
    void (async () => {
      // A read running now would put back the state before it once cancelled: cancelled first.
      await queryClient.cancelQueries({ queryKey });
      // Revoked while cancelling: nothing to send for it.
      if (!current()) return;
      queryClient.setQueryData(queryKey, seen());
      try {
        await markWeekSeen({ familyId, weekStartsOn: shown });
      } catch {
        // The dot comes back if the server says so; an answer for a family revoked meanwhile counts no more.
        if (!current()) return;
        visits.clear(familyId, shown);
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      if (!current()) return;
      visits.set(familyId, shown, 'done');
      // Over any answer delivered meanwhile; nothing to read again.
      queryClient.setQueryData(queryKey, seen());
    })();
  }, [visit, familyId, shown, weekStartsOn, online, queryClient, markWeekSeen]);

  return { weekStartsOn };
}

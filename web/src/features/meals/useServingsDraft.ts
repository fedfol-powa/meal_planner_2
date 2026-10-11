import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { runMealMutation } from '../../api/mutations';
import { useCurrentLocale, useSession } from '../../session/SessionScope';
import { noticesOf } from './sessionState';
import { useMealMutation } from './useMealMutation';

export const SAVE_DELAY_MS = 800;

interface Options {
  familyId: string;
  weekStartsOn: string;
  slotId: string;
  mealLabel: string;
  date: string;
  servings: number;
  online: boolean;
  onSaved(actionId: string, changed: boolean): void;
}

/**
 * Servings with a delayed save (round 2): the value shown and the value to save are separate;
 * the save never runs inside a state update (Strict Mode replays those), leaves at once when the
 * panel closes, still leaves when the card unmounts (without the undo offer) and never offline.
 * A refused save is never silent: `error` while mounted, a Menu notice after unmounting.
 */
export function useServingsDraft(o: Options) {
  const api = useApi();
  const session = useSession();
  const currentLocale = useCurrentLocale();
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(o);
  latest.current = o;
  const save = useMealMutation<{ servings: number }>('meals.setServings', o.familyId, o.weekStartsOn, ({ servings, id }) =>
    api.meals.setServings({ familyId: o.familyId, slotId: o.slotId, servings, id })
  );

  const flush = () => {
    clearTimeout(timer.current);
    const value = pending.current;
    pending.current = null;
    if (value === null) return;
    if (!latest.current.online || value === latest.current.servings) {
      setDraft(null);
      return;
    }
    save.mutate(
      { servings: value },
      {
        onSuccess: ({ view }) => latest.current.onSaved(view.actionId, view.changed),
        onSettled: () => setDraft(null)
      }
    );
  };

  const step = (next: number) => {
    save.reset();
    pending.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  // Offline: a pending value is dropped and the server's value comes back.
  useEffect(() => {
    if (!o.online && pending.current !== null) {
      clearTimeout(timer.current);
      pending.current = null;
      setDraft(null);
    }
  }, [o.online]);

  // Unmount (navigation): the pending value still leaves, through the session, without the undo
  // offer; if it is refused, a notice stays in the Menu until dismissed.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const value = pending.current;
      pending.current = null;
      const { familyId, weekStartsOn, slotId, servings, online, mealLabel, date } = latest.current;
      if (value === null || value === servings || !online) return;
      void runMealMutation({ queryClient: session.queryClient, session, currentLocale }, 'meals.setServings', familyId, weekStartsOn, () =>
        api.meals.setServings({ familyId, slotId, servings: value, id: crypto.randomUUID() })
      ).catch(() => {
        if (!session.isClosed()) noticesOf(session).add({ mealLabel, date });
      });
    },
    // Mount and unmount only: the latest values are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return { value: draft ?? o.servings, busy: save.isPending, error: save.error, step, flush };
}

import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useT } from '../../i18n/LocaleProvider';
import type { UndoOffer } from './UndoProvider';
import { useMealErrors } from './useMealErrors';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

export const UNDO_MS = 6000;

/** «Annulla» after each action that changed something (spec section 5, round 2 default: 6 s). */
export function UndoToast({ offer, familyId, onDone }: { offer: UndoOffer; familyId: string; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const { message, handle } = useMealErrors(familyId, offer.weekStartsOn);
  const [refusal, setRefusal] = useState<{ text: string; at: number } | null>(null);
  // The offer's week, whatever week is shown: the answer lands on the meal's week.
  const undo = useMealMutation<Record<string, never>>('meals.undo', familyId, offer.weekStartsOn, ({ id }) =>
    api.meals.undo({ familyId, actionId: offer.actionId, id })
  );
  // The offer, then the refusal, each stay 6 seconds from when they appeared, also across remounts.
  const since = refusal?.at ?? offer.at;
  useEffect(() => {
    if (undo.isPending) return;
    const timer = setTimeout(onDone, Math.max(0, since + UNDO_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [since, undo.isPending, onDone]);
  return (
    <div className={styles.toastRegion} role="status" aria-live="polite">
      <div className={styles.toast}>
        {refusal ? (
          <span>{refusal.text}</span>
        ) : (
          <>
            <span>{t('meals.changed')}</span>
            <button type="button" disabled={undo.isPending} onClick={() => undo.mutate({}, { onSuccess: onDone, onError: (error) => {
                handle(error);
                setRefusal({ text: message(error), at: Date.now() });
              } })}>
              {t('meals.undo')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

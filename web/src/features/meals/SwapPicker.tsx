import { useApi } from '../../api/ApiProvider';
import type { MealView, WeekView } from '../../api/types';
import { formatDayLong } from '../../i18n/dates';
import { useLocale, useT } from '../../i18n/LocaleProvider';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

/** Every other meal of the week (spec section 5): dish or free text and note move, servings stay. */
export function SwapPicker({ familyId, weekStartsOn, meal, week, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; onDone: () => void }) {
  const t = useT();
  const { locale } = useLocale();
  const api = useApi();
  const undo = useUndo();
  const message = useMealErrors(familyId, weekStartsOn);
  const swap = useMealMutation<{ otherSlotId: string }>('meals.swap', familyId, weekStartsOn, ({ otherSlotId, id }) =>
    api.meals.swap({ familyId, slotId: meal.slotId, otherSlotId, id })
  );
  const others = week.days.flatMap((d) => d.meals).filter((m) => m.slotId !== meal.slotId);
  const pick = (otherSlotId: string) =>
    swap.mutate(
      { otherSlotId },
      {
        onSuccess: ({ view }) => {
          if (view.changed) undo.offer(view.actionId, weekStartsOn);
          onDone();
        }
      }
    );
  return (
    <>
      {swap.isError && <p className="meta-line" role="alert">{message(swap.error)}</p>}
      <ul className={styles.swapList}>
        {others.map((other) => (
          <li key={other.slotId}>
            <button type="button" disabled={swap.isPending} onClick={() => pick(other.slotId)}>
              <span className={styles.when}>{formatDayLong(locale, other.date)} · {t(`meal.${other.mealType}`)}</span>
              <span className={other.kind === 'recipe' ? styles.name : `${styles.name} ${styles.free}`}>
                {other.recipe?.name ?? other.freeText ?? t('meal.empty.title')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

import { useState, type ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import { Icon } from '../../components/Icon';
import type { CardActions } from '../../components/RecipeCard';
import { ServingsStepper } from '../../components/ServingsStepper';
import { useT } from '../../i18n/LocaleProvider';
import { MealEditor, type EditorStage } from './MealEditor';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useServingsDraft } from './useServingsDraft';
import styles from './meals.module.css';

const MAX_SERVINGS = 20;

/** Pencil, panel under the card (round 2: servings, change recipe, note) and the editor sheet. */
export function useMealActions({ familyId, weekStartsOn, meal, week, online }: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; online: boolean }): { actions: CardActions; sheet: ReactNode } {
  const t = useT();
  const undo = useUndo();
  const { message, handle } = useMealErrors(familyId, weekStartsOn);
  const [stage, setStage] = useState<EditorStage | null>(null);
  const servings = useServingsDraft({
    familyId, weekStartsOn, slotId: meal.slotId, servings: meal.servings, online,
    mealLabel: meal.recipe?.name ?? meal.freeText ?? t(`meal.${meal.mealType}`), date: meal.date,
    onSaved: (actionId, changed) => {
      if (changed) undo.offer(actionId, weekStartsOn);
    },
    onRefused: (error) => handle(error)
  });
  const panel = (
    <ul className={styles.actions}>
      {/* Every kind of meal (spec section 5): the servings stay with the slot, also free or empty. */}
      <li className={styles.stepperRow}>
        {/* ServingsStepper has no disabled prop: the fieldset disables its buttons. */}
        <fieldset disabled={servings.busy || !online} className={styles.plain}>
          <ServingsStepper value={servings.value} min={1} max={MAX_SERVINGS} onChange={servings.step} />
        </fieldset>
        {servings.busy && <p className="meta-line" role="status">{t('meals.sending')}</p>}
        {servings.error != null && <p className="meta-line" role="alert">{message(servings.error)}</p>}
      </li>
      <li>
        <button type="button" aria-haspopup="dialog" disabled={!online} onClick={() => setStage('picker')}>
          <Icon name="search" />{meal.kind === 'empty' ? t('meals.chooseRecipe') : t('meals.changeRecipe')}
        </button>
      </li>
      <li>
        <button type="button" aria-haspopup="dialog" disabled={!online} onClick={() => setStage('note')}>
          <Icon name="note" />{t('meals.note')}
        </button>
      </li>
    </ul>
  );
  return {
    actions: {
      label: t('meals.edit'),
      disabled: !online,
      panel,
      onToggle: (open) => {
        if (!open) servings.flush();
      },
      onChooseRecipe: meal.kind === 'empty' ? () => setStage('picker') : undefined
    },
    sheet: stage && <MealEditor familyId={familyId} weekStartsOn={weekStartsOn} meal={meal} week={week} stage={stage} onStage={setStage} onClose={() => setStage(null)} />
  };
}

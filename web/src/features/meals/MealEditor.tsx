import type { ReactNode } from 'react';
import type { MealView, WeekView } from '../../api/types';
import { BottomSheet } from '../../components/BottomSheet';
import { useT } from '../../i18n/LocaleProvider';

export type EditorStage = 'picker' | 'swap' | 'free' | 'note';

/** The sheet of round 2: change recipe, swap, free meal and note. */
export function MealEditor(props: { familyId: string; weekStartsOn: string; meal: MealView; week: WeekView; stage: EditorStage; onStage: (s: EditorStage) => void; onClose: () => void }) {
  const t = useT();
  const titles: Record<EditorStage, string> = { picker: t('meals.changeRecipe'), swap: t('meals.swapTitle'), free: t('meals.freeTitle'), note: t('meals.note') };
  const content: Record<EditorStage, ReactNode> = { picker: null, swap: null, free: null, note: null };
  return <BottomSheet open title={titles[props.stage]} onClose={props.onClose}>{content[props.stage]}</BottomSheet>;
}

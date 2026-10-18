import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useQueryDeps } from '../../api/queries';
import type { MealView } from '../../api/types';
import { useOnline } from '../../components/OfflineBanner';
import { LoadingArea } from '../../components/Skeleton';
import { useT } from '../../i18n/LocaleProvider';
import { suggestionsQuery } from './queries';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

const MAX_FREE_TEXT = 60;

/** Free meal: quick picks (texts the family uses most) fill the field; the text is kept as written. */
export function FreeMealForm({ familyId, weekStartsOn, meal, onBack, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onBack: () => void; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const { message, handle } = useMealErrors(familyId, weekStartsOn);
  const online = useOnline();
  const [text, setText] = useState(meal.freeText ?? '');
  const picksQuery = useQuery(suggestionsQuery(useQueryDeps(), familyId, meal.slotId, 0));
  const picks = picksQuery.data?.freeTexts ?? [];
  const save = useMealMutation<{ text: string }>('meals.setFree', familyId, weekStartsOn, ({ text, id }) => api.meals.setFree({ familyId, slotId: meal.slotId, text, id }));
  const send = () =>
    save.mutate(
      { text: text.trim() },
      {
        onSuccess: ({ view }) => {
          if (view.changed) undo.offer(view.actionId, weekStartsOn);
          onDone();
        },
        onError: (error) => handle(error, onDone)
      }
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className={styles.field}>
        {t('meals.freeLabel')}
        <input type="text" placeholder={t('meals.freePlaceholder')} maxLength={MAX_FREE_TEXT} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {/* One row of chip blocks while the picks load (W20); no picks, no row. */}
      <LoadingArea loading={picksQuery.isPending} paused={picksQuery.fetchStatus === 'paused'} skeleton={<ChipsSkeleton />}>
        {picks.length > 0 && (
          <div className={styles.chips}>
            {picks.map((p) => (
              <button key={p} type="button" className={styles.chip} aria-pressed={text === p} onClick={() => setText(p)}>{p}</button>
            ))}
          </div>
        )}
      </LoadingArea>
      {save.isError && <p className="meta-line" role="alert">{message(save.error)}</p>}
      <div className={styles.buttons}>
        <button type="button" className="text-button" onClick={onBack}>{t('common.back')}</button>
        <button type="submit" className="text-button primary" disabled={!text.trim() || save.isPending || !online}>{t('meals.save')}</button>
      </div>
    </form>
  );
}

function ChipsSkeleton() {
  return (
    <div className={styles.chips}>
      {['30%', '24%', '36%'].map((width) => <span key={width} className="skeleton-block" style={{ width, height: 44 }} />)}
    </div>
  );
}

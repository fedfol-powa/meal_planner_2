import { useState } from 'react';
import { useApi } from '../../api/ApiProvider';
import type { MealView } from '../../api/types';
import { useT } from '../../i18n/LocaleProvider';
import { useMealErrors } from './useMealErrors';
import { useUndo } from './UndoProvider';
import { useMealMutation } from './useMealMutation';
import styles from './meals.module.css';

const MAX_NOTE = 200;

/** Note of the meal, seen by the whole family, kept as written (up to 200 characters). */
export function NoteForm({ familyId, weekStartsOn, meal, onDone }: { familyId: string; weekStartsOn: string; meal: MealView; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useUndo();
  const { message, handle } = useMealErrors(familyId, weekStartsOn);
  const [note, setNote] = useState(meal.note ?? '');
  const save = useMealMutation<{ note: string | null }>('meals.setNote', familyId, weekStartsOn, ({ note, id }) => api.meals.setNote({ familyId, slotId: meal.slotId, note, id }));
  const send = (value: string | null) =>
    save.mutate(
      { note: value },
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
        send(note.trim() || null);
      }}
    >
      <label className={styles.field}>
        {t('meals.noteLabel')}
        <textarea maxLength={MAX_NOTE} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="meta-line" aria-live="polite">{t('meals.noteCount', { count: note.length })}</p>
      {save.isError && <p className="meta-line" role="alert">{message(save.error)}</p>}
      <div className={styles.buttons}>
        {meal.note && <button type="button" className="text-button" disabled={save.isPending} onClick={() => send(null)}>{t('meals.removeNote')}</button>}
        <button type="submit" className="text-button primary" disabled={save.isPending}>{t('meals.save')}</button>
      </div>
    </form>
  );
}

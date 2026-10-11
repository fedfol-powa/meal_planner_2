import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiProvider';
import { useT } from '../../i18n/LocaleProvider';
import { useMealMutation } from './useMealMutation';

export interface UndoOffer { actionId: string; weekStartsOn: string; key: number }
interface UndoState { current: UndoOffer | null; offer(actionId: string, weekStartsOn: string): void; clear(): void }
const UndoContext = createContext<UndoState | null>(null);

/** Provisional undo (replaced by UndoToast in Task 14): a status line with «Annulla». */
function ProvisionalUndo({ offer, familyId, onDone }: { offer: UndoOffer; familyId: string; onDone: () => void }) {
  const t = useT();
  const api = useApi();
  const undo = useMealMutation<Record<string, never>>('meals.undo', familyId, offer.weekStartsOn, ({ id }) => api.meals.undo({ familyId, actionId: offer.actionId, id }));
  return (
    <div role="status">
      {t('meals.changed')} <button type="button" onClick={() => undo.mutate({}, { onSuccess: onDone })}>{t('meals.undo')}</button>
    </div>
  );
}

let offers = 0;

/** The last action the user can undo (one at a time: a new one replaces it). */
export function UndoProvider({ familyId, children }: { familyId: string; children: ReactNode }) {
  const [current, setCurrent] = useState<UndoOffer | null>(null);
  const offer = useCallback((actionId: string, weekStartsOn: string) => setCurrent({ actionId, weekStartsOn, key: ++offers }), []);
  const clear = useCallback(() => setCurrent(null), []);
  const value = useMemo(() => ({ current, offer, clear }), [current, offer, clear]);
  return (
    <UndoContext.Provider value={value}>
      {children}
      {current && <ProvisionalUndo key={current.key} offer={current} familyId={familyId} onDone={clear} />}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoState {
  const value = useContext(UndoContext);
  if (!value) throw new Error('useUndo outside UndoProvider');
  return value;
}

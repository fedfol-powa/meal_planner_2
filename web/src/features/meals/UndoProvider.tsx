import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useBusyCheck } from '../../pwa/busy';
import { useSession } from '../../session/SessionScope';
import { nextOfferKey, undoOf, type UndoOffer } from './sessionState';
import { UndoToast } from './UndoToast';

export type { UndoOffer } from './sessionState';
interface UndoState { current: UndoOffer | null; offer(actionId: string, weekStartsOn: string): void; clear(): void }
const UndoContext = createContext<UndoState | null>(null);

/** The last action the user can undo (one at a time: a new one replaces it), kept by the session. */
export function UndoProvider({ familyId, children }: { familyId: string; children: ReactNode }) {
  const slot = undoOf(useSession());
  // An offered «Annulla» keeps the page from reloading into a new version (spec W8).
  useBusyCheck(() => slot.get() !== null);
  const stored = useSyncExternalStore(slot.subscribe, slot.get, slot.get);
  const current = stored?.familyId === familyId ? stored : null;
  const offer = useCallback(
    (actionId: string, weekStartsOn: string) => slot.set({ familyId, actionId, weekStartsOn, key: nextOfferKey(), at: Date.now() }),
    [slot, familyId]
  );
  const clear = useCallback(() => slot.set(null), [slot]);
  const value = useMemo(() => ({ current, offer, clear }), [current, offer, clear]);
  return (
    <UndoContext.Provider value={value}>
      {children}
      {current && <UndoToast key={current.key} offer={current} familyId={familyId} onDone={clear} />}
    </UndoContext.Provider>
  );
}

export function useUndo(): UndoState {
  const value = useContext(UndoContext);
  if (!value) throw new Error('useUndo outside UndoProvider');
  return value;
}

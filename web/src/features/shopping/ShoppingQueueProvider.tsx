import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiProvider';
import type { Api } from '../../api/types';
import { useSession } from '../../session/SessionScope';
import { applyConfirmedList } from './listQuery';
import type { LockManagerLike } from './queue/locks';
import type { ShoppingOperation } from './queue/ops';
import { createShoppingQueue, type SendResult, type ShoppingQueue } from './queue/queue';

const QueueContext = createContext<ShoppingQueue | null>(null);

/** Sends one queued operation with the client of the language shown now. */
export function sendWith(api: Api, op: ShoppingOperation): Promise<SendResult> {
  switch (op.kind) {
    case 'setItemChecked':
      return api.shopping.setItemChecked(op.input);
    case 'setAddedBack':
      return api.shopping.setAddedBack(op.input);
    case 'addFreeItem':
      return api.shopping.addFreeItem(op.input);
    case 'setFreeItemChecked':
      return api.shopping.setFreeItemChecked(op.input);
    case 'removeFreeItem':
      return api.shopping.removeFreeItem(op.input);
  }
}

/**
 * One queue per session, mounted with the app: what is left in it is sent at the start, also
 * when the shopping list is not open (spec, «Quando si invia»).
 */
export function ShoppingQueueProvider({ children, locks }: { children: ReactNode; locks?: LockManagerLike | null }) {
  const session = useSession();
  const api = useApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [queue, setQueue] = useState<ShoppingQueue | null>(null);
  useEffect(() => {
    if (!session.userId) return;
    const created = createShoppingQueue({
      session,
      locks,
      send: (op) => sendWith(apiRef.current, op),
      applyConfirmed: (familyId, weekStartsOn, result, isCurrent) => applyConfirmedList(session.queryClient, familyId, weekStartsOn, result, isCurrent)
    });
    let live = true;
    // Shown only once the record on the device is read: before that an empty queue would look like
    // a synced list, and exports would leave without the changes saved here (PR #22 review, finding 3).
    void created.ready().then(() => live && setQueue(created));
    return () => {
      live = false;
      created.dispose();
      setQueue((current) => (current === created ? null : current));
    };
  }, [session, locks]);
  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}

/** null until the queue on the device has been read, or without a signed-in person. */
export function useShoppingQueue(): ShoppingQueue | null {
  return useContext(QueueContext);
}

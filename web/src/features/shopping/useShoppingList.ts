import type { ShoppingListView } from '@app/contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryDeps } from '../../api/queries';
import { shoppingListQuery } from './listQuery';
import type { QueuedOp, QueueNotice, QueueRecord, ShoppingOperation } from './queue/ops';
import { applyPending, type PendingView } from './queue/pending';
import { noticesOfList, opsOfList, type ShoppingQueue } from './queue/queue';
import { useShoppingQueue } from './ShoppingQueueProvider';

const EMPTY: QueueRecord = { ops: [], notices: [], seq: 0 };
const noQueue = { subscribe: () => () => {}, record: () => EMPTY };

export interface ShoppingListState {
  /** The list as shown: confirmed view with the queued changes on top; null until both are known. */
  view: PendingView | null;
  query: UseQueryResult<ShoppingListView>;
  pendingCount: number;
  notices: QueueNotice[];
  ops: QueuedOp[];
  act(op: ShoppingOperation, label: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  flush(): Promise<void>;
}

export function useShoppingList(familyId: string, weekStartsOn: string): ShoppingListState {
  const deps = useQueryDeps();
  const query = useQuery({ ...shoppingListQuery(deps, familyId, weekStartsOn), retry: false });
  const queue: ShoppingQueue | null = useShoppingQueue();
  const source = queue ?? noQueue;
  const record = useSyncExternalStore(source.subscribe, source.record, source.record);
  const ops = useMemo(() => opsOfList(record, familyId, weekStartsOn), [record, familyId, weekStartsOn]);
  const notices = useMemo(() => noticesOfList(record, familyId, weekStartsOn), [record, familyId, weekStartsOn]);
  // No list without the local layer: until the queue is read, its changes are unknown (PR #22 review, finding 3).
  const view = useMemo(() => (query.data && queue ? applyPending(query.data, familyId, ops) : null), [query.data, queue, familyId, ops]);
  const act = useCallback(async (op: ShoppingOperation, label: string) => {
    if (!queue) return;
    await queue.add(op, label);
  }, [queue]);
  const dismiss = useCallback(async (id: string) => queue?.dismiss(id), [queue]);
  const flush = useCallback(async () => queue?.flush(), [queue]);
  return { view, query, pendingCount: ops.length, notices, ops, act, dismiss, flush };
}

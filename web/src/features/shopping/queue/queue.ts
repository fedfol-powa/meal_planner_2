import type { ShoppingListView } from '@app/contract';
import { SessionClosedError, toApiError } from '../../../api/errors';
import { isOnline } from '../../../lib/connectivity';
import { subscribeExtension } from '../../../session/channel';
import type { Session } from '../../../session/session';
import { queueKey } from '../storage';
import { browserLocks, withLock, type LockManagerLike } from './locks';
import { dropWithDependents, emptyRecord, enqueue, type QueuedOp, type QueueNotice, type QueueRecord, type ShoppingOperation } from './ops';

export { QUEUE_PREFIX, queueKey } from '../storage';

export const QUEUE_TOPIC = 'shopping-queue';
export type SendResult = { version: string; data: ShoppingListView };

/** What a tab tells the other tabs of the same person after every change of the record. */
export type QueueMessage =
  | { type: 'reread' }
  | { type: 'confirmed'; familyId: string; weekStartsOn: string; seq: number; result: SendResult };

export interface ShoppingQueue {
  record(): QueueRecord;
  /** Resolves once the record on the device has been read. */
  ready(): Promise<void>;
  add(op: ShoppingOperation, label: string): Promise<void>;
  /** One sending round under the lock; resolves when empty or stopped. */
  flush(): Promise<void>;
  dismiss(noticeId: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface ShoppingQueueDeps {
  session: Session;
  send: (op: ShoppingOperation) => Promise<SendResult>;
  /** Applies a confirmed view to this tab's cache: cancels the list's running reads first. */
  applyConfirmed: (familyId: string, weekStartsOn: string, result: SendResult) => Promise<void>;
  /** navigator.locks by default; null = declared limitation, no exclusion. */
  locks?: LockManagerLike | null;
  now?: () => number;
}

function asRecord(value: unknown): QueueRecord {
  if (typeof value !== 'object' || value === null) return emptyRecord();
  const record = value as Partial<QueueRecord>;
  return Array.isArray(record.ops) && Array.isArray(record.notices) && typeof record.seq === 'number'
    ? { ops: record.ops, notices: record.notices, seq: record.seq }
    : emptyRecord();
}

const isMessage = (payload: unknown): payload is QueueMessage =>
  typeof payload === 'object' && payload !== null && ((payload as QueueMessage).type === 'reread' || (payload as QueueMessage).type === 'confirmed');

type Stop = 'continue' | 'stop';

/**
 * Every change of the shopping list goes through this queue, online too (spec, «Coda offline»).
 * One record per person on the device; sending happens in one tab at a time, after a renewal
 * of the same person, and every answer becomes the confirmed view of the list.
 */
export function createShoppingQueue(deps: ShoppingQueueDeps): ShoppingQueue {
  const { session } = deps;
  const userId = session.userId;
  const now = deps.now ?? Date.now;
  const locks = deps.locks === undefined ? browserLocks() : deps.locks;
  const key = userId ? queueKey(userId) : '';
  const listeners = new Set<() => void>();
  const cleanups: (() => void)[] = [];
  // Confirmed views already applied per list; seq below the one read at start are old news.
  const applied = new Map<string, number>();
  let baseline = 0;
  let current = emptyRecord();
  let disposed = false;
  let running: Promise<void> | null = null;
  let again = false;

  const notify = () => listeners.forEach((listener) => listener());
  const post = (payload: QueueMessage) => {
    if (userId) session.channel?.post({ type: 'extension', userId, topic: QUEUE_TOPIC, payload });
  };
  const gone = () => disposed || session.isClosed();

  async function reread(): Promise<void> {
    if (!userId) return;
    try {
      current = asRecord(await session.store.get(key));
    } catch {
      // The device store failed: the screen keeps what it knew.
    }
    notify();
  }

  /**
   * Reads and writes the record as one step of the store; `next` undefined leaves it as it is.
   * `quiet`: the caller publishes the change itself, later.
   */
  async function mutate<T>(change: (record: QueueRecord) => { next?: QueueRecord; value: T }, { quiet = false } = {}): Promise<T> {
    let value!: T;
    let next: QueueRecord | undefined;
    await session.store.transact([key], (entries) => {
      // A closed session writes nothing: its queue is already deleted.
      if (session.isClosed()) return [];
      ({ next, value } = change(asRecord(entries.get(key))));
      return next ? [[key, next]] : [];
    });
    if (next && !quiet) {
      current = next;
      notify();
      post({ type: 'reread' });
    }
    return value;
  }

  async function applyView(familyId: string, weekStartsOn: string, seq: number, result: SendResult): Promise<void> {
    const list = `${familyId}/${weekStartsOn}`;
    if (seq <= Math.max(baseline, applied.get(list) ?? 0) || gone()) return;
    applied.set(list, seq);
    await deps.applyConfirmed(familyId, weekStartsOn, result);
  }

  const loading = (async () => {
    await reread();
    baseline = current.seq;
  })();

  /** Takes the head as it is now, marks it sent and returns a copy: that copy is what leaves. */
  const takeHead = () =>
    mutate((record) => {
      const head = record.ops[0];
      if (!head) return { value: null };
      const sent: QueuedOp = { ...head, state: 'sent' };
      return { next: head.state === 'sent' ? undefined : { ...record, ops: [sent, ...record.ops.slice(1)] }, value: structuredClone(sent) };
    });

  async function confirm(head: QueuedOp, result: SendResult): Promise<void> {
    const seq = await mutate(
      (record) => {
        // Already confirmed by another tab, or dropped meanwhile: nothing to take away.
        if (record.ops[0]?.op.input.id !== head.op.input.id) return { value: null };
        const next = { ...record, ops: record.ops.slice(1), seq: record.seq + 1 };
        return { next, value: next.seq };
      },
      { quiet: true }
    );
    if (seq === null) return;
    const { familyId, weekStartsOn } = head.op.input;
    post({ type: 'confirmed', familyId, weekStartsOn, seq, result });
    // The base first, then the shorter queue: the change is always shown, in one or the other.
    await applyView(familyId, weekStartsOn, seq, result);
    await reread();
  }

  async function refuse(head: QueuedOp, error: unknown): Promise<Stop> {
    if (error instanceof SessionClosedError || gone()) return 'stop';
    const { code } = toApiError(error);
    const { familyId, weekStartsOn } = head.op.input;
    if (code === 'forbidden') {
      await mutate((record) => ({ next: { ...record, ops: record.ops.filter((o) => o.op.input.familyId !== familyId) }, value: null }));
      // As a read refused for the family: it leaves the device and the profile is read again.
      session.revoke(familyId);
      void session.queryClient.invalidateQueries({ queryKey: ['me'] });
      return 'continue';
    }
    if (code === 'invalid' || code === 'not_found' || code === 'conflict') {
      const notice: QueueNotice = { id: crypto.randomUUID(), familyId, weekStartsOn, kind: head.op.kind, code: code === 'not_found' ? 'not_found' : 'invalid', label: head.label };
      await mutate((record) => ({ next: { ...record, ops: dropWithDependents(record.ops, head), notices: [...record.notices, notice] }, value: null }));
      return 'continue';
    }
    // network, internal, unauthorized (handled by the session), unknown: the head stays sent, next event retries.
    return 'stop';
  }

  /** One round under the lock: `done` when the queue emptied, `stopped` otherwise (network, renewal, closing). */
  async function round(): Promise<'done' | 'stopped'> {
    if (!userId || gone()) return 'stopped';
    const renewal = await session.renew();
    if (gone()) return 'stopped';
    if (renewal.kind === 'ok' && renewal.userId !== userId) {
      // Another person holds the device now: this queue never leaves with their token.
      await session.store.delete(key).catch(() => undefined);
      return 'stopped';
    }
    // rejected: the session closes and its hook deletes the queue; network: next time.
    if (renewal.kind !== 'ok') return 'stopped';
    for (;;) {
      if (gone()) return 'stopped';
      const head = await takeHead();
      if (!head) return 'done';
      let result: SendResult;
      try {
        result = await session.call(() => deps.send(head.op), head.op.input.familyId);
      } catch (error) {
        if ((await refuse(head, error)) === 'stop') return 'stopped';
        continue;
      }
      if (gone()) return 'stopped';
      await confirm(head, result);
    }
  }

  /** `fresh`: something was just queued, so a round about to end goes round once more. */
  function flush(fresh = false): Promise<void> {
    if (!userId || gone()) return Promise.resolve();
    if (running) {
      if (fresh) again = true;
      return running;
    }
    running = (async () => {
      await loading;
      let outcome: 'done' | 'stopped' = 'stopped';
      do {
        again = false;
        try {
          outcome = await withLock(locks, key, round);
        } catch {
          // The store or the lock failed: the next event tries again.
          outcome = 'stopped';
        }
        // Queued while the round was ending: one more round, unless the round stopped (no network…).
      } while (again && outcome === 'done' && !gone());
      running = null;
    })();
    return running;
  }

  if (userId) {
    // Kept after dispose: the screen may go before the session closes, the queue must go with it.
    session.onClose(() => session.store.delete(key).catch(() => undefined));
    cleanups.push(
      session.onRevoke(async (familyId) => {
        await mutate((record) => ({
          next: { ...record, ops: record.ops.filter((o) => o.op.input.familyId !== familyId), notices: record.notices.filter((n) => n.familyId !== familyId) },
          value: null
        })).catch(() => undefined);
      })
    );
    if (session.channel) {
      cleanups.push(
        subscribeExtension(session.channel, QUEUE_TOPIC, (from, payload) => {
          if (from !== userId || gone() || !isMessage(payload)) return;
          void (async () => {
            await loading;
            if (payload.type === 'confirmed') await applyView(payload.familyId, payload.weekStartsOn, payload.seq, payload.result);
            await reread();
          })();
        })
      );
    }
    if (typeof window !== 'undefined') {
      const onOnline = () => void flush();
      const onVisible = () => {
        if (document.visibilityState === 'visible') void flush();
      };
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      cleanups.push(() => window.removeEventListener('online', onOnline));
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
    }
    if (isOnline()) void flush();
  }

  return {
    record: () => current,
    ready: () => loading,
    async add(op, label) {
      if (!userId || gone()) throw new SessionClosedError();
      await loading;
      await mutate((record) => ({ next: { ...record, ops: enqueue(record.ops, { userId, queuedAt: now(), state: 'pending', label, op }) }, value: null }));
      if (isOnline()) void flush(true);
    },
    flush: () => flush(),
    async dismiss(noticeId) {
      await mutate((record) =>
        record.notices.some((n) => n.id === noticeId) ? { next: { ...record, notices: record.notices.filter((n) => n.id !== noticeId) }, value: null } : { value: null }
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      listeners.clear();
    }
  };
}

/** The operations of one list still in the queue. */
export const opsOfList = (record: QueueRecord, familyId: string, weekStartsOn: string) =>
  record.ops.filter((o) => o.op.input.familyId === familyId && o.op.input.weekStartsOn === weekStartsOn);

/** The notices of one list not closed yet. */
export const noticesOfList = (record: QueueRecord, familyId: string, weekStartsOn: string) =>
  record.notices.filter((n) => n.familyId === familyId && n.weekStartsOn === weekStartsOn);

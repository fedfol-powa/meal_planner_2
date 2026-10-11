import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/errors';
import { createMemoryStore } from '../../../api/persister';
import { createSession, SessionClosedError, type RenewResult } from '../../../session/session';
import { createLockHub } from '../../../test/fakeLocks';
import { createMemoryHub } from '../../../test/memoryChannel';
import { setOnline } from '../../../test/connectivity';
import { FAMILY, grams, listView, MONDAY, ops, OTHER_FAMILY, OTHER_USER, queued, RICE, TOMATO, USER } from '../fixtures';
import type { ShoppingOperation } from './ops';
import { applyPending } from './pending';
import { createShoppingQueue, queueKey, type QueueMessage, type SendResult } from './queue';

const X = 'f0000000-0000-4000-8000-0000000000aa';
type Store = ReturnType<typeof createMemoryStore>;
type Handler = (op: ShoppingOperation, apply: () => SendResult) => Promise<SendResult>;

/** The server: applies absolute operations to the list; each request can be answered by a handler. */
function createServer() {
  const applied: ShoppingOperation[] = [];
  const handlers: Handler[] = [];
  const view = (): SendResult => ({ version: `v${applied.length}`, data: applyPending(listView(), FAMILY, applied.map((op) => queued(op))).view });
  const send = vi.fn(async (op: ShoppingOperation) => {
    // Like the browser: nothing leaves the device offline.
    if (!navigator.onLine) throw new ApiError('network');
    const handler = handlers.shift();
    const commit = () => {
      applied.push(op);
      return view();
    };
    return handler ? handler(op, commit) : commit();
  });
  return {
    applied,
    send,
    view,
    /** The next request is answered by `handler`. */
    next(handler: Handler) {
      handlers.push(handler);
    },
    failNext(error: ApiError) {
      handlers.push(async () => {
        throw error;
      });
    },
    /** The next request waits; returns how to answer it. */
    holdNext() {
      let release: (outcome: 'ok' | ApiError) => void = () => {};
      handlers.push(
        (_op, commit) =>
          new Promise<SendResult>((resolve, reject) => {
            release = (outcome) => (outcome === 'ok' ? resolve(commit()) : reject(outcome));
          })
      );
      return (outcome: 'ok' | ApiError) => release(outcome);
    }
  };
}

const OK: RenewResult = { kind: 'ok', userId: USER };

async function setup(options: { store?: Store; server?: ReturnType<typeof createServer>; refresh?: () => Promise<RenewResult>; locks?: ReturnType<ReturnType<typeof createLockHub>['tab']>['locks'] | null; channel?: ReturnType<ReturnType<typeof createMemoryHub>['channel']> } = {}) {
  const store = options.store ?? createMemoryStore();
  const server = options.server ?? createServer();
  const session = createSession(USER, store, { refresh: options.refresh ?? (async () => OK), end: (s) => s.close(), channel: options.channel });
  const applyConfirmed = vi.fn(async (_familyId: string, _weekStartsOn: string, _result: SendResult) => {});
  const queue = createShoppingQueue({ session, send: server.send, applyConfirmed, locks: options.locks === undefined ? createLockHub().tab().locks : options.locks });
  // The round started at creation ends before the test acts.
  if (navigator.onLine) await queue.flush();
  return { store, server, session, queue, applyConfirmed };
}

const stored = (store: Store) => store.entries.get(queueKey(USER)) as { ops: { state: string; op: ShoppingOperation }[]; notices: { label: string; code: string }[]; seq: number } | undefined;

describe('shopping queue', () => {
  it('writes the head as sent before the request leaves', async () => {
    const { store, server, queue } = await setup();
    let seen: string | undefined;
    server.next(async (_op, commit) => {
      seen = stored(store)?.ops[0]?.state;
      return commit();
    });
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.flush();
    expect(seen).toBe('sent');
    expect(stored(store)?.ops).toEqual([]);
  });

  it('never sends an addition compacted away by another tab before the head was taken (second review, finding 1)', async () => {
    const store = createMemoryStore();
    const server = createServer();
    setOnline(false);
    let renew: (result: RenewResult) => void = () => {};
    const first = await setup({ store, server, refresh: () => new Promise((resolve) => (renew = resolve)) });
    const second = await setup({ store, server });
    await first.queue.add(ops.add(X, 'Pane'), 'Pane');
    await second.queue.ready();
    setOnline(true);
    const round = first.queue.flush();
    await vi.waitFor(() => expect(first.queue.record().ops).toHaveLength(1));
    await second.queue.add(ops.remove(X), 'Pane');
    renew(OK);
    await round;
    await second.queue.flush();
    expect(server.send).not.toHaveBeenCalled();
    expect(server.view().data.freeItems.map((f) => f.id)).not.toContain(X);
  });

  it('sends in order, one at a time', async () => {
    const { server, queue } = await setup();
    setOnline(false);
    const sent = [ops.tick(TOMATO), ops.tick(RICE, grams(300)), ops.add(X, 'Pane')];
    for (const op of sent) await queue.add(op, 'x');
    setOnline(true);
    let inFlight = 0;
    let most = 0;
    server.send.mockImplementation(async (op) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      server.applied.push(op);
      return server.view();
    });
    await queue.flush();
    expect(server.applied).toEqual(sent);
    expect(most).toBe(1);
  });

  it('makes every answer the confirmed base, with the rest of the queue on top (review, finding 2)', async () => {
    const { server, queue, applyConfirmed } = await setup();
    setOnline(false);
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.add(ops.tick(RICE, grams(300)), 'Riso');
    setOnline(true);
    server.next((_op, commit) => Promise.resolve(commit()));
    server.failNext(new ApiError('network'));
    await queue.flush();
    expect(applyConfirmed).toHaveBeenCalledTimes(1);
    const [familyId, weekStartsOn, result] = applyConfirmed.mock.calls[0]!;
    expect([familyId, weekStartsOn]).toEqual([FAMILY, MONDAY]);
    expect(queue.record().ops.map((o) => o.state)).toEqual(['sent']);
    const shown = applyPending(result.data, FAMILY, queue.record().ops).view;
    const checked = shown.departments.flatMap((d) => d.items).filter((i) => i.checked).map((i) => i.ingredientId);
    expect(checked.sort()).toEqual([RICE, TOMATO].sort());
  });

  it('never applies a confirmation older than the last one applied', async () => {
    const hub = createMemoryHub();
    const other = hub.channel();
    const { queue, applyConfirmed } = await setup({ channel: hub.channel() });
    await queue.ready();
    const message = (seq: number): QueueMessage => ({ type: 'confirmed', familyId: FAMILY, weekStartsOn: MONDAY, seq, result: { version: `v${seq}`, data: listView() } });
    other.post({ type: 'extension', userId: USER, topic: 'shopping-queue', payload: message(3) });
    other.post({ type: 'extension', userId: USER, topic: 'shopping-queue', payload: message(2) });
    other.post({ type: 'extension', userId: OTHER_USER, topic: 'shopping-queue', payload: message(4) });
    await vi.waitFor(() => expect(applyConfirmed).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(applyConfirmed.mock.calls.map((c) => c[2].version)).toEqual(['v3']);
  });

  it('repeats a sent head after the answer was lost, without duplicates', async () => {
    const store = createMemoryStore();
    const server = createServer();
    const first = await setup({ store, server });
    server.next(async (_op, commit) => {
      commit();
      throw new ApiError('network');
    });
    await first.queue.add(ops.add(X, 'Pane'), 'Pane');
    await first.queue.flush();
    expect(stored(store)?.ops.map((o) => o.state)).toEqual(['sent']);
    first.queue.dispose();

    setOnline(false);
    const reopened = await setup({ store, server });
    await reopened.queue.ready();
    expect(reopened.queue.record().ops[0]?.state).toBe('sent');
    setOnline(true);
    await reopened.queue.flush();
    expect(server.send.mock.calls.map(([op]) => op.input.id)).toEqual([X, X]);
    expect(server.view().data.freeItems.filter((f) => f.id === X)).toHaveLength(1);
    expect(stored(store)?.ops).toEqual([]);
  });

  it('queues a change made while the head is in flight after it, and sends it in the same round', async () => {
    const { server, queue } = await setup();
    const release = server.holdNext();
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await vi.waitFor(() => expect(server.send).toHaveBeenCalledTimes(1));
    await queue.add(ops.tick(TOMATO, null), 'Pomodori');
    expect(queue.record().ops.map((o) => o.state)).toEqual(['sent', 'pending']);
    release('ok');
    await queue.flush();
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(server.view().data.departments[0]!.items.find((i) => i.ingredientId === TOMATO)!.checked).toBe(false);
  });

  it('sends the removal of an addition that may have reached the server (review, finding 3)', async () => {
    const { server, queue } = await setup();
    server.failNext(new ApiError('network'));
    await queue.add(ops.add(X, 'Pane'), 'Pane');
    await queue.flush();
    await queue.add(ops.remove(X), 'Pane');
    await queue.flush();
    expect(server.send.mock.calls.map(([op]) => op.kind)).toEqual(['addFreeItem', 'addFreeItem', 'removeFreeItem']);
    expect(server.view().data.freeItems.map((f) => f.id)).not.toContain(X);
  });

  it('never sends with the renewal of another person, and drops the queue', async () => {
    setOnline(false);
    const { store, server, queue, session } = await setup({ refresh: async () => ({ kind: 'ok', userId: OTHER_USER }) });
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    setOnline(true);
    await queue.flush();
    expect(server.send).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(session.isClosed()).toBe(true));
    await session.close();
    expect(store.entries.has(queueKey(USER))).toBe(false);
  });

  it('sends nothing when the renewal is refused, and the closing deletes the queue', async () => {
    setOnline(false);
    const { store, server, queue, session } = await setup({ refresh: async () => ({ kind: 'rejected' }) });
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    setOnline(true);
    await queue.flush();
    expect(server.send).not.toHaveBeenCalled();
    await session.close();
    expect(store.entries.has(queueKey(USER))).toBe(false);
  });

  it('keeps the queue when the renewal finds no network', async () => {
    const { store, server, queue } = await setup({ refresh: async () => ({ kind: 'network' }) });
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.flush();
    expect(server.send).not.toHaveBeenCalled();
    expect(stored(store)?.ops.map((o) => o.state)).toEqual(['pending']);
  });

  it('applies nothing after the session closed during a request, and sends nothing more', async () => {
    const { server, queue, session, applyConfirmed } = await setup();
    const release = server.holdNext();
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await vi.waitFor(() => expect(server.send).toHaveBeenCalledTimes(1));
    await session.close();
    release('ok');
    await queue.flush();
    expect(applyConfirmed).not.toHaveBeenCalled();
    await expect(queue.add(ops.tick(RICE), 'Riso')).rejects.toBeInstanceOf(SessionClosedError);
    const run = vi.fn();
    await expect(session.call(run)).rejects.toBeInstanceOf(SessionClosedError);
    expect(run).not.toHaveBeenCalled();
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it('drops every operation of a forbidden family and revokes it', async () => {
    const { server, queue, session } = await setup();
    setOnline(false);
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.add(ops.tick(RICE, grams(300), OTHER_FAMILY), 'Riso');
    await queue.add(ops.add(X, 'Pane'), 'Pane');
    setOnline(true);
    server.failNext(new ApiError('forbidden'));
    await queue.flush();
    expect(session.isRevoked(FAMILY)).toBe(true);
    expect(server.send.mock.calls.map(([op]) => op.input.familyId)).toEqual([FAMILY, OTHER_FAMILY]);
    expect(queue.record().ops).toEqual([]);
  });

  it('drops a refused addition with its dependents, keeps a notice and goes on', async () => {
    const { server, queue } = await setup();
    setOnline(false);
    await queue.add(ops.add(X, 'Pane'), 'Pane');
    await queue.add(ops.checkFree(X), 'Pane');
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    setOnline(true);
    server.failNext(new ApiError('invalid'));
    await queue.flush();
    expect(server.send.mock.calls.map(([op]) => op.kind)).toEqual(['addFreeItem', 'setItemChecked']);
    const [notice] = queue.record().notices;
    expect(notice).toMatchObject({ familyId: FAMILY, weekStartsOn: MONDAY, kind: 'addFreeItem', code: 'invalid', label: 'Pane' });
    await queue.dismiss(notice!.id);
    expect(queue.record().notices).toEqual([]);
  });

  it('ignores a late refusal of an operation dropped by a revocation (PR #22 review, finding 2)', async () => {
    const { store, server, queue, session } = await setup();
    const release = server.holdNext();
    await queue.add(ops.add(X, 'Pane'), 'Pane');
    await vi.waitFor(() => expect(server.send).toHaveBeenCalledTimes(1));
    session.revoke(FAMILY, { announce: false });
    await vi.waitFor(() => expect(queue.record().ops).toEqual([]));
    release(new ApiError('invalid'));
    await queue.flush();
    expect(queue.record().notices).toEqual([]);
    expect(stored(store)?.notices).toEqual([]);
  });

  it('drops the operations and notices of a family revoked in another tab', async () => {
    const { queue, session } = await setup();
    setOnline(false);
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.add(ops.tick(RICE, grams(300), OTHER_FAMILY), 'Riso');
    session.revoke(FAMILY, { announce: false });
    await vi.waitFor(() => expect(queue.record().ops.map((o) => o.op.input.familyId)).toEqual([OTHER_FAMILY]));
  });

  it('sends without Web Locks, as a declared limitation', async () => {
    const { server, queue } = await setup({ locks: null });
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    await queue.flush();
    expect(server.send).toHaveBeenCalledTimes(1);
    expect(queue.record().ops).toEqual([]);
  });

  it('starts a round when the network comes back', async () => {
    const { server, queue } = await setup();
    setOnline(false);
    await queue.add(ops.tick(TOMATO), 'Pomodori');
    expect(server.send).not.toHaveBeenCalled();
    setOnline(true);
    await vi.waitFor(() => expect(queue.record().ops).toEqual([]));
    expect(server.send).toHaveBeenCalledTimes(1);
  });
});

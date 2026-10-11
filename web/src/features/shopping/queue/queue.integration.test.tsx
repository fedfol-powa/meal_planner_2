import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/errors';
import { cacheKey, createMemoryStore, resetUserKeyPrefixes } from '../../../api/persister';
import { createSession, type RenewResult } from '../../../session/session';
import { useAuth } from '../../../auth/AuthProvider';
import { setOnline } from '../../../test/connectivity';
import { createLockHub } from '../../../test/fakeLocks';
import { createMemoryHub } from '../../../test/memoryChannel';
import { renderSession } from '../../../test/sessionHarness';
import { createStubBackend } from '../../../test/stubBackend';
import { FAMILY, grams, listView, ops, queued, RICE, TOMATO, USER } from '../fixtures';
import { registerShoppingStorage } from '../storage';
import type { ShoppingOperation } from './ops';
import { applyPending } from './pending';
import { createShoppingQueue, queueKey, type SendResult } from './queue';

// The queue with W5's real pieces: session, memory store with transact, channel between tabs, locks.
function createWorld() {
  const store = createMemoryStore();
  const hub = createMemoryHub();
  const locks = createLockHub();
  const applied: ShoppingOperation[] = [];
  const view = (): SendResult => ({ version: `v${applied.length}`, data: applyPending(listView(), FAMILY, applied.map((op) => queued(op))).view });
  return {
    store,
    applied,
    view,
    tab(options: { send?: (op: ShoppingOperation) => Promise<SendResult>; refresh?: () => Promise<RenewResult> } = {}) {
      const lockTab = locks.tab();
      const session = createSession(USER, store, { refresh: options.refresh ?? (async () => ({ kind: 'ok', userId: USER })), end: (s) => s.close(), channel: hub.channel() });
      const send = vi.fn(
        options.send ??
          (async (op: ShoppingOperation) => {
            if (!navigator.onLine) throw new ApiError('network');
            applied.push(op);
            return view();
          })
      );
      const applyConfirmed = vi.fn(async (_f: string, _w: string, _r: SendResult) => {});
      const queue = createShoppingQueue({ session, send, applyConfirmed, locks: lockTab.locks });
      const changes = vi.fn();
      queue.subscribe(changes);
      return {
        session, send, queue, applyConfirmed, changes,
        close() {
          lockTab.close();
          queue.dispose();
        }
      };
    }
  };
}

describe('shopping queue with the session of W5', () => {
  it('sends each operation once from two tabs; the other tab applies the confirmed views', async () => {
    setOnline(false);
    const world = createWorld();
    const a = world.tab();
    const b = world.tab();
    await a.queue.add(ops.tick(TOMATO), 'Pomodori');
    await b.queue.add(ops.tick(RICE, grams(300)), 'Riso');
    await b.queue.add(ops.add('f0000000-0000-4000-8000-0000000000aa', 'Pane'), 'Pane');
    setOnline(true);
    await Promise.all([a.queue.flush(), b.queue.flush()]);
    await waitFor(() => expect(world.store.entries.get(queueKey(USER))).toMatchObject({ ops: [], seq: 3 }));
    expect(world.applied).toHaveLength(3);
    expect(a.send.mock.calls.length + b.send.mock.calls.length).toBe(3);
    // Whoever did not send heard every confirmation.
    const listener = a.send.mock.calls.length === 3 ? b : a;
    await waitFor(() => expect(listener.applyConfirmed).toHaveBeenCalledTimes(3));
    expect(listener.applyConfirmed.mock.calls.at(-1)![2].version).toBe('v3');
  });

  it('tells the other tab about every change of the record (second review, finding 3)', async () => {
    const world = createWorld();
    setOnline(false);
    // Requests leave and are lost, in both tabs.
    const lost = async (): Promise<SendResult> => {
      throw new ApiError('network');
    };
    const a = world.tab({ send: lost });
    const b = world.tab({ send: lost });
    await a.queue.add(ops.tick(TOMATO), 'Pomodori');
    await waitFor(() => expect(b.queue.record().ops).toHaveLength(1));
    setOnline(true);
    await a.queue.flush();
    await waitFor(() => expect(b.queue.record().ops[0]?.state).toBe('sent'));
    // Compaction: a second tick of another item, then of the same one.
    setOnline(false);
    await a.queue.add(ops.tick(RICE, grams(300)), 'Riso');
    await a.queue.add(ops.tick(RICE, null), 'Riso');
    await waitFor(() => expect(b.queue.record().ops.map((o) => o.op.input)).toMatchObject([{ ingredientId: TOMATO }, { ingredientId: RICE, checked: false }]));
    b.close();
  });

  it('shows in the other tab a notice and its closing', async () => {
    const world = createWorld();
    const a = world.tab({
      send: async () => {
        throw new ApiError('invalid');
      }
    });
    const c = world.tab({
      send: async () => {
        throw new ApiError('network');
      }
    });
    setOnline(false);
    await a.queue.add(ops.add('f0000000-0000-4000-8000-0000000000aa', 'Pane'), 'Pane');
    setOnline(true);
    await a.queue.flush();
    await waitFor(() => expect(c.queue.record().notices).toHaveLength(1));
    expect(c.queue.record().ops).toEqual([]);
    await a.queue.dismiss(a.queue.record().notices[0]!.id);
    await waitFor(() => expect(c.queue.record().notices).toEqual([]));
  });

  it('repeats the sent head from another tab when the holder tab closes mid-round', async () => {
    const world = createWorld();
    const a = world.tab({ send: () => new Promise(() => {}) });
    const b = world.tab();
    await a.queue.add(ops.tick(TOMATO), 'Pomodori');
    await waitFor(() => expect(a.send).toHaveBeenCalledTimes(1));
    const waiting = b.queue.flush();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(b.send).not.toHaveBeenCalled();
    a.close();
    await waiting;
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(b.send.mock.calls[0]![0].input.id).toBe(a.send.mock.calls[0]![0].input.id);
    expect(world.store.entries.get(queueKey(USER))).toMatchObject({ ops: [] });
  });

  it('completes the queue when the app comes back from the background', async () => {
    const world = createWorld();
    let interrupted = true;
    const tab = world.tab({
      send: async (op) => {
        // Safari suspends the page: the request in flight is lost.
        if (interrupted) throw new ApiError('network');
        world.applied.push(op);
        return world.view();
      }
    });
    await tab.queue.add(ops.tick(TOMATO), 'Pomodori');
    await tab.queue.flush();
    expect(tab.queue.record().ops.map((o) => o.state)).toEqual(['sent']);
    interrupted = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(tab.queue.record().ops).toEqual([]));
    expect(world.applied).toHaveLength(1);
  });

  it('deletes the queue on «Esci» before the closing resolves', async () => {
    setOnline(false);
    const world = createWorld();
    const tab = world.tab();
    await tab.queue.add(ops.tick(TOMATO), 'Pomodori');
    expect(world.store.entries.has(queueKey(USER))).toBe(true);
    await tab.session.close();
    expect(world.store.entries.has(queueKey(USER))).toBe(false);
  });
});

describe('queues left on the device (second review, finding 2)', () => {
  const A = { id: 'user-a', email: 'a@example.com' };
  const B = { id: 'user-b', email: 'b@example.com' };
  const record = { ops: [], notices: [], seq: 1 };

  function Status() {
    return <p>auth: {useAuth().state.status}</p>;
  }

  it('deletes the queue of A once a start without anybody is confirmed', async () => {
    resetUserKeyPrefixes();
    registerShoppingStorage();
    const store = createMemoryStore();
    store.entries.set(queueKey(A.id), record);
    renderSession(<Status />, { backend: createStubBackend(null), store });
    await screen.findByText('auth: signedOut');
    await waitFor(() => expect(store.entries.has(queueKey(A.id))).toBe(false));
  });

  it('deletes the queue of A when B signs in, without opening the shopping list; B keeps theirs', async () => {
    resetUserKeyPrefixes();
    registerShoppingStorage();
    const store = createMemoryStore();
    store.entries.set(queueKey(A.id), record);
    store.entries.set(queueKey(B.id), record);
    store.entries.set(cacheKey(B.id), { timestamp: 1, buster: '', clientState: { queries: [], mutations: [] } });
    renderSession(<Status />, { backend: createStubBackend(B), store });
    await screen.findByText('auth: signedIn');
    await waitFor(() => expect(store.entries.has(queueKey(A.id))).toBe(false));
    expect(store.entries.get(queueKey(B.id))).toEqual(record);
  });
});

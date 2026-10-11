import { describe, expect, it } from 'vitest';
import { grams, ops, OTHER_USER, queued, RICE, TOMATO } from '../fixtures';
import { dropWithDependents, enqueue, type QueuedOp } from './ops';

const X = 'f0000000-0000-4000-8000-0000000000aa';
const Y = 'f0000000-0000-4000-8000-0000000000bb';
const kinds = (queue: QueuedOp[]) => queue.map((q) => `${q.op.kind}:${q.state}`);

describe('enqueue', () => {
  it('replaces the pending operation on the same item, in its place', () => {
    const first = queued(ops.tick(TOMATO));
    const rice = queued(ops.tick(RICE));
    const second = queued(ops.tick(TOMATO, null));
    const queue = enqueue(enqueue(enqueue([], first), rice), second);
    expect(queue).toEqual([second, rice]);
  });

  it('never replaces an operation already sent: the new one goes after it', () => {
    const sent = queued(ops.tick(TOMATO), 'sent');
    const next = queued(ops.tick(TOMATO, null));
    expect(enqueue([sent], next)).toEqual([sent, next]);
  });

  it('keeps operations on different items in order', () => {
    const a = queued(ops.tick(TOMATO));
    const b = queued(ops.tick(RICE));
    const c = queued(ops.addBack(TOMATO));
    expect(enqueue(enqueue(enqueue([], a), b), c)).toEqual([a, b, c]);
  });

  it('drops a pending free item, its tick and its removal together', () => {
    let queue = enqueue([], queued(ops.add(X, 'Pane')));
    queue = enqueue(queue, queued(ops.checkFree(X)));
    queue = enqueue(queue, queued(ops.tick(TOMATO)));
    queue = enqueue(queue, queued(ops.remove(X)));
    expect(kinds(queue)).toEqual(['setItemChecked:pending']);
  });

  it('sends the removal when the addition may have reached the server (review, finding 3)', () => {
    const added = queued(ops.add(X, 'Pane'), 'sent');
    let queue = enqueue([added], queued(ops.checkFree(X)));
    queue = enqueue(queue, queued(ops.remove(X)));
    expect(kinds(queue)).toEqual(['addFreeItem:sent', 'removeFreeItem:pending']);
  });

  it('queues the removal of an item that is not in the queue', () => {
    const tick = queued(ops.checkFree(Y));
    expect(kinds(enqueue([tick], queued(ops.remove(X))))).toEqual(['setFreeItemChecked:pending', 'removeFreeItem:pending']);
  });

  it('replaces the tick of the same free item', () => {
    const queue = enqueue([queued(ops.checkFree(X))], queued(ops.checkFree(X, false)));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.op).toMatchObject({ input: { checked: false } });
  });

  it('never compacts operations of different users', () => {
    const mine = queued(ops.tick(TOMATO));
    const theirs = queued(ops.tick(TOMATO, null), 'pending', OTHER_USER);
    expect(enqueue([mine], theirs)).toEqual([mine, theirs]);
    const added = queued(ops.add(X, 'Pane'));
    expect(kinds(enqueue([added], queued(ops.remove(X), 'pending', OTHER_USER)))).toEqual(['addFreeItem:pending', 'removeFreeItem:pending']);
  });

  it('keeps the operation it is given always pending', () => {
    expect(enqueue([], { ...queued(ops.tick(TOMATO)), state: 'sent' })[0]!.state).toBe('pending');
  });
});

describe('dropWithDependents', () => {
  it('drops a refused free item with the pending operations on it', () => {
    const add = queued(ops.add(X, 'Pane'), 'sent');
    const tick = queued(ops.checkFree(X));
    const remove = queued(ops.remove(X));
    const other = queued(ops.tick(TOMATO, grams(100)));
    const otherFree = queued(ops.checkFree(Y));
    expect(dropWithDependents([add, tick, other, remove, otherFree], add)).toEqual([other, otherFree]);
  });

  it('drops only the refused operation otherwise', () => {
    const head = queued(ops.tick(TOMATO), 'sent');
    const next = queued(ops.tick(RICE));
    expect(dropWithDependents([head, next], head)).toEqual([next]);
  });
});

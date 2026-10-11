import type { Contract } from '@app/contract';
import type { InferContractRouterInputs } from '@orpc/contract';

type Inputs = InferContractRouterInputs<Contract>['shopping'];
export type SetItemCheckedInput = Inputs['setItemChecked'];
export type SetAddedBackInput = Inputs['setAddedBack'];
export type AddFreeItemInput = Inputs['addFreeItem'];
export type SetFreeItemCheckedInput = Inputs['setFreeItemChecked'];
export type RemoveFreeItemInput = Inputs['removeFreeItem'];

/** The changes of a list: absolute state, each with its client id (`input.id`). */
export type ShoppingOperation =
  | { kind: 'setItemChecked'; input: SetItemCheckedInput }
  | { kind: 'setAddedBack'; input: SetAddedBackInput }
  | { kind: 'addFreeItem'; input: AddFreeItemInput }
  | { kind: 'setFreeItemChecked'; input: SetFreeItemCheckedInput }
  | { kind: 'removeFreeItem'; input: RemoveFreeItemInput };

/** `pending`: never sent. `sent`: left at least once, so the server may have applied it. */
export type OpState = 'pending' | 'sent';
export interface QueuedOp { userId: string; queuedAt: number; state: OpState; label: string; op: ShoppingOperation }
export interface QueueNotice { id: string; familyId: string; weekStartsOn: string; kind: ShoppingOperation['kind']; code: 'invalid' | 'not_found'; label: string }
export interface QueueRecord { ops: QueuedOp[]; notices: QueueNotice[]; seq: number }

export const emptyRecord = (): QueueRecord => ({ ops: [], notices: [], seq: 0 });

/** Same list: family and Monday. */
export const listOf = (o: { op: ShoppingOperation }) => `${o.op.input.familyId}/${o.op.input.weekStartsOn}`;

/** The free item an operation acts on, if any. */
export function freeItemOf(op: ShoppingOperation): string | null {
  if (op.kind === 'addFreeItem') return op.input.id;
  if (op.kind === 'setFreeItemChecked' || op.kind === 'removeFreeItem') return op.input.itemId;
  return null;
}

/** What an absolute-state operation sets: a newer one on the same target makes it useless. */
function targetOf(queued: QueuedOp): string | null {
  const { op } = queued;
  const owner = `${queued.userId}|${listOf(queued)}`;
  if (op.kind === 'setItemChecked' || op.kind === 'setAddedBack') return `${owner}|${op.kind}|${op.input.ingredientId}~${op.input.varietyKey}`;
  if (op.kind === 'setFreeItemChecked') return `${owner}|${op.kind}|${op.input.itemId}`;
  return null;
}

const sameFreeItem = (a: QueuedOp, b: QueuedOp) => a.userId === b.userId && freeItemOf(a.op) !== null && freeItemOf(a.op) === freeItemOf(b.op);

/** The queue after adding `next` (always `pending`); compaction only among `pending` operations. */
export function enqueue(ops: readonly QueuedOp[], next: QueuedOp): QueuedOp[] {
  const added: QueuedOp = { ...next, state: 'pending' };
  if (added.op.kind === 'removeFreeItem') {
    // Ticks of the item never sent are useless once it goes.
    const kept = ops.filter((o) => !(o.state === 'pending' && o.op.kind === 'setFreeItemChecked' && sameFreeItem(o, added)));
    const unsentAddition = kept.findIndex((o) => o.state === 'pending' && o.op.kind === 'addFreeItem' && sameFreeItem(o, added));
    // Never sent: the item never existed for the server, nothing to remove.
    if (unsentAddition !== -1) return kept.filter((_, index) => index !== unsentAddition);
    return [...kept, added];
  }
  const target = targetOf(added);
  const replaced = target === null ? -1 : ops.findLastIndex((o) => o.state === 'pending' && targetOf(o) === target);
  if (replaced === -1) return [...ops, added];
  return ops.map((o, index) => (index === replaced ? added : o));
}

/** Drops `failed` (the head) and the `pending` operations that depend on it. */
export function dropWithDependents(ops: readonly QueuedOp[], failed: QueuedOp): QueuedOp[] {
  const dependsOnFailed = (o: QueuedOp) => failed.op.kind === 'addFreeItem' && o.state === 'pending' && sameFreeItem(o, failed);
  return ops.filter((o) => o.op.input.id !== failed.op.input.id && !dependsOnFailed(o));
}

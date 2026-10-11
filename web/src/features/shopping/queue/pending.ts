import type { ShoppingItemView, ShoppingListView } from '@app/contract';
import { compareShoppingItems, DEPARTMENTS } from '@app/domain/shopping';
import { exceeds, formatCombined } from '@app/domain/units';
import type { QueuedOp } from './ops';

/** The list as shown: the confirmed view with the queued changes on top, and what they touched. */
export interface PendingView { view: ShoppingListView; pendingKeys: Set<string>; pendingFreeIds: Set<string> }

const keyOf = (ingredientId: string, varietyKey: string) => `${ingredientId}~${varietyKey}`;

/**
 * The «da sincronizzare» layer: every queued operation of the list (pending and sent) over the
 * confirmed view, never written to the cache. Operations are absolute, so one already in the
 * base changes nothing. Items and departments are arranged as the domain does.
 */
export function applyPending(base: ShoppingListView, familyId: string, ops: readonly QueuedOp[]): PendingView {
  const mine = ops.filter((o) => o.op.input.familyId === familyId && o.op.input.weekStartsOn === base.weekStartsOn);
  const pendingKeys = new Set<string>();
  const pendingFreeIds = new Set<string>();
  if (mine.length === 0) return { view: base, pendingKeys, pendingFreeIds };

  const options = { system: base.measurementSystem, locale: base.locale, rounding: 'shopping' as const };
  // Every item with whether it is on the list (an excluded item on the list was put back).
  const items = new Map<string, { item: ShoppingItemView; onList: boolean }>();
  for (const d of base.departments) for (const i of d.items) items.set(i.key, { item: i, onList: true });
  for (const i of base.excluded) items.set(i.key, { item: i, onList: false });
  let freeItems = base.freeItems;

  for (const { op } of mine) {
    if (op.kind === 'setItemChecked' || op.kind === 'setAddedBack') {
      const key = keyOf(op.input.ingredientId, op.input.varietyKey);
      pendingKeys.add(key);
      const entry = items.get(key);
      // The item left the list: the tick waits on the server until it comes back.
      if (!entry) continue;
      if (op.kind === 'setAddedBack') {
        if (entry.item.excluded !== null) items.set(key, { ...entry, onList: op.input.addedBack });
        continue;
      }
      const ticked = op.input.checked ? op.input.quantityAtCheck : undefined;
      const grew = ticked !== undefined && exceeds(entry.item.combined, ticked);
      items.set(key, {
        ...entry,
        item: { ...entry.item, checked: ticked !== undefined && !grew, previousQuantity: grew ? formatCombined(ticked, options) : null }
      });
    } else if (op.kind === 'addFreeItem') {
      pendingFreeIds.add(op.input.id);
      if (!freeItems.some((f) => f.id === op.input.id)) freeItems = [...freeItems, { id: op.input.id, text: op.input.text, checked: false }];
    } else if (op.kind === 'setFreeItemChecked') {
      pendingFreeIds.add(op.input.itemId);
      freeItems = freeItems.map((f) => (f.id === op.input.itemId ? { ...f, checked: op.input.checked } : f));
    } else {
      freeItems = freeItems.filter((f) => f.id !== op.input.itemId);
    }
  }

  // The domain's order: ingredient name, then variety (PR #24).
  const byName = compareShoppingItems(base.locale);
  const all = [...items.values()];
  const onList = all.filter((e) => e.onList).map((e) => e.item);
  return {
    view: {
      ...base,
      departments: DEPARTMENTS.map((department) => ({ department, items: onList.filter((i) => i.department === department).sort(byName) })).filter(
        (d) => d.items.length > 0
      ),
      excluded: all.filter((e) => !e.onList).map((e) => e.item).sort(byName),
      freeItems
    },
    pendingKeys,
    pendingFreeIds
  };
}

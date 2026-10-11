import type { ShoppingItemView, ShoppingListView } from '@app/contract';
import type { CombinedQuantity } from '@app/domain/units';
import type { OpState, QueuedOp, ShoppingOperation } from './queue/ops';

// Test data only: views as the server sends them (already arranged by the domain).
export const FAMILY = '11111111-1111-4111-8111-111111111111';
export const OTHER_FAMILY = '22222222-2222-4222-8222-222222222222';
export const MONDAY = '2026-10-12';
export const USER = '33333333-3333-4333-8333-333333333333';
export const OTHER_USER = '44444444-4444-4444-8444-444444444444';

export const grams = (mass: number): CombinedQuantity => ({ mass_g: mass, volume_ml: null, counts: {}, texts: [], to_taste: false });
export const texts = (...items: string[]): CombinedQuantity => ({
  mass_g: null, volume_ml: null, counts: {}, to_taste: false,
  texts: items.map((it) => ({ key: it.toLowerCase(), text: { 'it-IT': it, 'en-GB': `${it} (en)` } }))
});

export function item(ingredientId: string, name: string, overrides: Partial<ShoppingItemView> = {}): ShoppingItemView {
  return {
    key: `${ingredientId}~${overrides.varietyKey ?? ''}`, ingredientId, varietyKey: '', department: 'produce', name, ingredientName: name, variety: null,
    quantity: '200 g', combined: grams(200), isOptional: false, excluded: null, checked: false, previousQuantity: null, sources: [],
    ...overrides
  };
}

export const TOMATO = 'a0000000-0000-4000-8000-000000000001';
export const RICE = 'a0000000-0000-4000-8000-000000000002';
export const OIL = 'a0000000-0000-4000-8000-000000000003';
export const PEANUT = 'a0000000-0000-4000-8000-000000000004';
export const APPLE = 'a0000000-0000-4000-8000-000000000005';

export function listView(overrides: Partial<ShoppingListView> = {}): ShoppingListView {
  return {
    weekStartsOn: MONDAY, locale: 'it-IT', measurementSystem: 'metric', mealCount: 3,
    departments: [
      { department: 'produce', items: [item(APPLE, 'Mele', { quantity: '3', combined: { ...grams(0), mass_g: null, counts: { piece: 3 } } }), item(TOMATO, 'Pomodori')] },
      { department: 'pasta_grains', items: [item(RICE, 'Riso', { department: 'pasta_grains', quantity: '300 g', combined: grams(300) })] }
    ],
    excluded: [
      item(PEANUT, 'Arachidi', { department: 'other', excluded: 'avoid', quantity: '50 g', combined: grams(50) }),
      item(OIL, 'Olio', { department: 'condiments', excluded: 'pantry', quantity: '2 cucchiai', combined: { ...grams(0), mass_g: null, counts: { tbsp: 2 } } })
    ],
    skipped: [],
    freeItems: [{ id: 'f0000000-0000-4000-8000-000000000001', text: 'Detersivo', checked: false }],
    lastChange: null,
    ...overrides
  };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const week = (familyId = FAMILY) => ({ familyId, weekStartsOn: MONDAY });
export const ops = {
  tick: (ingredientId: string, quantityAtCheck: CombinedQuantity | null = grams(200), familyId = FAMILY): ShoppingOperation => ({
    kind: 'setItemChecked',
    input: { ...week(familyId), id: crypto.randomUUID(), ingredientId, varietyKey: '', checked: quantityAtCheck !== null, ...(quantityAtCheck ? { quantityAtCheck } : {}) }
  }),
  addBack: (ingredientId: string, addedBack = true): ShoppingOperation => ({
    kind: 'setAddedBack', input: { ...week(), id: crypto.randomUUID(), ingredientId, varietyKey: '', addedBack }
  }),
  add: (id: string, text: string): ShoppingOperation => ({ kind: 'addFreeItem', input: { ...week(), id, text } }),
  checkFree: (itemId: string, checked = true): ShoppingOperation => ({ kind: 'setFreeItemChecked', input: { ...week(), id: crypto.randomUUID(), itemId, checked } }),
  remove: (itemId: string): ShoppingOperation => ({ kind: 'removeFreeItem', input: { ...week(), id: crypto.randomUUID(), itemId } })
};

export const queued = (op: ShoppingOperation, state: OpState = 'pending', userId = USER): QueuedOp => ({ userId, queuedAt: 0, state, label: 'label', op });

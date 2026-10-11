import { describe, expect, it } from 'vitest';
import { deepFreeze, FAMILY, grams, item, listView, OIL, ops, OTHER_FAMILY, queued, RICE, texts, TOMATO } from '../fixtures';
import { applyPending } from './pending';

const NEW = 'f0000000-0000-4000-8000-0000000000aa';
const DETERGENT = 'f0000000-0000-4000-8000-000000000001';
const find = (view: ReturnType<typeof applyPending>['view'], ingredientId: string) =>
  [...view.departments.flatMap((d) => d.items), ...view.excluded].find((i) => i.ingredientId === ingredientId)!;
const withTomato = (overrides: Parameters<typeof item>[2]) =>
  listView({ departments: [{ department: 'produce', items: [item(TOMATO, 'Pomodori', overrides)] }] });

describe('applyPending', () => {
  it('ticks an item whose quantity is still the one ticked', () => {
    const { view, pendingKeys } = applyPending(deepFreeze(listView()), FAMILY, [queued(ops.tick(TOMATO, grams(200)))]);
    expect(find(view, TOMATO)).toMatchObject({ checked: true, previousQuantity: null });
    expect(pendingKeys.has(`${TOMATO}~`)).toBe(true);
  });

  it('shows «prima» when the item grew after the tick (review, finding 5)', () => {
    const base = deepFreeze(withTomato({ combined: grams(400), quantity: '400 g' }));
    const { view, pendingKeys } = applyPending(base, FAMILY, [queued(ops.tick(TOMATO, grams(200)))]);
    expect(find(view, TOMATO)).toMatchObject({ checked: false, previousQuantity: '200 g' });
    expect(pendingKeys.has(`${TOMATO}~`)).toBe(true);
  });

  it('keeps the tick when the item shrank', () => {
    const base = deepFreeze(withTomato({ combined: grams(100), quantity: '100 g' }));
    expect(find(applyPending(base, FAMILY, [queued(ops.tick(TOMATO, grams(200)))]).view, TOMATO).checked).toBe(true);
  });

  it('compares textual quantities like the domain, in the language of the view', () => {
    const base = deepFreeze(withTomato({ combined: texts('Un cesto', 'Una cassetta') }));
    const { view } = applyPending(base, FAMILY, [queued(ops.tick(TOMATO, texts('Un cesto')))]);
    expect(find(view, TOMATO)).toMatchObject({ checked: false, previousQuantity: 'Un cesto' });
  });

  it('formats «prima» in the language and system of the view', () => {
    const base = deepFreeze({ ...withTomato({ combined: grams(400) }), locale: 'en-GB' as const, measurementSystem: 'uk_imperial' as const });
    const previous = find(applyPending(base, FAMILY, [queued(ops.tick(TOMATO, grams(200)))]).view, TOMATO).previousQuantity;
    expect(previous).toMatch(/oz/);
    const textual = deepFreeze({ ...withTomato({ combined: texts('Un cesto', 'Una cassetta') }), locale: 'en-GB' as const });
    expect(find(applyPending(textual, FAMILY, [queued(ops.tick(TOMATO, texts('Un cesto')))]).view, TOMATO).previousQuantity).toBe('Un cesto (en)');
  });

  it('unticks, and moves items between «Non in lista» and their department', () => {
    const base = deepFreeze(withTomato({ checked: true, previousQuantity: null }));
    expect(find(applyPending(base, FAMILY, [queued(ops.tick(TOMATO, null))]).view, TOMATO).checked).toBe(false);

    const back = applyPending(deepFreeze(listView()), FAMILY, [queued(ops.addBack(OIL))]);
    expect(back.view.excluded.map((i) => i.ingredientId)).not.toContain(OIL);
    expect(back.view.departments.map((d) => d.department)).toEqual(['produce', 'pasta_grains', 'condiments']);
    expect(back.pendingKeys.has(`${OIL}~`)).toBe(true);

    // Same order as the domain: departments in their order, items by name in the view's language.
    const produce = applyPending(deepFreeze(listView({ excluded: [item(OIL, 'Asparagi', { excluded: 'pantry' })] })), FAMILY, [queued(ops.addBack(OIL))]);
    expect(produce.view.departments[0]!.items.map((i) => i.name)).toEqual(['Asparagi', 'Mele', 'Pomodori']);

    const putBack = listView({
      departments: [...listView().departments, { department: 'condiments', items: [item(OIL, 'Olio', { department: 'condiments', excluded: 'pantry' })] }],
      excluded: []
    });
    const off = applyPending(deepFreeze(putBack), FAMILY, [queued(ops.addBack(OIL, false))]);
    expect(off.view.excluded.map((i) => i.ingredientId)).toEqual([OIL]);
    expect(off.view.departments.map((d) => d.department)).toEqual(['produce', 'pasta_grains']);
  });

  it('applies the free items', () => {
    const { view, pendingFreeIds } = applyPending(deepFreeze(listView()), FAMILY, [
      queued(ops.add(NEW, 'Pane')),
      queued(ops.checkFree(DETERGENT))
    ]);
    expect(view.freeItems).toEqual([
      { id: DETERGENT, text: 'Detersivo', checked: true },
      { id: NEW, text: 'Pane', checked: false }
    ]);
    expect([...pendingFreeIds].sort()).toEqual([DETERGENT, NEW].sort());
    expect(applyPending(deepFreeze(listView()), FAMILY, [queued(ops.remove(DETERGENT))]).view.freeItems).toEqual([]);
  });

  it('gives the same result when the base already holds the operations sent', () => {
    const queue = [queued(ops.tick(TOMATO, grams(200)), 'sent'), queued(ops.addBack(OIL)), queued(ops.add(NEW, 'Pane'))];
    const once = applyPending(deepFreeze(listView()), FAMILY, queue).view;
    expect(applyPending(deepFreeze(once), FAMILY, queue).view).toEqual(once);
  });

  it('ignores the operations of other lists and leaves the base untouched', () => {
    const base = deepFreeze(listView());
    const { view, pendingKeys } = applyPending(base, FAMILY, [queued(ops.tick(TOMATO, grams(200), OTHER_FAMILY)), queued(ops.tick(RICE, grams(300)))]);
    expect(find(view, TOMATO).checked).toBe(false);
    expect(find(view, RICE).checked).toBe(true);
    expect([...pendingKeys]).toEqual([`${RICE}~`]);
    expect(base).toEqual(listView());
  });

  it('ignores a tick of an item no longer on the list', () => {
    const { view } = applyPending(deepFreeze(listView()), FAMILY, [queued(ops.tick('a0000000-0000-4000-8000-0000000000ff'))]);
    expect(view).toEqual(listView());
  });
});

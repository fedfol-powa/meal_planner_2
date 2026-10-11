import { describe, expect, it } from 'vitest';
import { createFakeApi, createFakeData } from './fakeApi';
import type { Api, WeekView } from '../types';

async function demoWeek(api: Api, familyId: string): Promise<WeekView> {
  const opening = await api.menu.getOpening({ familyId });
  if (opening.unchanged || opening.data.kind !== 'day') throw new Error('demo menu');
  const week = await api.menu.getWeek({ familyId, weekStartsOn: opening.data.weekStartsOn });
  if (week.unchanged) throw new Error('expected data');
  return week.data;
}

describe('fake meals', () => {
  it('changes servings as an action and undoes it from the week alone', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const meal = (await demoWeek(api, familyId)).days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    const changed = await api.meals.setServings({ familyId, slotId: meal.slotId, id: crypto.randomUUID(), servings: meal.servings + 1 });
    expect(changed.changed).toBe(true);
    const last = changed.week.days.flatMap((d) => d.meals).find((m) => m.slotId === meal.slotId)!.lastChange!;
    expect(last).toMatchObject({ actionId: changed.actionId, undoable: true, slotIds: [meal.slotId] });
    const undone = await api.meals.undo({ familyId, actionId: last.actionId!, id: crypto.randomUUID() });
    expect(undone.week.days.flatMap((d) => d.meals).find((m) => m.slotId === meal.slotId)!.servings).toBe(meal.servings);
  });

  it('pages at most five suggestions and remembers a request without effect', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const meal = (await demoWeek(api, familyId)).days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    expect((await api.meals.getSuggestions({ familyId, slotId: meal.slotId, offset: 0 })).recipes.length).toBeLessThanOrEqual(5);
    expect((await api.meals.setServings({ familyId, slotId: meal.slotId, id: crypto.randomUUID(), servings: meal.servings })).changed).toBe(false);
  });

  it('swaps two meals of the week and undoes the swap whole', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const meals = (await demoWeek(api, familyId)).days.flatMap((d) => d.meals).filter((m) => m.kind === 'recipe');
    const [a, b] = [meals[0]!, meals.find((m) => m.recipe!.id !== meals[0]!.recipe!.id)!];
    const swapped = await api.meals.swap({ familyId, slotId: a.slotId, otherSlotId: b.slotId, id: crypto.randomUUID() });
    const after = (id: string, week: WeekView) => week.days.flatMap((d) => d.meals).find((m) => m.slotId === id)!;
    expect(after(a.slotId, swapped.week).recipe!.id).toBe(b.recipe!.id);
    expect(after(a.slotId, swapped.week).servings).toBe(a.servings);
    const undone = await api.meals.undo({ familyId, actionId: swapped.actionId, id: crypto.randomUUID() });
    expect(after(a.slotId, undone.week).recipe!.id).toBe(a.recipe!.id);
    expect(after(b.slotId, undone.week).recipe!.id).toBe(b.recipe!.id);
  });

  it('suggestions skip the excluded recipes and the meals of the week', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', data: createFakeData() });
    const familyId = (await api.profile.get({})).currentFamilyId!;
    const week = await demoWeek(api, familyId);
    const meal = week.days.flatMap((d) => d.meals).find((m) => m.kind === 'recipe')!;
    const first = (await api.meals.getSuggestions({ familyId, slotId: meal.slotId, offset: 0 })).recipes[0]!.recipe.id;
    const inWeek = new Set(week.days.flatMap((d) => d.meals).map((m) => m.recipe?.id));
    expect(inWeek.has(first)).toBe(false);
    await api.family.addExclusion({ familyId, recipeId: first });
    const again = await api.meals.getSuggestions({ familyId, slotId: meal.slotId, offset: 0 });
    expect(again.recipes.map((r) => r.recipe.id)).not.toContain(first);
  });
});

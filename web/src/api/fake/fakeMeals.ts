import type { MealActionResult, SuggestionsView, WeekView } from '@app/contract';
import { ApiError } from '../errors';
import type { Api } from '../types';

export interface FakeSlot {
  id: string; date: string; mealType: 'lunch' | 'dinner';
  recipeId: string | null; freeText: string | null; servings: number; note: string | null;
  updatedBy?: string | null; updatedAt?: string | null; lastActionId?: string | null;
}
interface Content { recipeId: string | null; freeText: string | null; servings: number; note: string | null }
interface Row { slotId: string; before: Content; after: Content }
interface Action { id: string; actorId: string; kind: string; slotIds: string[]; undoes: string | null; rows: Row[] }

export interface FakeMealsOptions {
  userId: string;
  latencyMs?: number;
  checkFamily(familyId: string): void;
  /** Every slot of the visible weeks, with its week's Monday (mutable objects of the fake data). */
  slots(): { weekStartsOn: string; slot: FakeSlot }[];
  /** The week as menu.getWeek shows it. */
  weekView(weekStartsOn: string): WeekView;
  /** Simulated ranking of round 2 (design/percorsi.md, «Suggerimenti simulati»): recipe ids, best first. */
  rank(slotId: string): string[];
  suggestion(recipeId: string): SuggestionsView['recipes'][number];
  isPublished(recipeId: string): boolean;
  now(): string;
  bump(): void;
}

const contentOf = (s: FakeSlot): Content => ({ recipeId: s.recipeId, freeText: s.freeText, servings: s.servings, note: s.note });
const same = (a: Content, b: Content) => a.recipeId === b.recipeId && a.freeText === b.freeText && a.servings === b.servings && a.note === b.note;

/** The same rules as the server (spec of the revision, section 4), in memory. */
export function createFakeMeals(o: FakeMealsOptions) {
  const actions = new Map<string, Action>();
  const wait = () => (o.latencyMs ? new Promise((r) => setTimeout(r, o.latencyMs)) : Promise.resolve());
  const find = (slotId: string) => {
    const found = o.slots().find((s) => s.slot.id === slotId);
    if (!found) throw new ApiError('not_found');
    return found;
  };
  const result = (weekStartsOn: string, action: Action): MealActionResult => ({ week: o.weekView(weekStartsOn), actionId: action.id, changed: action.rows.length > 0 });
  function act(id: string, kind: string, slotIds: string[], next: (slot: FakeSlot) => Content, undoes: string | null = null): MealActionResult {
    const weekStartsOn = find(slotIds[0]!).weekStartsOn;
    const known = actions.get(id);
    if (known) {
      if (known.actorId !== o.userId || known.kind !== kind || known.slotIds.join() !== slotIds.join() || known.undoes !== undoes) throw new ApiError('invalid');
      return result(weekStartsOn, known);
    }
    const slots = slotIds.map((sid) => find(sid).slot);
    const edits = slots.map((slot) => ({ slot, before: contentOf(slot), after: next(slot) })).filter((e) => !same(e.before, e.after));
    const action: Action = { id, actorId: o.userId, kind, slotIds, undoes, rows: edits.map((e) => ({ slotId: e.slot.id, before: e.before, after: e.after })) };
    actions.set(id, action);
    for (const e of edits) Object.assign(e.slot, e.after, { updatedBy: o.userId, updatedAt: o.now(), lastActionId: id });
    if (edits.length) o.bump();
    return result(weekStartsOn, action);
  }
  const api: Api['meals'] = {
    async getSuggestions({ familyId, slotId, offset }) {
      o.checkFamily(familyId);
      await wait();
      find(slotId);
      const ranked = o.rank(slotId);
      // The contract coerces the offset (query string of the REST route).
      const from = Number(offset ?? 0);
      const start = from < ranked.length ? from : 0;
      const counts = new Map<string, number>();
      for (const { slot } of o.slots()) if (slot.freeText) counts.set(slot.freeText, (counts.get(slot.freeText) ?? 0) + 1);
      return {
        recipes: ranked.slice(start, start + 5).map(o.suggestion),
        nextOffset: start + 5 < ranked.length ? start + 5 : 0,
        freeTexts: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([t]) => t)
      };
    },
    async setServings({ familyId, slotId, id, servings }) {
      o.checkFamily(familyId);
      await wait();
      return act(id, 'set_servings', [slotId], (s) => ({ ...contentOf(s), servings }));
    },
    async setRecipe({ familyId, slotId, id, recipeId }) {
      o.checkFamily(familyId);
      await wait();
      if (!actions.has(id) && !o.isPublished(recipeId)) throw new ApiError('not_found');
      return act(id, 'set_recipe', [slotId], (s) => ({ ...contentOf(s), recipeId, freeText: null }));
    },
    async setFree({ familyId, slotId, id, text }) {
      o.checkFamily(familyId);
      await wait();
      return act(id, 'set_free', [slotId], (s) => ({ ...contentOf(s), recipeId: null, freeText: text.trim() }));
    },
    async setNote({ familyId, slotId, id, note }) {
      o.checkFamily(familyId);
      await wait();
      return act(id, 'set_note', [slotId], (s) => ({ ...contentOf(s), note: note?.trim() || null }));
    },
    async swap({ familyId, slotId, otherSlotId, id }) {
      o.checkFamily(familyId);
      await wait();
      const [a, b] = [find(slotId), find(otherSlotId)];
      if (slotId === otherSlotId || a.weekStartsOn !== b.weekStartsOn) throw new ApiError('invalid');
      const moved = (s: FakeSlot) => ({ recipeId: s.recipeId, freeText: s.freeText, note: s.note });
      const [ma, mb] = [moved(a.slot), moved(b.slot)];
      return act(id, 'swap', [slotId, otherSlotId], (s) => ({ ...contentOf(s), ...(s.id === slotId ? mb : ma) }));
    },
    async undo({ familyId, actionId, id }) {
      o.checkFamily(familyId);
      await wait();
      const target = actions.get(actionId);
      if (!target) throw new ApiError('not_found');
      const slotIds = target.rows.length ? target.rows.map((r) => r.slotId) : target.slotIds;
      if (!actions.has(id) && target.rows.length) {
        if (target.actorId !== o.userId) throw new ApiError('not_allowed');
        if (target.rows.some((r) => find(r.slotId).slot.lastActionId !== actionId)) throw new ApiError('not_allowed');
      }
      return act(id, 'undo', slotIds, (s) => target.rows.find((r) => r.slotId === s.id)?.before ?? contentOf(s), actionId);
    }
  };
  return {
    api,
    /** The action fields of lastChange, as the server computes them for the reader. */
    lastChangeOf(slot: FakeSlot) {
      const action = slot.lastActionId ? actions.get(slot.lastActionId) : undefined;
      if (!action) return { actionId: null, undoable: false, slotIds: [] as string[] };
      const slotIds = action.rows.map((r) => r.slotId);
      const undoable = action.actorId === o.userId && slotIds.every((sid) => find(sid).slot.lastActionId === action.id);
      return { actionId: action.id, undoable, slotIds };
    }
  };
}

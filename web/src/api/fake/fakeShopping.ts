import type { ShoppingListView } from '@app/contract';
import { arrangeShoppingList, consolidateShoppingList, itemKey, type Department, type ShoppingCheck, type ShoppingIngredient, type ShoppingMeal } from '@app/domain/shopping';
import type { Localized, Quantity } from '@app/domain/units';
import type { Locale } from '../../i18n/translate';
import type { IsoDate, MealType } from '../../lib/calendar';
import { listExport } from '../../features/shopping/exportText';
import { ApiError } from '../errors';
import type { Api } from '../types';
import type { Quantity as DemoQuantity, Translated } from './quantity';
import { DEMO_PEOPLE } from './seed';

// FAKE shopping area: the list computed by the domain on the demo data, ticks kept in memory.
interface DemoLine { ingredientId: string; quantity: DemoQuantity; sourceText: string; text: Translated | null; isOptional: boolean }
interface DemoRecipe { id: string; status: string; name: Translated; baseServings: number | null; ingredients: DemoLine[] }
interface DemoSlot { id: string; date: IsoDate; mealType: MealType; recipeId: string | null; servings: number }
interface DemoIngredient { id: string; name: Translated; department: Department; isPantry: boolean }

interface ListState {
  checks: Map<string, ShoppingCheck>;
  addedBack: Set<string>;
  freeItems: { id: string; text: string; checked: boolean }[];
  lastChange: { userId: string; at: string } | null;
}

export interface FakeShoppingDeps {
  familyId: string;
  userId: string;
  getLocale: () => Locale;
  latencyMs?: number;
  ingredients: DemoIngredient[];
  recipes: DemoRecipe[];
  /** The generated week starting on that Monday, if visible. */
  week: (weekStartsOn: IsoDate) => { slots: DemoSlot[] } | undefined;
  /** The session's fake backend, shared by the clients of every language: its counter grows at every change. */
  data: { revision: number };
}

/** Ticks and free items per session and week. */
const sessions = new WeakMap<object, Map<string, ListState>>();

const localized = (text: Translated): Localized => ({ 'it-IT': text['it-IT'], 'en-GB': text['en-GB'] ?? text['it-IT'] });

function quantityOf(line: DemoLine): Quantity {
  if (line.quantity.kind === 'amount') return line.quantity;
  if (line.quantity.kind === 'to_taste') return { kind: 'to_taste' };
  return { kind: 'text', text: line.text ? localized(line.text) : { 'it-IT': line.sourceText, 'en-GB': line.sourceText } };
}

export function createFakeShopping(deps: FakeShoppingDeps): Api['shopping'] {
  const wait = () => (deps.latencyMs ? new Promise((resolve) => setTimeout(resolve, deps.latencyMs)) : Promise.resolve());
  const catalogue = new Map<string, ShoppingIngredient>(
    deps.ingredients.map((i) => [i.id, { name: localized(i.name), department: i.department ?? 'other', isPantry: !!i.isPantry }])
  );
  const version = (revision: number) => `shopping:${deps.familyId}|rev:${revision}|lang:${deps.getLocale()}|deploy:fake`;

  const lists = sessions.get(deps.data) ?? new Map<string, ListState>();
  sessions.set(deps.data, lists);
  function stateOf(weekStartsOn: string): ListState {
    let state = lists.get(weekStartsOn);
    if (!state) {
      state = { checks: new Map(), addedBack: new Set(), freeItems: [], lastChange: null };
      lists.set(weekStartsOn, state);
    }
    return state;
  }

  function check(input: { familyId: string; weekStartsOn: string }) {
    if (input.familyId !== deps.familyId) throw new ApiError('forbidden');
    const week = deps.week(input.weekStartsOn);
    if (!week) throw new ApiError('not_found');
    return week;
  }

  function view(weekStartsOn: string): ShoppingListView {
    const week = check({ familyId: deps.familyId, weekStartsOn });
    const locale = deps.getLocale();
    const state = stateOf(weekStartsOn);
    const drafts: ShoppingListView['skipped'] = [];
    const meals: ShoppingMeal[] = [];
    for (const slot of week.slots) {
      const recipe = slot.recipeId ? deps.recipes.find((r) => r.id === slot.recipeId) : undefined;
      if (!recipe) continue;
      if (recipe.status !== 'published') {
        drafts.push({ slotId: slot.id, recipeId: recipe.id, recipeName: localized(recipe.name)[locale] });
        continue;
      }
      meals.push({
        slotId: slot.id, date: slot.date, mealType: slot.mealType, servings: slot.servings,
        recipe: {
          id: recipe.id, name: localized(recipe.name), baseServings: recipe.baseServings,
          lines: recipe.ingredients.map((l) => ({ ingredientId: l.ingredientId, variety: null, preparation: null, quantity: quantityOf(l), isOptional: l.isOptional }))
        }
      });
    }
    const list = consolidateShoppingList({ meals, ingredients: catalogue, equivalences: [], avoided: new Set() });
    const arranged = arrangeShoppingList(list, {
      checks: [...state.checks.values()],
      addedBack: [...state.addedBack].map((key) => ({ ingredientId: key.split('~')[0]!, varietyKey: key.split('~')[1] ?? '' })),
      system: 'metric',
      locale
    });
    const author = state.lastChange && DEMO_PEOPLE.find((p) => p.id === state.lastChange!.userId);
    return {
      ...arranged,
      skipped: [...arranged.skipped, ...drafts],
      weekStartsOn,
      measurementSystem: 'metric',
      freeItems: state.freeItems.map((f) => ({ ...f })),
      lastChange: state.lastChange ? { name: author?.displayName ?? null, at: state.lastChange.at } : null
    };
  }

  async function change(input: { familyId: string; weekStartsOn: string }, apply: (state: ListState) => void) {
    check(input);
    await wait();
    const state = stateOf(input.weekStartsOn);
    apply(state);
    state.lastChange = { userId: deps.userId, at: new Date().toISOString() };
    deps.data.revision += 1;
    return { version: version(deps.data.revision), data: view(input.weekStartsOn) };
  }

  const area: Api['shopping'] = {
    async getWeekList(input) {
      check(input);
      await wait();
      return { unchanged: false, version: version(deps.data.revision), data: view(input.weekStartsOn) };
    },
    setItemChecked: (input) =>
      change(input, (state) => {
        const key = itemKey(input.ingredientId, input.varietyKey);
        if (input.checked && input.quantityAtCheck) state.checks.set(key, { ingredientId: input.ingredientId, varietyKey: input.varietyKey, quantityAtCheck: input.quantityAtCheck });
        else state.checks.delete(key);
      }),
    setAddedBack: (input) =>
      change(input, (state) => {
        const key = itemKey(input.ingredientId, input.varietyKey);
        if (input.addedBack) state.addedBack.add(key);
        else state.addedBack.delete(key);
      }),
    addFreeItem: (input) =>
      change(input, (state) => {
        const text = input.text.trim().replace(/\s+/g, ' ');
        if (!text || text.length > 60) throw new ApiError('invalid');
        if (!state.freeItems.some((f) => f.id === input.id)) state.freeItems.push({ id: input.id, text, checked: false });
      }),
    setFreeItemChecked: (input) =>
      change(input, (state) => {
        const found = state.freeItems.find((f) => f.id === input.itemId);
        if (!found) throw new ApiError('not_found');
        found.checked = input.checked;
      }),
    removeFreeItem: (input) =>
      change(input, (state) => {
        state.freeItems = state.freeItems.filter((f) => f.id !== input.itemId);
      }),
    async exportList(input) {
      check(input);
      await wait();
      return listExport(view(input.weekStartsOn));
    },
    async createBringLink(input) {
      check(input);
      await wait();
      if (listExport(view(input.weekStartsOn)).lines.length === 0) throw new ApiError('invalid', { issues: [{ path: [], code: 'empty_list' }] });
      const page = encodeURIComponent(`${location.origin}/shopping-lists/fake-${crypto.randomUUID()}`);
      return { url: `https://api.getbring.com/rest/bringrecipes/deeplink?url=${page}&source=web`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    }
  };
  return area;
}

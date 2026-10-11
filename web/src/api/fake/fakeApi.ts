import { addDays, daysBetween, isMealPast, localNow, MEAL_PAST_AT, mondayOf, weekDates, type IsoDate, type LocalDateTime, type MealType } from '../../lib/calendar';
import type { Locale } from '../../i18n/translate';
import { isOnline } from '../../lib/connectivity';
import { ApiError } from '../errors';
import type { Api, IngredientLine, MealView, OpeningView, RatingSummary, Read, RecipeListItem, RecipeMealType, RecipeQuery, RecipeSummary, SourceType, ProteinGroup } from '../types';
import raw from './demo-data.json';
import { createFakeFamily, createFakeFamilyData, type FakeFamilyData } from './family';
import { formatAmount, scaleQuantity, type Quantity, type Translated } from './quantity';
import { DEMO_CHANGES, DEMO_FAMILY, DEMO_PEOPLE, DEMO_USER_ID, seedRatings, type DemoRating } from './seed';

export { DEMO_FAMILY_ID, DEMO_USER_ID } from './seed';

// FAKE client for tests and fake mode (spec "Client finto"). Same interface as the real one.
interface DemoRecipe {
  id: string; status: string; name: Translated; description: Translated; sourceType: SourceType; sourceUrl: string | null;
  bookId: string | null; bookPages: string | null; durationMinutes: number | null; baseServings: number | null;
  mealType: RecipeMealType; proteinGroup: ProteinGroup | null; addedOn: IsoDate;
  ingredients: { ingredientId: string; quantity: Quantity; sourceText: string; text: Translated | null; isOptional: boolean }[];
}
interface DemoSlot {
  id: string; date: IsoDate; mealType: MealType; recipeId: string | null; freeText: string | null; servings: number;
  note: string | null; updatedBy: string | null; updatedAt: LocalDateTime | null;
}
interface DemoWeek { startsOn: IsoDate; generatedAt: LocalDateTime; slots: DemoSlot[] }

const data = raw as unknown as {
  books: { id: string; title: string }[];
  ingredients: { id: string; name: Translated }[];
  recipes: DemoRecipe[];
  weeks: { startsOn: IsoDate; generatedAt: LocalDateTime; slots: Omit<DemoSlot, 'updatedBy' | 'updatedAt'>[] }[];
  federicoRatings: { recipeId: string; stars: number }[];
};

const DEMO_CURRENT_WEEK = '2026-10-05';
const MEAL_ORDER: Record<MealType, number> = { lunch: 0, dinner: 1 };

export interface FakeApiOptions {
  getLocale: () => Locale;
  user?: { id: string; email: string };
  latencyMs?: number;
  /** State shared with the clients of the other languages; a fresh one when missing. */
  data?: FakeData;
}

/** What the fake backend remembers for one session: menus, recipes, ratings and the version counter. */
export interface FakeData {
  readonly user: { id: string; email: string } | undefined;
  readonly weeks: DemoWeek[];
  readonly recipes: DemoRecipe[];
  readonly ratings: DemoRating[];
  /** Grows at every rating: stands for the family counter of the real versions. */
  revision: number;
  /** What the person changed in the profile; missing values come from the demo people. */
  readonly profile: { displayName?: string; locale?: Locale };
  /** The demo family's name, units, time zone, settings and exclusions. */
  readonly family: FakeFamilyData;
}

const shiftTime = (time: LocalDateTime, days: number) => `${addDays(time.slice(0, 10), days)}${time.slice(10)}`;
const localized = (text: Translated, locale: Locale) => text[locale] ?? text['it-IT'];
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
/** The instant a wall-clock time happens in a time zone, as ISO: the Worker sends it as `passesAt`. */
function zonedInstant(local: LocalDateTime, timeZone: string): string {
  const asUtc = Date.parse(`${local}:00Z`);
  let instant = asUtc;
  // Two rounds settle the offset also next to a change of daylight saving time.
  for (let round = 0; round < 2; round++) instant = asUtc - (Date.parse(`${localNow(timeZone, new Date(instant))}:00Z`) - instant);
  return new Date(instant).toISOString();
}
// Descending order with missing values last.
const desc = <T extends string | number>(a: T | null, b: T | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? 1 : -1);

export function createFakeData(user?: { id: string; email: string }): FakeData {
  // The demo week of 5 October 2026 becomes the current week, so there is always a menu for today.
  const offset = daysBetween(DEMO_CURRENT_WEEK, mondayOf(localNow(DEMO_FAMILY.timeZone).slice(0, 10)));
  const weeks: DemoWeek[] = data.weeks.map((w) => ({
    startsOn: addDays(w.startsOn, offset),
    generatedAt: shiftTime(w.generatedAt, offset),
    slots: w.slots.map((s) => {
      const change = DEMO_CHANGES.find((c) => c.slotId === s.id);
      return {
        ...s,
        date: addDays(s.date, offset),
        note: change?.note ?? s.note,
        updatedBy: change?.updatedBy ?? null,
        updatedAt: change ? shiftTime(change.updatedAt, offset) : null
      };
    })
  }));
  const recipes = data.recipes.map((r) => ({ ...r, addedOn: addDays(r.addedOn, offset) }));
  return { user, weeks, recipes, ratings: seedRatings(data.federicoRatings), revision: 1, profile: {}, family: createFakeFamilyData() };
}

/**
 * One fake backend per session, one client per language on top of it (PR review, C13): the
 * language stays fixed per request, ratings and versions are the same in every language.
 */
export function fakeClients(options: { latencyMs?: number } = {}) {
  return (user: { id: string; email: string } | null) => {
    const shared = createFakeData(user ?? undefined);
    return (locale: Locale) => createFakeApi({ getLocale: () => locale, data: shared, latencyMs: options.latencyMs });
  };
}

export function createFakeApi(options: FakeApiOptions): Api {
  const now = () => localNow(DEMO_FAMILY.timeZone);
  const state = options.data ?? createFakeData(options.user);
  const { weeks, recipes, ratings } = state;
  const user = state.user;
  const userId = user?.id ?? DEMO_USER_ID;
  const memberIds = new Set([...DEMO_PEOPLE.map((p) => p.id), userId]);

  async function respond<T>(value: T): Promise<Read<T>> {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    // Opaque and composite like W1's versions (family, counter, language, deploy); the web never parses it.
    const version = `family:${DEMO_FAMILY.id}|rev:${state.revision}|lang:${options.getLocale()}|deploy:fake`;
    return { unchanged: false, version, data: structuredClone(value) };
  }
  async function delayed<T>(value: T): Promise<T> {
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    return structuredClone(value);
  }
  // Same shape as the contract's profile.get (W2): not versioned.
  function profileView() {
    const person = DEMO_PEOPLE.find((p) => p.id === userId);
    const email = user?.email ?? person?.email ?? '';
    const fromEmail = email.split('@')[0] ?? '';
    return {
      user: {
        id: userId,
        displayName: state.profile.displayName ?? person?.displayName ?? (fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1)),
        email,
        locale: state.profile.locale ?? person?.locale ?? options.getLocale(),
        globalRoles: []
      },
      families: [{ id: DEMO_FAMILY.id, name: state.family.name, timeZone: state.family.timeZone, measurementSystem: state.family.measurementSystem, role: person?.role ?? 'member' }],
      currentFamilyId: DEMO_FAMILY.id
    } satisfies Awaited<ReturnType<Api['profile']['get']>>;
  }
  function checkFamily(familyId: string) {
    if (familyId !== DEMO_FAMILY.id) throw new ApiError('forbidden');
  }
  const visibleWeeks = () => weeks.filter((w) => w.generatedAt <= now()).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const published = (id: string) => recipes.find((r) => r.id === id && r.status === 'published') ?? null;

  function ratingSummary(recipeId: string): RatingSummary {
    const family = ratings.filter((r) => r.recipeId === recipeId && memberIds.has(r.userId));
    const total = family.reduce((sum, r) => sum + r.stars, 0);
    return {
      familyAverage: family.length ? total / family.length : null,
      familyCount: family.length,
      myStars: family.find((r) => r.userId === userId)?.stars ?? null
    };
  }
  function summary(recipe: DemoRecipe, locale: Locale): RecipeSummary {
    // Like the server (W6): a never-published recipe shows its name and description only.
    if (recipe.status === 'draft') {
      return {
        id: recipe.id, name: localized(recipe.name, locale), description: localized(recipe.description, locale) || null,
        durationMinutes: null, sourceType: null, sourceUrl: null, bookTitle: null, bookPages: null, mealType: null, proteinGroup: null
      };
    }
    return {
      id: recipe.id, name: localized(recipe.name, locale), description: localized(recipe.description, locale),
      durationMinutes: recipe.durationMinutes, sourceType: recipe.sourceType, sourceUrl: recipe.sourceUrl,
      bookTitle: data.books.find((b) => b.id === recipe.bookId)?.title ?? null, bookPages: recipe.bookPages,
      mealType: recipe.mealType, proteinGroup: recipe.proteinGroup
    };
  }
  function lines(recipe: DemoRecipe, servings: number, locale: Locale): IngredientLine[] | null {
    if (!recipe.baseServings || recipe.ingredients.length === 0) return null;
    const factor = servings / recipe.baseServings;
    return recipe.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      name: localized(data.ingredients.find((i) => i.id === line.ingredientId)?.name ?? { 'it-IT': line.ingredientId, 'en-GB': null }, locale),
      amount: formatAmount(scaleQuantity(line.quantity, factor), line.sourceText, line.text, locale),
      preparation: null,
      optional: line.isOptional
    }));
  }
  function pastMeals(recipeId: string) {
    return visibleWeeks().flatMap((w) => w.slots).filter((s) => s.recipeId === recipeId && isMealPast(s.date, s.mealType, now()));
  }
  /** Every planned meal not yet past, soonest first, with the instant it passes (contract of W6). */
  function upcomingMeals(recipeId: string) {
    return visibleWeeks().flatMap((w) => w.slots)
      .filter((s) => s.recipeId === recipeId && !isMealPast(s.date, s.mealType, now()))
      .sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])
      .map((s) => ({ date: s.date, mealType: s.mealType, passesAt: zonedInstant(`${s.date}T${MEAL_PAST_AT[s.mealType]}`, DEMO_FAMILY.timeZone) }));
  }
  function mealView(slot: DemoSlot, locale: Locale): MealView {
    const recipe = slot.recipeId ? recipes.find((r) => r.id === slot.recipeId) ?? null : null;
    const isPublished = recipe?.status === 'published';
    const author = slot.updatedBy ? DEMO_PEOPLE.find((p) => p.id === slot.updatedBy)?.displayName ?? null : null;
    return {
      slotId: slot.id, date: slot.date, mealType: slot.mealType,
      kind: recipe ? 'recipe' : slot.freeText ? 'free' : 'empty',
      recipe: recipe ? summary(recipe, locale) : null, freeText: slot.freeText, servings: slot.servings,
      ingredients: recipe ? lines(recipe, slot.servings, locale) : null, note: slot.note,
      rating: recipe && isPublished ? ratingSummary(recipe.id) : null,
      canOpenRecipe: isPublished,
      lastChange: slot.updatedBy && slot.updatedAt ? { userName: author, at: slot.updatedAt } : null
    };
  }
  function matches(recipe: DemoRecipe, locale: Locale, needle: string) {
    if (!needle) return true;
    const names = recipe.ingredients.map((l) => localized(data.ingredients.find((i) => i.id === l.ingredientId)?.name ?? { 'it-IT': '', 'en-GB': null }, locale));
    return [localized(recipe.name, locale), localized(recipe.description, locale), ...names].some((t) => normalize(t).includes(needle));
  }

  const api: Api = {
    session: {
      // Same shape as the contract's answer; the real one comes from the Worker.
      async whoami() {
        return { userId, channel: 'web', clientId: null, locale: options.getLocale() };
      }
    },
    profile: {
      async get() {
        return delayed(profileView());
      },
      async update({ displayName, locale }) {
        const name = displayName?.trim();
        if ((displayName === undefined && locale === undefined) || (name !== undefined && (name.length < 1 || name.length > 60))) {
          throw new ApiError('invalid');
        }
        if (name !== undefined) state.profile.displayName = name;
        if (locale !== undefined) state.profile.locale = locale;
        return delayed(profileView());
      },
      // One demo family: choosing another one is choosing a family the person is not in.
      async setCurrentFamily({ familyId }) {
        checkFamily(familyId);
        return delayed(profileView());
      }
    },
    family: createFakeFamily({
      data: state.family,
      userId,
      role: DEMO_PEOPLE.find((p) => p.id === userId)?.role ?? 'member',
      displayName: () => profileView().user.displayName,
      locale: options.getLocale,
      books: data.books,
      ingredients: data.ingredients,
      recipeName: (recipeId, locale) => {
        const recipe = recipes.find((r) => r.id === recipeId);
        return recipe ? localized(recipe.name, locale) : null;
      },
      checkFamily,
      respond,
      delayed,
      bump: () => void (state.revision += 1)
    }),
    menu: {
      async getOpening({ familyId, today: requested }) {
        checkFamily(familyId);
        const visible = visibleWeeks();
        if (visible.length === 0) return respond<OpeningView>({ kind: 'no_weeks' });
        const today = requested ?? now().slice(0, 10);
        // Spec of the menu, 5.2: first day from today with content, then with any slot, then the last earlier day with a slot, then the latest Monday.
        const slots = visible.flatMap((w) => w.slots).sort((a, b) => a.date.localeCompare(b.date));
        const coming = slots.filter((s) => s.date >= today);
        const date =
          coming.find((s) => s.recipeId || s.freeText)?.date ?? coming[0]?.date ?? slots.filter((s) => s.date < today).at(-1)?.date ?? visible.at(-1)!.startsOn;
        return respond<OpeningView>({ kind: 'day', date, weekStartsOn: mondayOf(date) });
      },
      async getWeek({ familyId, weekStartsOn }) {
        checkFamily(familyId);
        const week = visibleWeeks().find((w) => w.startsOn === weekStartsOn);
        if (!week) throw new ApiError('not_found');
        const locale = options.getLocale();
        return respond({
          startsOn: week.startsOn,
          days: weekDates(week.startsOn).map((date) => ({
            date,
            meals: week.slots
              .filter((s) => s.date === date)
              .sort((a, b) => MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType])
              .map((s) => mealView(s, locale))
          }))
        });
      },
      async getDates({ familyId, month }) {
        checkFamily(familyId);
        const dates = new Set(visibleWeeks().flatMap((w) => w.slots.map((s) => s.date)).filter((d) => d.startsWith(month)));
        return respond([...dates].sort());
      }
    },
    recipes: {
      async search({ familyId, query }: { familyId: string; query: RecipeQuery }) {
        checkFamily(familyId);
        const locale = options.getLocale();
        const needle = normalize(query.text ?? '');
        const lastEaten = (id: string) => pastMeals(id).map((s) => s.date).sort().at(-1) ?? null;
        const items = recipes
          .filter((r) => r.status === 'published')
          .filter((r) => !query.mealType || r.mealType === query.mealType || r.mealType === 'both')
          .filter((r) => !query.maxMinutes || (r.durationMinutes !== null && r.durationMinutes <= query.maxMinutes))
          .filter((r) => !query.proteinGroup || r.proteinGroup === query.proteinGroup)
          .filter((r) => matches(r, locale, needle))
          .map((r) => ({
            r,
            item: {
              recipe: summary(r, locale), rating: ratingSummary(r.id), baseServings: r.baseServings ?? 1,
              ingredients: lines(r, r.baseServings ?? 1, locale) ?? [], addedOn: r.addedOn, lastEatenOn: lastEaten(r.id), upcoming: upcomingMeals(r.id)
            } satisfies RecipeListItem
          }))
          .filter(({ item }) => !query.minStars || (item.rating.familyAverage ?? 0) >= query.minStars)
          .sort((a, b) => {
            const byName = a.item.recipe.name.localeCompare(b.item.recipe.name, locale);
            const primary =
              query.sort === 'rating' ? desc(a.item.rating.familyAverage, b.item.rating.familyAverage)
              : query.sort === 'added' ? desc(a.r.addedOn, b.r.addedOn)
              : query.sort === 'lastEaten' ? desc(a.item.lastEatenOn, b.item.lastEatenOn)
              : 0;
            return primary || byName;
          })
          .map(({ item }) => item);
        return respond({ items: query.reversed ? items.reverse() : items });
      },
      // slotId is accepted and ignored: versions of past meals arrive with wave 2.
      async get({ familyId, recipeId, servings }) {
        checkFamily(familyId);
        const recipe = published(recipeId);
        if (!recipe) throw new ApiError('not_found');
        const locale = options.getLocale();
        const base = recipe.baseServings;
        const chosen = servings && Number.isInteger(servings) && servings > 0 && servings <= 50 ? servings : (base ?? 1);
        return respond({
          recipe: summary(recipe, locale), status: 'published' as const, baseServings: base ?? chosen, servings: chosen,
          ingredients: lines(recipe, chosen, locale) ?? [], rating: ratingSummary(recipe.id),
          history: pastMeals(recipe.id)
            .sort((a, b) => b.date.localeCompare(a.date) || MEAL_ORDER[b.mealType] - MEAL_ORDER[a.mealType])
            .slice(0, 5)
            .map((s) => ({ date: s.date, mealType: s.mealType })),
          upcoming: upcomingMeals(recipe.id)
        });
      }
    },
    ratings: {
      async set({ familyId, recipeId, stars }) {
        checkFamily(familyId);
        if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) throw new ApiError('invalid');
        if (!published(recipeId)) throw new ApiError('not_found');
        if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
        const index = ratings.findIndex((r) => r.userId === userId && r.recipeId === recipeId);
        if (stars === null) {
          if (index !== -1) ratings.splice(index, 1);
        } else if (index === -1) ratings.push({ userId, recipeId, stars });
        else ratings[index]!.stars = stars;
        state.revision += 1;
        return ratingSummary(recipeId);
      }
    }
  };
  return withTransport(api);
}

/** Every method fails with `network` while the device is offline, before touching any data. */
function withTransport(api: Api): Api {
  const wrap = <T extends object>(area: T): T =>
    Object.fromEntries(
      Object.entries(area).map(([name, method]) => [
        name,
        (...args: unknown[]) => (isOnline() ? (method as (...a: unknown[]) => Promise<unknown>)(...args) : Promise.reject(new ApiError('network')))
      ])
    ) as T;
  return { session: wrap(api.session), profile: wrap(api.profile), family: wrap(api.family), menu: wrap(api.menu), recipes: wrap(api.recipes), ratings: wrap(api.ratings) };
}

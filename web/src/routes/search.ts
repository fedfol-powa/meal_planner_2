import { PROTEIN_GROUPS, type ProteinGroup, type RecipeQuery } from '../api/types';
import { isIsoDate, type IsoDate, type MealType } from '../lib/calendar';

// TanStack Router parses search values as JSON: numbers may arrive as numbers or strings.
/** `welcome`: just after the wizard of a new family (spec W9), until the card is closed. */
export interface MenuSearch { day?: IsoDate; welcome?: true }
/** `granted`: the global roles an invitation just gave, told once by the wizard (spec W9). */
export interface NewFamilySearch { granted?: ('recipe_curator' | 'app_admin')[] }
export interface RecipesSearch {
  q?: string; meal?: MealType; time?: number; group?: ProteinGroup; rating?: number;
  sort?: 'rating' | 'added' | 'lastEaten'; dir?: 'reverse';
}
export interface RecipeSearch { servings?: number; from?: 'menu' | 'recipes'; day?: IsoDate; slot?: string }
/** `email`: written in advance, e.g. after an invitation whose automatic sign-in failed (spec W9). */
export interface LoginSearch { redirect?: string; email?: string }
/** `family`: the family to delete (spec W11); the link of the settings and of the agents. */
export interface FamilyDeleteSearch { family?: string }

const SORTS = ['rating', 'added', 'lastEaten'] as const;
const MEALS = ['lunch', 'dinner'] as const;

function positiveInt(value: unknown, max: number): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
}
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.includes(value as T) ? (value as T) : undefined;
// Drops undefined fields so URLs and comparisons stay clean (not for validators, see below).
const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

// Validators keep every key, undefined when invalid: the router merges the raw search of the
// parent route into the child's, so a dropped key would let the raw value through.
export function validateMenuSearch(raw: Record<string, unknown>): MenuSearch {
  return { day: isIsoDate(raw.day) ? raw.day : undefined, welcome: raw.welcome === true || raw.welcome === 'true' ? true : undefined };
}

export function validateNewFamilySearch(raw: Record<string, unknown>): NewFamilySearch {
  // Written as `a,b` by the invitation page; the router may store it back as an array.
  const roles: unknown[] = typeof raw.granted === 'string' ? raw.granted.split(',') : Array.isArray(raw.granted) ? raw.granted : [];
  const granted = (['recipe_curator', 'app_admin'] as const).filter((role) => roles.includes(role));
  return { granted: granted.length ? granted : undefined };
}

export function validateRecipesSearch(raw: Record<string, unknown>): RecipesSearch {
  return {
    q: typeof raw.q === 'string' && raw.q !== '' ? raw.q : undefined,
    meal: oneOf(MEALS, raw.meal),
    time: positiveInt(raw.time, 600),
    group: oneOf(PROTEIN_GROUPS, raw.group),
    rating: positiveInt(raw.rating, 5),
    sort: oneOf(SORTS, raw.sort),
    dir: raw.dir === 'reverse' ? ('reverse' as const) : undefined
  };
}

export function validateRecipeSearch(raw: Record<string, unknown>): RecipeSearch {
  return {
    servings: positiveInt(raw.servings, 50),
    from: oneOf(['menu', 'recipes'] as const, raw.from),
    day: isIsoDate(raw.day) ? raw.day : undefined,
    // Meal the recipe was opened from: the hook for past versions (spec R1, wave 2).
    slot: typeof raw.slot === 'string' && /^[\w-]{1,80}$/.test(raw.slot) ? raw.slot : undefined
  };
}

export function validateLoginSearch(raw: Record<string, unknown>): LoginSearch {
  const target = raw.redirect;
  const local = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login');
  const email = typeof raw.email === 'string' && raw.email.length <= 320 ? raw.email : undefined;
  return { redirect: local ? target : undefined, email };
}

export function toRecipeQuery(search: RecipesSearch): RecipeQuery {
  return compact({
    text: search.q, mealType: search.meal, maxMinutes: search.time, proteinGroup: search.group,
    minStars: search.rating, sort: search.sort, reversed: search.dir === 'reverse' ? true : undefined
  });
}

export function toRecipesSearch(query: RecipeQuery): RecipesSearch {
  return compact({
    q: query.text || undefined, meal: query.mealType, time: query.maxMinutes, group: query.proteinGroup,
    rating: query.minStars, sort: query.sort === 'name' ? undefined : query.sort,
    dir: query.reversed ? ('reverse' as const) : undefined
  });
}

export function validateFamilyDeleteSearch(raw: Record<string, unknown>): FamilyDeleteSearch {
  return { family: typeof raw.family === 'string' && raw.family !== '' ? raw.family : undefined };
}

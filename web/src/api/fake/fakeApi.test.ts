import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../../i18n/translate';
import { ApiError } from '../errors';
import { setOnline } from '../../test/connectivity';
import type { Read } from '../types';
import { createFakeApi, DEMO_FAMILY_ID, fakeClients } from './fakeApi';
import { recipeDetailView, recipeListItemView } from '@app/contract';
import { PROTEIN_GROUPS } from '../types';

/** Differences from the contract's schema, except the demo ids, which are readable slugs instead of uuids. */
const contractIssues = (schema: typeof recipeListItemView | typeof recipeDetailView, value: unknown) => {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => !(issue.code === 'invalid_format' && (issue as { format?: string }).format === 'uuid'))
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

const data = <T,>(read: Read<T>): T => {
  if (read.unchanged) throw new Error('fake reads are never unchanged');
  return read.data;
};

let locale: Locale = 'it-IT';
const api = () => createFakeApi({ getLocale: () => locale, latencyMs: 0 });
const familyId = DEMO_FAMILY_ID;

beforeEach(() => {
  locale = 'it-IT';
  vi.useFakeTimers({ toFake: ['Date'] });
  // Thursday 8 October 2026, 12:00 in Rome: the demo week of 5 October is the current one (no shift).
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('fake api', () => {
  it('opens on today and shifts the demo weeks to the current week', async () => {
    expect(data(await api().menu.getOpening({ familyId }))).toEqual({ kind: 'day', date: '2026-10-08', weekStartsOn: '2026-10-05' });
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    const week = data(await api().menu.getWeek({ familyId, weekStartsOn: '2026-11-02' }));
    expect(week.days.map((d) => d.date)[0]).toBe('2026-11-02');
    expect(week.days.flatMap((d) => d.meals).length).toBeGreaterThan(0);
  });
  it('rejects unknown weeks and other families', async () => {
    await expect(api().menu.getWeek({ familyId, weekStartsOn: '2030-01-07' })).rejects.toEqual(new ApiError('not_found'));
    await expect(api().menu.getOpening({ familyId: 'family-other' })).rejects.toEqual(new ApiError('forbidden'));
  });
  it('shows changes, notes and former members on meals', async () => {
    const week = data(await api().menu.getWeek({ familyId, weekStartsOn: '2026-10-05' }));
    const meals = week.days.flatMap((d) => d.meals);
    expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.lastChange).toEqual({ userName: 'Anna', at: '2026-10-02T21:30' });
    expect(meals.find((m) => m.slotId === '2026-10-08-lunch')?.note).toBe('Doppia dose, avanza per venerdì');
    expect(meals.find((m) => m.slotId === '2026-10-07-lunch')?.lastChange?.userName).toBeNull();
  });
  it('lists the days with a menu in a month', async () => {
    const dates = data(await api().menu.getDates({ familyId, month: '2026-10' }));
    expect(dates).toContain('2026-10-05');
    expect(dates).toContain('2026-10-18');
    expect(dates.every((d) => d.startsWith('2026-10'))).toBe(true);
  });
  it('searches by ingredient in the user language and filters by time', async () => {
    locale = 'en-GB';
    const found = data(await api().recipes.search({ familyId, query: { text: 'basmati' } })).items;
    expect(found.map((i) => i.recipe.id)).toContain('wok-pollo-peperoni-riso-basmati');
    expect(found[0]?.recipe.name).toMatch(/[A-Za-z]/);
    const quick = data(await api().recipes.search({ familyId, query: { text: 'basmati', maxMinutes: 20 } })).items;
    expect(quick.map((i) => i.recipe.id)).not.toContain('wok-pollo-peperoni-riso-basmati');
  });
  it('sorts by rating and reverses the order', async () => {
    const byRating = data(await api().recipes.search({ familyId, query: { sort: 'rating' } })).items;
    const averages = byRating.map((i) => i.rating.familyAverage ?? 0);
    expect(averages).toEqual([...averages].sort((a, b) => b - a));
    const reversed = data(await api().recipes.search({ familyId, query: { sort: 'rating', reversed: true } })).items;
    expect(reversed.map((i) => i.recipe.id)).toEqual(byRating.map((i) => i.recipe.id).reverse());
  });
  it('answers the search in the shape of the contract, with the planned meals still to come', async () => {
    const { items } = data(await api().recipes.search({ familyId, query: {} }));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(contractIssues(recipeListItemView, item)).toEqual([]);
    const groups = new Set(items.map((i) => i.recipe.proteinGroup));
    expect([...groups].every((g) => g === null || (PROTEIN_GROUPS as readonly string[]).includes(g))).toBe(true);
    // Thursday 8 October, 12:00 in Rome: today's lunch passes at 15:30 local time.
    const planned = items.flatMap((i) => i.upcoming);
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((m) => Date.parse(m.passesAt) > Date.parse('2026-10-08T10:00:00Z'))).toBe(true);
    expect(planned.find((m) => m.date === '2026-10-08' && m.mealType === 'lunch')?.passesAt).toBe('2026-10-08T13:30:00.000Z');
    const wok = items.find((i) => i.recipe.id === 'wok-pollo-peperoni-riso-basmati')!;
    expect(wok.baseServings).toBe(6);
    expect(wok.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('filters by one of the eight protein groups', async () => {
    const { items } = data(await api().recipes.search({ familyId, query: { proteinGroup: 'red_meat' } }));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.recipe.proteinGroup === 'red_meat')).toBe(true);
  });
  it('answers the recipe detail in the shape of the contract', async () => {
    const detail = data(await api().recipes.get({ familyId, recipeId: 'omelette-spinaci-montasio' }));
    expect(contractIssues(recipeDetailView, detail)).toEqual([]);
    expect(detail.status).toBe('published');
    expect(detail.history.length).toBeLessThanOrEqual(5);
  });
  it('scales the recipe detail to the chosen servings', async () => {
    const detail = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', servings: 3 }));
    expect(detail.baseServings).toBe(6);
    expect(detail.servings).toBe(3);
    expect(detail.ingredients.find((i) => i.ingredientId === 'riso-basmati')?.amount).toBe('150 g');
    const fallback = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', servings: -2 }));
    expect(fallback.servings).toBe(6);
    await expect(api().recipes.get({ familyId, recipeId: 'nope' })).rejects.toEqual(new ApiError('not_found'));
  });
  it('sets and removes the own rating, updating the family average', async () => {
    const client = api();
    const recipeId = 'wok-pollo-peperoni-riso-basmati';
    const rated = await client.ratings.set({ familyId, recipeId, stars: 5 });
    expect(rated.myStars).toBe(5);
    const removed = await client.ratings.set({ familyId, recipeId, stars: null });
    expect(removed.myStars).toBeNull();
    expect(removed.familyCount).toBe(rated.familyCount - 1);
    await expect(client.ratings.set({ familyId, recipeId, stars: 6 })).rejects.toEqual(new ApiError('invalid'));
  });
  it('fails every call while the device is offline, like a real transport', async () => {
    const client = api();
    setOnline(false);
    await expect(client.menu.getOpening({ familyId })).rejects.toEqual(new ApiError('network'));
    await expect(client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 4 })).rejects.toEqual(new ApiError('network'));
    setOnline(true);
    expect((await client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 4 })).myStars).toBe(4);
  });
  it('answers with opaque composite versions that change with the data and the language', async () => {
    const client = api();
    const first = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05' });
    expect(typeof first.version).toBe('string');
    await client.ratings.set({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', stars: 2 });
    const second = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05', knownVersion: first.version });
    expect(second.version).not.toBe(first.version);
    locale = 'en-GB';
    const english = await client.menu.getWeek({ familyId, weekStartsOn: '2026-10-05' });
    expect(english.version).not.toBe(second.version);
  });
  it('accepts the meal reference when a recipe is opened from a meal', async () => {
    const detail = data(await api().recipes.get({ familyId, recipeId: 'wok-pollo-peperoni-riso-basmati', slotId: '2026-10-05-dinner' }));
    expect(detail.recipe.id).toBe('wok-pollo-peperoni-riso-basmati');
  });
  it('returns the signed-in user and the demo family', async () => {
    const me = data(await createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, user: { id: 'u-1', email: 'giulia@example.com' } }).me.get({}));
    expect(me.user).toMatchObject({ id: 'u-1', email: 'giulia@example.com', displayName: 'Giulia' });
    expect(me.currentFamilyId).toBe(familyId);
    expect(me.families[0]).toMatchObject({ name: 'Famiglia Folloni', timeZone: 'Europe/Rome' });
  });
});

describe('fake clients of one session (PR review, C13)', () => {
  it('share ratings and versions while each answers in its own language', async () => {
    const forLocale = fakeClients({ latencyMs: 0 })({ id: 'user-federico', email: 'federico@example.com' });
    const italian = forLocale('it-IT');
    const english = forLocale('en-GB');
    const recipeId = 'bistecche-tonno-skottle';
    await italian.ratings.set({ familyId, recipeId, stars: 1 });
    const read = await english.recipes.get({ familyId, recipeId });
    expect(data(read).rating.myStars).toBe(1);
    expect(data(read).recipe.name).toBe('Skottle tuna steaks');
    expect(read.unchanged ? '' : read.version).toContain('rev:2|lang:en-GB');
    expect(data(await italian.recipes.get({ familyId, recipeId })).recipe.name).toBe('Bistecche di tonno allo skottle');
    // Another session starts again from the demo data.
    const other = fakeClients({ latencyMs: 0 })({ id: 'user-federico', email: 'federico@example.com' })('it-IT');
    expect(data(await other.recipes.get({ familyId, recipeId })).rating.myStars).not.toBe(1);
  });
});

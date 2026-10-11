import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, createPersister, createQueryClient, persistOptions } from './persister';
import { queryKeys, recipeQuery, weekQuery, type Versioned } from './queries';
import { applyRating } from './ratings';
import type { Api, MealView, RatingSummary, Read, RecipeDetailView, RecipeListItem, WeekView } from './types';

const none: RatingSummary = { familyAverage: null, familyCount: 0, myStars: null };
const confirmed: RatingSummary = { familyAverage: 2, familyCount: 1, myStars: 2 };
const weekWith = (rating: RatingSummary): Versioned<WeekView> => ({
  version: 'v',
  data: { startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ recipe: { id: 'r1' }, rating } as MealView] }] }
});
const ratingIn = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<Versioned<WeekView>>(key)?.data.days[0]?.meals[0]?.rating;

describe('applyRating', () => {
  it('updates the views of the same family only and marks its lists as stale', async () => {
    const client = new QueryClient();
    const mine = queryKeys.week('f1', '2026-10-05', 'it-IT');
    const other = queryKeys.week('f2', '2026-10-05', 'it-IT');
    const detail = queryKeys.recipe('f1', 'r1', 'it-IT');
    const list = queryKeys.search('f1', { minStars: 3 }, 'it-IT');
    const otherList = queryKeys.search('f2', {}, 'it-IT');
    client.setQueryData(mine, weekWith(none));
    client.setQueryData(other, weekWith({ familyAverage: 5, familyCount: 3, myStars: null }));
    client.setQueryData<Versioned<RecipeDetailView>>(detail, { version: 'v', data: { recipe: { id: 'r1' }, rating: none } as RecipeDetailView });
    client.setQueryData<Versioned<RecipeListItem[]>>(list, { version: 'v', data: [] });
    client.setQueryData<Versioned<RecipeListItem[]>>(otherList, { version: 'v', data: [] });
    await applyRating(client, 'f1', 'r1', confirmed);
    expect(ratingIn(client, mine)).toEqual(confirmed);
    expect(ratingIn(client, other)).toEqual({ familyAverage: 5, familyCount: 3, myStars: null });
    expect(client.getQueryData<Versioned<RecipeDetailView>>(detail)?.data.rating).toEqual(confirmed);
    expect(client.getQueryState(list)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherList)?.isInvalidated).toBe(false);
  });
});

describe('reads pending while a rating is confirmed (second review, C5)', () => {
  const key = queryKeys.week('f1', '2026-10-05', 'it-IT');
  function pendingWeekRead(client: QueryClient) {
    let answer: (value: Read<WeekView>) => void = () => {};
    const getWeek = vi.fn(() => new Promise<Read<WeekView>>((resolve) => (answer = resolve)));
    const api = { menu: { getWeek } } as unknown as Api;
    const read = client.fetchQuery({ ...weekQuery({ api, queryClient: client, locale: 'it-IT' }, 'f1', '2026-10-05'), staleTime: 0 }).catch(() => undefined);
    return { getWeek, read, answer: (value: Read<WeekView>) => answer(value) };
  }
  it.each([
    ['a full answer', { unchanged: false as const, version: 'v1', data: weekWith(none).data }],
    ['an unchanged answer', { unchanged: true as const, version: 'v1' }]
  ])('keeps the confirmed rating when %s of an older read arrives, on disk too', async (_label, late) => {
    const client = createQueryClient();
    client.setQueryData(key, weekWith(none));
    const { getWeek, read, answer } = pendingWeekRead(client);
    await vi.waitFor(() => expect(getWeek).toHaveBeenCalledWith({ familyId: 'f1', weekStartsOn: '2026-10-05', knownVersion: 'v' }));
    await applyRating(client, 'f1', 'r1', confirmed);
    answer(late as Read<WeekView>);
    await read;
    expect(ratingIn(client, key)).toEqual(confirmed);
    // Saved and reopened offline: the confirmed rating survives.
    const store = createMemoryStore();
    const persister = createPersister(store, 'a');
    const { dehydrateOptions } = persistOptions(persister, 'b');
    await persistQueryClientSave({ queryClient: client, persister, buster: 'b', dehydrateOptions });
    const reopened = createQueryClient();
    await persistQueryClientRestore({ queryClient: reopened, persister, buster: 'b' });
    expect(ratingIn(reopened, key)).toEqual(confirmed);
  });
  it('starts again a cancelled read that had nothing to show yet', async () => {
    const client = createQueryClient();
    const getRecipe = vi.fn(() => new Promise<Read<RecipeDetailView>>(() => {}));
    const api = { recipes: { get: getRecipe } } as unknown as Api;
    const observer = new QueryObserver(client, recipeQuery({ api, queryClient: client, locale: 'it-IT' }, 'f1', 'r1'));
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(getRecipe).toHaveBeenCalledTimes(1));
    await applyRating(client, 'f1', 'r1', confirmed);
    await vi.waitFor(() => expect(getRecipe).toHaveBeenCalledTimes(2));
    unsubscribe();
  });
  it('applies nothing when the request is no longer current after the cancellation', async () => {
    const client = new QueryClient();
    client.setQueryData(key, weekWith(none));
    await applyRating(client, 'f1', 'r1', confirmed, () => false);
    expect(ratingIn(client, key)).toEqual(none);
  });
});

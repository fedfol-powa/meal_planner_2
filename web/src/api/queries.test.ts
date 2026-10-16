import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { familyOfKey, keepPreviousWithin, queryKeys, readThrough, weekQuery, type Versioned } from './queries';
import type { Api, Read, WeekView } from './types';

const key = queryKeys.week('f', '2026-10-05', 'it-IT');
// A realistic version from W1: family, counters, language and deploy, opaque to the web.
const V1 = 'family:f|counter:12|catalogue:40|lang:it-IT|deploy:2026-10-11T10:00Z';

describe('readThrough', () => {
  it('reads without a version when nothing is cached', async () => {
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: V1, data: 'week' }));
    expect(await readThrough(new QueryClient(), key, read)).toEqual({ version: V1, data: 'week', producedAt: expect.any(Number) });
    expect(read).toHaveBeenCalledWith(undefined);
  });
  it('sends the cached version back as is and keeps the cached view when unchanged', async () => {
    const client = new QueryClient();
    const cached: Versioned<string> = { version: V1, data: 'week' };
    client.setQueryData(key, cached);
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: true, version: V1 }));
    expect(await readThrough(client, key, read)).toBe(cached);
    expect(read).toHaveBeenCalledWith(V1);
  });
  it('takes the new view when it changed', async () => {
    const client = new QueryClient();
    client.setQueryData(key, { version: V1, data: 'old' });
    const read = vi.fn(async (): Promise<Read<string>> => ({ unchanged: false, version: `${V1}+1`, data: 'new' }));
    expect(await readThrough(client, key, read)).toEqual({ version: `${V1}+1`, data: 'new', producedAt: expect.any(Number) });
  });
  it('reads again without a version if the server answers unchanged but the cache is gone', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce({ unchanged: true, version: V1 })
      .mockResolvedValueOnce({ unchanged: false, version: V1, data: 'week' });
    expect(await readThrough(new QueryClient(), key, read)).toEqual({ version: V1, data: 'week', producedAt: expect.any(Number) });
    expect(read).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('readThrough with changes while the read is pending (second review, C5)', () => {
  it('returns the cache as it is after the answer, not the snapshot taken before', async () => {
    const client = new QueryClient();
    client.setQueryData(key, { version: V1, data: 'rating 4' });
    let answer: (value: Read<string>) => void = () => {};
    const pending = readThrough(client, key, () => new Promise<Read<string>>((resolve) => (answer = resolve)));
    // A confirmed rating patches the cached view meanwhile, keeping its version.
    client.setQueryData(key, { version: V1, data: 'rating 5' });
    answer({ unchanged: true, version: V1 });
    expect(await pending).toEqual({ version: V1, data: 'rating 5' });
  });
  it('asks for the full view when the cache moved to another version meanwhile', async () => {
    const client = new QueryClient();
    client.setQueryData(key, { version: V1, data: 'old' });
    const read = vi.fn()
      .mockImplementationOnce(async () => {
        client.setQueryData(key, { version: 'V2', data: 'other' });
        return { unchanged: true, version: V1 };
      })
      .mockResolvedValueOnce({ unchanged: false, version: 'V3', data: 'full' });
    expect(await readThrough(client, key, read)).toEqual({ version: 'V3', data: 'full', producedAt: expect.any(Number) });
    expect(read).toHaveBeenNthCalledWith(2, undefined);
  });
});

describe('keepPreviousWithin (second review, C7)', () => {
  const next = queryKeys.search('f', { text: 'riso' }, 'it-IT');
  const keep = keepPreviousWithin(next, ['familyId', 'locale']);
  it('keeps previous data only within the same view', () => {
    expect(keep('old', { queryKey: queryKeys.search('f', {}, 'it-IT') })).toBe('old');
    expect(keep('old', { queryKey: queryKeys.search('f', {}, 'en-GB') })).toBeUndefined();
    expect(keep('old', { queryKey: queryKeys.search('f2', {}, 'it-IT') })).toBeUndefined();
    expect(keep('old', { queryKey: queryKeys.week('f', '2026-10-05', 'it-IT') })).toBeUndefined();
    expect(keep('old', undefined)).toBeUndefined();
  });
  it('tells recipes and meals apart', () => {
    const detail = keepPreviousWithin(queryKeys.recipe('f', 'r1', 'it-IT', 4, 's1'), ['familyId', 'locale', 'recipeId', 'slotId']);
    expect(detail('old', { queryKey: queryKeys.recipe('f', 'r1', 'it-IT', 2, 's1') })).toBe('old');
    expect(detail('old', { queryKey: queryKeys.recipe('f', 'r2', 'it-IT', 4, 's1') })).toBeUndefined();
    expect(detail('old', { queryKey: queryKeys.recipe('f', 'r1', 'it-IT', 4, 's2') })).toBeUndefined();
  });
});

describe('query options', () => {
  it('carries the composite version from client to cache and back, unchanged included', async () => {
    const view = { startsOn: '2026-10-05', days: [] } as WeekView;
    const getWeek = vi.fn()
      .mockResolvedValueOnce({ unchanged: false, version: V1, data: view })
      .mockResolvedValueOnce({ unchanged: true, version: V1 });
    const api = { menu: { getWeek } } as unknown as Api;
    const queryClient = new QueryClient();
    const options = weekQuery({ api, queryClient, locale: 'it-IT' }, 'f', '2026-10-05');
    await queryClient.fetchQuery(options);
    await queryClient.fetchQuery({ ...options, staleTime: 0 });
    expect(getWeek).toHaveBeenNthCalledWith(1, { familyId: 'f', weekStartsOn: '2026-10-05', knownVersion: undefined });
    expect(getWeek).toHaveBeenNthCalledWith(2, { familyId: 'f', weekStartsOn: '2026-10-05', knownVersion: V1 });
    expect(queryClient.getQueryData<Versioned<WeekView>>(options.queryKey)).toEqual({ version: V1, data: view, producedAt: expect.any(Number) });
  });
  it('keeps languages and families apart in the keys', () => {
    expect(queryKeys.week('f', '2026-10-05', 'it-IT')).not.toEqual(queryKeys.week('f', '2026-10-05', 'en-GB'));
    expect(familyOfKey(queryKeys.search('f2', {}, 'en-GB'))).toBe('f2');
    expect(familyOfKey(queryKeys.profile('it-IT'))).toBeNull();
    expect(queryKeys.recipe('f', 'r', 'it-IT', 2, 'slot-1')[2]).toEqual({ familyId: 'f', recipeId: 'r', locale: 'it-IT', servings: 2, slotId: 'slot-1' });
  });
});

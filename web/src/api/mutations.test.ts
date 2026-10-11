import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './persister';
import { createSession } from '../session/session';
import { applyMutation, runAreaMutation, type MutationName } from './mutations';

const FAMILY = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const settingsKey = (familyId: string) => ['family', 'getSettings', { familyId, locale: 'it-IT' }];
const view = (servings: number) => ({ canEdit: true, settings: { slots: { lunch: [{ servings }] } }, books: [], restrictions: [] });

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** QueryClient and Session of the base, a language that can change, and the mutation logic without React. */
function harness() {
  const session = createSession('a', createMemoryStore());
  let locale = 'it-IT';
  return {
    client: session.queryClient,
    session,
    setLocale: (next: string) => (locale = next),
    run: <T,>(name: MutationName, familyId: string | undefined, call: () => Promise<T>) =>
      runAreaMutation({ queryClient: session.queryClient, session, currentLocale: () => locale }, name, familyId, call)
  };
}

describe('applying the answer of a mutation', () => {
  it('a read started before the mutation never overwrites its answer', async () => {
    const client = new QueryClient();
    const late = deferred<{ version: string; data: unknown }>();
    void client.fetchQuery({ queryKey: settingsKey(FAMILY), queryFn: () => late.promise }).catch(() => undefined);
    await applyMutation(client, { name: 'family.setMeal', familyId: FAMILY, locale: 'it-IT', view: view(3), sessionOpen: () => true, isLatest: () => true });
    late.resolve({ version: 'old', data: view(2) });
    await flush();
    expect(client.getQueryData(settingsKey(FAMILY))).toMatchObject({ data: view(3) });
  });

  it('two mutations of the same view: only the latest answer is written, the earlier one marks the view stale', async () => {
    const { client, run } = harness();
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const a = run('family.setMeal', FAMILY, () => first.promise);
    const b = run('family.setKnownNew', FAMILY, () => second.promise);
    second.resolve(view(4));
    await b;
    first.resolve(view(3)); // answered later, but started earlier
    await a;
    expect(client.getQueryData(settingsKey(FAMILY))).toMatchObject({ data: view(4) });
    expect(client.getQueryState(settingsKey(FAMILY))?.isInvalidated).toBe(true);
  });

  it('a superseded write still invalidates its dependencies', async () => {
    const { client, run } = harness();
    const shopping = ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-12', locale: 'it-IT' }];
    client.setQueryData(shopping, { version: 's1', data: {} });
    client.setQueryData(settingsKey(FAMILY), { version: 'v1', data: view(2) });
    const avoid = deferred<unknown>();
    const meal = deferred<unknown>();
    const first = run('family.setIngredientRestriction', FAMILY, () => avoid.promise);
    const second = run('family.setMeal', FAMILY, () => meal.promise);
    meal.resolve(view(3));
    await second;
    avoid.resolve(view(2)); // older answer, arrives last: not written…
    await first;
    expect(client.getQueryData(settingsKey(FAMILY))).toMatchObject({ data: view(3) });
    expect(client.getQueryState(shopping)?.isInvalidated).toBe(true); // …but the avoided ingredient leaves the list
  });

  it.each(['signOut', 'language'] as const)('drops an answer after %s', async (close) => {
    const { client, session, setLocale, run } = harness();
    client.setQueryData(settingsKey(FAMILY), { version: 'v1', data: view(2) });
    const answer = deferred<unknown>();
    const done = run('family.setMeal', FAMILY, () => answer.promise);
    if (close === 'signOut') await session.close();
    else setLocale('en-GB');
    answer.resolve(view(3));
    await done;
    expect(client.getQueryData(settingsKey(FAMILY))).not.toMatchObject({ data: view(3) });
  });

  it('writes the profile as it is, without a version: the profile is not versioned', async () => {
    const { client, run } = harness();
    const profile = { user: { displayName: 'Fede' } };
    await run('profile.updateName', undefined, async () => profile);
    expect(client.getQueryData(['profile', 'get', { locale: 'it-IT' }])).toEqual(profile);
  });

  it('keeps the old version next to the new view, so the next read never gets a wrong «unchanged»', async () => {
    const client = new QueryClient();
    client.setQueryData(settingsKey(FAMILY), { version: 'v1', data: view(2) });
    await applyMutation(client, { name: 'family.setMeal', familyId: FAMILY, locale: 'it-IT', view: view(3), sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryData(settingsKey(FAMILY))).toEqual({ version: 'v1', data: view(3) });
  });

  it('marks exactly the reads of the table, of the same family only', async () => {
    const client = new QueryClient();
    const keys = {
      profile: ['profile', 'get', { locale: 'it-IT' }],
      week: ['menu', 'getWeek', { familyId: FAMILY, weekStartsOn: '2026-10-12', locale: 'it-IT' }],
      search: ['recipes', 'search', { familyId: FAMILY, query: {}, locale: 'it-IT' }],
      recipe: ['recipes', 'get', { familyId: FAMILY, recipeId: 'r', locale: 'it-IT' }],
      shopping: ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-12', locale: 'it-IT' }],
      otherWeek: ['menu', 'getWeek', { familyId: OTHER, weekStartsOn: '2026-10-12', locale: 'it-IT' }]
    };
    const stale = async (name: MutationName) => {
      client.clear();
      for (const key of Object.values(keys)) client.setQueryData(key, { version: 'v', data: {} });
      await applyMutation(client, { name, familyId: name.startsWith('profile.') ? undefined : FAMILY, locale: 'it-IT', view: {}, sessionOpen: () => true, isLatest: () => true });
      return Object.entries(keys).filter(([, key]) => client.getQueryState(key)?.isInvalidated).map(([key]) => key).sort();
    };
    expect(await stale('family.setMeal')).toEqual([]);
    expect(await stale('family.addExclusion')).toEqual([]);
    expect(await stale('family.setBookOwned')).toEqual(['recipe', 'search']);
    expect(await stale('family.setIngredientRestriction')).toEqual(['shopping']);
    expect(await stale('family.setTimeZone')).toEqual(['profile', 'recipe', 'shopping', 'week']);
    expect(await stale('family.setMeasurementSystem')).toEqual(['profile', 'recipe', 'search', 'shopping', 'week']);
    expect(await stale('family.rename')).toEqual(['profile']);
    expect(await stale('profile.updateLocale')).toEqual([]);
    expect(await stale('profile.setCurrentFamily')).toEqual([]);
    // The profile is the view written: every other query goes stale, of every family.
    expect(await stale('profile.updateName')).toEqual(['otherWeek', 'recipe', 'search', 'shopping', 'week']);
  });
});

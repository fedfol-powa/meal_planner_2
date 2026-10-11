import { contract } from '@app/contract';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { readThrough } from './queries';
import { createMemoryStore } from './persister';
import { createSession } from '../session/session';
import { applyMutation, runAreaMutation, runMealMutation, type MutationName } from './mutations';
import type { MealActionResult } from './types';

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

  it('keeps no version when none was cached, so the next read is valid for the contract (PR #21 review, finding 1)', async () => {
    const { client, run } = harness();
    const key = ['family', 'listExclusions', { familyId: FAMILY, locale: 'it-IT' }];
    await run('family.addExclusion', FAMILY, async () => []);
    expect(client.getQueryData(key)).toEqual({ data: [] });
    const inputs: unknown[] = [];
    const fresh = await readThrough(client, key, async (knownVersion) => {
      // The real input schema of the operation: an empty version would be refused here.
      inputs.push(contract.family.listExclusions['~orpc'].inputSchema!['~standard'].validate({ familyId: FAMILY, knownVersion }));
      return { unchanged: false, version: 'v2', data: [] };
    });
    expect(inputs).toEqual([{ value: { familyId: FAMILY } }]);
    expect(fresh).toEqual({ version: 'v2', data: [] });
  });

  it('makes the same view in the other languages stale, written or superseded (PR #21 review, finding 2)', async () => {
    const english = ['family', 'getSettings', { familyId: FAMILY, locale: 'en-GB' }];
    const otherFamily = ['family', 'getSettings', { familyId: OTHER, locale: 'en-GB' }];
    for (const superseded of [false, true]) {
      const { client, setLocale, run } = harness();
      client.setQueryData(english, { version: 'v1', data: view(2) });
      client.setQueryData(otherFamily, { version: 'v1', data: view(2) });
      const answer = deferred<unknown>();
      const done = run('family.setBookOwned', FAMILY, () => answer.promise);
      if (superseded) setLocale('en-GB');
      answer.resolve(view(3));
      await done;
      // Never the Italian answer in the English view, but read again.
      expect(client.getQueryData(english)).toEqual({ version: 'v1', data: view(2) });
      expect(client.getQueryState(english)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherFamily)?.isInvalidated).toBe(false);
    }
  });

  it('tells whether the answer was applied', async () => {
    const { run } = harness();
    const first = deferred<unknown>();
    const a = run('profile.updateLocale', undefined, () => first.promise);
    const b = await run('profile.updateLocale', undefined, async () => ({ n: 2 }));
    first.resolve({ n: 1 });
    expect(b.applied).toBe(true);
    expect((await a).applied).toBe(false);
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

const weekKey = (weekStartsOn: string, locale = 'it-IT') => ['menu', 'getWeek', { familyId: FAMILY, weekStartsOn, locale }];
const weekView = (servings: number) => ({ startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ slotId: 's', servings }] }] });
const suggestionsKey = (familyId = FAMILY) => ['meals', 'getSuggestions', { familyId, slotId: 's', offset: 0, locale: 'it-IT' }];

describe('meal mutations', () => {
  it('write the week of the meal, keep its version, make the dependent reads stale', async () => {
    const client = new QueryClient();
    client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    client.setQueryData(weekKey('2026-10-12'), { version: 'w2', data: weekView(9) });
    client.setQueryData(weekKey('2026-10-05', 'en-GB'), { version: 'w1en', data: weekView(2) });
    const stale = [
      ['menu', 'getOpening', { familyId: FAMILY, today: '2026-10-08', locale: 'it-IT' }],
      ['shopping', 'getWeekList', { familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT' }],
      ['recipes', 'get', { familyId: FAMILY, recipeId: 'r', locale: 'it-IT' }],
      ['recipes', 'search', { familyId: FAMILY, query: {}, locale: 'it-IT' }],
      suggestionsKey()
    ];
    for (const key of stale) client.setQueryData(key, { version: 'x', data: {} });
    client.setQueryData(suggestionsKey(OTHER), { recipes: [] });
    await applyMutation(client, { name: 'meals.setServings', familyId: FAMILY, weekStartsOn: '2026-10-05', locale: 'it-IT', view: weekView(4), sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryData(weekKey('2026-10-05'))).toEqual({ version: 'w1', data: weekView(4) });
    expect(client.getQueryState(weekKey('2026-10-12'))?.isInvalidated).toBe(false);
    expect(client.getQueryState(weekKey('2026-10-05', 'en-GB'))?.isInvalidated).toBe(true);
    for (const key of stale) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(suggestionsKey(OTHER))?.isInvalidated).toBe(false);
  });

  it.each([
    'family.addExclusion', 'family.removeExclusion', 'family.setMeal', 'family.addRule', 'family.removeRule',
    'family.setKnownNew', 'family.setGroupRange', 'family.setBookOwned', 'family.setIngredientRestriction'
  ] as const)('%s makes the suggestions stale', async (name) => {
    const client = new QueryClient();
    client.setQueryData(suggestionsKey(), { recipes: [] });
    await applyMutation(client, { name, familyId: FAMILY, locale: 'it-IT', view: {}, sessionOpen: () => true, isLatest: () => true });
    expect(client.getQueryState(suggestionsKey())?.isInvalidated).toBe(true);
  });

  it('a suggestions answer still in flight never lands after the confirmation', async () => {
    const client = new QueryClient();
    const late = deferred<unknown>();
    void client.fetchQuery({ queryKey: suggestionsKey(), queryFn: () => late.promise }).catch(() => undefined);
    await applyMutation(client, { name: 'family.addExclusion', familyId: FAMILY, locale: 'it-IT', view: [], sessionOpen: () => true, isLatest: () => true });
    late.resolve({ recipes: ['old'] });
    await flush();
    expect(client.getQueryData(suggestionsKey())).not.toEqual({ recipes: ['old'] });
  });

  it('a superseded answer of the same week is not written', async () => {
    const h = harness();
    h.client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    const deps = { queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' };
    const answer = (servings: number, actionId: string) => ({ week: weekView(servings), actionId, changed: true }) as unknown as MealActionResult;
    const slow = deferred<MealActionResult>();
    const first = runMealMutation(deps, 'meals.setServings', FAMILY, '2026-10-05', () => slow.promise);
    await runMealMutation(deps, 'meals.setNote', FAMILY, '2026-10-05', async () => answer(5, 'b'));
    slow.resolve(answer(3, 'a'));
    expect((await first).applied).toBe(false);
    expect((h.client.getQueryData(weekKey('2026-10-05')) as { data: unknown }).data).toEqual(weekView(5));
  });
});

import { contract } from '@app/contract';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { readThrough } from './queries';
import { createMemoryStore } from './persister';
import { createSession } from '../session/session';
import { applyMutation, runAreaMutation, runMealMutation, type MutationName } from './mutations';
import { confirmRating } from './ratings';
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
    run: <T,>(name: MutationName, familyId: string | undefined, call: () => Promise<T>, options?: { track?: string }) =>
      runAreaMutation({ queryClient: session.queryClient, session, currentLocale: () => locale }, name, familyId, call, options)
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
    expect(client.getQueryData(key)).toEqual({ data: [], producedAt: expect.any(Number) });
    const inputs: unknown[] = [];
    const fresh = await readThrough(client, key, async (knownVersion) => {
      // The real input schema of the operation: an empty version would be refused here.
      inputs.push(contract.family.listExclusions['~orpc'].inputSchema!['~standard'].validate({ familyId: FAMILY, knownVersion }));
      return { unchanged: false, version: 'v2', data: [] };
    });
    expect(inputs).toEqual([{ value: { familyId: FAMILY } }]);
    expect(fresh).toEqual({ version: 'v2', data: [], producedAt: expect.any(Number) });
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
    expect(client.getQueryData(settingsKey(FAMILY))).toEqual({ version: 'v1', data: view(3), producedAt: expect.any(Number) });
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
    expect(client.getQueryData(weekKey('2026-10-05'))).toEqual({ version: 'w1', data: weekView(4), producedAt: expect.any(Number) });
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

  it('an answer prepared before a confirmed rating never brings the old rating back (PR #33 review, 3)', async () => {
    const h = harness();
    const rated = (myStars: number) => ({
      startsOn: '2026-10-05',
      days: [{ date: '2026-10-05', meals: [{ slotId: 's', servings: 4, recipe: { id: 'r' }, rating: { familyAverage: myStars, familyCount: 1, myStars } }] }]
    });
    h.client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: rated(2) });
    const deps = { queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' };
    const slow = deferred<MealActionResult>();
    const servings = runMealMutation(deps, 'meals.setServings', FAMILY, '2026-10-05', () => slow.promise);
    await confirmRating(h.client, h.session, FAMILY, 'r', { familyAverage: 5, familyCount: 1, myStars: 5 });
    slow.resolve({ week: rated(2), actionId: 'a', changed: true } as unknown as MealActionResult);
    expect((await servings).applied).toBe(false);
    const cached = h.client.getQueryData(weekKey('2026-10-05')) as { data: ReturnType<typeof rated> };
    expect(cached.data.days[0]!.meals[0]!.rating.myStars).toBe(5);
    expect(h.client.getQueryState(weekKey('2026-10-05'))?.isInvalidated).toBe(true);
  });

  it('a meal answer started after the rating is written', async () => {
    const h = harness();
    h.client.setQueryData(weekKey('2026-10-05'), { version: 'w1', data: weekView(2) });
    await confirmRating(h.client, h.session, FAMILY, 'r', { familyAverage: 5, familyCount: 1, myStars: 5 });
    const deps = { queryClient: h.client, session: h.session, currentLocale: () => 'it-IT' };
    const result = await runMealMutation(deps, 'meals.setServings', FAMILY, '2026-10-05', async () => ({ week: weekView(3), actionId: 'a', changed: true }) as unknown as MealActionResult);
    expect(result.applied).toBe(true);
  });
});

describe('app invitation mutations', () => {
  const listKey = ['appInvitations', 'list', {}];

  it('invalidate the list and are applied while the session is open, also after a change of language', async () => {
    const { client, setLocale, run } = harness();
    client.setQueryData(listKey, { invitations: [] });
    const outcome = await run('appInvitations.create', undefined, async () => {
      setLocale('en-GB'); // the language changes while the request runs
      return { invitation: { id: 'i' }, url: 'https://app.test/invite/app#t' };
    });
    expect(outcome.applied).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('a late answer after the session closed is not applied', async () => {
    const { client, session, run } = harness();
    client.setQueryData(listKey, { invitations: [] });
    const outcome = await run('appInvitations.revoke', undefined, async () => {
      await session.close();
      return { invitation: { id: 'i' } };
    });
    expect(outcome.applied).toBe(false);
  });

  it('a superseded answer still makes the list stale', async () => {
    const { client, run } = harness();
    client.setQueryData(listKey, { invitations: [] });
    const answer = deferred<unknown>();
    const first = run('appInvitations.create', undefined, () => answer.promise);
    await run('appInvitations.create', undefined, async () => ({ invitation: { id: 'b' }, url: 'https://app.test/invite/app#b' }));
    client.setQueryData(listKey, { invitations: [] }); // read again meanwhile
    answer.resolve({ invitation: { id: 'a' }, url: 'https://app.test/invite/app#a' });
    await first;
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('family.create writes the profile view', async () => {
    const { client, run } = harness();
    const view = { user: { id: 'u' }, families: [{ id: 'f' }], currentFamilyId: 'f' };
    await run('family.create', undefined, async () => view);
    expect(client.getQueryData(['profile', 'get', { locale: 'it-IT' }])).toEqual(view);
  });
});

describe('user role mutations', () => {
  const detailKey = ['users', 'get', { id: 'u' }];
  const listKey = ['users', 'list', { query: '' }];
  const profileKey = ['profile', 'get', { locale: 'it-IT' }];
  const detail = (roles: string[]) => ({ user: { id: 'u', roles }, families: [] });

  it('read the users and the profile again; the registry never writes the answer itself', async () => {
    const { client, run } = harness();
    client.setQueryData(detailKey, detail([]));
    client.setQueryData(listKey, { users: [], more: false });
    client.setQueryData(profileKey, { user: { globalRoles: ['app_admin'] } });
    const outcome = await run('users.setRole', undefined, async () => detail(['recipe_curator']), { track: 'users:u' });
    expect(outcome.applied).toBe(true);
    expect(client.getQueryData(detailKey)).toEqual(detail([]));
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
  });

  it('answers in reverse order: only the latest for the same user is applied, both make the views stale', async () => {
    const { client, run } = harness();
    const older = deferred<ReturnType<typeof detail>>();
    const first = run('users.setRole', undefined, () => older.promise, { track: 'users:u' });
    const second = await run('users.setRole', undefined, async () => detail([]), { track: 'users:u' });
    expect(second.applied).toBe(true);
    client.setQueryData(detailKey, detail([])); // read again meanwhile
    older.resolve(detail(['recipe_curator']));
    const late = await first;
    expect(late.applied).toBe(false);
    expect(client.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  it('another user’s change does not supersede this one', async () => {
    const { run } = harness();
    const slow = deferred<ReturnType<typeof detail>>();
    const first = run('users.setRole', undefined, () => slow.promise, { track: 'users:u' });
    await run('users.setRole', undefined, async () => detail([]), { track: 'users:v' });
    slow.resolve(detail(['recipe_curator']));
    expect((await first).applied).toBe(true);
  });

  it('a late answer after the session closed is not applied', async () => {
    const { session, run } = harness();
    const outcome = await run('users.setRole', undefined, async () => {
      await session.close();
      return detail([]);
    }, { track: 'users:u' });
    expect(outcome.applied).toBe(false);
  });
});

describe('family management mutations (W11)', () => {
  const profileKey = ['profile', 'get', { locale: 'it-IT' }];
  const familyKey = ['family', 'get', { familyId: FAMILY, locale: 'it-IT' }];
  const linksKey = ['familyInvitations', 'list', { familyId: FAMILY }];
  const joinsKey = ['familyInvitations', 'listJoins', { familyId: FAMILY }];
  const profile = (current: string | null) => ({ user: { id: 'u' }, families: current ? [{ id: current }] : [], currentFamilyId: current });

  it('links: created and revoked links read the list again', async () => {
    const { client, run } = harness();
    client.setQueryData(linksKey, { invitations: [] });
    for (const name of ['familyInvitations.create', 'familyInvitations.revoke'] as const) {
      client.setQueryData(linksKey, { invitations: [] });
      expect((await run(name, FAMILY, async () => ({ invitations: [] }))).applied).toBe(true);
      expect(client.getQueryState(linksKey)?.isInvalidated).toBe(true);
    }
  });

  it('join, leave and delete write the profile from the answer', async () => {
    const { client, run } = harness();
    for (const name of ['family.join', 'family.leave', 'family.delete'] as const) {
      const view = profile(name === 'family.join' ? FAMILY : null);
      await run(name, name === 'family.join' ? undefined : FAMILY, async () => view);
      expect(client.getQueryData(profileKey)).toEqual(view);
    }
  });

  it('role changes and removals write the family and read the links and joins again', async () => {
    const { client, run } = harness();
    for (const name of ['family.setMemberRole', 'family.removeMember'] as const) {
      client.setQueryData(familyKey, { version: 'v1', data: { members: [] } });
      client.setQueryData(linksKey, { invitations: [] });
      client.setQueryData(joinsKey, { joins: [] });
      const view = { id: FAMILY, members: [{ userId: 'x' }] };
      await run(name, FAMILY, async () => view);
      expect(client.getQueryData(familyKey)).toEqual({ version: 'v1', data: view, producedAt: expect.any(Number) });
      expect(client.getQueryState(linksKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(joinsKey)?.isInvalidated).toBe(true);
    }
  });

  it('account.delete writes nothing; users.delete reads the users again', async () => {
    const { client, run } = harness();
    client.setQueryData(profileKey, profile(FAMILY));
    await run('account.delete', undefined, async () => ({ completed: true }));
    expect(client.getQueryData(profileKey)).toEqual(profile(FAMILY));
    const listKey = ['users', 'list', { query: '' }];
    client.setQueryData(listKey, { users: [], more: false });
    await run('users.delete', undefined, async () => ({ completed: true }), { track: 'users:x' });
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});

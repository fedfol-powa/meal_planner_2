import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, DEMO_FAMILY_ID } from '../../../api/fake/fakeApi';
import { runMealMutation } from '../../../api/mutations';
import type { MealActionResult } from '../../../api/types';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { useRemovePhoto, useUploadPhoto } from './usePhotoMutations';

const RECIPE = 'wok-pollo-peperoni-riso-basmati';
const WEEK = '2026-10-05';
const weekKey = ['menu', 'getWeek', { familyId: DEMO_FAMILY_ID, weekStartsOn: WEEK, locale: 'it-IT' }];
const week = (photoUrl: string | null) => ({
  startsOn: WEEK,
  days: [{ date: WEEK, meals: [{ slotId: 's', servings: 4, recipe: { id: RECIPE, photoUrl } }] }]
});
type Week = ReturnType<typeof week>;

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('photo mutations and meal answers (W12)', () => {
  it.each(['upload', 'remove'] as const)('a meal answer from before the photo %s does not overwrite the week', async (kind) => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const hooks: { upload?: ReturnType<typeof useUploadPhoto>; remove?: ReturnType<typeof useRemovePhoto> } = {};
    function Probe() {
      // The real hooks; the resize is the browser's job, out of this test.
      hooks.upload = useUploadPhoto(RECIPE, { resize: async (file) => file });
      hooks.remove = useRemovePhoto(RECIPE);
      return <p>ready</p>;
    }
    const view = renderWithProviders(<Probe />, { api });
    await screen.findByText('ready');
    const client = view.queryClient();
    const session = view.session();
    if (kind === 'remove') await api.catalogue.uploadPhoto({ id: crypto.randomUUID(), recipeId: RECIPE, file: new File(['x'], 'a.jpg') });
    const before = kind === 'upload' ? null : '/photos/before.webp';
    client.setQueryData(weekKey, { version: 'w1', data: week(before) });

    // A change of the meal leaves before the photo changes; its answer carries the old photo.
    const slow = deferred<MealActionResult>();
    const meal = runMealMutation({ queryClient: client, session, currentLocale: () => 'it-IT' }, 'meals.setServings', DEMO_FAMILY_ID, WEEK, () => slow.promise);

    await act(async () => {
      if (kind === 'upload') await hooks.upload!.mutateAsync(new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }));
      else await hooks.remove!.mutateAsync();
    });
    // The read again after the photo shows the new state.
    const after = kind === 'upload' ? '/photos/after.webp' : null;
    client.setQueryData(weekKey, { version: 'w2', data: week(after) });

    slow.resolve({ week: week(before), actionId: 'a', changed: true } as unknown as MealActionResult);
    expect((await meal).applied).toBe(false);
    expect((client.getQueryData(weekKey) as { data: Week }).data.days[0]!.meals[0]!.recipe.photoUrl).toBe(after);
    expect(client.getQueryState(weekKey)?.isInvalidated).toBe(true);
  });

  it('marks the recipe, menu, suggestion and catalogue reads stale', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    let upload: ReturnType<typeof useUploadPhoto> | undefined;
    function Probe() {
      upload = useUploadPhoto(RECIPE, { resize: async (file) => file });
      return <p>ready</p>;
    }
    const view = renderWithProviders(<Probe />, { api });
    await screen.findByText('ready');
    const client = view.queryClient();
    const keys = [
      ['recipes', 'get', { familyId: DEMO_FAMILY_ID, recipeId: RECIPE, locale: 'it-IT' }],
      ['recipes', 'search', { familyId: DEMO_FAMILY_ID, locale: 'it-IT' }],
      weekKey,
      ['meals', 'getSuggestions', { familyId: DEMO_FAMILY_ID, locale: 'it-IT' }],
      ['catalogue', 'overview', { locale: 'it-IT' }]
    ];
    for (const key of keys) client.setQueryData(key, { data: 'old' });
    await act(async () => {
      await upload!.mutateAsync(new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' }));
    });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  });

  it('sends a new id at each gesture and the resized image as a JPEG file', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const sent: { id: string; recipeId: string; file: File }[] = [];
    const original = api.catalogue.uploadPhoto;
    api.catalogue.uploadPhoto = async (input, options) => (sent.push(input as never), original(input, options));
    let upload: ReturnType<typeof useUploadPhoto> | undefined;
    const resized = new Blob(['small'], { type: 'image/jpeg' });
    function Probe() {
      upload = useUploadPhoto(RECIPE, { resize: async () => resized });
      return <p>ready</p>;
    }
    renderWithProviders(<Probe />, { api });
    await screen.findByText('ready');
    await act(async () => {
      await upload!.mutateAsync(new File(['big'], 'IMG.HEIC', { type: 'image/heic' }));
      await upload!.mutateAsync(new File(['big'], 'IMG.HEIC', { type: 'image/heic' }));
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.id).not.toBe(sent[1]!.id);
    expect(sent[0]!.recipeId).toBe(RECIPE);
    expect(sent[0]!.file.type).toBe('image/jpeg');
    expect(await sent[0]!.file.text()).toBe('small');
  });
});

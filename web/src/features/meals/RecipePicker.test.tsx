import { ORPCError } from '@orpc/server';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOnline } from '../../test/connectivity';
import { SERVER_RECIPE } from '../../test/rpcServer';
import { DINNER, realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const NAME = SERVER_RECIPE.recipe.name;

async function openPicker(card: RegExp, labels = { edit: 'Modifica il pasto', change: 'Cambia ricetta' }) {
  const article = await screen.findByRole('article', { name: card });
  fireEvent.click(within(article).getByRole('button', { name: labels.edit }));
  fireEvent.click(within(article).getByRole('button', { name: labels.change }));
  return { article, sheet: await screen.findByRole('dialog') };
}

/** A server answer held until the test releases it. */
function held<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((done) => (release = done));
  return { promise, release };
}

const suggestionsOf = (sheet: HTMLElement) => within(sheet).getByRole('region', { name: 'Suggerimenti' });
const visibleSkeleton = (root: HTMLElement) => root.querySelector('.skeleton[data-visible="true"]');
const page = (offset: number) => ({
  recipes: [{ recipe: { ...SERVER_RECIPE.recipe, id: `0b6f7c38-9f6e-4c51-9a3e-00000000000${offset}`, name: `Ricetta ${offset}` }, rating: SERVER_RECIPE.rating }],
  nextOffset: offset === 0 ? 5 : 0,
  freeTexts: []
});

describe('change recipe: suggestions while loading (W20)', () => {
  it('suggestions: skeleton of three cards while loading, cards on arrival', async () => {
    const { server } = realMealsApp();
    const answer = held<ReturnType<typeof page>>();
    server.answerMeals({ getSuggestions: () => answer.promise });
    const { sheet } = await openPicker(/Pizza/);
    const section = suggestionsOf(sheet);
    await waitFor(() => expect(visibleSkeleton(section)).not.toBeNull());
    expect(section.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(section.querySelectorAll('.skeleton .skeleton-card')).toHaveLength(3);
    expect(within(sheet).getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')).toHaveLength(1);
    await act(async () => answer.release(page(0)));
    expect(await within(section).findByRole('button', { name: 'Scegli Ricetta 0' })).toBeTruthy();
    expect(section.querySelector('.skeleton')).toBeNull();
    expect(section.querySelector('[aria-busy]')).toBeNull();
  });

  it('suggestions: no skeleton with the cached copy', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: () => page(0) });
    const { article, sheet } = await openPicker(/Pizza/);
    await within(sheet).findByRole('button', { name: 'Scegli Ricetta 0' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    server.answerMeals({ getSuggestions: () => new Promise(() => undefined) });
    if (!within(article).queryByRole('button', { name: 'Cambia ricetta' })) fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Cambia ricetta' }));
    const again = await screen.findByRole('dialog');
    expect(within(again).getByRole('button', { name: 'Scegli Ricetta 0' })).toBeTruthy();
    expect(suggestionsOf(again).querySelector('.skeleton')).toBeNull();
  });

  it('«Proponimene altri» to an unsaved page shows the skeleton, not an empty list', async () => {
    const { server } = realMealsApp();
    const next = held<ReturnType<typeof page>>();
    server.answerMeals({ getSuggestions: (input: { offset: number }) => (input.offset === 0 ? page(0) : next.promise) });
    const { sheet } = await openPicker(/Pizza/);
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Proponimene altri' }));
    const section = suggestionsOf(sheet);
    expect(section.querySelectorAll('.skeleton .skeleton-card')).toHaveLength(3);
    await waitFor(() => expect(visibleSkeleton(section)).not.toBeNull());
    await act(async () => next.release(page(5)));
    expect(await within(section).findByRole('button', { name: 'Scegli Ricetta 5' })).toBeTruthy();
  });

  it('no suggestions: the message keeps the space of the cards', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: () => ({ recipes: [], nextOffset: 0, freeTexts: [] }) });
    const { sheet } = await openPicker(/Pizza/);
    const section = suggestionsOf(sheet);
    const message = await within(section).findByText(/Nessun/);
    const reserve = message.closest('[data-reserve]')!;
    expect(reserve).not.toBeNull();
    expect(reserve.querySelectorAll('[aria-hidden="true"] .skeleton-card')).toHaveLength(3);
    expect(section.querySelector('[aria-busy]')).toBeNull();
    expect(within(sheet).queryAllByRole('status').some((s) => s.textContent === 'Caricamento…')).toBe(false);
  });

  it('suggestions error: the message keeps the space and the status is cleared', async () => {
    const { server } = realMealsApp();
    server.answerMeals({
      getSuggestions: () => {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
      }
    });
    const { sheet } = await openPicker(/Pizza/);
    const section = suggestionsOf(sheet);
    const alert = await within(section).findByRole('alert');
    expect(alert.closest('[data-reserve]')).not.toBeNull();
    expect(section.querySelector('.skeleton')).toBeNull();
    expect(section.querySelector('[aria-busy]')).toBeNull();
    expect(within(sheet).queryAllByRole('status').some((s) => s.textContent === 'Caricamento…')).toBe(false);
  });

  it('suggestions offline without a saved copy keep a still skeleton', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: (input: { offset: number }) => page(input.offset) });
    const { sheet } = await openPicker(/Pizza/);
    await within(sheet).findByRole('button', { name: 'Scegli Ricetta 0' });
    // Reading stays possible offline: the next page waits for the network.
    act(() => setOnline(false));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Proponimene altri' }));
    const section = suggestionsOf(sheet);
    await waitFor(() => expect(section.querySelector('.skeleton[data-paused="true"]')).not.toBeNull());
    act(() => setOnline(true));
    expect(await within(section).findByRole('button', { name: 'Scegli Ricetta 5' })).toBeTruthy();
    expect(section.querySelector('.skeleton')).toBeNull();
  });
});

describe('change recipe', () => {
  it('suggestions show the 3:1 photo banner when the recipe has a photo, and stay as before without', async () => {
    const { server } = realMealsApp();
    const other = { ...SERVER_RECIPE.recipe, id: '0b6f7c38-9f6e-4c51-9a3e-111111111111', name: 'Senza foto' };
    server.answerMeals({
      getSuggestions: () => ({
        recipes: [
          { recipe: { ...SERVER_RECIPE.recipe, photoUrl: '/photos/pasta.webp' }, rating: SERVER_RECIPE.rating },
          { recipe: other, rating: SERVER_RECIPE.rating }
        ],
        nextOffset: 0,
        freeTexts: []
      })
    });
    const { sheet } = await openPicker(/Pizza/);
    const withPhoto = (await within(sheet).findByRole('button', { name: `Scegli ${NAME}` })).closest('li')!;
    const img = withPhoto.querySelector('img.meal-photo')!;
    expect(img.getAttribute('src')).toBe('/photos/pasta.webp');
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe('3 / 1');
    // Inside the button only phrasing content: the banner is a span, never a div.
    expect(img.parentElement!.tagName).toBe('SPAN');
    expect(withPhoto.querySelector('button div')).toBeNull();
    const without = within(sheet).getByRole('button', { name: 'Scegli Senza foto' }).closest('li')!;
    expect(without.querySelector('img')).toBeNull();
  });

  it('suggestions with read-only stars; «Proponimene altri» changes page, not the meal', async () => {
    const { server } = realMealsApp();
    const { article, sheet } = await openPicker(new RegExp(NAME));
    await within(sheet).findByRole('button', { name: `Scegli ${NAME}` });
    expect(within(sheet).queryAllByRole('radio')).toHaveLength(0);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Proponimene altri' }));
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.getSuggestions').map((c) => c.input.offset)).toContain(5));
    expect(server.mealCalls.some((c) => c.op.startsWith('meals.set'))).toBe(false);
    expect(within(article).getByRole('heading', { level: 3 }).textContent).toContain(NAME);
  });

  it('choosing a suggestion changes the meal and closes the sheet', async () => {
    const { server } = realMealsApp();
    const { sheet } = await openPicker(/Pizza/);
    fireEvent.click(await within(sheet).findByRole('button', { name: `Scegli ${NAME}` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.mealCalls.find((c) => c.op === 'meals.setRecipe')?.input).toMatchObject({ slotId: DINNER, recipeId: SERVER_RECIPE.recipe.id });
  });

  it.each([
    ['it-IT', { edit: 'Modifica il pasto', change: 'Cambia ricetta', toggle: 'Filtri e ordinamento', group: 'Gruppo alimentare', pick: 'Scegli', none: 'Nessun voto' }],
    ['en-GB', { edit: 'Edit the meal', change: 'Change recipe', toggle: 'Filters and sorting', group: 'Food group', pick: 'Choose', none: 'No ratings' }]
  ] as const)('the search runs with filters only and shows the read-only rating (%s)', async (locale, l) => {
    const { server } = realMealsApp('/menu', { locale });
    const { sheet } = await openPicker(/Pizza/, l);
    fireEvent.click(within(sheet).getByRole('button', { name: l.toggle }));
    fireEvent.change(within(sheet).getByRole('combobox', { name: l.group }), { target: { value: 'legumes' } });
    await waitFor(() => expect(server.recipeCalls.find((c) => c.op === 'recipes.search')?.input).toMatchObject({ query: { proteinGroup: 'legumes' } }));
    const results = await within(sheet).findByRole('list', { name: /risultati|results/i });
    const row = within(results).getByRole('button', { name: `${l.pick} ${NAME}` }).closest('li')!;
    expect(within(row).getByLabelText(l.none)).toBeTruthy();
    expect(within(row).queryAllByRole('radio')).toHaveLength(0);
  });

  it('«Non proporre più» excludes, offers the undo in the sheet, keeps the meal until a choice', async () => {
    const { server } = realMealsApp();
    const { article, sheet } = await openPicker(new RegExp(NAME));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Non proporre più' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Annulla esclusione' }));
    await waitFor(() => expect(server.familySeen.map((c) => c.operation)).toEqual(expect.arrayContaining(['addExclusion', 'removeExclusion'])));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
    expect(within(article).getByRole('heading', { level: 3 }).textContent).toContain(NAME);
    expect(server.mealCalls.some((c) => c.op === 'meals.setRecipe')).toBe(false);
  });

  it('a recipe no longer available: sheet closed, week read once, the message stays in the menu (PR #33 review, 2)', async () => {
    const { server } = realMealsApp();
    server.answerMeals({
      setRecipe: () => {
        throw new ORPCError('not_found');
      }
    });
    const { article, sheet } = await openPicker(/Pizza/);
    const reads = server.weekReads.length;
    fireEvent.click(await within(sheet).findByRole('button', { name: `Scegli ${NAME}` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Questo pasto o questa ricetta non è più disponibile.')).toBeTruthy();
    await waitFor(() => expect(server.weekReads.length).toBe(reads + 1));
    // Renders after the refusal read nothing more.
    fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    await new Promise((done) => setTimeout(done, 50));
    expect(server.weekReads.length).toBe(reads + 1);
  });

  it('a failed search explains and can be tried again (PR #33 review, 5)', async () => {
    const { server } = realMealsApp();
    server.answerSearch(() => {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
    });
    const { sheet } = await openPicker(/Pizza/);
    fireEvent.change(within(sheet).getByRole('searchbox'), { target: { value: 'ceci' } });
    const retry = await within(sheet).findByRole('button', { name: 'Riprova' });
    expect(within(sheet).getAllByRole('alert').length).toBeGreaterThan(0);
    expect(within(sheet).queryByText('Nessuna ricetta trovata.')).toBeNull();
    server.answerSearch(() => ({ unchanged: false, version: 'v1', data: { items: [SERVER_RECIPE] } }));
    fireEvent.click(retry);
    expect(await within(sheet).findByRole('list', { name: 'Risultati' })).toBeTruthy();
  });

  it('a failed reread with results in the cache: results stay, error and «Riprova» show (PR #33 second review)', async () => {
    const { server } = realMealsApp();
    const { sheet } = await openPicker(/Pizza/);
    const box = within(sheet).getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'ceci' } });
    await within(sheet).findByRole('list', { name: 'Risultati' });
    fireEvent.change(box, { target: { value: 'ceci rossi' } });
    await waitFor(() => expect(server.recipeCalls.filter((c) => c.op === 'recipes.search')).toHaveLength(2));
    server.answerSearch(() => {
      throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
    });
    // Back to a cached query: its results show while it is read again, and the reread fails.
    fireEvent.change(box, { target: { value: 'ceci' } });
    const retry = await within(sheet).findByRole('button', { name: 'Riprova' });
    expect(within(sheet).getByRole('list', { name: 'Risultati' })).toBeTruthy();
    server.answerSearch(() => ({ unchanged: false, version: 'v1', data: { items: [SERVER_RECIPE] } }));
    fireEvent.click(retry);
    await waitFor(() => expect(within(sheet).queryByRole('button', { name: 'Riprova' })).toBeNull());
    expect(within(sheet).getByRole('list', { name: 'Risultati' })).toBeTruthy();
  });
});

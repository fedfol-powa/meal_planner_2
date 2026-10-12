import { ORPCError } from '@orpc/server';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('change recipe', () => {
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
});

import { ORPCError } from '@orpc/server';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOnline } from '../../test/connectivity';
import * as family from '../../i18n/messages/family';
import * as meals from '../../i18n/messages/meals';
import { realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const card = (name: RegExp) => screen.findByRole('article', { name });
const pencil = (article: HTMLElement) => within(article).getByRole('button', { name: 'Modifica il pasto' }) as HTMLButtonElement;
const more = (article: HTMLElement) => within(article).getByRole('button', { name: 'Una porzione in più' }) as HTMLButtonElement;
const servingsCalls = (server: ReturnType<typeof realMealsApp>['server']) => server.mealCalls.filter((c) => c.op === 'meals.setServings');

describe('meal card actions', () => {
  it('every kind has the pencil; only a recipe has rating and ingredients; one panel at a time', async () => {
    realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    const dinner = await card(/Pizza/);
    expect(pencil(dinner)).toBeTruthy();
    expect(within(dinner).queryByRole('button', { name: /ingredient/i })).toBeNull();
    fireEvent.click(within(lunch).getByRole('button', { name: /ingredient/i }));
    expect(within(lunch).getByText('Ceci', { exact: false })).toBeTruthy();
    fireEvent.click(pencil(lunch));
    expect(within(lunch).getByRole('button', { name: 'Cambia ricetta' })).toBeTruthy();
    expect(within(lunch).queryByText('Ceci', { exact: false })).toBeNull();
  });

  it('a free meal has no servings in the panel but can change recipe and note', async () => {
    realMealsApp();
    const dinner = await card(/Pizza/);
    fireEvent.click(pencil(dinner));
    expect(within(dinner).queryByRole('button', { name: 'Una porzione in più' })).toBeNull();
    expect(within(dinner).getByRole('button', { name: 'Cambia ricetta' })).toBeTruthy();
    expect(within(dinner).getByRole('button', { name: 'Nota' })).toBeTruthy();
  });

  it('servings: three taps, one request after 800 ms, one undo restores', async () => {
    const { server } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    for (let i = 0; i < 3; i++) fireEvent.click(more(lunch));
    expect(servingsCalls(server)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(servingsCalls(server).map((c) => c.input.servings)).toEqual([7]));
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(within(lunch).getAllByText(/4 porzioni/).length).toBeGreaterThan(0));
    expect(server.mealCalls.filter((c) => c.op === 'meals.undo')).toHaveLength(1);
  });

  it('closing the panel sends the pending value at once; the stepper is disabled until the answer', async () => {
    const { server } = realMealsApp();
    let release: () => void = () => {};
    server.answerMeals({ setServings: (input) => new Promise((done) => (release = () => done(server.defaultMeals.setServings(input)))) });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    fireEvent.click(pencil(lunch));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
    fireEvent.click(pencil(lunch));
    // The fieldset disables the stepper's buttons: `:disabled`, not their own attribute.
    expect(more(lunch).matches(':disabled')).toBe(true);
    expect(within(lunch).getAllByText(/5 porzioni/).length).toBeGreaterThan(0);
    release();
    await waitFor(() => expect(more(lunch).matches(':disabled')).toBe(false));
  });

  it('leaving the menu sends the pending value once, without undo', async () => {
    const { server, history } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => history.push('/recipes'));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('losing the network: nothing is sent, the value goes back, the controls are disabled', async () => {
    const { server } = realMealsApp();
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    act(() => setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(servingsCalls(server)).toHaveLength(0);
    expect(within(lunch).getByText(/4 porzioni/)).toBeTruthy();
    expect(pencil(lunch).disabled).toBe(true);
    act(() => setOnline(true));
  });

  it('the labels match the empty state of the exclusions', () => {
    expect(family.it['exclusions.emptyBody']).toContain(`«${meals.it['meals.changeRecipe']}»`);
    expect(family.it['exclusions.emptyBody']).toContain(`«${meals.it['meals.exclude']}»`);
    expect(family.en['exclusions.emptyBody']).toContain(`“${meals.en['meals.changeRecipe']}”`);
    expect(family.en['exclusions.emptyBody']).toContain(`“${meals.en['meals.exclude']}”`);
  });
});

describe('servings refused by the server', () => {
  it('with the card mounted: the error shows in the panel and the value goes back', async () => {
    const { server } = realMealsApp();
    // Not `forbidden`: that one revokes the family and closes the menu (SessionScope).
    server.answerMeals({
      setServings: () => {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
      }
    });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(await within(lunch).findByRole('alert')).toBeTruthy();
    expect(within(lunch).getAllByText(/4 porzioni/).length).toBeGreaterThan(0);
  });

  it('after leaving the menu: a notice stays in the menu until dismissed', async () => {
    const { server, history } = realMealsApp();
    server.answerMeals({
      setServings: () => {
        throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 });
      }
    });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => history.push('/recipes'));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
    await act(() => history.push('/menu'));
    const notice = await screen.findByText(/Le porzioni di Ricetta dal server .* non sono state salvate/);
    fireEvent.click(within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Chiudi avviso' }));
    expect(screen.queryByText(/non sono state salvate/)).toBeNull();
  });
});

describe('servings in Strict Mode', () => {
  it('one request for one adjustment', async () => {
    const { server } = realMealsApp('/menu', { strict: true });
    const lunch = await card(/Ricetta dal server/);
    fireEvent.click(pencil(lunch));
    fireEvent.click(more(lunch));
    await act(() => vi.advanceTimersByTimeAsync(800));
    await waitFor(() => expect(servingsCalls(server)).toHaveLength(1));
  });
});

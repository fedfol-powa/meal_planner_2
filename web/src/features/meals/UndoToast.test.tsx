import { ORPCError } from '@orpc/server';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSwitch } from '../../test/LanguageSwitch';
import { realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Servings +1 and panel closed: the value leaves at once. */
async function changeServings() {
  const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
  fireEvent.click(within(article).getByRole('button', { name: /Modifica il pasto|Edit the meal/ }));
  fireEvent.click(within(article).getByRole('button', { name: /Una porzione in più|One serving more/ }));
  fireEvent.click(within(article).getByRole('button', { name: /Modifica il pasto|Edit the meal/ }));
  return article;
}

describe('undo', () => {
  it('offers «Annulla» for 6 seconds and restores the meal with the action id', async () => {
    const { server } = realMealsApp();
    await changeServings();
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.setServings')).toBe(true));
    const action = server.mealCalls.find((c) => c.op === 'meals.setServings')!.input.id;
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.undo')?.input).toMatchObject({ actionId: action }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull());
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });

  it('a refused undo explains and reads the week again', async () => {
    const { server } = realMealsApp();
    server.answerMeals({
      undo: () => {
        throw new ORPCError('not_allowed', { status: 409, data: { reason: 'changed_since' } });
      }
    });
    await changeServings();
    const undo = await screen.findByRole('button', { name: 'Annulla' });
    const reads = server.weekReads.length;
    fireEvent.click(undo);
    expect(await screen.findByText('Non si può più annullare: il pasto è stato cambiato.')).toBeTruthy();
    await waitFor(() => expect(server.weekReads.length).toBeGreaterThan(reads));
  });

  it('after moving to another week the undo still targets the meal’s week', async () => {
    const { server, history } = realMealsApp();
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    await act(() => history.push('/menu?day=2026-10-12'));
    fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.undo')).toBe(true));
    await act(() => history.push('/menu?day=2026-10-08'));
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    await waitFor(() => expect(within(article).getByText(/4 porzioni/)).toBeTruthy());
  });

  it('after switching to English the undo still applies to the meal', async () => {
    const { server } = realMealsApp('/menu', { extra: <LanguageSwitch /> });
    await changeServings();
    await screen.findByRole('button', { name: 'Annulla' });
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.undo')).toBe(true));
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    await waitFor(() => expect(within(article).getByText(/4 servings/)).toBeTruthy());
  });

  it('no toast when nothing changed', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ setNote: (input) => ({ week: server.currentWeek('2026-10-05'), actionId: input.id, changed: false }) });
    const article = await screen.findByRole('article', { name: /Ricetta dal server/ });
    fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
    fireEvent.click(within(article).getByRole('button', { name: 'Nota' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull();
  });
});

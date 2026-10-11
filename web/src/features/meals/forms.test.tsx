import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DINNER, LUNCH, realMealsApp } from './testApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

async function open(card: RegExp, button: string) {
  const article = await screen.findByRole('article', { name: card });
  fireEvent.click(within(article).getByRole('button', { name: 'Modifica il pasto' }));
  fireEvent.click(within(article).getByRole('button', { name: button }));
  return { article, sheet: await screen.findByRole('dialog') };
}

describe('swap, free meal and note', () => {
  it('swaps with another meal of the week; «Indietro» goes back to the recipes', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scambia con un altro pasto' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Indietro' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Scambia con un altro pasto' }));
    fireEvent.click(await within(sheet).findByRole('button', { name: /Pizza/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.mealCalls.find((c) => c.op === 'meals.swap')?.input).toMatchObject({ slotId: LUNCH, otherSlotId: DINNER });
  });

  it('marks a meal free from a typed text, kept as written; quick picks fill the text', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: () => ({ recipes: [], nextOffset: 0, freeTexts: ['Fuori', 'Avanzi'] }) });
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Segna come pasto libero' }));
    const input = (await within(sheet).findByRole('textbox', { name: 'Testo del pasto libero' })) as HTMLInputElement;
    expect(input.maxLength).toBe(60);
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Fuori' }));
    expect(input.value).toBe('Fuori');
    const save = within(sheet).getByRole('button', { name: 'Salva' }) as HTMLButtonElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Cena da Zia Pina' } });
    fireEvent.click(save);
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.setFree')?.input).toMatchObject({ slotId: LUNCH, text: 'Cena da Zia Pina' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('writes a note with a counter and removes it', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Pizza/, 'Nota');
    const box = within(sheet).getByRole('textbox', { name: 'Nota per la famiglia' }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: 'Senza cipolla' } });
    expect(within(sheet).getByText('13/200')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(server.mealCalls.find((c) => c.op === 'meals.setNote')?.input).toMatchObject({ slotId: DINNER, note: 'Senza cipolla' }));
    const article = await screen.findByRole('article', { name: /Pizza/ });
    await waitFor(() => expect(within(article).getByText('Senza cipolla', { exact: false })).toBeTruthy());
    // The panel under the pencil stays open after the sheet closes.
    fireEvent.click(within(article).getByRole('button', { name: 'Nota' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'Togli nota' }));
    await waitFor(() => expect(server.mealCalls.filter((c) => c.op === 'meals.setNote').at(-1)?.input.note).toBeNull());
  });
});

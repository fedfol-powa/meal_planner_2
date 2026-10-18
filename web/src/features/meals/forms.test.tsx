import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORPCError } from '@orpc/server';
import { setOnline } from '../../test/connectivity';
import { SERVER_RECIPE } from '../../test/rpcServer';
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

describe('free meal picks while loading (W20)', () => {
  const openFree = async () => {
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Segna come pasto libero' }));
    await within(sheet).findByRole('textbox', { name: 'Testo del pasto libero' });
    return sheet;
  };

  it('free meal: chips skeleton while the picks load', async () => {
    const { server } = realMealsApp();
    let release!: (value: unknown) => void;
    server.answerMeals({ getSuggestions: () => new Promise((done) => (release = done)) });
    const sheet = await openFree();
    const form = sheet.querySelector('form')!;
    await waitFor(() => expect(form.querySelector('.skeleton[data-visible="true"]')).not.toBeNull());
    expect(form.querySelectorAll('.skeleton .skeleton-block')).toHaveLength(3);
    await act(async () => release({ recipes: [], nextOffset: 0, freeTexts: ['Fuori'] }));
    expect(await within(sheet).findByRole('button', { name: 'Fuori' })).toBeTruthy();
    expect(form.querySelector('.skeleton')).toBeNull();
  });

  it('free meal: saved picks show at once', async () => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: () => ({ recipes: [], nextOffset: 0, freeTexts: ['Avanzi'] }) });
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.getSuggestions')).toBe(true));
    await waitFor(() => expect(sheet.querySelector('.skeleton')).toBeNull());
    server.answerMeals({ getSuggestions: () => new Promise(() => undefined) });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Segna come pasto libero' }));
    expect(await within(sheet).findByRole('button', { name: 'Avanzi' })).toBeTruthy();
    expect(sheet.querySelector('form .skeleton')).toBeNull();
  });

  it.each([
    ['no picks', () => ({ recipes: [], nextOffset: 0, freeTexts: [] })],
    ['an error', () => { throw new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 }); }]
  ])('free meal: %s leaves no row', async (_, answer) => {
    const { server } = realMealsApp();
    server.answerMeals({ getSuggestions: answer });
    const sheet = await openFree();
    await waitFor(() => expect(server.mealCalls.some((c) => c.op === 'meals.getSuggestions')).toBe(true));
    await waitFor(() => expect(sheet.querySelector('form .skeleton')).toBeNull());
    expect(sheet.querySelector('form [aria-busy]')).toBeNull();
    expect(within(sheet.querySelector('form')!).queryAllByRole('button').map((b) => b.textContent)).toEqual(['Indietro', 'Salva']);
  });
});

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

describe('losing the network with the sheet open (PR #33 review, 4)', () => {
  afterEach(() => act(() => setOnline(true)));
  const disabled = (sheet: HTMLElement, name: string | RegExp) => (within(sheet).getByRole('button', { name }) as HTMLButtonElement).disabled;

  it('note: «Salva» goes off, closing stays, it comes back online', async () => {
    realMealsApp();
    const { sheet } = await open(/Pizza/, 'Nota');
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Nota per la famiglia' }), { target: { value: 'Senza cipolla' } });
    act(() => setOnline(false));
    expect(disabled(sheet, 'Salva')).toBe(true);
    expect(disabled(sheet, 'Chiudi')).toBe(false);
    act(() => setOnline(true));
    expect(disabled(sheet, 'Salva')).toBe(false);
  });

  it('change recipe: choices and exclusion go off, the suggestions stay visible; swap and free too', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Ricetta dal server/, 'Cambia ricetta');
    const name = `Scegli ${SERVER_RECIPE.recipe.name}`;
    await within(sheet).findByRole('button', { name });
    act(() => setOnline(false));
    expect(disabled(sheet, name)).toBe(true);
    expect(disabled(sheet, 'Non proporre più')).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scambia con un altro pasto' }));
    expect(disabled(sheet, /Pizza/)).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Indietro' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Segna come pasto libero' }));
    fireEvent.change(await within(sheet).findByRole('textbox', { name: 'Testo del pasto libero' }), { target: { value: 'Fuori' } });
    expect(disabled(sheet, 'Salva')).toBe(true);
    expect(server.mealCalls.some((c) => c.op.startsWith('meals.set') || c.op === 'meals.swap')).toBe(false);
  });

  it('«Annulla» goes off offline', async () => {
    const { server } = realMealsApp();
    const { sheet } = await open(/Pizza/, 'Nota');
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Nota per la famiglia' }), { target: { value: 'Senza cipolla' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }));
    const undo = (await screen.findByRole('button', { name: 'Annulla' })) as HTMLButtonElement;
    act(() => setOnline(false));
    expect(undo.disabled).toBe(true);
    expect(server.mealCalls.some((c) => c.op === 'meals.undo')).toBe(false);
  });
});

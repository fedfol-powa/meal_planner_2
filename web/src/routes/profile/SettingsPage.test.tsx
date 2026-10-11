import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, DEMO_FAMILY_ID } from '../../api/fake/fakeApi';
import type { Api } from '../../api/types';
import { setOnline } from '../../test/connectivity';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const ANNA = { id: 'user-anna', email: 'anna@example.com' };
const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const card = async (title: string) => within((await screen.findByRole('heading', { name: title })).closest('section')!);

/** A method that answers when released, to see the controls while a write is pending. */
function held<T>(answer: () => Promise<T>) {
  let release: () => void = () => {};
  const method = vi.fn(() => new Promise<T>((resolve, reject) => (release = () => void answer().then(resolve, reject))));
  return { method, release: () => act(async () => release()) };
}

describe('family settings', () => {
  it('is read-only for members, with the reason', async () => {
    renderApp('/profile/family/settings', { backend: createStubBackend(ANNA, 'supabase') });
    expect(await screen.findByText('Solo gli amministratori della famiglia possono cambiare le impostazioni.')).toBeTruthy();
    expect((screen.getByLabelText('Nome della famiglia') as HTMLInputElement).disabled).toBe(true);
    const diners = await card('Chi mangia quando');
    for (const cell of diners.getAllByRole('button')) expect((cell as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aggiungi una regola' })).toBeNull();
    expect(screen.getByText('Evita')).toBeTruthy();
  });

  it('saves one meal from the sheet, shows the value sent while pending, then the server view', async () => {
    const api = adminApi();
    const setMeal = held(() => adminApi().family.setMeal({ familyId: DEMO_FAMILY_ID, mealType: 'lunch', weekday: 6, servings: 3, fixedText: null, maxMinutes: null }));
    api.family.setMeal = setMeal.method as unknown as Api['family']['setMeal'];
    renderApp('/profile/family/settings', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'domenica Pranzo: 2 porzioni' }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.click(sheet.getByRole('button', { name: 'Più: Porzioni' }));
    await waitFor(() => expect(setMeal.method).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'lunch', weekday: 6, servings: 3, fixedText: null, maxMinutes: null }), expect.anything()));
    expect(sheet.getByRole('group', { name: 'Porzioni' }).textContent).toContain('3');
    expect((sheet.getByRole('button', { name: 'Più: Porzioni' }) as HTMLButtonElement).disabled).toBe(true);
    await setMeal.release();
    await waitFor(() => expect((sheet.getByRole('button', { name: 'Più: Porzioni' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'domenica Pranzo: 3 porzioni' })).toBeTruthy();
  });

  it('restores the value and shows the error when saving fails', async () => {
    const api = adminApi();
    // Not forbidden: that one revokes the family (W5) and the page leaves.
    api.family.setKnownNew = (async () => {
      throw new ApiError('invalid');
    }) as unknown as Api['family']['setKnownNew'];
    renderApp('/profile/family/settings', { api });
    fireEvent.click(await screen.findByText('Avanzate'));
    fireEvent.click(screen.getByRole('button', { name: 'Più: Note' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Dati non validi.');
    expect(screen.getByRole('group', { name: 'Note' }).textContent).toContain('7');
  });

  it('adds a rule from a template and removes it by value', async () => {
    const api = adminApi();
    const addRule = vi.spyOn(api.family, 'addRule');
    const removeRule = vi.spyOn(api.family, 'removeRule');
    renderApp('/profile/family/settings', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi una regola' }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.click(sheet.getByLabelText('Almeno un pasto di un gruppo in un giorno'));
    fireEvent.change(sheet.getByLabelText('Gruppo'), { target: { value: 'fish' } });
    fireEvent.change(sheet.getByLabelText('Giorno'), { target: { value: '4' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Aggiungi' }));
    const rule = { kind: 'at_least_one', group: 'fish', weekday: 4 };
    await waitFor(() => expect(addRule).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, rule }, expect.anything()));
    const rules = await card('Regole dei pasti');
    expect(await rules.findByText('Pesce: almeno un pasto di venerdì')).toBeTruthy();
    fireEvent.click(rules.getByRole('button', { name: 'Togli la regola: Pesce: almeno un pasto di venerdì' }));
    await waitFor(() => expect(removeRule).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, rule }, expect.anything()));
    expect(await rules.findByText('Nessuna regola.')).toBeTruthy();
  });

  it('searches ingredients from two letters, avoids one and limits it', async () => {
    const api = adminApi();
    const search = vi.spyOn(api.family, 'searchIngredients');
    const restrict = vi.spyOn(api.family, 'setIngredientRestriction');
    renderApp('/profile/family/settings', { api });
    const ingredients = await card('Ingredienti da evitare o limitare');
    const field = ingredients.getByPlaceholderText('Cerca un ingrediente da aggiungere');
    fireEvent.change(field, { target: { value: 'z' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(search).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'zucchin' } });
    fireEvent.click(await ingredients.findByRole('button', { name: 'Zucchine' }));
    await waitFor(() => expect(restrict).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, ingredientId: 'zucchine', restriction: 'avoid', weeklyMax: null }, expect.anything()));
    const select = await ingredients.findByLabelText('Restrizione per Zucchine');
    fireEvent.change(select, { target: { value: '1' } });
    await waitFor(() => expect(restrict).toHaveBeenLastCalledWith({ familyId: DEMO_FAMILY_ID, ingredientId: 'zucchine', restriction: 'limit', weeklyMax: 1 }, expect.anything()));
    await waitFor(() => expect((ingredients.getByLabelText('Restrizione per Zucchine') as HTMLSelectElement).value).toBe('1'));
  });

  it('changes units and time zone, making the menus of this family stale and no other', async () => {
    const api = adminApi();
    const units = vi.spyOn(api.family, 'setMeasurementSystem');
    const zone = vi.spyOn(api.family, 'setTimeZone');
    let client: QueryClient | null = null;
    function Probe() {
      client = useQueryClient();
      return null;
    }
    renderApp('/profile/family/settings', { api, extra: <Probe /> });
    const section = await card('Unità di misura');
    const queryClient = client!;
    const mine = ['menu', 'getWeek', { familyId: DEMO_FAMILY_ID, weekStartsOn: '2026-10-05', locale: 'it-IT' }];
    const other = ['menu', 'getWeek', { familyId: 'family-other', weekStartsOn: '2026-10-05', locale: 'it-IT' }];
    const seed = () => {
      queryClient.setQueryData(mine, { version: 'v', data: {} });
      queryClient.setQueryData(other, { version: 'v', data: {} });
    };
    seed();
    fireEvent.click(section.getByLabelText('Imperiale britannico (oz, lb)'));
    await waitFor(() => expect(units).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, measurementSystem: 'uk_imperial' }, expect.anything()));
    await waitFor(() => expect(queryClient.getQueryState(mine)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
    await waitFor(() => expect((section.getByLabelText('Imperiale britannico (oz, lb)') as HTMLInputElement).checked).toBe(true));
    seed();
    fireEvent.change(section.getByLabelText('Fuso orario'), { target: { value: 'Europe/London' } });
    await waitFor(() => expect(zone).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, timeZone: 'Europe/London' }, expect.anything()));
    await waitFor(() => expect(queryClient.getQueryState(mine)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
  });

  it('marks owned books and keeps everything read only offline', async () => {
    const api = adminApi();
    const owned = vi.spyOn(api.family, 'setBookOwned');
    renderApp('/profile/family/settings', { api });
    const books = await card('Libri posseduti');
    fireEvent.click(books.getByLabelText('Panini e tramezzini'));
    await waitFor(() => expect(owned).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, bookId: 'panini-e-tramezzini', owned: true }, expect.anything()));
    await waitFor(() => expect((books.getByLabelText('Panini e tramezzini') as HTMLInputElement).checked).toBe(true));
    act(() => setOnline(false));
    expect(await screen.findByText('Le impostazioni si cambiano online.')).toBeTruthy();
    expect((books.getByLabelText('Panini e tramezzini') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows every weekly maximum and tolerance the contract accepts (PR #21 review, finding 4)', async () => {
    const api = adminApi();
    // Values an agent may have set through MCP.
    await api.family.setIngredientRestriction({ familyId: DEMO_FAMILY_ID, ingredientId: 'zucchine', restriction: 'limit', weeklyMax: 7 });
    await api.family.setKnownNew({ familyId: DEMO_FAMILY_ID, known: 7, new: 5, tolerance: 3 });
    renderApp('/profile/family/settings', { api });
    const ingredients = await card('Ingredienti da evitare o limitare');
    const select = ingredients.getByLabelText('Restrizione per Zucchine') as HTMLSelectElement;
    expect(select.value).toBe('7');
    expect(select.selectedOptions[0]!.textContent).toBe('Max 7 a settimana');
    expect([...select.options].map((o) => o.value)).toEqual(['avoid', '1', '2', '3', '4', '5', '6', '7']);
    fireEvent.click(screen.getByText('Avanzate'));
    expect((screen.getByRole('button', { name: 'Più: Tolleranza ±' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('brings the fixed meal text back to the server value after a refusal, with the error in the sheet (PR #21 review, finding 5)', async () => {
    const api = adminApi();
    await api.family.setMeal({ familyId: DEMO_FAMILY_ID, mealType: 'dinner', weekday: 4, servings: 2, fixedText: 'Pizza', maxMinutes: null });
    const setMeal = api.family.setMeal;
    let refuse = true;
    api.family.setMeal = ((input: Parameters<typeof setMeal>[0]) => (refuse ? Promise.reject(new ApiError('invalid')) : setMeal(input))) as unknown as Api['family']['setMeal'];
    renderApp('/profile/family/settings', { api });
    fireEvent.click(await screen.findByRole('button', { name: 'venerdì Cena: Pizza' }));
    const sheet = within(screen.getByRole('dialog'));
    const field = sheet.getByLabelText('Che cosa') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'Sushi' } });
    fireEvent.blur(field);
    expect((await sheet.findByRole('alert')).textContent).toBe('Dati non validi.');
    expect(field.value).toBe('Pizza');
    // Accepted: the field shows the text as the server saved it.
    refuse = false;
    fireEvent.change(field, { target: { value: '  Sushi  ' } });
    fireEvent.blur(field);
    await waitFor(() => expect(screen.getByRole('button', { name: 'venerdì Cena: Sushi' })).toBeTruthy());
    expect(field.value).toBe('Sushi');
    expect(sheet.queryByRole('alert')).toBeNull();
  });

  it('locks the open sheets when the connection drops (PR #21 review, finding 6)', async () => {
    renderApp('/profile/family/settings', { api: adminApi() });
    fireEvent.click(await screen.findByRole('button', { name: 'lunedì Pranzo: 2 porzioni, max 30 min' }));
    const meal = within(screen.getByRole('dialog'));
    expect((meal.getByLabelText('Tempo massimo') as HTMLSelectElement).disabled).toBe(false);
    act(() => setOnline(false));
    await waitFor(() => expect((meal.getByLabelText('Tempo massimo') as HTMLSelectElement).disabled).toBe(true));
    expect((meal.getByRole('button', { name: 'Più: Porzioni' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(meal.getByRole('button', { name: 'Fatto' }));
    act(() => setOnline(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi una regola' }));
    const rule = within(screen.getByRole('dialog'));
    act(() => setOnline(false));
    await waitFor(() => expect((rule.getByRole('button', { name: 'Aggiungi' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('tells a failed ingredient search from an empty one, and searches again (PR #21 review, finding 7)', async () => {
    const api = adminApi();
    const search = api.family.searchIngredients;
    let fail = true;
    api.family.searchIngredients = ((input: Parameters<typeof search>[0]) => (fail ? Promise.reject(new ApiError('internal')) : search(input))) as unknown as Api['family']['searchIngredients'];
    renderApp('/profile/family/settings', { api });
    const ingredients = await card('Ingredienti da evitare o limitare');
    fireEvent.change(ingredients.getByPlaceholderText('Cerca un ingrediente da aggiungere'), { target: { value: 'zucchin' } });
    expect((await ingredients.findByRole('alert')).textContent).toContain('Il servizio ha avuto un problema');
    expect(ingredients.queryByText('Nessun ingrediente trovato.')).toBeNull();
    fail = false;
    fireEvent.click(ingredients.getByRole('button', { name: 'Riprova' }));
    expect(await ingredients.findByRole('button', { name: 'Zucchine' })).toBeTruthy();
    expect(ingredients.queryByRole('alert')).toBeNull();
  });

  it('has no «Elimina la famiglia» (wave 3)', async () => {
    renderApp('/profile/family/settings');
    await screen.findByText('Chi mangia quando');
    expect(screen.queryByText('Elimina la famiglia')).toBeNull();
  });
});

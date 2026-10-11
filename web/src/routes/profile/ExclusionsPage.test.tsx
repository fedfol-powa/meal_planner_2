import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi, DEMO_FAMILY_ID } from '../../api/fake/fakeApi';
import { renderApp } from '../../test/renderApp';

describe('«Non proporre più»', () => {
  it('lists exclusions with author or former member, and brings them back', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const remove = vi.spyOn(api.family, 'removeExclusion');
    renderApp('/profile/family/exclusions', { api });
    const first = (await screen.findByRole('link', { name: 'Pasta classica con pomodoro fresco, melanzane e ricotta' })).closest('li')!;
    expect(within(first).getByText('Esclusa da Anna, 1 ottobre')).toBeTruthy();
    expect(screen.getByText(/Esclusa da ex membro, 12 settembre/)).toBeTruthy();
    expect(screen.getByText('Non piace ai bambini')).toBeTruthy();
    fireEvent.click(within(first).getByRole('button', { name: /Proponi di nuovo/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, recipeId: 'pasta-melanzane-pomodoro-ricotta' }, expect.anything()));
    await waitFor(() => expect(screen.queryByText('Esclusa da Anna, 1 ottobre')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Proponi di nuovo/ }));
    expect(await screen.findByText('Nessuna ricetta esclusa')).toBeTruthy();
  });
});

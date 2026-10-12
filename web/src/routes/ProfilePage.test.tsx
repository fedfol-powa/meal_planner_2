import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import type { ProfileView } from '../api/types';
import { DEMO_USER } from '../auth/backend';
import { createStubBackend } from '../test/stubBackend';
import { renderApp } from '../test/renderApp';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('profile', () => {
  it('shows the person, the family shown with its pages, and no wave 3 rows', async () => {
    renderApp('/profile', { backend: createStubBackend(DEMO_USER, 'fake') });
    expect(await screen.findByRole('heading', { name: 'Federico' })).toBeTruthy();
    expect(screen.getByText('federico@example.com')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Famiglia Folloni' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Membri.*3 membri/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Impostazioni della famiglia' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Non proporre più.*2 ricette/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Famiglia Folloni/, pressed: true })).toBeTruthy();
    expect(screen.queryByText(/Crea un’altra famiglia/)).toBeNull();
    expect(screen.queryByText(/inviti/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Esci' })).toBeNull();
  });
  it('opens the members page from the family card', async () => {
    const { history } = renderApp('/profile');
    fireEvent.click(await screen.findByRole('link', { name: /Membri/ }));
    await waitFor(() => expect(history.location.pathname).toBe('/profile/family'));
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
  });
  it('chooses the family shown on the server and marks it at the answer', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const base = await api.profile.get({});
    const other = { ...base.families[0]!, id: 'family-other', name: 'Casa al mare', role: 'member' as const };
    let current = base.currentFamilyId;
    const view = (): ProfileView => ({ ...base, families: [base.families[0]!, other], currentFamilyId: current });
    let answer: () => void = () => {};
    api.profile.get = async () => view();
    api.profile.setCurrentFamily = vi.fn(({ familyId }: { familyId: string }) => new Promise<ProfileView>((resolve) => (answer = () => {
      current = familyId;
      resolve(view());
    }))) as unknown as typeof api.profile.setCurrentFamily;
    renderApp('/profile', { api });
    const families = within((await screen.findByRole('heading', { name: 'Le tue famiglie' })).closest('section')!);
    fireEvent.click(families.getByRole('button', { name: /Casa al mare/ }));
    await waitFor(() => expect(api.profile.setCurrentFamily).toHaveBeenCalledWith({ familyId: 'family-other' }, expect.anything()));
    // No optimistic update: still the old family until the answer.
    expect(families.getByRole('button', { name: /Famiglia Folloni/, pressed: true })).toBeTruthy();
    await act(async () => answer());
    expect(await families.findByRole('button', { name: /Casa al mare/, pressed: true })).toBeTruthy();
  });
  it('hides the cached profile when a new read fails with an error other than network (second review, C8)', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = api.profile.get;
    let refuse = false;
    api.profile.get = (input) => (refuse ? Promise.reject(new ApiError('unknown')) : get(input));
    renderApp('/profile', { backend: createStubBackend(DEMO_USER, 'supabase'), api });
    expect(await screen.findByRole('heading', { name: 'Federico' })).toBeTruthy();
    refuse = true;
    // Another view reads the profile again, and the read fails.
    fireEvent.click(screen.getByRole('link', { name: 'Ricettario' }));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Profilo' }));
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Federico' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'federico@example.com' })).toBeTruthy();
    // Language and sign-out stay one tap away.
    expect(screen.getByRole('link', { name: /Account e preferenze/ })).toBeTruthy();
  });

  it('opens «Collega un agente» from the account section, with the number of connected agents', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const { history } = renderApp('/profile', { api });
    const row = await screen.findByRole('link', { name: /Collega un agente/ });
    expect(await within(row).findByText('1 agente collegato')).toBeTruthy();
    vi.spyOn(api.agents, 'list').mockResolvedValue([]);
    fireEvent.click(row);
    await waitFor(() => expect(history.location.pathname).toBe('/profile/agents'));
  });

  it('suggests the clients when no agent is connected', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'list').mockResolvedValue([]);
    renderApp('/profile', { api });
    expect(await screen.findByText('Claude, ChatGPT o Codex con MCP')).toBeTruthy();
  });
});

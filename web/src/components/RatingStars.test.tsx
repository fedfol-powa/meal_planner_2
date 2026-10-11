import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { realClients } from '../api/clients';
import { createFakeApi } from '../api/fake/fakeApi';
import { createRpcClient } from '../api/rpc';
import { DEMO_USER, type Credentials } from '../auth/backend';
import { createRpcTestServer } from '../test/rpcServer';
import { queryKeys, type Versioned } from '../api/queries';
import type { Api, MealView, RatingSummary, WeekView } from '../api/types';
import { setOnline } from '../test/connectivity';
import { renderWithProviders } from '../test/renderWithProviders';
import { RatingStars } from './RatingStars';

const start: RatingSummary = { familyAverage: 4, familyCount: 2, myStars: null };
const weekKey = queryKeys.week('family-main', '2026-10-05', 'it-IT');
const weekWith = (rating: RatingSummary): Versioned<WeekView> => ({
  version: 'v',
  data: { startsOn: '2026-10-05', days: [{ date: '2026-10-05', meals: [{ recipe: { id: 'wok', name: 'Wok' }, rating } as MealView] }] }
});

/** Reads the rating from the cached week, as the menu card does. */
function Harness() {
  const rating = useQuery({
    queryKey: weekKey,
    queryFn: () => new Promise<never>(() => {}),
    staleTime: Infinity,
    select: (v: Versioned<WeekView>) => v.data.days[0]!.meals[0]!.rating
  });
  return rating.data ? <RatingStars summary={rating.data} recipeId="wok" recipeName="Wok" familyId="family-main" /> : null;
}

async function setup(set?: Api['ratings']['set'], rating = start) {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const api = set ? { ...base, ratings: { set } } : base;
  const spy = vi.spyOn(api.ratings, 'set');
  const view = renderWithProviders(<Harness />, { api });
  // The session stack mounts asynchronously: wait for its QueryClient, then seed the confirmed week.
  const client = await waitFor(() => view.queryClient());
  act(() => client.setQueryData(weekKey, weekWith(rating)));
  return { ...view, spy };
}
const cached = (view: Awaited<ReturnType<typeof setup>>) => view.queryClient().getQueryData<Versioned<WeekView>>(weekKey)?.data.days[0]?.meals[0]?.rating;

describe('RatingStars', () => {
  it('shows the sending state and then the confirmed result, never an unconfirmed one', async () => {
    let resolve: (value: RatingSummary) => void = () => {};
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => (resolve = r))));
    fireEvent.click(await screen.findByLabelText('Dai 4 stelle a Wok'));
    expect(await screen.findByText('Invio del voto…')).toBeTruthy();
    expect(cached(view)).toEqual(start);
    await act(async () => resolve({ familyAverage: 4.5, familyCount: 3, myStars: 4 }));
    await waitFor(() => expect(cached(view)).toEqual({ familyAverage: 4.5, familyCount: 3, myStars: 4 }));
    expect(screen.getByText('4,5')).toBeTruthy();
    expect(screen.queryByText('Invio del voto…')).toBeNull();
  });
  it('keeps the confirmed value and explains the error when the rating fails', async () => {
    const view = await setup(vi.fn(() => Promise.reject(new Error('boom'))));
    fireEvent.click(await screen.findByLabelText('Dai 2 stelle a Wok'));
    expect((await screen.findByRole('alert')).textContent).toBe('Qualcosa non ha funzionato: riprova.');
    expect(cached(view)).toEqual(start);
  });
  it('fails at once offline through the real connectivity path, and sends nothing when back online', async () => {
    const view = await setup();
    await screen.findByLabelText('Dai 3 stelle a Wok');
    act(() => setOnline(false));
    fireEvent.click(screen.getByLabelText('Dai 3 stelle a Wok'));
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(view.spy).not.toHaveBeenCalled();
    expect(cached(view)).toEqual(start);
  });
  it('applies only the answer to the latest request for the same recipe', async () => {
    const pending: ((value: RatingSummary) => void)[] = [];
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => pending.push(r))));
    const session = view.session();
    // Two requests for the same recipe (for example card and recipe page): the first answers last.
    const first = session.track('rating:wok');
    const second = session.track('rating:wok');
    expect(session.isLatest('rating:wok', first)).toBe(false);
    expect(session.isLatest('rating:wok', second)).toBe(true);
    fireEvent.click(await screen.findByLabelText('Dai 5 stelle a Wok'));
    await waitFor(() => expect(pending).toHaveLength(1));
    // A newer request on the same recipe starts while this one is pending.
    session.track('rating:wok');
    await act(async () => pending[0]!({ familyAverage: 5, familyCount: 3, myStars: 5 }));
    expect(cached(view)).toEqual(start);
  });
  it('drops an answer that arrives after the session is closed', async () => {
    let resolve: (value: RatingSummary) => void = () => {};
    const view = await setup(vi.fn(() => new Promise<RatingSummary>((r) => (resolve = r))));
    fireEvent.click(await screen.findByLabelText('Dai 4 stelle a Wok'));
    const session = view.session();
    const client = view.queryClient();
    await act(async () => {
      await session.close();
      // Even if something cached the week again, a late answer of a closed session must not touch it.
      client.setQueryData(weekKey, weekWith(start));
      resolve({ familyAverage: 4.5, familyCount: 3, myStars: 4 });
    });
    expect(client.getQueryData<Versioned<WeekView>>(weekKey)?.data.days[0]?.meals[0]?.rating).toEqual(start);
  });
  it('removes the rating when the chosen star is tapped again', async () => {
    const set = vi.fn(async () => ({ familyAverage: 4, familyCount: 1, myStars: null }));
    await setup(set, { familyAverage: 4, familyCount: 2, myStars: 4 });
    fireEvent.click(await screen.findByLabelText('Il tuo voto: 4 stelle. Tocca di nuovo per toglierlo'));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ familyId: 'family-main', recipeId: 'wok', stars: null }, expect.anything()));
  });
});

describe('RatingStars on the real RPC path (PR #19 review, finding 2)', () => {
  /** The client of real mode: ratings go to the Worker through the oRPC link; credentials come when released. */
  function realApi() {
    const server = createRpcTestServer();
    const pending: ((credentials: Credentials) => void)[] = [];
    const getCredentials = vi.fn(() => new Promise<Credentials>((resolve) => pending.push(resolve)));
    const rpc = createRpcClient({ getCredentials, fetch: server.fetch });
    const api = realClients({ rpc, latencyMs: 0 })(DEMO_USER)('it-IT');
    const release = () => pending.splice(0).forEach((resolve) => resolve({ accessToken: 'token', userId: DEMO_USER.id }));
    return { api, server, getCredentials, release };
  }

  it('refuses a rating offline before reading credentials, and sends nothing after reconnecting', async () => {
    const { api, server, getCredentials, release } = realApi();
    renderWithProviders(<RatingStars summary={start} recipeId="0f7c4b1e-2a3d-4c5e-8f90-123456789abc" recipeName="Wok" familyId="3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" />, { api });
    const star = await screen.findByLabelText('Dai 3 stelle a Wok');
    act(() => setOnline(false));
    fireEvent.click(star);
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(getCredentials).not.toHaveBeenCalled();
    expect(server.fetch).not.toHaveBeenCalled();
  });
  it('sends nothing when the device goes offline while the credentials are being read', async () => {
    const { api, server, getCredentials, release } = realApi();
    renderWithProviders(<RatingStars summary={start} recipeId="0f7c4b1e-2a3d-4c5e-8f90-123456789abc" recipeName="Wok" familyId="3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" />, { api });
    fireEvent.click(await screen.findByLabelText('Dai 3 stelle a Wok'));
    await waitFor(() => expect(getCredentials).toHaveBeenCalledTimes(1));
    act(() => setOnline(false));
    release();
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(server.fetch).not.toHaveBeenCalled();
  });
});

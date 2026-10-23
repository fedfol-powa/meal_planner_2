import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, createFakeData, type FakeData } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';

afterEach(() => setOnline(true));

const FEDERICO = { id: 'user-federico', email: 'federico@example.com' };
const ANNA = { id: 'user-anna', email: 'anna@example.com' };
const PATH = '/profile/family';
const LINKS = 'Link d’invito';
const JOINS = 'Ingressi con i link';
const CREATE = 'Crea un link d’invito';

function setup(user = FEDERICO, change?: (data: FakeData) => void) {
  const data = createFakeData(user);
  change?.(data);
  const api = createFakeApi({ getLocale: () => 'it-IT', data, latencyMs: 0 });
  return { data, api, backend: createStubBackend(user, 'supabase') };
}

const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const blockCards = () => document.querySelectorAll('.secondary-view .skeleton .settings-card.skeleton-card');
const heading = (name: string) => screen.queryByRole('heading', { level: 2, name });
const cardOf = (name: string) => heading(name)!.closest('section')!;

describe('members while loading (W22)', () => {
  it('members: admin cards are real from the start for an administrator', async () => {
    const { api, backend } = setup();
    const detail = holdCalls(api, 'family', 'get');
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { level: 2, name: LINKS })).toBeTruthy();
    expect(heading(JOINS)).toBeTruthy();
    expect((within(cardOf(LINKS)).getByRole('button', { name: CREATE }) as HTMLButtonElement).disabled).toBe(true);
    expect(cardOf(LINKS).querySelectorAll('.row-main.skeleton-block')).toHaveLength(1);
    expect(cardOf(JOINS).querySelectorAll('.row-main.skeleton-block')).toHaveLength(1);
    expect(blockCards()).toHaveLength(1);
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(loadingStatuses()).toHaveLength(1);
    await detail.open();
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('members: a member never sees the admin cards', async () => {
    const { api, backend } = setup(ANNA);
    const detail = holdCalls(api, 'family', 'get');
    renderApp(PATH, { api, backend });
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton .settings-card .meta-line')).not.toBeNull());
    expect(blockCards()).toHaveLength(1);
    expect(heading(LINKS)).toBeNull();
    await detail.open();
    expect(await screen.findByText('Anna (tu)')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(heading(LINKS)).toBeNull();
  });

  it('members: one announcement while links and joins load after the detail', async () => {
    const { api, backend } = setup();
    const links = holdCalls(api, 'familyInvitations', 'list');
    const joins = holdCalls(api, 'familyInvitations', 'listJoins');
    renderApp(PATH, { api, backend });
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    await waitFor(() => expect((within(cardOf(LINKS)).getByRole('button', { name: CREATE }) as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(skeletons().length).toBe(2));
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    const busy = [...document.querySelectorAll('.secondary-view [aria-busy="true"]')];
    expect(busy).toHaveLength(2);
    expect(cardOf(LINKS).contains(busy[0]!)).toBe(true);
    expect(cardOf(JOINS).contains(busy[1]!)).toBe(true);
    await links.open();
    await joins.open();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('members: no admin cards while the profile is unknown', async () => {
    const { api, backend } = setup();
    const profile = holdCalls(api, 'profile', 'get');
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { level: 1, name: 'Membri' })).toBeTruthy();
    expect(blockCards()).toHaveLength(1);
    expect(heading(LINKS)).toBeNull();
    expect(document.querySelector('.secondary-view .skeleton .settings-card .meta-line')).toBeNull();
    await profile.open();
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
  });

  it('members: the detail decides when profile and detail disagree (admin → member)', async () => {
    const { api, backend, data } = setup();
    const list = vi.spyOn(api.familyInvitations, 'list');
    const listJoins = vi.spyOn(api.familyInvitations, 'listJoins');
    const detail = holdCalls(api, 'family', 'get');
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('heading', { level: 2, name: LINKS })).toBeTruthy();
    data.family.members.find((m) => m.id === FEDERICO.id)!.role = 'member';
    data.family.members.find((m) => m.id === ANNA.id)!.role = 'family_admin';
    await detail.open();
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    await waitFor(() => expect(heading(LINKS)).toBeNull());
    expect(heading(JOINS)).toBeNull();
    expect(screen.queryByRole('button', { name: /Azioni per/ })).toBeNull();
    expect(screen.getByText(/chiedi un link a: Anna/)).toBeTruthy();
    expect(list).not.toHaveBeenCalled();
    expect(listJoins).not.toHaveBeenCalled();
  });

  it('members: the detail decides when profile and detail disagree (member → admin)', async () => {
    const { api, backend, data } = setup(ANNA);
    const list = vi.spyOn(api.familyInvitations, 'list');
    const listJoins = vi.spyOn(api.familyInvitations, 'listJoins');
    const detail = holdCalls(api, 'family', 'get');
    renderApp(PATH, { api, backend });
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton .settings-card .meta-line')).not.toBeNull());
    expect(heading(LINKS)).toBeNull();
    expect(list).not.toHaveBeenCalled();
    expect(listJoins).not.toHaveBeenCalled();
    data.family.members.find((m) => m.id === ANNA.id)!.role = 'family_admin';
    await detail.open();
    expect(await screen.findByRole('heading', { level: 2, name: LINKS })).toBeTruthy();
    expect(heading(JOINS)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Azioni per Federico' })).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() => expect(listJoins).toHaveBeenCalled());
  });

  it('members: an error of the detail replaces the skeleton', async () => {
    const { api, backend } = setup();
    api.family.get = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api, backend });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('members: offline every block stands still', async () => {
    const { api, backend } = setup();
    const { history } = renderApp('/recipes', { api, backend });
    await screen.findAllByRole('article');
    act(() => setOnline(false));
    act(() => history.push(PATH));
    await waitFor(() => expect(blockCards()).toHaveLength(1));
    await waitFor(() => expect(skeletons().every((el) => el.dataset.paused === 'true')).toBe(true));
    act(() => setOnline(true));
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
  });

  it('members: no skeleton with the cached copy', async () => {
    const { api, backend } = setup();
    const { history } = renderApp(PATH, { api, backend });
    await screen.findByText('Federico (tu)');
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'family', 'get');
    holdCalls(api, 'familyInvitations', 'list');
    holdCalls(api, 'familyInvitations', 'listJoins');
    act(() => history.push(PATH));
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

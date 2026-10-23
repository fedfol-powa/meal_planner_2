import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const PATH = '/profile/family/exclusions';
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const rows = () => document.querySelectorAll('.secondary-view .skeleton .row-list > li');
const FIRST = 'Pasta classica con pomodoro fresco, melanzane e ricotta';

describe('exclusions while loading (W22)', () => {
  it('exclusions: header and three rows while the profile and the list load', async () => {
    const api = fakeApi();
    const profile = holdCalls(api, 'profile', 'get');
    const list = holdCalls(api, 'family', 'listExclusions');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Non proporre più' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(document.querySelector<HTMLElement>('.page-header')!).getByRole('link', { name: 'Profilo' }).getAttribute('href')).toBe('/profile');
    expect(rows()).toHaveLength(3);
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await profile.open();
    expect(screen.getAllByRole('heading', { level: 1, name: 'Non proporre più' })).toHaveLength(1);
    expect(rows()).toHaveLength(3);
    expect(loadingStatuses()).toHaveLength(1);
    await list.open();
    expect(await screen.findByRole('link', { name: FIRST })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('exclusions: an empty list replaces the skeleton with the notice', async () => {
    const api = fakeApi();
    api.family.listExclusions = async () => ({ unchanged: false, version: 'v1', data: [] }) as never;
    renderApp(PATH, { api });
    expect(await screen.findByText('Nessuna ricetta esclusa')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('exclusions: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.family.listExclusions = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('exclusions: offline the blocks stand still', async () => {
    const api = fakeApi();
    // The recipe book does not read the exclusions (the profile does, for its count).
    const { history } = renderApp('/recipes', { api });
    await screen.findAllByRole('article');
    act(() => setOnline(false));
    act(() => history.push(PATH));
    await waitFor(() => expect(rows()).toHaveLength(3));
    await waitFor(() => expect(skeletons().every((el) => el.dataset.paused === 'true')).toBe(true));
    act(() => setOnline(true));
    expect(await screen.findByRole('link', { name: FIRST })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('exclusions: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByRole('link', { name: FIRST });
    act(() => history.push('/profile'));
    await screen.findByRole('link', { name: /Non proporre più/ });
    holdCalls(api, 'family', 'listExclusions');
    act(() => history.push(PATH));
    expect(await screen.findByRole('link', { name: FIRST })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { setOnline } from '../test/connectivity';
import { holdCalls } from '../test/holdCalls';
import { renderApp } from '../test/renderApp';

afterEach(() => setOnline(true));

const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const title = () => document.querySelector<HTMLElement>('.secondary-view h1')!;

describe('profile while loading (W22)', () => {
  it('profile: name and email blocks, family and families cards while the profile loads', async () => {
    const api = fakeApi();
    const profile = holdCalls(api, 'profile', 'get');
    renderApp('/profile', { api });
    // After the startup skeleton (W20), the page's own.
    await waitFor(() => expect(document.querySelector('.secondary-view h1 .skeleton')).not.toBeNull());
    expect(document.querySelectorAll('.secondary-view h1')).toHaveLength(1);
    expect(title().getAttribute('aria-hidden')).toBe('true');
    expect(title().textContent).toBe('');
    const block = title().querySelector<HTMLElement>('.skeleton')!;
    expect(block.dataset.visible).toBe('false');
    expect(document.querySelectorAll('.secondary-view .skeleton .settings-card.skeleton-card')).toHaveLength(2);
    await waitFor(() => expect(block.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await profile.open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Federico' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Famiglia Folloni' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('profile: the account card is real and usable while the profile loads', async () => {
    const api = fakeApi();
    holdCalls(api, 'profile', 'get');
    renderApp('/profile', { api });
    const link = await screen.findByRole('link', { name: /Account e preferenze/ });
    expect(link.closest('.skeleton')).toBeNull();
    expect(link.getAttribute('href')).toBe('/profile/preferences');
  });

  it('profile: rows have the link structure of the real rows', async () => {
    const api = fakeApi();
    holdCalls(api, 'profile', 'get');
    renderApp('/profile', { api });
    await waitFor(() => expect(document.querySelector('.secondary-view h1 .skeleton')).not.toBeNull());
    const rows = [...document.querySelectorAll('.secondary-view .skeleton .row-list > li')];
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.querySelector(':scope > .row-link > .row-main'))).toBe(true);
  });

  it('profile: the title stands still offline', async () => {
    const api = fakeApi();
    // Offline from the start: the query client's network state too (it listens only once mounted).
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp('/profile', { api });
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view h1 .skeleton')?.dataset.paused).toBe('true'));
    expect(skeletons().every((el) => el.dataset.paused === 'true')).toBe(true);
    act(() => setOnline(true));
    expect(await screen.findByRole('heading', { level: 1, name: 'Federico' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('profile: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.profile.get = async () => {
      throw new ApiError('internal');
    };
    renderApp('/profile', { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('profile: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp('/profile', { api });
    await screen.findByRole('heading', { level: 1, name: 'Federico' });
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'profile', 'get');
    act(() => history.push('/profile'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Federico' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

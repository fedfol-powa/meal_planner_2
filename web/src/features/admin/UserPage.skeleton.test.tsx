import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const PATH = `/admin/users/${FAKE_GUEST_ID}`;
const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const titles = () => document.querySelectorAll<HTMLElement>('.secondary-view h1');

describe('user detail while loading (W22)', () => {
  it('user: the title is a hidden block until the name arrives', async () => {
    const api = adminApi();
    const read = holdCalls(api, 'users', 'get');
    renderApp(PATH, { api });
    await waitFor(() => expect(document.querySelector('.secondary-view h1 .skeleton')).not.toBeNull());
    expect(titles()).toHaveLength(1);
    const title = titles()[0]!;
    expect(title.getAttribute('aria-hidden')).toBe('true');
    expect(title.textContent).toBe('');
    const block = title.querySelector<HTMLElement>('.skeleton')!;
    expect(block.dataset.visible).toBe('false');
    const back = within(document.querySelector<HTMLElement>('.page-header')!).getByRole('link', { name: 'Amministrazione dell’app' });
    expect(back.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelectorAll('.secondary-view .skeleton .settings-card.skeleton-card')).toHaveLength(2);
    // The gate's wait (profile) gives way to the detail's: read the block again.
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view h1 .skeleton')!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    await read.open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ospite' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('user: the skeleton also while the access is checked', async () => {
    const api = adminApi();
    const profile = holdCalls(api, 'profile', 'get');
    renderApp(PATH, { api });
    await waitFor(() => expect(document.querySelector('.secondary-view h1 .skeleton')).not.toBeNull());
    await profile.open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Ospite' })).toBeTruthy();
  });

  it('user: offline the title stands still', async () => {
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp(PATH, { api: adminApi() });
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view h1 .skeleton')?.dataset.paused).toBe('true'));
    act(() => setOnline(true));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ospite' })).toBeTruthy();
  });

  it('user: an error replaces the skeleton', async () => {
    const api = adminApi();
    api.users.get = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('user: no skeleton with the cached copy', async () => {
    const api = adminApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByRole('heading', { level: 1, name: 'Ospite' });
    act(() => history.push('/admin'));
    await screen.findByText('ospite@example.com');
    holdCalls(api, 'users', 'get');
    act(() => history.push(PATH));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ospite' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

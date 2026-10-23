import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { FAKE_GUEST_ID } from '../../api/fake/fakeUsers';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';

const PATH = `/admin/users/${FAKE_GUEST_ID}/delete`;
const adminApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, globalRoles: ['app_admin'] });
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');

describe('user deletion while loading (W22)', () => {
  it('user delete: back «Utenti» real, title a hidden block, then the plan', async () => {
    const api = adminApi();
    const plan = holdCalls(api, 'users', 'getDeletionPlan');
    renderApp(PATH, { api });
    await waitFor(() => expect(document.querySelector('.secondary-view h1 .skeleton')).not.toBeNull());
    const header = document.querySelector<HTMLElement>('.page-header')!;
    expect(within(header).getByRole('link', { name: 'Utenti' }).closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelector('.secondary-view h1')!.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('.secondary-view .skeleton .settings-card.skeleton-card')).toHaveLength(2);
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    await plan.open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Cancella Ospite' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('user delete: an error replaces the skeleton', async () => {
    const api = adminApi();
    api.users.getDeletionPlan = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import styles from './Deletion.module.css';

const PATH = '/profile/account/delete';
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');

describe('account deletion while loading (W22)', () => {
  it('account delete: families title, a family and «Cosa sparisce» as blocks, then the plan', async () => {
    const api = fakeApi();
    const read = holdCalls(api, 'account', 'getDeletionPlan');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Cancella l’account' })).toBeTruthy();
    await waitFor(() => expect(skeletons()).toHaveLength(1));
    const parts = [...skeletons()[0]!.children];
    expect(parts[0]!.matches(`h2.${styles.sectionTitle}`)).toBe(true);
    expect(parts[1]!.matches(`.settings-card.${styles.card}.skeleton-card`) && parts[1]!.querySelector('h3')).toBeTruthy();
    expect(parts[2]!.querySelector(`.text-button.wide.${styles.confirm}`)).not.toBeNull();
    await waitFor(() => expect(skeletons()[0]!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    await read.open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Le tue famiglie' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('account delete: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.account.getDeletionPlan = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

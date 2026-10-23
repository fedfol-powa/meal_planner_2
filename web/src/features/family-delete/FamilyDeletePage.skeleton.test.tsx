import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi, DEMO_FAMILY_ID } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import styles from './FamilyDeletePage.module.css';

afterEach(() => setOnline(true));

const PATH = `/profile/family/delete?family=${DEMO_FAMILY_ID}`;
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const CONFIRM = /Elimina Famiglia Folloni/;

describe('family deletion while loading (W22)', () => {
  it('family delete: a card of blocks with the button, then the summary', async () => {
    const api = fakeApi();
    const read = holdCalls(api, 'family', 'getDeletion');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Elimina la famiglia' })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton .settings-card.skeleton-card')).not.toBeNull());
    const card = document.querySelector('.secondary-view .skeleton .settings-card')!;
    expect(card.querySelectorAll(`ul.${styles.facts} > li`)).toHaveLength(2);
    expect(card.querySelector(`.text-button.wide.${styles.confirm}`)).not.toBeNull();
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await read.open();
    expect(await screen.findByRole('button', { name: CONFIRM })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('family delete: offline the blocks stand still', async () => {
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp(PATH, { api: fakeApi() });
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view .skeleton:has(.settings-card)')?.dataset.paused).toBe('true'));
    act(() => setOnline(true));
    expect(await screen.findByRole('button', { name: CONFIRM })).toBeTruthy();
  });

  it('family delete: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.family.getDeletion = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('family delete: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByRole('button', { name: CONFIRM });
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'family', 'getDeletion');
    act(() => history.push(PATH));
    expect(await screen.findByRole('button', { name: CONFIRM })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

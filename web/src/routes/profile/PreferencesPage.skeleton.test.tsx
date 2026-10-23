import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import styles from './profile.module.css';

afterEach(() => setOnline(true));

const PATH = '/profile/preferences';
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');

describe('preferences while loading (W22)', () => {
  it('preferences: the name card is blocks in its place, language and buttons are real', async () => {
    const api = fakeApi();
    const profile = holdCalls(api, 'profile', 'get');
    renderApp(PATH, { api });
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton .field')).not.toBeNull());
    expect(skeletons()).toHaveLength(1);
    const card = skeletons()[0]!.querySelector('.settings-card.skeleton-card')!;
    expect(card.querySelector(':scope > .field')).not.toBeNull();
    const email = card.querySelector(`:scope > p.${styles.static}`)!;
    expect([...email.children].map((el) => el.tagName.toLowerCase())).toEqual(['span', 'em']);
    expect(screen.getByRole('heading', { level: 2, name: 'Lingua' }).closest('.skeleton')).toBeNull();
    await waitFor(() => expect(skeletons()[0]!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await profile.open();
    expect(await screen.findByLabelText('Nome')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('preferences: offline the blocks stand still', async () => {
    // Offline from the start: the query client's network state too (it listens only once mounted).
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp(PATH, { api: fakeApi() });
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view .skeleton:has(.field)')?.dataset.paused).toBe('true'));
    act(() => setOnline(true));
    expect(await screen.findByLabelText('Nome')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('preferences: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.profile.get = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('preferences: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByLabelText('Nome');
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'profile', 'get');
    act(() => history.push(PATH));
    expect(await screen.findByLabelText('Nome')).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

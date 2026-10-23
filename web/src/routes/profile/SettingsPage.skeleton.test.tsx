import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import dinersStyles from '../../components/DinersGrid.module.css';
import styles from './SettingsPage.module.css';

afterEach(() => setOnline(true));

const PATH = '/profile/family/settings';
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const NAME = 'Nome della famiglia';

describe('family settings while loading (W22)', () => {
  it('settings: intro, name, diners and rules cards while loading', async () => {
    const api = fakeApi();
    const read = holdCalls(api, 'family', 'getSettings');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Impostazioni della famiglia' })).toBeTruthy();
    await waitFor(() => expect(skeletons().length).toBeGreaterThan(0));
    const parts = [...skeletons()[0]!.children];
    expect(parts[0]!.classList.contains(styles.intro!)).toBe(true);
    expect(parts[1]!.matches('.settings-card') && parts[1]!.querySelector('.field')).toBeTruthy();
    expect(parts[2]!.querySelector('h2') && parts[2]!.querySelector('.meta-line')).toBeTruthy();
    const body = [...parts[2]!.querySelectorAll('tbody tr')];
    expect(body).toHaveLength(7);
    expect(body.every((row) => row.querySelectorAll(`.${dinersStyles.cell}`).length === 2)).toBe(true);
    expect(parts[3]!.querySelector('h2')).toBeTruthy();
    expect(parts[3]!.querySelectorAll('.row-list > li')).toHaveLength(2);
    await waitFor(() => expect(skeletons().every((el) => el.dataset.visible === 'true')).toBe(true));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await read.open();
    expect(await screen.findByLabelText(NAME)).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('settings: the skeleton also while the profile loads', async () => {
    const api = fakeApi();
    const profile = holdCalls(api, 'profile', 'get');
    renderApp(PATH, { api });
    expect(await screen.findByRole('heading', { level: 1, name: 'Impostazioni della famiglia' })).toBeTruthy();
    expect(document.querySelectorAll('.secondary-view .skeleton tbody tr')).toHaveLength(7);
    await profile.open();
    expect(await screen.findByLabelText(NAME)).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('settings: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.family.getSettings = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('settings: offline the blocks stand still', async () => {
    const api = fakeApi();
    const { history } = renderApp('/recipes', { api });
    await screen.findAllByRole('article');
    act(() => setOnline(false));
    act(() => history.push(PATH));
    await waitFor(() => expect(skeletons().length).toBeGreaterThan(0));
    await waitFor(() => expect(skeletons().every((el) => el.dataset.paused === 'true')).toBe(true));
    act(() => setOnline(true));
    expect(await screen.findByLabelText(NAME)).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('settings: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByLabelText(NAME);
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'family', 'getSettings');
    act(() => history.push(PATH));
    expect(await screen.findByLabelText(NAME)).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('settings: the saving status is not the loading announcement', async () => {
    const api = fakeApi();
    holdCalls(api, 'family', 'addRule');
    renderApp(PATH, { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi una regola' }));
    const sheet = within(screen.getByRole('dialog'));
    fireEvent.click(sheet.getByLabelText('Almeno un pasto di un gruppo in un giorno'));
    fireEvent.change(sheet.getByLabelText('Gruppo'), { target: { value: 'fish' } });
    fireEvent.change(sheet.getByLabelText('Giorno'), { target: { value: '4' } });
    fireEvent.click(sheet.getByRole('button', { name: 'Aggiungi' }));
    expect(await screen.findByText('Salvataggio…')).toBeTruthy();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Salvataggio…')).toBe(true);
    await new Promise((done) => setTimeout(done, 250));
    expect(loadingStatuses()).toHaveLength(0);
  });
});

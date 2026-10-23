import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';

afterEach(() => setOnline(true));

const PATH = '/profile/agents';
const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const skeletons = () => [...document.querySelectorAll<HTMLElement>('.secondary-view .skeleton')];
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const connected = () => screen.getByRole('heading', { level: 2, name: 'Agenti collegati' }).closest('section')!;
const AGENT = () => screen.findByText('Claude Code', { selector: '.row-main' });

describe('agents while loading (W22)', () => {
  it('agents: the waiting row is a filled block inside the real card', async () => {
    const api = fakeApi();
    const list = holdCalls(api, 'agents', 'list');
    renderApp(PATH, { api });
    await screen.findByRole('heading', { level: 2, name: 'Agenti collegati' });
    await waitFor(() => expect(connected().querySelector('.row-main.skeleton-block')).not.toBeNull());
    expect(connected().querySelector('.text-button.skeleton-block')).not.toBeNull();
    expect(skeletons()).toHaveLength(1);
    await waitFor(() => expect(skeletons()[0]!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    expect(connected().querySelector('[aria-busy="true"]')).not.toBeNull();
    await list.open();
    expect(await AGENT()).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('agents: an error replaces the skeleton', async () => {
    const api = fakeApi();
    api.agents.list = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(connected().contains(screen.getByRole('button', { name: 'Riprova' }))).toBe(true);
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('agents: offline the row stands still', async () => {
    // Offline from the start: the query client's network state too (it listens only once mounted).
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp(PATH, { api: fakeApi() });
    await waitFor(() => expect(document.querySelector<HTMLElement>('.secondary-view .skeleton:has(.row-main)')?.dataset.paused).toBe('true'));
    act(() => setOnline(true));
    expect(await AGENT()).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('agents: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await AGENT();
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'agents', 'list');
    act(() => history.push(PATH));
    expect(await AGENT()).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('agents: the disconnected notice is not the loading announcement', async () => {
    const api = fakeApi();
    let client!: QueryClient;
    function Grab() {
      client = useQueryClient();
      return null;
    }
    renderApp(PATH, { api, extra: <Grab /> });
    const row = (await AGENT()).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' })).getByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText('Claude Code scollegato.')).toBeTruthy();
    holdCalls(api, 'agents', 'list');
    // Back to no data, read again: the list waits from zero.
    act(() => void client.resetQueries({ queryKey: ['agents', 'list'] }));
    await waitFor(() => expect(skeletons().length).toBe(1));
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Claude Code scollegato.')).toBe(true);
  });
});

import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import { renderApp } from '../test/renderApp';

const WOK = 'wok-pollo-peperoni-riso-basmati';
const PATH = `/recipes/${WOK}?from=menu&day=2026-10-08`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const fakeApi = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
const header = () => document.querySelector<HTMLElement>('.page-header');

describe('recipe page while loading (W20)', () => {
  it('recipe page: complete header and skeleton while loading, content on arrival', async () => {
    const api = fakeApi();
    const get = api.recipes.get;
    let release!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    api.recipes.get = (input) => gate.then(() => get(input));
    renderApp(PATH, { api });
    await waitFor(() => expect(document.querySelector('.secondary-view .skeleton[data-visible="true"]')).not.toBeNull());
    const waitingHeader = header()!;
    expect(within(waitingHeader).getByRole('link', { name: 'Menu' })).toBeTruthy();
    const title = waitingHeader.querySelector('h1.page-title')!;
    expect(title.getAttribute('aria-hidden')).toBe('true');
    expect(title.querySelector('.skeleton.skeleton-block')).not.toBeNull();
    expect(document.querySelector('.secondary-view [aria-busy="true"] .skeleton')).not.toBeNull();
    expect(screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')).toHaveLength(1);
    await act(async () => release());
    expect(await screen.findByRole('link', { name: /Wok di pollo/ })).toBeTruthy();
    expect(header()).toBe(waitingHeader);
    expect(header()!.querySelector('h1')!.getAttribute('aria-hidden')).toBeNull();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('recipe page: not found and error replace the skeleton', async () => {
    const api = fakeApi();
    api.recipes.get = async () => {
      throw new ApiError('not_found');
    };
    const { unmount } = renderApp(PATH, { api });
    expect(await screen.findByText('Ricetta non disponibile')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(within(header()!).getByRole('link', { name: 'Menu' })).toBeTruthy();
    unmount();
    const failing = fakeApi();
    failing.recipes.get = async () => {
      throw new ApiError('internal');
    };
    renderApp(PATH, { api: failing });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('recipe page: no skeleton with the cached copy', async () => {
    const api = fakeApi();
    const { history } = renderApp(PATH, { api });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    history.push('/recipes');
    await screen.findAllByRole('article');
    api.recipes.get = () => new Promise(() => undefined);
    history.push(PATH);
    expect(await screen.findByRole('link', { name: /Wok di pollo/ })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

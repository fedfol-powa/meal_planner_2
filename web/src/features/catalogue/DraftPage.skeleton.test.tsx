import { onlineManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DraftView } from '@app/contract';
import { ApiError } from '../../api/errors';
import { setOnline } from '../../test/connectivity';
import { holdCalls } from '../../test/holdCalls';
import { renderApp } from '../../test/renderApp';
import { catalogueApi, LUCIA } from './test-support';

afterEach(() => setOnline(true));

const DRAFT = '1d7c3b1e-0000-4000-8000-000000000001';
const CECI = '4a0b6e41-0000-4000-8000-000000000001';
const draft: DraftView = {
  draftId: DRAFT,
  recipeId: '2e8d4c2f-0000-4000-8000-000000000001',
  kind: 'new',
  revision: 3,
  content: {
    schemaVersion: 1,
    name: { 'it-IT': 'Zuppa di farro', 'en-GB': '' },
    description: { 'it-IT': 'Calda e densa', 'en-GB': null },
    sourceType: 'book',
    bookId: '5b1c7f52-0000-4000-8000-000000000001',
    bookPages: '42-43',
    durationMinutes: 50,
    baseServings: 4,
    proteinGroup: 'legumes',
    ingredients: [
      { ingredientId: CECI, variety: { 'it-IT': 'neri', 'en-GB': 'black' }, preparation: null, quantity: { kind: 'amount', value: 200, unit: 'g' }, sourceText: '200 g di ceci neri', isOptional: false, isPrimary: true },
      { ingredientId: null, variety: null, preparation: null, quantity: { kind: 'to_taste' }, sourceText: 'erbe aromatiche', isOptional: true, isPrimary: false }
    ]
  },
  createdBy: LUCIA,
  createdAt: '2026-10-05T10:00:00.000Z',
  updatedBy: LUCIA,
  updatedAt: '2026-10-06T16:00:00.000Z',
  baseVersion: null,
  currentVersion: 0,
  recipeStatus: 'draft',
  issues: [
    { path: ['name', 'en-GB'], code: 'translation_missing' },
    { path: ['ingredients', 1, 'ingredientId'], code: 'required' }
  ],
  missing: ['translation', 'ingredients'],
  conversions: [],
  outcome: null,
  canDiscard: true,
  ingredientNames: { [CECI]: 'Ceci' },
  bookTitle: 'Il cucchiaio verde'
};

const PATH = `/recipes/drafts/${DRAFT}`;
const loadingStatuses = () => screen.queryAllByRole('status').filter((s) => s.textContent === 'Caricamento…');
const titleBlock = () => document.querySelector<HTMLElement>('.secondary-view h1 .skeleton');

describe('draft page while loading (W22)', () => {
  it('draft: real back link, the title a hidden block, the body blocks, then the draft', async () => {
    const api = catalogueApi({ getDraft: async () => draft });
    const read = holdCalls(api, 'catalogue', 'getDraft');
    renderApp(PATH, { api });
    await waitFor(() => expect(titleBlock()).not.toBeNull());
    expect(document.querySelectorAll('.secondary-view h1')).toHaveLength(1);
    expect(document.querySelector('.secondary-view h1')!.getAttribute('aria-hidden')).toBe('true');
    expect(titleBlock()!.dataset.visible).toBe('false');
    const back = within(document.querySelector<HTMLElement>('.page-header')!).getByRole('link', { name: 'Ricettario' });
    expect(back.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelectorAll('.secondary-view .skeleton .skeleton-card')).toHaveLength(2);
    await waitFor(() => expect(titleBlock()!.dataset.visible).toBe('true'));
    expect(loadingStatuses()).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await read.open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' })).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it('draft: the skeleton while the profile loads; without the role the notice', async () => {
    const api = catalogueApi({ getDraft: async () => draft }, []);
    const profile = holdCalls(api, 'profile', 'get');
    renderApp(PATH, { api });
    await waitFor(() => expect(titleBlock()).not.toBeNull());
    await profile.open();
    expect(await screen.findByText('Bozza non disponibile')).toBeTruthy();
    expect(document.querySelector('.skeleton')).toBeNull();
  });

  it('draft: offline the title stands still', async () => {
    act(() => {
      setOnline(false);
      onlineManager.setOnline(false);
    });
    renderApp(PATH, { api: catalogueApi({ getDraft: async () => draft }) });
    await waitFor(() => expect(titleBlock()?.dataset.paused).toBe('true'));
    act(() => setOnline(true));
    expect(await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' })).toBeTruthy();
  });

  it('draft: an error replaces the skeleton', async () => {
    renderApp(PATH, { api: catalogueApi({ getDraft: async () => { throw new ApiError('internal'); } }) });
    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });

  it('draft: no skeleton with the cached copy', async () => {
    const api = catalogueApi({ getDraft: async () => draft });
    const { history } = renderApp(PATH, { api });
    await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' });
    act(() => history.push('/recipes'));
    await screen.findAllByRole('article');
    holdCalls(api, 'catalogue', 'getDraft');
    act(() => history.push(PATH));
    expect(await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' })).toBeTruthy();
    expect(document.querySelector('.secondary-view .skeleton')).toBeNull();
  });
});

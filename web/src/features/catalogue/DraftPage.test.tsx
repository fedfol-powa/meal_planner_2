import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draftView, type DraftView } from '@app/contract';
import { ApiError } from '../../api/errors';
import { renderApp } from '../../test/renderApp';
import { catalogueApi, LUCIA } from './test-support';

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

describe('DraftPage', () => {
  it('shows a curator the draft as saved, with what is missing to publish', async () => {
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => draft }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' })).toBeTruthy();
    expect(screen.getByText('Calda e densa')).toBeTruthy();
    expect(screen.getByText('Libro: Il cucchiaio verde, pp. 42-43')).toBeTruthy();
    expect(screen.getByText(/50 min/)).toBeTruthy();
    expect(screen.getByText('Dosi della fonte per 4 porzioni')).toBeTruthy();
    expect(screen.getByText('Ceci')).toBeTruthy();
    expect(screen.getByText('neri')).toBeTruthy();
    expect(screen.getByText('200 g di ceci neri')).toBeTruthy();
    expect(screen.getByText('da collegare')).toBeTruthy();
    expect(screen.getByText('Manca la traduzione')).toBeTruthy();
    expect(screen.getByText('Nome (inglese)')).toBeTruthy();
    expect(screen.getByText('Ingredienti, riga 2')).toBeTruthy();
    expect(screen.getByText('Ultima modifica: Lucia, 6 ott')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pubblica/ })).toBeNull();
  });

  it('is not found for members', async () => {
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => draft }, []) });
    expect(await screen.findByText('Bozza non disponibile')).toBeTruthy();
    expect(screen.queryByText('Zuppa di farro')).toBeNull();
  });

  it('shows the permission notice when the server refuses the read', async () => {
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => { throw new ApiError('forbidden'); } }) });
    expect(await screen.findByText('Solo i curatori del ricettario vedono le bozze.')).toBeTruthy();
  });

  it('says when the draft does not exist', async () => {
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => { throw new ApiError('not_found'); } }) });
    expect(await screen.findByText('Bozza non disponibile')).toBeTruthy();
  });

  it('shows the saved planner attributes, false values included, and names the attribute of a problem', async () => {
    const classified: DraftView = {
      ...draft,
      content: { ...draft.content, mealType: 'both', carbohydrateGroup: 'cereals', isFreshFish: false, hasVegetables: true, isHeavy: false, seasons: ['autumn', 'winter'] },
      issues: [{ path: ['category'], code: 'required' }]
    };
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => classified }) });
    const attributes = await screen.findByRole('region', { name: 'Attributi' });
    const value = (term: string) => [...attributes.querySelectorAll('dt')].find((dt) => dt.textContent === term)?.nextElementSibling?.textContent;
    expect(value('Pasto')).toBe('Pranzo e cena');
    expect(value('Proteina principale')).toBe('Legumi');
    expect(value('Carboidrati')).toBe('Cereali');
    expect(value('Tipo di piatto')).toBe('—');
    expect(value('Pesce fresco')).toBe('No');
    expect(value('Con verdure')).toBe('Sì');
    expect(value('Piatto pesante')).toBe('No');
    expect(value('Stagioni')).toBe('autunno, inverno');
    expect(screen.getByText('Dato obbligatorio').nextElementSibling?.textContent).toBe('Tipo di piatto');
  });

  it('says «all year» when the seasons are empty', async () => {
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => ({ ...draft, content: { ...draft.content, seasons: [] } }) }) });
    expect(await screen.findByText('Tutto l’anno')).toBeTruthy();
  });

  it('shows an imported draft that does not match the current schema, with its problems', async () => {
    // Valid for the contract (content is any record), not for recipeDraftSchema.
    const legacy = draftView.parse({
      ...draft,
      content: {
        schemaVersion: 1, name: { 'it-IT': 42, 'en-GB': 'Legacy' }, description: 7, sourceType: 'book', bookPages: { from: 1 }, sourceUrl: 3,
        durationMinutes: '50', baseServings: 'four', proteinGroup: 'lamb', mealType: 'brunch', isHeavy: 'yes', seasons: 'winter',
        ingredients: [null, 'flour', { ingredientId: 5, variety: { 'it-IT': 1 }, sourceText: { text: 'x' } }, { ingredientId: CECI, sourceText: 'ceci' }]
      },
      issues: [{ path: ['name', 'it-IT'], code: 'invalid_value' }, { path: ['mealType'], code: 'invalid_value' }]
    });
    renderApp(`/recipes/drafts/${DRAFT}`, { api: catalogueApi({ getDraft: async () => legacy }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Legacy' })).toBeTruthy();
    expect(screen.getAllByText('Valore non valido')).toHaveLength(2);
    expect(screen.getByText('Nome (italiano)')).toBeTruthy();
    expect(screen.getByText('Ceci')).toBeTruthy();
    expect(screen.getByText('ceci')).toBeTruthy();
    expect(screen.getAllByText('da collegare')).toHaveLength(1);
    expect(screen.getByText('Libro: Il cucchiaio verde, pp. —')).toBeTruthy();
  });

  it('offers to retry when the first read of the profile fails', async () => {
    let failing = true;
    const api = catalogueApi({ getDraft: async () => draft });
    const profileGet = api.profile.get;
    api.profile.get = async (input) => {
      if (failing) throw new ApiError('internal');
      return profileGet(input);
    };
    renderApp(`/recipes/drafts/${DRAFT}`, { api });
    expect(await screen.findByText('Il servizio ha avuto un problema: riprova tra poco.')).toBeTruthy();
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Zuppa di farro' })).toBeTruthy();
  });
});

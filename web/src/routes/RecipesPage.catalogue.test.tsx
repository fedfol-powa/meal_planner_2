import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OverviewView } from '@app/contract';
import { catalogueApi, LUCIA } from '../features/catalogue/test-support';
import { renderApp } from '../test/renderApp';

const overview: OverviewView = {
  drafts: [{ draftId: '1d7c3b1e-0000-4000-8000-000000000001', recipeId: '2e8d4c2f-0000-4000-8000-000000000001', kind: 'new', name: 'Zuppa di farro',
    createdBy: LUCIA, updatedBy: LUCIA, updatedAt: '2026-10-06T16:00:00.000Z', missing: [] }],
  archived: [{ recipeId: '3f9e5d30-0000-4000-8000-000000000009', name: 'Erbazzone', archivedBy: LUCIA, archivedAt: '2026-10-05T10:00:00.000Z' }]
};

describe('recipe book of a curator', () => {
  it('shows drafts after the filters and archived recipes at the end, inside the scrolling view', async () => {
    renderApp('/recipes', { api: catalogueApi({ overview: async () => overview }) });
    const drafts = await screen.findByRole('button', { name: /Bozze/ });
    const view = drafts.closest('.secondary-view')!;
    expect(view).not.toBeNull();
    expect(within(view as HTMLElement).getByRole('heading', { level: 1, name: 'Ricettario' })).toBeTruthy();
    expect(within(view as HTMLElement).getByRole('button', { name: /Archiviate/ })).toBeTruthy();
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(screen.getByRole('search'), drafts)).toBe(true);
    expect(follows(drafts, screen.getByRole('button', { name: /Archiviate/ }))).toBe(true);
  });

  it('shows drafts and archived recipes to a curator without a family, next to the notice', async () => {
    const api = catalogueApi({ overview: async () => overview });
    const get = api.profile.get;
    api.profile.get = async (...args) => ({ ...(await get(...args)), families: [], currentFamilyId: null });
    renderApp('/recipes', { api });
    expect(await screen.findByText('Non fai ancora parte di una famiglia')).toBeTruthy();
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Archiviate/ })).toBeTruthy();
  });

  it('shows neither section to a member', async () => {
    renderApp('/recipes', { api: catalogueApi({ overview: async () => overview }, []) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Ricettario' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bozze/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Archiviate/ })).toBeNull();
  });
});

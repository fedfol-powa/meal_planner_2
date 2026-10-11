import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import type { OverviewView } from '@app/contract';
import { CatalogueDraftsSection } from './CatalogueDraftsSection';
import { catalogueApi, LUCIA, renderCatalogue } from './test-support';

const overview: OverviewView = {
  drafts: [
    { draftId: '1d7c3b1e-0000-4000-8000-000000000001', recipeId: '2e8d4c2f-0000-4000-8000-000000000001', kind: 'new', name: 'Zuppa di farro',
      createdBy: LUCIA, updatedBy: LUCIA, updatedAt: '2026-10-06T16:00:00.000Z', missing: ['baseServings', 'translation'] },
    { draftId: '1d7c3b1e-0000-4000-8000-000000000002', recipeId: '2e8d4c2f-0000-4000-8000-000000000002', kind: 'revision', name: 'Risotto',
      createdBy: LUCIA, updatedBy: { userId: null, name: null }, updatedAt: '2026-10-07T09:00:00.000Z', missing: [] }
  ],
  archived: []
};

describe('CatalogueDraftsSection', () => {
  it('shows draft cards to curators with kind, author, date and what they miss', async () => {
    renderCatalogue(<CatalogueDraftsSection />, catalogueApi({ overview: async () => overview }));
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    expect(screen.getByText('Nuova')).toBeTruthy();
    expect(screen.getByText('Modifica')).toBeTruthy();
    expect(screen.getByText('Lucia · 6 ott')).toBeTruthy();
    expect(screen.getByText('Porzioni')).toBeTruthy();
    expect(screen.getByText('Traduzione')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Zuppa di farro/ }).getAttribute('href')).toBe('/recipes/drafts/1d7c3b1e-0000-4000-8000-000000000001');
  });

  it('collapses and opens again', async () => {
    renderCatalogue(<CatalogueDraftsSection />, catalogueApi({ overview: async () => overview }));
    const toggle = await screen.findByRole('button', { name: /Bozze/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryByText('Zuppa di farro')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Zuppa di farro')).toBeTruthy();
  });

  it('renders nothing for members and never reads the overview', async () => {
    let reads = 0;
    const { container } = renderCatalogue(<CatalogueDraftsSection />, catalogueApi({ overview: async () => (reads++, overview) }, []));
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(reads).toBe(0);
  });

  it('removes drafts already shown when the server refuses a later read, and reads the profile again', async () => {
    let refuse = false;
    let profileReads = 0;
    const api = catalogueApi({ overview: async () => { if (refuse) throw new ApiError('forbidden'); return overview; } }, () => (profileReads++, ['recipe_curator']));
    const { refetchAll } = renderCatalogue(<CatalogueDraftsSection />, api);
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    const before = profileReads;
    refuse = true;
    await refetchAll();
    await waitFor(() => expect(screen.queryByText('Zuppa di farro')).toBeNull());
    await waitFor(() => expect(profileReads).toBeGreaterThan(before));
  });

  it('keeps drafts already shown when only the network fails', async () => {
    let offline = false;
    const { refetchAll } = renderCatalogue(<CatalogueDraftsSection />, catalogueApi({ overview: async () => { if (offline) throw new ApiError('network'); return overview; } }));
    expect(await screen.findByText('Zuppa di farro')).toBeTruthy();
    offline = true;
    await refetchAll();
    expect(screen.getByText('Zuppa di farro')).toBeTruthy();
  });
});

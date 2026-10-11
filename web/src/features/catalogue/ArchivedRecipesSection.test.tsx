import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArchivedSummaryView, StatusView } from '@app/contract';
import { ApiError } from '../../api/errors';
import { ArchivedRecipesSection } from './ArchivedRecipesSection';
import { catalogueApi, LUCIA, renderCatalogue } from './test-support';

const RECIPE = '3f9e5d30-0000-4000-8000-000000000009';
const erbazzone: ArchivedSummaryView = { recipeId: RECIPE, name: 'Erbazzone', archivedBy: LUCIA, archivedAt: '2026-10-05T10:00:00.000Z' };
const brought: StatusView = { recipeId: RECIPE, status: 'published', changedBy: LUCIA, changedAt: '2026-10-11T10:00:00.000Z' };

describe('ArchivedRecipesSection', () => {
  it('is closed at first, then lists the archived recipes with author and date', async () => {
    renderCatalogue(<ArchivedRecipesSection />, catalogueApi({ overview: async () => ({ drafts: [], archived: [erbazzone] }) }));
    const toggle = await screen.findByRole('button', { name: /Archiviate/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Erbazzone')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText('Erbazzone')).toBeTruthy();
    expect(screen.getByText('Lucia · 5 ott')).toBeTruthy();
  });

  it('brings a recipe back and shows the server answer, without optimistic changes', async () => {
    let archived = [erbazzone];
    let release!: () => void;
    const setArchived = vi.fn(() => new Promise<StatusView>((resolve) => {
      release = () => { archived = []; resolve(brought); };
    }));
    renderCatalogue(<ArchivedRecipesSection />, catalogueApi({ overview: async () => ({ drafts: [], archived }), setArchived }));
    fireEvent.click(await screen.findByRole('button', { name: /Archiviate/ }));
    const button = screen.getByRole('button', { name: 'Riporta nel ricettario' });
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText('Erbazzone')).toBeTruthy(); // still there while waiting
    release();
    await waitFor(() => expect(screen.queryByText('Erbazzone')).toBeNull());
    expect((setArchived.mock.calls[0] as unknown[])[0]).toEqual({ recipeId: RECIPE, archived: false }); // the session adds its options
  });

  it('drops the catalogue views when the bring-back is refused (role revoked)', async () => {
    let roles: ('recipe_curator' | 'app_admin')[] = ['recipe_curator'];
    const api = catalogueApi({
      overview: async () => ({ drafts: [], archived: [erbazzone] }),
      setArchived: async () => { roles = []; throw new ApiError('forbidden'); }
    }, () => roles);
    const { queryClient } = renderCatalogue(<ArchivedRecipesSection />, api);
    fireEvent.click(await screen.findByRole('button', { name: /Archiviate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Riporta nel ricettario' }));
    await waitFor(() => expect(screen.queryByText('Erbazzone')).toBeNull());
    await waitFor(() => expect(queryClient().getQueriesData({ queryKey: ['catalogue'] }).filter(([, data]) => data !== undefined)).toEqual([]));
  });
});

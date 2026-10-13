import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStubBackend } from '../../test/stubBackend';
import { renderApp } from '../../test/renderApp';
import { needsHomeScreenHint } from './ios';

vi.mock('./ios', () => ({ needsHomeScreenHint: vi.fn(() => false) }));

describe('welcome card in the menu', () => {
  afterEach(() => vi.mocked(needsHomeScreenHint).mockReturnValue(false));

  it('shows once the week is loaded, and closing removes the parameter without a new entry', async () => {
    const { history } = renderApp('/menu?welcome=true');
    expect(screen.queryByText('Il primo menu è pronto')).toBeNull();
    expect(await screen.findByText('Il primo menu è pronto')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Pasti della settimana' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sistema le impostazioni' }).getAttribute('href')).toBe('/profile/family/settings');
    expect(screen.queryByText(/schermata Home/)).toBeNull();
    const length = history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    await waitFor(() => expect(history.location.search).not.toContain('welcome'));
    expect(history.length).toBe(length);
    expect(screen.queryByText('Il primo menu è pronto')).toBeNull();
  });

  it('adds the Home Screen note on iOS in Safari', async () => {
    vi.mocked(needsHomeScreenHint).mockReturnValue(true);
    renderApp('/menu?welcome=true');
    expect(await screen.findByText(/Condividi › Aggiungi alla schermata Home/)).toBeTruthy();
  });

  it('is not shown to a member', async () => {
    renderApp('/menu?welcome=true', { backend: createStubBackend({ id: 'user-anna', email: 'anna@example.com' }) });
    expect(await screen.findByRole('region', { name: 'Pasti della settimana' })).toBeTruthy();
    expect(screen.queryByText('Il primo menu è pronto')).toBeNull();
  });
});

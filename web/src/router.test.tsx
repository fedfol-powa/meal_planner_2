import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeBackend } from './auth/backend';
import { createStubBackend } from './test/stubBackend';
import { renderApp } from './test/renderApp';

describe('routes', () => {
  it('sends signed-out people to the sign-in page, keeping the destination', async () => {
    const { history } = renderApp('/recipes?q=riso', { backend: createStubBackend(null) });
    await waitFor(() => expect(history.location.pathname).toBe('/login'));
    expect(history.location.search).toContain('redirect');
    expect(screen.queryByRole('navigation', { name: 'Navigazione principale' })).toBeNull();
  });
  it('opens the menu from the root', async () => {
    const { history } = renderApp('/');
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });
  it('skips the sign-in page in fake mode', async () => {
    const { history } = renderApp('/login', { backend: createFakeBackend() });
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
  });
  it('shows a not found page for unknown paths', async () => {
    renderApp('/nope');
    expect(await screen.findByText('Contenuto non trovato')).toBeTruthy();
  });
  it('has an icon navbar with accessible names and the current view marked', async () => {
    renderApp('/recipes');
    const nav = await screen.findByRole('navigation', { name: 'Navigazione principale' });
    const links = Array.from(nav.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Menu', 'Ricettario', 'Profilo']);
    expect(links[1]?.getAttribute('aria-current')).toBe('page');
    expect(links[0]?.getAttribute('aria-current')).toBeNull();
  });
});

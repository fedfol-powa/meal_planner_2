import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEMO_USER } from './auth/backend';
import { renderApp } from './test/renderApp';
import { createStubBackend } from './test/stubBackend';

describe('startup (W20)', () => {
  it('startup shows the generic skeleton while the access check is held', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdCheck();
    renderApp('/recipes', { backend });
    expect(document.querySelector('.skeleton')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.skeleton[data-visible="true"]')).not.toBeNull());
    expect(screen.getAllByRole('status').filter((s) => s.textContent === 'Caricamento…')).toHaveLength(1);
    expect(document.querySelector('.secondary-view [aria-busy="true"]')).not.toBeNull();
    await act(async () => answer({ status: 'signedIn', user: DEMO_USER }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ricettario' })).toBeTruthy();
    expect((await screen.findAllByRole('article')).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.querySelector('.skeleton')).toBeNull());
  });
});

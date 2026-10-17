import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';

describe('NotFound', () => {
  // An old shell without /password shows «non trovata»: the fragment must survive until W8 reloads
  // the page into the new version, which verifies it (spec W15, «Passaggio fra versioni», case C).
  it('leaves the fragment of the address alone', async () => {
    const hash = '#token_hash=hash-1&type=recovery';
    const { history } = renderApp(`/not-a-page${hash}`, { backend: createStubBackend(null) });
    expect(await screen.findByText('Contenuto non trovato')).toBeTruthy();
    expect(history.location.hash).toBe(hash);
    expect(history.location.pathname).toBe('/not-a-page');
  });
});

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api, MeView } from '../api/types';
import { renderApp } from '../test/renderApp';

function withMe(get: () => Promise<MeView>): Api {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  return { ...base, me: { get: async () => ({ unchanged: false, version: 'me', data: await get() }) } };
}
const me = (patch: Partial<MeView>): MeView => ({
  user: { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT' },
  families: [{ id: 'family-main', name: 'Famiglia Folloni', timeZone: 'Europe/Rome', role: 'family_admin' }],
  currentFamilyId: 'family-main',
  ...patch
});

describe('family state', () => {
  it('shows the error with a retry that works', async () => {
    let calls = 0;
    renderApp('/recipes', { api: withMe(async () => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : me({}))) });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: 'Ricettario' })).toBeTruthy();
  });
  it('says when the person has no family', async () => {
    renderApp('/menu', { api: withMe(async () => me({ families: [], currentFamilyId: null })) });
    expect(await screen.findByText('Non fai parte di nessuna famiglia')).toBeTruthy();
  });
  it('treats a vanished current family as no family', async () => {
    renderApp('/menu', { api: withMe(async () => me({ currentFamilyId: 'family-gone' })) });
    expect(await screen.findByText('Non fai parte di nessuna famiglia')).toBeTruthy();
  });
});

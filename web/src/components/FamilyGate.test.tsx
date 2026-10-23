import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi } from '../api/fake/fakeApi';
import type { Api, ProfileView } from '../api/types';
import { renderApp } from '../test/renderApp';

function withProfile(get: () => Promise<ProfileView>): Api {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  return { ...base, profile: { ...base.profile, get } };
}
const profile = (patch: Partial<ProfileView>): ProfileView => ({
  user: { id: 'user-federico', displayName: 'Federico', email: 'federico@example.com', locale: 'it-IT', menuEmails: true, globalRoles: [] },
  families: [{ id: 'family-main', name: 'Famiglia Folloni', timeZone: 'Europe/Rome', measurementSystem: 'metric', role: 'family_admin' }],
  currentFamilyId: 'family-main',
  ...patch
});

describe('family state', () => {
  it('shows the error with a retry that works', async () => {
    let calls = 0;
    renderApp('/recipes', { api: withProfile(async () => (calls++ === 0 ? Promise.reject(new ApiError('unknown')) : profile({}))) });
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }));
    expect(await screen.findByRole('heading', { name: 'Ricettario' })).toBeTruthy();
  });
  it('says when the person has no family', async () => {
    renderApp('/menu', { api: withProfile(async () => profile({ families: [], currentFamilyId: null })) });
    expect(await screen.findByText('Non fai ancora parte di una famiglia')).toBeTruthy();
  });
  it('offers to create a family', async () => {
    renderApp('/menu', { api: withProfile(async () => profile({ families: [], currentFamilyId: null })) });
    expect((await screen.findByRole('link', { name: 'Crea la tua famiglia' })).getAttribute('href')).toBe('/family/new');
  });
  it('points to the invitation links under the create button', async () => {
    renderApp('/menu', { api: withProfile(async () => profile({ families: [], currentFamilyId: null })) });
    expect(await screen.findByText('Hai un link d’invito? Aprilo per entrare nella famiglia di chi te l’ha mandato.')).toBeTruthy();
  });
  it('treats a vanished current family as no family', async () => {
    renderApp('/menu', { api: withProfile(async () => profile({ currentFamilyId: 'family-gone' })) });
    expect(await screen.findByText('Non fai ancora parte di una famiglia')).toBeTruthy();
  });
});

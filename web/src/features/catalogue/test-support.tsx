import { act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createFakeApi } from '../../api/fake/fakeApi';
import type { Api, ProfileView } from '../../api/types';
import { renderWithProviders } from '../../test/renderWithProviders';

type Roles = ProfileView['user']['globalRoles'];

export const LUCIA = { userId: '0c4e0a6e-1b1a-4c55-9a3b-1f2a3b4c5d6e', name: 'Lucia' };

/**
 * The fake API with the catalogue area overridden and the profile's roles chosen by the test;
 * `roles` as a function lets them change after the first read (a revoked curator).
 */
export function catalogueApi(catalogue: Partial<Api['catalogue']>, roles: Roles | (() => Roles) = ['recipe_curator']): Api {
  const base = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
  const rolesNow = typeof roles === 'function' ? roles : () => roles;
  return {
    ...base,
    profile: {
      ...base.profile,
      get: async () => {
        const profile = await base.profile.get({});
        return { ...profile, user: { ...profile.user, globalRoles: rolesNow() } };
      }
    },
    catalogue: { ...base.catalogue, ...catalogue }
  };
}

export function renderCatalogue(ui: ReactNode, api: Api) {
  const result = renderWithProviders(ui, { api });
  return {
    ...result,
    /** Every active query read again, as on focus or reconnection. */
    refetchAll: async () => {
      await act(async () => {
        await result.queryClient().refetchQueries({ type: 'active' });
      });
    }
  };
}

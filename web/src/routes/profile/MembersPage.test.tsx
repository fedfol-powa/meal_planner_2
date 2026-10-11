import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/renderApp';

describe('members', () => {
  it('shows an administrator the list with «tu» and the roles, without actions', async () => {
    renderApp('/profile/family');
    expect(await screen.findByText('Federico (tu)')).toBeTruthy();
    expect(screen.getAllByText('Membro')).toHaveLength(2);
    expect(screen.queryByText(/chiedi un link/)).toBeNull();
    expect(screen.queryAllByRole('button').filter((b) => b.closest('.settings-card'))).toEqual([]);
  });
  it('tells a member which administrators to ask for invitations', async () => {
    const { createStubBackend } = await import('../../test/stubBackend');
    renderApp('/profile/family', { backend: createStubBackend({ id: 'user-anna', email: 'anna@example.com' }, 'supabase') });
    expect(await screen.findByText('Anna (tu)')).toBeTruthy();
    expect(screen.getByText('Per invitare qualcuno chiedi un link a: Federico.')).toBeTruthy();
    expect(screen.getAllByText('Dal 1 settembre', { selector: 'small' })).toHaveLength(2);
  });
});

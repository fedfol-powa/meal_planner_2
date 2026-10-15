import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { createFakeAppInvitations, expireFakeInvitation, FAKE_INVITE_TOKEN, fakeTokenOf } from './fakeAppInvitations';

const id = '00000000-0000-4000-8000-0000000000b1';

describe('fake app invitations', () => {
  it('creates with a link in the fragment, lists it pending and revokes it', async () => {
    const api = createFakeAppInvitations();
    const { invitation, url } = await api.create({ id, email: 'nuova@x.it', roles: ['recipe_curator'] });
    expect(url).toMatch(/\/invite\/app#[A-Za-z0-9_-]{43}$/);
    expect(invitation).toMatchObject({ id, email: 'nuova@x.it', roles: ['recipe_curator'], status: 'pending' });
    expect((await api.list({})).invitations.find((i) => i.id === id)?.status).toBe('pending');
    expect((await api.revoke({ id })).invitation.status).toBe('revoked');
  });

  it('computes expiry like the server and still revokes an expired invitation', async () => {
    const api = createFakeAppInvitations();
    await api.create({ id, email: 'tardi@x.it', roles: [] });
    expireFakeInvitation(api, id);
    expect((await api.list({})).invitations.find((i) => i.id === id)?.status).toBe('expired');
    expect((await api.revoke({ id })).invitation.status).toBe('revoked');
  });

  it('reads the demo link and accepts a created one once', async () => {
    const api = createFakeAppInvitations();
    expect(await api.get({ token: FAKE_INVITE_TOKEN })).toEqual({ invitedBy: 'Federico', roles: [] });
    await api.create({ id, email: 'giulia@x.it', roles: [] });
    const token = fakeTokenOf(api, id);
    await expect(api.accept({ token, email: 'altra@x.it', displayName: 'G', password: 'segreta123', locale: 'it-IT' })).rejects.toMatchObject({ code: 'invalid' });
    expect(await api.accept({ token, email: ' Giulia@x.it', displayName: 'G', password: 'segreta123', locale: 'it-IT' })).toEqual({ email: 'giulia@x.it' });
    await expect(api.get({ token })).rejects.toEqual(new ApiError('invitation_unavailable'));
  });

  it('refuses an unknown link', async () => {
    await expect(createFakeAppInvitations().get({ token: 'z'.repeat(43) })).rejects.toEqual(new ApiError('invitation_unavailable'));
  });

  it('refuses an email that has an account, as the server', async () => {
    const area = createFakeAppInvitations(0, (email) => email === 'ospite@example.com');
    await expect(area.create({ id: crypto.randomUUID(), email: ' Ospite@example.com', roles: [] })).rejects.toEqual(new ApiError('not_allowed', { reason: 'account_exists' }));
  });
});

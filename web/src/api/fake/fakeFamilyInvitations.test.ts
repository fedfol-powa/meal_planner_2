import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import type { Read } from '../types';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID } from './fakeApi';
import { FAKE_FAMILY_EXPIRED_TOKEN, FAKE_FAMILY_INVITE_TOKEN, FAKE_FAMILY_REVOKED_TOKEN } from './fakeFamilyInvitations';

const familyId = DEMO_FAMILY_ID;
/** Several people on one fake backend, as the server sees them. */
function world() {
  const shared = createFakeData({ id: 'user-federico', email: 'federico@example.com' });
  const as = (id: string, email = `${id}@example.com`) => createFakeApi({ getLocale: () => 'it-IT', data: { ...shared, user: { id, email } } as typeof shared });
  return { as, shared };
}
const data = <T,>(read: Read<T>): T => {
  if (read.unchanged) throw new Error('unchanged');
  return read.data;
};

describe('fake family invitations', () => {
  it('seed: a valid link, an expired one with pending registrations; revoked links are not listed', async () => {
    const { invitations } = await world().as('user-federico').familyInvitations.list({ familyId });
    expect(invitations.map((i) => [i.createdByName, i.expired, i.pendingRegistrations])).toEqual([
      ['Federico', false, 0],
      ['Federico', true, 1]
    ]);
  });

  it('creates, renews on the same id and revokes; members are refused', async () => {
    const { as } = world();
    const federico = as('user-federico');
    const id = crypto.randomUUID();
    const { url, invitation } = await federico.familyInvitations.create({ familyId, id });
    expect(url).toMatch(/\/invite#[A-Za-z0-9_-]{43}$/);
    const again = await federico.familyInvitations.create({ familyId, id });
    expect(again.url).not.toBe(url);
    expect(again.invitation.id).toBe(invitation.id);
    const { invitations } = await federico.familyInvitations.revoke({ familyId, id });
    expect(invitations.map((i) => i.id)).not.toContain(id);
    await expect(federico.familyInvitations.revoke({ familyId, id: crypto.randomUUID() })).rejects.toEqual(new ApiError('not_found'));
    await expect(as('user-anna').familyInvitations.list({ familyId })).rejects.toEqual(new ApiError('forbidden'));
  });

  it('the public page reads the family and who invites; expired, revoked and unknown links are unavailable', async () => {
    const { as } = world();
    expect(await as('user-new').familyInvitations.get({ token: FAKE_FAMILY_INVITE_TOKEN })).toEqual({
      familyName: 'Famiglia Folloni', invitedBy: 'Federico', accountsAvailable: true
    });
    for (const token of [FAKE_FAMILY_EXPIRED_TOKEN, FAKE_FAMILY_REVOKED_TOKEN, 'z'.repeat(43)]) {
      await expect(as('user-new').familyInvitations.get({ token })).rejects.toEqual(new ApiError('invitation_unavailable'));
    }
  });

  it('status and join: members already belong, Marco (removed after the link) stays out, others join', async () => {
    const { as } = world();
    const token = FAKE_FAMILY_INVITE_TOKEN;
    expect((await as('user-anna').familyInvitations.status({ token })).alreadyMember).toBe(true);
    await expect(as('user-marco').familyInvitations.status({ token })).rejects.toEqual(new ApiError('invitation_unavailable'));
    await expect(as('user-marco').family.join({ token })).rejects.toEqual(new ApiError('invitation_unavailable'));
    // A new person of the fake mode starts in the demo family: out first (leaving writes no removal).
    const newcomer = as('user-new');
    await newcomer.family.leave({ familyId });
    expect((await newcomer.familyInvitations.status({ token })).alreadyMember).toBe(false);
    const profile = await newcomer.family.join({ token });
    expect(profile.currentFamilyId).toBe(familyId);
    expect(profile.families.map((f) => f.id)).toContain(familyId);
    expect((await newcomer.family.join({ token })).currentFamilyId).toBe(familyId);
    const { joins } = await as('user-federico').familyInvitations.listJoins({ familyId });
    expect(joins.map((j) => [j.mode, j.userName])).toEqual([['existing_account', 'User-new'], ['new_account', null]]);
  });

  it('accept: a new account joins; a registered email is refused; at most 10 people per link', async () => {
    const { as } = world();
    const anonymous = as('user-new');
    const token = FAKE_FAMILY_INVITE_TOKEN;
    const form = (email: string) => ({ token, email, displayName: 'Giulia', locale: 'it-IT' as const });
    expect(await anonymous.familyInvitations.accept(form('giulia@x.it'))).toEqual({ email: 'giulia@x.it', joined: true, passwordEmail: 'sent' });
    expect(await anonymous.familyInvitations.accept(form('giulia@x.it'))).toEqual({ email: 'giulia@x.it', joined: true, passwordEmail: 'not_sent' });
    expect(await anonymous.familyInvitations.resendPasswordEmail({ token, email: 'giulia@x.it', locale: 'it-IT' })).toEqual({ passwordEmail: 'sent' });
    await expect(anonymous.familyInvitations.accept(form('anna@example.com'))).rejects.toEqual(new ApiError('not_allowed', { reason: 'account_exists' }));
    for (let i = 0; i < 9; i++) await anonymous.familyInvitations.accept(form(`p${i}@x.it`));
    expect((await anonymous.familyInvitations.get({ token })).accountsAvailable).toBe(false);
    await expect(anonymous.familyInvitations.accept(form('late@x.it'))).rejects.toEqual(new ApiError('invitation_unavailable'));
    const family = data(await as('user-federico').family.get({ familyId }));
    expect(family.members.map((m) => m.displayName)).toContain('Giulia');
  });
});

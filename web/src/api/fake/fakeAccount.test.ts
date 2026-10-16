import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import type { Read } from '../types';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID } from './fakeApi';

const familyId = DEMO_FAMILY_ID;
function world(globalRoles?: ('recipe_curator' | 'app_admin')[]) {
  const shared = createFakeData({ id: 'user-federico', email: 'federico@example.com' });
  const as = (id: string) => createFakeApi({ getLocale: () => 'it-IT', globalRoles: id === 'user-federico' ? globalRoles : undefined, data: { ...shared, user: { id, email: `${id}@example.com` } } as typeof shared });
  return { as };
}
const data = <T,>(read: Read<T>): T => {
  if (read.unchanged) throw new Error('unchanged');
  return read.data;
};

describe('fake account deletion', () => {
  it('plans: the only administrator needs a successor among the members; a member stays', async () => {
    const { as } = world();
    const plan = await as('user-federico').account.getDeletionPlan({});
    expect(plan.families).toEqual([
      { familyId, name: 'Famiglia Folloni', outcome: 'needs_successor', candidates: [{ userId: 'user-anna', displayName: 'Anna' }, { userId: 'user-tom', displayName: 'Tom' }] }
    ]);
    expect(plan).toMatchObject({ lastAppAdmin: false, openInvitations: 2, pending: false });
    expect(plan.connectedAgents).toBeGreaterThanOrEqual(0);
    expect((await as('user-anna').account.getDeletionPlan({})).families[0]!.outcome).toBe('stays');
  });

  it('refuses a missing successor and a changed plan, then deletes and promotes the successor', async () => {
    const { as } = world();
    const federico = as('user-federico');
    await expect(federico.account.delete({ successors: {}, deletedFamilies: [] })).rejects.toEqual(
      new ApiError('invalid', { issues: [{ path: ['successors'], code: 'successor' }] })
    );
    await expect(federico.account.delete({ successors: { [familyId]: 'user-anna' }, deletedFamilies: [familyId] })).rejects.toEqual(new ApiError('conflict'));
    expect(await federico.account.delete({ successors: { [familyId]: 'user-anna' }, deletedFamilies: [] })).toEqual({ completed: true });
    expect(data(await as('user-anna').family.get({ familyId })).myRole).toBe('family_admin');
  });

  it('the last app administrator cannot delete the account', async () => {
    const { as } = world(['app_admin']);
    const plan = await as('user-federico').account.getDeletionPlan({});
    expect(plan.lastAppAdmin).toBe(true);
    await expect(as('user-federico').account.delete({ successors: { [familyId]: 'user-anna' }, deletedFamilies: [] })).rejects.toEqual(new ApiError('last_app_admin'));
  });

  it('users: own account refused, another user deleted', async () => {
    const { as } = world(['app_admin']);
    const federico = as('user-federico');
    await expect(federico.users.getDeletionPlan({ id: 'user-federico' })).rejects.toEqual(new ApiError('not_allowed', { reason: 'own_account' }));
    await expect(federico.users.delete({ id: 'user-federico', successors: {}, deletedFamilies: [] })).rejects.toEqual(new ApiError('not_allowed', { reason: 'own_account' }));
    const plan = await federico.users.getDeletionPlan({ id: 'user-tom' });
    expect(plan.user).toMatchObject({ id: 'user-tom', displayName: 'Tom' });
    expect(plan.families[0]!.outcome).toBe('stays');
    expect(await federico.users.delete({ id: 'user-tom', successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
    expect((await federico.users.list({})).users.map((u) => u.id)).not.toContain('user-tom');
    await expect(federico.users.getDeletionPlan({ id: 'user-tom' })).rejects.toEqual(new ApiError('not_found'));
  });
});

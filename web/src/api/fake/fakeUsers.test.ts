import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import { FAKE_GUEST_ID, createFakeUsers } from './fakeUsers';
import { DEMO_USER_ID } from './seed';

/** The signed-in person is the seed's Federico, as in the fake API. */
const make = (roles: ('recipe_curator' | 'app_admin')[] = ['app_admin']) =>
  createFakeUsers({
    self: { id: DEMO_USER_ID, displayName: () => 'Federico', email: 'federico@example.com', roles, family: 'family_admin' },
    familyName: () => 'Famiglia Folloni'
  });

describe('fake users', () => {
  it('lists the seed people once, the signed-in one included, and the account with no roles and no family', async () => {
    const { area } = make();
    expect((await area.list({ query: 'FEDERICO' })).users.map((u) => u.id)).toEqual([DEMO_USER_ID]);
    expect((await area.list({})).users.map((u) => u.displayName)).toEqual(['Anna', 'Federico', 'Ospite', 'Tom']);
    expect((await area.list({ query: 'ospite@' })).users).toEqual([{ id: FAKE_GUEST_ID, displayName: 'Ospite', email: 'ospite@example.com', roles: [], deletion: null, emailUnconfirmed: false }]);
    expect((await area.list({})).more).toBe(false);
  });
  it('protects the last app admin and is idempotent', async () => {
    const users = make();
    await expect(users.area.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false })).rejects.toEqual(new ApiError('last_app_admin'));
    await users.area.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    await users.area.setRole({ id: FAKE_GUEST_ID, role: 'app_admin', granted: true });
    expect((await users.area.get({ id: FAKE_GUEST_ID })).user.roles).toEqual(['app_admin']);
    await users.area.setRole({ id: DEMO_USER_ID, role: 'app_admin', granted: false });
    expect(users.rolesOf(DEMO_USER_ID)).toEqual([]);
  });
  it('refuses a signed-in person without app_admin, as the server', async () => {
    const { area } = make(['recipe_curator']);
    await expect(area.list({})).rejects.toEqual(new ApiError('forbidden'));
    await expect(area.get({ id: FAKE_GUEST_ID })).rejects.toEqual(new ApiError('forbidden'));
  });
  it('answers not_found for an unknown id and shows families by name and role', async () => {
    const { area } = make();
    await expect(area.get({ id: 'nobody' })).rejects.toEqual(new ApiError('not_found'));
    expect((await area.get({ id: DEMO_USER_ID })).families).toEqual([{ name: 'Famiglia Folloni', role: 'family_admin' }]);
    expect((await area.get({ id: FAKE_GUEST_ID })).families).toEqual([]);
  });
  it('knows which emails have an account', () => {
    const users = make();
    expect(users.hasEmail(' OSPITE@example.com')).toBe(true);
    expect(users.hasEmail('nuova@x.it')).toBe(false);
  });
});

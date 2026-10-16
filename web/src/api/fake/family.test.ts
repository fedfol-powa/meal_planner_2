import { describe, expect, it } from 'vitest';
import type { Read } from '../types';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID } from './fakeApi';

const familyId = DEMO_FAMILY_ID;
const as = (id: string, email = `${id}@example.com`) => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, user: { id, email } });
const data = <T,>(read: Read<T>): T => {
  if (read.unchanged) throw new Error('unchanged');
  return read.data;
};

describe('fake family area', () => {
  it('lists the members with the administrators first and marks the person', async () => {
    const family = data(await as('user-anna').family.get({ familyId }));
    expect(family.myRole).toBe('member');
    expect(family.members.map((m) => [m.displayName, m.role, m.isMe])).toEqual([
      ['Federico', 'family_admin', false],
      ['Anna', 'member', true],
      ['Tom', 'member', false]
    ]);
  });
  it('lets administrators change the settings and refuses members, like the server', async () => {
    const admin = as('user-federico');
    const before = await admin.family.getSettings({ familyId });
    const settings = await admin.family.setMeal({ familyId, mealType: 'lunch', weekday: 6, servings: 3, fixedText: null, maxMinutes: null });
    expect(settings.settings.slots.lunch[6]).toEqual({ servings: 3, fixedText: null, maxMinutes: null });
    expect(settings.canEdit).toBe(true);
    expect((await admin.family.getSettings({ familyId })).version).not.toBe(before.version);
    await expect(as('user-anna').family.setKnownNew({ familyId, known: 1, new: 1, tolerance: 0 })).rejects.toMatchObject({ code: 'forbidden' });
    expect(data(await as('user-anna').family.getSettings({ familyId })).canEdit).toBe(false);
  });
  it('adds and removes rules by value, once', async () => {
    const admin = as('user-federico');
    const rule = { kind: 'at_least_one' as const, group: 'fish' as const, weekday: 4 };
    await admin.family.addRule({ familyId, rule });
    expect((await admin.family.addRule({ familyId, rule: { weekday: 4, group: 'fish', kind: 'at_least_one' } })).settings.rules).toEqual([rule]);
    expect((await admin.family.removeRule({ familyId, rule })).settings.rules).toEqual([]);
  });
  it('searches ingredients from two letters and restricts them', async () => {
    const admin = as('user-federico');
    expect(await admin.family.searchIngredients({ familyId, text: 'c' })).toEqual([]);
    const found = await admin.family.searchIngredients({ familyId, text: 'cipol' });
    expect(found.length).toBeGreaterThan(1);
    expect(found.length).toBeLessThanOrEqual(8);
    const limited = await admin.family.setIngredientRestriction({ familyId, ingredientId: 'cipolla', restriction: 'limit', weeklyMax: 1 });
    expect(limited.restrictions).toContainEqual({ ingredientId: 'cipolla', name: 'Cipolla', restriction: 'limit', weeklyMax: 1 });
    await expect(admin.family.setIngredientRestriction({ familyId, ingredientId: 'cipolla', restriction: 'avoid', weeklyMax: 2 })).rejects.toMatchObject({ code: 'invalid' });
  });
  it('lists exclusions newest first, with the former member without a name, and brings one back', async () => {
    const anna = as('user-anna');
    const list = data(await anna.family.listExclusions({ familyId }));
    expect(list.map((e) => e.createdByName)).toEqual(['Anna', null]);
    expect(await anna.family.removeExclusion({ familyId, recipeId: list[0]!.recipe.id })).toHaveLength(1);
  });
  it('shows the renamed family in the profile', async () => {
    const admin = as('user-federico');
    await admin.family.rename({ familyId, name: '  Casa  ' });
    expect((await admin.profile.get({})).families[0]?.name).toBe('Casa');
    await expect(admin.family.get({ familyId: 'other' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('fake family creation', () => {
  it('adds the new family, shown, and does not duplicate it on repeat', async () => {
    const api = as('user-federico');
    const id = '00000000-0000-4000-8000-0000000000aa';
    const view = await api.family.create({ id, name: 'Casa nuova', measurementSystem: 'uk_imperial', timeZone: 'Europe/London' });
    expect(view.currentFamilyId).toBe(id);
    expect(view.families.find((f) => f.id === id)).toEqual({ id, name: 'Casa nuova', role: 'family_admin', timeZone: 'Europe/London', measurementSystem: 'uk_imperial' });
    const again = await api.family.create({ id, name: 'Casa nuova', measurementSystem: 'uk_imperial' });
    expect(again.families.filter((f) => f.id === id)).toHaveLength(1);
    expect((await api.profile.get({})).currentFamilyId).toBe(id);
  });

  it('changes roles, protects the last administrator, removes and lets members leave', async () => {
    const shared = createFakeData({ id: 'user-federico', email: 'federico@example.com' });
    const on = (id: string) => createFakeApi({ getLocale: () => 'it-IT', data: { ...shared, user: { id, email: `${id}@example.com` } } as typeof shared });
    const federico = on('user-federico');
    await expect(federico.family.setMemberRole({ familyId, userId: 'user-federico', role: 'member' })).rejects.toMatchObject({ code: 'last_admin' });
    const promoted = await federico.family.setMemberRole({ familyId, userId: 'user-anna', role: 'family_admin' });
    expect(promoted.members.find((m) => m.userId === 'user-anna')?.role).toBe('family_admin');
    await expect(federico.family.setMemberRole({ familyId, userId: 'user-marco', role: 'member' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(federico.family.removeMember({ familyId, userId: 'user-federico' })).rejects.toMatchObject({ code: 'invalid' });
    const removed = await federico.family.removeMember({ familyId, userId: 'user-tom' });
    expect(removed.members.map((m) => m.userId)).not.toContain('user-tom');
    await expect(on('user-tom').family.get({ familyId })).rejects.toMatchObject({ code: 'forbidden' });
    const left = await on('user-anna').family.leave({ familyId });
    expect(left.families.map((f) => f.id)).not.toContain(familyId);
    await expect(federico.family.leave({ familyId })).rejects.toMatchObject({ code: 'sole_member' });
  });

  it('summarises and deletes the family for administrators only', async () => {
    const shared = createFakeData({ id: 'user-federico', email: 'federico@example.com' });
    const on = (id: string) => createFakeApi({ getLocale: () => 'it-IT', data: { ...shared, user: { id, email: `${id}@example.com` } } as typeof shared });
    const summary = data(await on('user-anna').family.getDeletion({ familyId }));
    expect(summary).toMatchObject({ name: 'Famiglia Folloni', memberNames: ['Anna', 'Federico', 'Tom'], canDelete: false });
    expect(summary.weekCount).toBeGreaterThan(0);
    await expect(on('user-anna').family.delete({ familyId })).rejects.toMatchObject({ code: 'forbidden' });
    const profile = await on('user-federico').family.delete({ familyId });
    expect(profile.families.map((f) => f.id)).not.toContain(familyId);
    await expect(on('user-anna').family.get({ familyId })).rejects.toMatchObject({ code: 'forbidden' });
  });
});


import { beforeEach, describe, expect, it } from 'vitest';
import { createInitial } from '#lib/store/persistence.ts';
import { isMealPast } from '#lib/domain/calendar.ts';
import { slotSetting } from '#lib/domain/settings.ts';
import type { DemoDatabase } from '#lib/domain/types.ts';
import type { OperationContext } from './context';
import { ratingSummary } from './access';
import { fitsSettings } from './constraints';
import { deleteAccount, getAccountDeletionPlan, updateProfile } from './account';
import {
	deleteFamily,
	getExclusions,
	getFamilyDeletion,
	getFamilyOverview,
	leaveFamily,
	removeMember,
	renameFamily,
	searchIngredients,
	setIngredientRestriction,
	setMemberRole,
	updateFamilySettings
} from './family';
import { acceptInvitation, createInvitation, getInvitation, revokeInvitation } from './invitations';
import { createFamily, createUser, firstGenerationWeeks, generateFirstWeeks } from './onboarding';
import { excludeRecipe } from './revision';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};
const error = (r: { ok: boolean; error?: string }) => (r.ok ? 'ok' : r.error);
const main = () => db.families.find((f) => f.id === 'family-main')!;

beforeEach(() => { db = createInitial().db; });

describe('permissions', () => {
	it('lets members read the family but only administrators change it', () => {
		expect(value(getFamilyOverview(db, ctx({ userId: 'user-anna' }))).invitations).toBeNull();
		expect(value(getFamilyOverview(db, ctx())).invitations).toHaveLength(1);
		expect(error(renameFamily(db, ctx({ userId: 'user-anna' }), 'X'))).toBe('forbidden');
		expect(error(createInvitation(db, ctx({ userId: 'user-anna' })))).toBe('forbidden');
		expect(error(updateFamilySettings(db, ctx({ userId: 'user-tom' }), () => {}))).toBe('forbidden');
	});
	it('blocks every change offline', () => {
		expect(error(renameFamily(db, ctx({ offline: true }), 'X'))).toBe('offline');
		expect(error(acceptInvitation(db, ctx({ userId: 'user-giulia', offline: true }), 'folloni-k7m2q'))).toBe('offline');
		expect(error(updateProfile(db, ctx({ offline: true }), { locale: 'en-GB' }))).toBe('offline');
	});
});

describe('invitations', () => {
	it('creates a link valid for 7 days and revokes it', () => {
		const { token } = value(createInvitation(db, ctx()));
		expect(db.invitations.find((i) => i.token === token)).toMatchObject({ expiresAt: '2026-10-13T12:00', createdBy: 'user-federico' });
		expect(getInvitation(db, ctx({ userId: 'user-giulia' }), token).status).toBe('valid');
		value(revokeInvitation(db, ctx(), token));
		expect(getInvitation(db, ctx({ userId: 'user-giulia' }), token).status).toBe('revoked');
	});
	it('reports expired, revoked, unknown and already-member links', () => {
		const giulia = ctx({ userId: 'user-giulia' });
		expect(getInvitation(db, giulia, 'folloni-old9x').status).toBe('expired');
		expect(getInvitation(db, giulia, 'folloni-rev4t').status).toBe('revoked');
		expect(getInvitation(db, giulia, 'nope').status).toBe('not_found');
		expect(getInvitation(db, ctx({ userId: 'user-anna' }), 'folloni-k7m2q').status).toBe('already_member');
		expect(value(acceptInvitation(db, ctx({ userId: 'user-anna' }), 'folloni-k7m2q'))).toEqual({ familyId: 'family-main' });
		expect(main().members).toHaveLength(3);
	});
	it('is readable before signing in', () => {
		expect(getInvitation(db, ctx({ userId: '' }), 'folloni-k7m2q')).toMatchObject({ status: 'valid', familyName: 'Famiglia Folloni', invitedByName: 'Federico' });
	});
	it('lets a new person join as a member', () => {
		value(acceptInvitation(db, ctx({ userId: 'user-giulia' }), 'folloni-k7m2q'));
		expect(main().members.find((m) => m.userId === 'user-giulia')).toMatchObject({ role: 'member', joinedAt: '2026-10-06T12:00' });
	});
	it('R2: a removed member cannot come back with a link created before the removal, only with a new one', () => {
		const marco = ctx({ userId: 'user-marco' });
		expect(getInvitation(db, marco, 'folloni-k7m2q').status).toBe('removed');
		expect(error(acceptInvitation(db, marco, 'folloni-k7m2q'))).toBe('not_allowed');
		const { token } = value(createInvitation(db, ctx()));
		value(acceptInvitation(db, marco, token));
		expect(main().members.some((m) => m.userId === 'user-marco')).toBe(true);
	});
	it('R2: removing someone now blocks the links they already had', () => {
		const { token } = value(createInvitation(db, ctx({ now: '2026-10-05T09:00' })));
		value(removeMember(db, ctx(), 'user-tom'));
		expect(getInvitation(db, ctx({ userId: 'user-tom' }), token).status).toBe('removed');
		expect(getInvitation(db, ctx({ userId: 'user-giulia' }), token).status).toBe('valid');
	});
});

describe('members', () => {
	it('removal takes ratings out of the average and leaves traces as former member', () => {
		const recipeId = db.ratings.find((r) => r.userId === 'user-anna')!.recipeId;
		const before = ratingSummary(db, main(), 'user-federico', recipeId).familyCount;
		value(removeMember(db, ctx(), 'user-anna'));
		expect(ratingSummary(db, main(), 'user-federico', recipeId).familyCount).toBe(before - 1);
		expect(db.removals.at(-1)).toMatchObject({ userId: 'user-anna', removedBy: 'user-federico' });
	});
	it('protects the last administrator', () => {
		expect(error(setMemberRole(db, ctx(), 'user-federico', 'member'))).toBe('last_admin');
		value(setMemberRole(db, ctx(), 'user-anna', 'family_admin'));
		value(setMemberRole(db, ctx(), 'user-federico', 'member'));
		expect(main().members.find((m) => m.userId === 'user-federico')!.role).toBe('member');
	});
	it('the last administrator leaves only naming a successor in the same step', () => {
		expect(error(leaveFamily(db, ctx()))).toBe('last_admin');
		value(leaveFamily(db, ctx(), 'user-tom'));
		expect(main().members.map((m) => [m.userId, m.role])).toEqual([['user-anna', 'member'], ['user-tom', 'family_admin']]);
	});
	it('a member leaves freely; the only member must delete the family instead', () => {
		value(leaveFamily(db, ctx({ userId: 'user-anna' })));
		const { familyId } = value(createFamily(db, ctx({ userId: 'user-giulia' }), 'Casa Giulia', 'metric'));
		expect(error(leaveFamily(db, ctx({ userId: 'user-giulia', familyId })))).toBe('sole_member');
	});
});

describe('settings', () => {
	it('validates and saves settings', () => {
		value(updateFamilySettings(db, ctx(), (s) => (s.slots.dinner[0].servings = 3)));
		expect(main().settings.slots.dinner[0].servings).toBe(3);
		expect(error(updateFamilySettings(db, ctx(), (s) => (s.slots.dinner[0].maxMinutes = 17)))).toBe('invalid');
		expect(error(updateFamilySettings(db, ctx(), (s) => (s.groupRanges.fish = { min: 3, max: 1 })))).toBe('invalid');
		expect(main().settings.slots.dinner[0].maxMinutes).toBe(20);
	});
	it('restricts ingredients: avoid, or limit with a weekly maximum', () => {
		const [first] = value(searchIngredients(db, ctx(), 'tonno'));
		expect(first).toBeDefined();
		expect(error(setIngredientRestriction(db, ctx(), first.id, 'limit', null))).toBe('invalid');
		value(setIngredientRestriction(db, ctx(), first.id, 'limit', 1));
		expect(value(searchIngredients(db, ctx(), 'tonno')).map((i) => i.id)).not.toContain(first.id);
		value(setIngredientRestriction(db, ctx(), first.id, null));
		expect(db.familyIngredients.some((f) => f.ingredientId === first.id)).toBe(false);
	});
	it('lists "non proporre più" for every member', () => {
		const recipeId = db.recipes.find((r) => r.status === 'published' && !r.bookId)!.id;
		value(excludeRecipe(db, ctx({ userId: 'user-anna' }), recipeId));
		expect(value(getExclusions(db, ctx({ userId: 'user-tom' })))).toMatchObject([{ recipe: { id: recipeId }, createdByName: 'Anna' }]);
	});
});

describe('new family and first generation', () => {
	it('signs up and creates a family with the defaults, the creator as administrator', () => {
		const { userId } = value(createUser(db, 'Sara@Example.com', 'Sara', 'en-GB'));
		expect(error(createUser(db, 'sara@example.com', 'Altra', 'it-IT'))).toBe('invalid');
		const { familyId } = value(createFamily(db, ctx({ userId }), 'Casa Sara', 'uk_imperial'));
		const family = db.families.find((f) => f.id === familyId)!;
		expect(family).toMatchObject({ name: 'Casa Sara', measurementSystem: 'uk_imperial', showSetupCard: true, members: [{ userId, role: 'family_admin' }] });
		expect(family.settings.slots.lunch.every((s) => s.servings === 2 && !s.fixedText && !s.maxMinutes)).toBe(true);
	});
	it('generates this week only before Wednesday 20:00, next week too after', () => {
		expect(firstGenerationWeeks('2026-10-06T12:00')).toEqual(['2026-10-05']);
		expect(firstGenerationWeeks('2026-10-07T19:59')).toEqual(['2026-10-05']);
		expect(firstGenerationWeeks('2026-10-07T20:00')).toEqual(['2026-10-05', '2026-10-12']);
		expect(firstGenerationWeeks('2026-10-11T22:00')).toEqual(['2026-10-05', '2026-10-12']);
	});
	it('fills only meals still to come, with fixed meals and settings respected', () => {
		const nonni = ctx({ userId: 'user-lucia', familyId: 'family-grandparents', now: '2026-10-08T21:00' });
		const family = db.families.find((f) => f.id === 'family-grandparents')!;
		family.settings.slots.dinner[5] = { servings: 2, fixedText: 'Pizza', maxMinutes: null };
		family.settings.slots.lunch[6] = { servings: 0, fixedText: null, maxMinutes: null };
		family.settings.slots.dinner[4].maxMinutes = 20;
		expect(error(generateFirstWeeks(db, { ...nonni, userId: 'user-federico' }))).toBe('forbidden');
		expect(value(generateFirstWeeks(db, nonni)).weekStarts).toEqual(['2026-10-05', '2026-10-12']);
		const weeks = db.weeks.filter((w) => w.familyId === 'family-grandparents');
		const slots = weeks.flatMap((w) => w.slots);
		expect(slots.every((s) => !isMealPast(s.date, s.mealType, nonni.now))).toBe(true);
		expect(slots.filter((s) => s.date === '2026-10-08').map((s) => s.mealType)).toEqual(['dinner']);
		expect(slots.find((s) => s.date === '2026-10-10' && s.mealType === 'dinner')).toMatchObject({ freeText: 'Pizza', recipeId: null });
		expect(slots.some((s) => s.date === '2026-10-11' && s.mealType === 'lunch')).toBe(false);
		for (const week of weeks)
			for (const slot of week.slots.filter((s) => s.recipeId)) {
				const recipe = db.recipes.find((r) => r.id === slot.recipeId)!;
				expect(fitsSettings(db, family, recipe, slot, week.slots)).toBe(true);
				expect(slot.servings).toBe(slotSetting(family.settings, slot.date, slot.mealType).servings);
			}
		expect(error(generateFirstWeeks(db, nonni))).toBe('not_allowed');
	});
	it('satisfies "fish at least once on Friday" when a candidate fits', () => {
		const nonni = ctx({ userId: 'user-lucia', familyId: 'family-grandparents' });
		db.families.find((f) => f.id === 'family-grandparents')!.settings.rules = [{ id: 'r', kind: 'at_least_one', group: 'fish', weekday: 4 }];
		value(generateFirstWeeks(db, nonni));
		const friday = db.weeks.flatMap((w) => w.slots).filter((s) => s.date === '2026-10-09' && s.recipeId);
		expect(friday.some((s) => db.recipes.find((r) => r.id === s.recipeId)!.proteinGroup === 'fish')).toBe(true);
	});
});

describe('family deletion', () => {
	it('shows the dedicated page to members, but only administrators delete, only on the web', () => {
		expect(value(getFamilyDeletion(db, ctx({ userId: 'user-anna' }), 'family-main')).canDelete).toBe(false);
		expect(error(deleteFamily(db, ctx({ userId: 'user-anna' }), 'family-main'))).toBe('forbidden');
		expect(error(deleteFamily(db, ctx({ channel: 'mcp' }), 'family-main'))).toBe('web_only');
		expect(error(deleteFamily(db, ctx(), 'family-grandparents'))).toBe('forbidden');
	});
	it('removes the family data for everyone, keeping accounts, ratings and other families', () => {
		const ratings = db.ratings.length;
		value(deleteFamily(db, ctx(), 'family-main'));
		expect(db.families.map((f) => f.id)).toEqual(['family-grandparents']);
		expect(db.weeks.some((w) => w.familyId === 'family-main')).toBe(false);
		expect(db.shoppingLists.length + db.invitations.length + db.familyIngredients.length).toBe(0);
		expect(db.users.some((u) => u.id === 'user-anna')).toBe(true);
		expect(db.ratings.length).toBe(ratings);
	});
});

describe('account deletion', () => {
	it('explains each family and blocks the last app administrator', () => {
		const plan = value(getAccountDeletionPlan(db, ctx()));
		expect(plan.lastAppAdmin).toBe(true);
		expect(plan.families.map((f) => [f.name, f.outcome])).toEqual([['Famiglia Folloni', 'needs_successor'], ['Nonni', 'stays']]);
		expect(error(deleteAccount(db, ctx(), { 'family-main': 'user-anna' }))).toBe('last_app_admin');
	});
	it('needs a successor where the user is the last administrator, then changes everything at once', () => {
		const lucia = ctx({ userId: 'user-lucia', familyId: 'family-grandparents' });
		const before = structuredClone(db);
		expect(error(deleteAccount(db, lucia, {}))).toBe('last_admin');
		expect(db).toEqual(before);
		value(deleteAccount(db, lucia, { 'family-grandparents': 'user-federico' }));
		expect(db.families.find((f) => f.id === 'family-grandparents')!.members).toEqual([{ userId: 'user-federico', role: 'family_admin', joinedAt: '2026-09-20T10:30' }]);
		expect(db.users.some((u) => u.id === 'user-lucia')).toBe(false);
	});
	it('deletes the families where the user is the only member, removes ratings and revokes their links', () => {
		const giulia = ctx({ userId: 'user-giulia', familyId: '' });
		const { familyId } = value(createFamily(db, giulia, 'Casa Giulia', 'metric'));
		const own = { ...giulia, familyId };
		value(createInvitation(db, own));
		db.ratings.push({ userId: 'user-giulia', recipeId: db.recipes[0].id, stars: 4 });
		expect(error(deleteAccount(db, { ...own, channel: 'mcp' }, {}))).toBe('web_only');
		expect(value(deleteAccount(db, own, {})).deletedFamilies).toEqual([familyId]);
		expect(db.families.some((f) => f.id === familyId)).toBe(false);
		expect(db.ratings.some((r) => r.userId === 'user-giulia')).toBe(false);
	});
	it('revokes the open links created by a member who leaves no empty family', () => {
		value(setMemberRole(db, ctx(), 'user-anna', 'family_admin'));
		const { token } = value(createInvitation(db, ctx({ userId: 'user-anna' })));
		value(deleteAccount(db, ctx({ userId: 'user-anna' }), {}));
		expect(db.invitations.find((i) => i.token === token)!.revokedAt).toBe('2026-10-06T12:00');
	});
});

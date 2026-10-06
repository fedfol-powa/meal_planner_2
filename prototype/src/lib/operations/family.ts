import { settingsProblem } from '#lib/domain/settings.ts';
import type { DemoDatabase, Family, FamilyRole, FamilySettings, LocalDateTime, MeasurementSystem } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { familyFor, localeOf, localized, recipeSummary } from './access';
import type { RecipeSummary } from './views';

export const FAMILY_NAME_MAX = 60;

export interface MemberView {
	userId: string;
	name: string;
	role: FamilyRole;
	isMe: boolean;
	joinedAt: LocalDateTime;
}

export interface InvitationView {
	token: string;
	createdByName: string | null;
	createdAt: LocalDateTime;
	expiresAt: LocalDateTime;
}

export interface FamilyOverview {
	id: string;
	name: string;
	myRole: FamilyRole;
	members: MemberView[];
	/** Active links, only for administrators. */
	invitations: InvitationView[] | null;
	adminNames: string[];
}

export interface ExclusionView {
	recipe: RecipeSummary;
	createdByName: string | null;
	createdAt: LocalDateTime;
}

export const roleOf = (family: Family, userId: string): FamilyRole | null => family.members.find((m) => m.userId === userId)?.role ?? null;
const admins = (family: Family) => family.members.filter((m) => m.role === 'family_admin');
const nameOf = (db: DemoDatabase, userId: string) => db.users.find((u) => u.id === userId)?.displayName ?? null;

/** Invitations are reusable until they expire or are revoked (spec section 7). */
export const isInvitationActive = (inv: { expiresAt: LocalDateTime; revokedAt: LocalDateTime | null }, now: LocalDateTime) =>
	inv.revokedAt === null && now < inv.expiresAt;

/** A family the user can change: online, member, and administrator when `admin` is set. */
export function writableFamily(db: DemoDatabase, ctx: OperationContext, admin: boolean): OpResult<Family> {
	if (ctx.offline) return fail('offline');
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	if (admin && roleOf(family, ctx.userId) !== 'family_admin') return fail('forbidden');
	return ok(family);
}

export function getFamilyOverview(db: DemoDatabase, ctx: OperationContext): OpResult<FamilyOverview> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const myRole = roleOf(family, ctx.userId)!;
	const locale = localeOf(db, ctx);
	const members = family.members
		.map((m) => ({ userId: m.userId, name: nameOf(db, m.userId) ?? '', role: m.role, isMe: m.userId === ctx.userId, joinedAt: m.joinedAt }))
		.sort((a, b) => Number(b.role === 'family_admin') - Number(a.role === 'family_admin') || a.name.localeCompare(b.name, locale));
	const invitations =
		myRole === 'family_admin'
			? db.invitations
					.filter((i) => i.familyId === family.id && isInvitationActive(i, ctx.now))
					.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
					.map((i) => ({ token: i.token, createdByName: nameOf(db, i.createdBy), createdAt: i.createdAt, expiresAt: i.expiresAt }))
			: null;
	return ok({ id: family.id, name: family.name, myRole, members, invitations, adminNames: admins(family).map((m) => nameOf(db, m.userId) ?? '') });
}

export function setMemberRole(db: DemoDatabase, ctx: OperationContext, userId: string, role: FamilyRole): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const member = found.value.members.find((m) => m.userId === userId);
	if (!member) return fail('not_found');
	if (member.role === 'family_admin' && role === 'member' && admins(found.value).length === 1) return fail('last_admin');
	member.role = role;
	return ok(null);
}

/** Removal (spec section 7): ratings leave the average, traces become "ex membro"; old links no longer work for them (R2). */
export function removeMember(db: DemoDatabase, ctx: OperationContext, userId: string): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const family = found.value;
	if (userId === ctx.userId) return fail('invalid');
	if (!family.members.some((m) => m.userId === userId)) return fail('not_found');
	family.members = family.members.filter((m) => m.userId !== userId);
	db.removals.push({ familyId: family.id, userId, removedBy: ctx.userId, removedAt: ctx.now });
	return ok(null);
}

/** Leaving: the last administrator names a successor in the same step; the only member deletes the family instead. */
export function leaveFamily(db: DemoDatabase, ctx: OperationContext, successorId: string | null = null): OpResult<null> {
	const found = writableFamily(db, ctx, false);
	if (!found.ok) return found;
	const family = found.value;
	if (family.members.length === 1) return fail('sole_member');
	const others = family.members.filter((m) => m.userId !== ctx.userId);
	if (roleOf(family, ctx.userId) === 'family_admin' && !others.some((m) => m.role === 'family_admin')) {
		const successor = others.find((m) => m.userId === successorId);
		if (!successor) return fail('last_admin');
		successor.role = 'family_admin';
	}
	family.members = others;
	return ok(null);
}

export function renameFamily(db: DemoDatabase, ctx: OperationContext, name: string): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > FAMILY_NAME_MAX) return fail('invalid');
	found.value.name = trimmed;
	return ok(null);
}

export function setMeasurementSystem(db: DemoDatabase, ctx: OperationContext, system: MeasurementSystem): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	if (system !== 'metric' && system !== 'uk_imperial') return fail('invalid');
	found.value.measurementSystem = system;
	return ok(null);
}

/** Settings apply to the next generations and to suggestions; menus already made do not change. */
export function updateFamilySettings(db: DemoDatabase, ctx: OperationContext, change: (settings: FamilySettings) => void): OpResult<FamilySettings> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const next = structuredClone(found.value.settings);
	change(next);
	if (settingsProblem(next)) return fail('invalid');
	found.value.settings = next;
	return ok(next);
}

export function setFamilyBook(db: DemoDatabase, ctx: OperationContext, bookId: string, owned: boolean): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	if (!db.books.some((b) => b.id === bookId)) return fail('not_found');
	const others = found.value.bookIds.filter((id) => id !== bookId);
	found.value.bookIds = owned ? [...others, bookId] : others;
	return ok(null);
}

export interface IngredientRestrictionView {
	ingredientId: string;
	name: string;
	restriction: 'avoid' | 'limit';
	weeklyMax: number | null;
}

export function getIngredientRestrictions(db: DemoDatabase, ctx: OperationContext): OpResult<IngredientRestrictionView[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	return ok(
		db.familyIngredients
			.filter((f) => f.familyId === family.id)
			.map((f) => {
				const ingredient = db.ingredients.find((i) => i.id === f.ingredientId);
				return { ingredientId: f.ingredientId, name: ingredient ? localized(ingredient.name, locale).text : f.ingredientId, restriction: f.restriction, weeklyMax: f.weeklyMax };
			})
			.sort((a, b) => a.name.localeCompare(b.name, locale))
	);
}

/** Catalogue ingredients matching a search, without demo duplicates or ones already restricted. */
export function searchIngredients(db: DemoDatabase, ctx: OperationContext, text: string): OpResult<{ id: string; name: string }[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	const needle = text.trim().toLocaleLowerCase(locale);
	if (needle.length < 2) return ok([]);
	const taken = new Set(db.familyIngredients.filter((f) => f.familyId === family.id).map((f) => f.ingredientId));
	return ok(
		db.ingredients
			.filter((i) => !i.canonicalId && !taken.has(i.id))
			.map((i) => ({ id: i.id, name: localized(i.name, locale).text }))
			.filter((i) => i.name.toLocaleLowerCase(locale).includes(needle))
			.sort((a, b) => a.name.localeCompare(b.name, locale))
			.slice(0, 8)
	);
}

/** null removes the restriction; "limit" needs a weekly maximum from 1 to 7. */
export function setIngredientRestriction(
	db: DemoDatabase,
	ctx: OperationContext,
	ingredientId: string,
	restriction: 'avoid' | 'limit' | null,
	weeklyMax: number | null = null
): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const familyId = found.value.id;
	if (!db.ingredients.some((i) => i.id === ingredientId)) return fail('not_found');
	if (restriction === 'limit' && (weeklyMax === null || !Number.isInteger(weeklyMax) || weeklyMax < 1 || weeklyMax > 7)) return fail('invalid');
	db.familyIngredients = db.familyIngredients.filter((f) => !(f.familyId === familyId && f.ingredientId === ingredientId));
	if (restriction) db.familyIngredients.push({ familyId, ingredientId, restriction, weeklyMax: restriction === 'limit' ? weeklyMax : null });
	return ok(null);
}

/** "Non proporre più" list: every member reads and manages it (spec section 2). */
export function getExclusions(db: DemoDatabase, ctx: OperationContext): OpResult<ExclusionView[]> {
	const family = familyFor(db, ctx);
	if (!family) return fail('forbidden');
	const locale = localeOf(db, ctx);
	return ok(
		db.exclusions
			.filter((e) => e.familyId === family.id)
			.flatMap((e) => {
				const recipe = db.recipes.find((r) => r.id === e.recipeId);
				const author = family.members.some((m) => m.userId === e.createdBy) ? nameOf(db, e.createdBy) : null;
				return recipe ? [{ recipe: recipeSummary(db, recipe, locale), createdByName: author, createdAt: e.createdAt }] : [];
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
	);
}

export function dismissSetupCard(db: DemoDatabase, ctx: OperationContext): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	found.value.showSetupCard = false;
	return ok(null);
}

export interface FamilyDeletionView {
	familyId: string;
	name: string;
	memberNames: string[];
	weekCount: number;
	canDelete: boolean;
}

/** The dedicated page (spec section 7): identifies the family and what is removed for everyone. */
export function getFamilyDeletion(db: DemoDatabase, ctx: OperationContext, familyId: string): OpResult<FamilyDeletionView> {
	const family = familyFor(db, { ...ctx, familyId });
	if (!family) return fail('forbidden');
	return ok({
		familyId,
		name: family.name,
		memberNames: family.members.map((m) => nameOf(db, m.userId) ?? ''),
		weekCount: db.weeks.filter((w) => w.familyId === familyId).length,
		canDelete: roleOf(family, ctx.userId) === 'family_admin'
	});
}

/** Removes a family and every family-owned row; accounts, ratings, other families and the catalogue stay. */
export function purgeFamily(db: DemoDatabase, familyId: string): void {
	const slotIds = new Set(db.weeks.filter((w) => w.familyId === familyId).flatMap((w) => w.slots.map((s) => s.id)));
	db.families = db.families.filter((f) => f.id !== familyId);
	db.weeks = db.weeks.filter((w) => w.familyId !== familyId);
	db.mealChanges = db.mealChanges.filter((c) => !slotIds.has(c.slotId));
	db.exclusions = db.exclusions.filter((e) => e.familyId !== familyId);
	db.familyIngredients = db.familyIngredients.filter((f) => f.familyId !== familyId);
	db.shoppingLists = db.shoppingLists.filter((l) => l.familyId !== familyId);
	db.invitations = db.invitations.filter((i) => i.familyId !== familyId);
	db.removals = db.removals.filter((r) => r.familyId !== familyId);
}

/** Only family administrators, only from the web app; permissions are checked again at confirmation. */
export function deleteFamily(db: DemoDatabase, ctx: OperationContext, familyId: string): OpResult<null> {
	if (ctx.channel !== 'web') return fail('web_only');
	const found = writableFamily(db, { ...ctx, familyId }, true);
	if (!found.ok) return found;
	purgeFamily(db, familyId);
	return ok(null);
}

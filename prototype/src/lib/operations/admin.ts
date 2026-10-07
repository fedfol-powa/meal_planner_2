import type { DemoDatabase, FamilyRole, GlobalRole, Locale } from '#lib/domain/types.ts';
import { performDeletion, planDeletion, type AccountDeletionPlan } from './account';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { roleOf } from './family';

export const isAppAdmin = (db: DemoDatabase, userId: string) => !!db.users.find((u) => u.id === userId)?.globalRoles.includes('app_admin');

/** App administration (round 6): only app_admin, read only offline. */
export function adminGuard(db: DemoDatabase, ctx: OperationContext, write: boolean): OpResult<null> {
	if (!isAppAdmin(db, ctx.userId)) return fail('forbidden');
	if (write && ctx.offline) return fail('offline');
	return ok(null);
}

export interface UserRow {
	id: string;
	name: string;
	email: string;
	roles: GlobalRole[];
	families: number;
	isSelf: boolean;
}

const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function listUsers(db: DemoDatabase, ctx: OperationContext, text = ''): OpResult<UserRow[]> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	const query = normalize(text);
	return ok(
		db.users
			.filter((u) => !query || normalize(`${u.displayName} ${u.email}`).includes(query))
			.map((u) => ({
				id: u.id, name: u.displayName, email: u.email, roles: [...u.globalRoles],
				families: db.families.filter((f) => f.members.some((m) => m.userId === u.id)).length,
				isSelf: u.id === ctx.userId
			}))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
}

export interface UserAdminView extends Omit<UserRow, 'families'> {
	locale: Locale;
	/** Names and roles only: app administrators do not see family contents (spec section 2). */
	families: { name: string; role: FamilyRole }[];
	agents: number;
	/** Removing app_admin is blocked: no other administrator. */
	lastAppAdmin: boolean;
}

export function getUserAdmin(db: DemoDatabase, ctx: OperationContext, userId: string): OpResult<UserAdminView> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	const user = db.users.find((u) => u.id === userId);
	if (!user) return fail('not_found');
	return ok({
		id: user.id, name: user.displayName, email: user.email, roles: [...user.globalRoles], isSelf: user.id === ctx.userId, locale: user.locale,
		families: db.families.filter((f) => f.members.some((m) => m.userId === userId)).map((f) => ({ name: f.name, role: roleOf(f, userId)! })),
		agents: db.connectedAgents.filter((a) => a.userId === userId).length,
		lastAppAdmin: user.globalRoles.includes('app_admin') && db.users.filter((u) => u.globalRoles.includes('app_admin')).length === 1
	});
}

/** Gives or removes a global role; the last app administrator keeps the role until a successor exists. */
export function setUserRole(db: DemoDatabase, ctx: OperationContext, userId: string, role: GlobalRole, on: boolean): OpResult<null> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	const user = db.users.find((u) => u.id === userId);
	if (!user) return fail('not_found');
	if (!on && role === 'app_admin' && user.globalRoles.includes('app_admin') && db.users.filter((u) => u.globalRoles.includes('app_admin')).length === 1)
		return fail('last_app_admin');
	const roles = new Set(user.globalRoles);
	if (on) roles.add(role);
	else roles.delete(role);
	user.globalRoles = (['recipe_curator', 'app_admin'] as const).filter((r) => roles.has(r));
	return ok(null);
}

/** Own account goes through the account page (not_allowed here). */
export function getUserDeletionPlan(db: DemoDatabase, ctx: OperationContext, userId: string): OpResult<AccountDeletionPlan & { name: string; email: string }> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	if (userId === ctx.userId) return fail('not_allowed');
	const user = db.users.find((u) => u.id === userId);
	if (!user) return fail('not_found');
	const plan = planDeletion(db, userId, ctx.now);
	if (!plan.ok) return plan;
	return ok({ ...plan.value, name: user.displayName, email: user.email });
}

/** Same rules as the own account: successors, sole member families deleted only from the web app. */
export function deleteUser(db: DemoDatabase, ctx: OperationContext, userId: string, successors: Record<string, string>): OpResult<{ deletedFamilies: string[] }> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	if (userId === ctx.userId) return fail('not_allowed');
	if (!db.users.some((u) => u.id === userId)) return fail('not_found');
	return performDeletion(db, ctx, userId, successors);
}

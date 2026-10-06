import { LOCALES, type DemoDatabase, type Locale } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { purgeFamily, roleOf } from './family';
import { DISPLAY_NAME_MAX } from './onboarding';

const currentUser = (db: DemoDatabase, ctx: OperationContext) => db.users.find((u) => u.id === ctx.userId) ?? null;

/** Personal preferences (spec section 7): independent of the family and of its measurement system. */
export function updateProfile(db: DemoDatabase, ctx: OperationContext, change: { displayName?: string; locale?: Locale }): OpResult<null> {
	if (ctx.offline) return fail('offline');
	const user = currentUser(db, ctx);
	if (!user) return fail('forbidden');
	if (change.displayName !== undefined) {
		const name = change.displayName.trim();
		if (!name || name.length > DISPLAY_NAME_MAX) return fail('invalid');
		user.displayName = name;
	}
	if (change.locale !== undefined) {
		if (!LOCALES.includes(change.locale)) return fail('invalid');
		user.locale = change.locale;
	}
	return ok(null);
}

/**
 * What happens to each family when the account is deleted (spec section 7): `stays` (the family goes on
 * without the user), `needs_successor` (last administrator with other members: name one first), `deleted`
 * (only member: the family and its data go too).
 */
export type FamilyOutcome = 'stays' | 'needs_successor' | 'deleted';

export interface AccountDeletionPlan {
	families: { familyId: string; name: string; outcome: FamilyOutcome; candidates: { userId: string; name: string }[] }[];
	/** Last app administrator: blocked until a successor is appointed (percorso 8). */
	lastAppAdmin: boolean;
	openInvitations: number;
}

export function getAccountDeletionPlan(db: DemoDatabase, ctx: OperationContext): OpResult<AccountDeletionPlan> {
	const user = currentUser(db, ctx);
	if (!user) return fail('forbidden');
	const families = db.families
		.filter((f) => f.members.some((m) => m.userId === user.id))
		.map((f) => {
			const others = f.members.filter((m) => m.userId !== user.id);
			const outcome: FamilyOutcome =
				others.length === 0 ? 'deleted' : roleOf(f, user.id) === 'family_admin' && !others.some((m) => m.role === 'family_admin') ? 'needs_successor' : 'stays';
			return {
				familyId: f.id,
				name: f.name,
				outcome,
				candidates: outcome === 'needs_successor' ? others.map((m) => ({ userId: m.userId, name: db.users.find((u) => u.id === m.userId)?.displayName ?? '' })) : []
			};
		});
	const appAdmins = db.users.filter((u) => u.globalRoles.includes('app_admin'));
	return ok({
		families,
		lastAppAdmin: user.globalRoles.includes('app_admin') && appAdmins.length === 1,
		openInvitations: db.invitations.filter((i) => i.createdBy === user.id && i.revokedAt === null && ctx.now < i.expiresAt).length
	});
}

/**
 * All or nothing: every condition is checked before anything changes. Removes personal data and ratings,
 * revokes the links the user created and every access; published recipes and attributions stay ("ex
 * membro"). Through MCP, when a family would be deleted, only the web page link is returned (web_only).
 */
export function deleteAccount(db: DemoDatabase, ctx: OperationContext, successors: Record<string, string>): OpResult<{ deletedFamilies: string[] }> {
	if (ctx.offline) return fail('offline');
	const planned = getAccountDeletionPlan(db, ctx);
	if (!planned.ok) return planned;
	const plan = planned.value;
	if (plan.lastAppAdmin) return fail('last_app_admin');
	const deleted = plan.families.filter((f) => f.outcome === 'deleted').map((f) => f.familyId);
	if (ctx.channel !== 'web' && deleted.length > 0) return fail('web_only');
	for (const f of plan.families) {
		if (f.outcome === 'needs_successor' && !f.candidates.some((c) => c.userId === successors[f.familyId])) return fail('last_admin');
	}

	for (const f of plan.families) {
		const family = db.families.find((x) => x.id === f.familyId)!;
		if (f.outcome === 'needs_successor') family.members.find((m) => m.userId === successors[f.familyId])!.role = 'family_admin';
		if (f.outcome === 'deleted') purgeFamily(db, f.familyId);
		else family.members = family.members.filter((m) => m.userId !== ctx.userId);
	}
	for (const invitation of db.invitations) if (invitation.createdBy === ctx.userId) invitation.revokedAt ??= ctx.now;
	db.ratings = db.ratings.filter((r) => r.userId !== ctx.userId);
	db.users = db.users.filter((u) => u.id !== ctx.userId);
	return ok({ deletedFamilies: deleted });
}

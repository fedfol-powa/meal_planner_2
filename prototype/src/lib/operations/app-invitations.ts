import { addDaysToTime } from '#lib/domain/calendar.ts';
import type { AppInvitation, DemoDatabase, GlobalRole, LocalDateTime } from '#lib/domain/types.ts';
import { adminGuard } from './admin';
import { fail, ok, type OperationContext, type OpResult } from './context';

export const APP_INVITATION_DAYS = 7;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const nameOf = (db: DemoDatabase, id: string | null) => db.users.find((u) => u.id === id)?.displayName ?? null;

export type AppInvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

const stateOf = (invitation: AppInvitation, now: LocalDateTime): AppInvitationState =>
	invitation.status === 'pending' && now >= invitation.expiresAt ? 'expired' : invitation.status;

export interface AppInvitationRow {
	token: string;
	email: string;
	roles: GlobalRole[];
	status: AppInvitationState;
	createdByName: string | null;
	createdAt: LocalDateTime;
	expiresAt: LocalDateTime;
	acceptedByName: string | null;
	acceptedAt: LocalDateTime | null;
}

/** Newest first; pending ones on top. */
export function listAppInvitations(db: DemoDatabase, ctx: OperationContext): OpResult<AppInvitationRow[]> {
	const allowed = adminGuard(db, ctx, false);
	if (!allowed.ok) return allowed;
	return ok(
		db.appInvitations
			.map((i) => ({
				token: i.token, email: i.email, roles: [...i.roles], status: stateOf(i, ctx.now),
				createdByName: nameOf(db, i.createdBy), createdAt: i.createdAt, expiresAt: i.expiresAt,
				acceptedByName: nameOf(db, i.acceptedBy), acceptedAt: i.acceptedAt
			}))
			.sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt.localeCompare(a.createdAt))
	);
}

export type CreateAppInvitationOutcome = { status: 'created'; token: string } | { status: 'existing_user'; userId: string };

/**
 * A single-use link for one email, valid 7 days; roles are given on acceptance. A new invitation to the
 * same email replaces the pending one. An existing user gets roles from the user list instead.
 */
export function createAppInvitation(db: DemoDatabase, ctx: OperationContext, email: string, roles: GlobalRole[]): OpResult<CreateAppInvitationOutcome> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	const address = email.trim().toLowerCase();
	if (!EMAIL.test(address) || roles.some((r) => r !== 'recipe_curator' && r !== 'app_admin')) return fail('invalid');
	const existing = db.users.find((u) => sameEmail(u.email, address));
	if (existing) return ok({ status: 'existing_user', userId: existing.id });
	for (const old of db.appInvitations)
		if (sameEmail(old.email, address) && old.status === 'pending') Object.assign(old, { status: 'revoked', revokedAt: ctx.now });
	const token = `app-${Math.random().toString(36).slice(2, 8)}`;
	db.appInvitations.push({
		token, email: address, roles: (['recipe_curator', 'app_admin'] as const).filter((r) => roles.includes(r)),
		createdBy: ctx.userId, createdAt: ctx.now, expiresAt: addDaysToTime(ctx.now, APP_INVITATION_DAYS),
		status: 'pending', acceptedBy: null, acceptedAt: null, revokedAt: null
	});
	return ok({ status: 'created', token });
}

export function revokeAppInvitation(db: DemoDatabase, ctx: OperationContext, token: string): OpResult<null> {
	const allowed = adminGuard(db, ctx, true);
	if (!allowed.ok) return allowed;
	const invitation = db.appInvitations.find((i) => i.token === token);
	if (!invitation) return fail('not_found');
	if (invitation.status !== 'pending') return fail('not_allowed');
	Object.assign(invitation, { status: 'revoked', revokedAt: ctx.now });
	return ok(null);
}

/** `wrong_email`: signed in with another address; the page says which one the link is for. */
export type AppInvitationPageStatus = 'valid' | 'wrong_email' | 'accepted' | 'expired' | 'revoked' | 'not_found';

export interface AppInvitationView {
	status: AppInvitationPageStatus;
	email: string | null;
	roles: GlobalRole[];
	invitedByName: string | null;
	expiresAt: LocalDateTime | null;
}

/** Readable before signing in (ctx.userId empty). */
export function getAppInvitation(db: DemoDatabase, ctx: OperationContext, token: string): AppInvitationView {
	const invitation = db.appInvitations.find((i) => i.token === token);
	if (!invitation) return { status: 'not_found', email: null, roles: [], invitedByName: null, expiresAt: null };
	const user = db.users.find((u) => u.id === ctx.userId);
	const state = stateOf(invitation, ctx.now);
	const status: AppInvitationPageStatus = state !== 'pending' ? state : user && !sameEmail(user.email, invitation.email) ? 'wrong_email' : 'valid';
	return { status, email: invitation.email, roles: [...invitation.roles], invitedByName: nameOf(db, invitation.createdBy), expiresAt: invitation.expiresAt };
}

/** Gives the roles of the invitation to the signed-in user with the same email; single use. */
export function acceptAppInvitation(db: DemoDatabase, ctx: OperationContext, token: string): OpResult<{ roles: GlobalRole[] }> {
	if (ctx.offline) return fail('offline');
	const user = db.users.find((u) => u.id === ctx.userId);
	if (!user) return fail('forbidden');
	const invitation = db.appInvitations.find((i) => i.token === token);
	if (!invitation) return fail('not_found');
	if (getAppInvitation(db, ctx, token).status !== 'valid') return fail('not_allowed');
	user.globalRoles = (['recipe_curator', 'app_admin'] as const).filter((r) => user.globalRoles.includes(r) || invitation.roles.includes(r));
	Object.assign(invitation, { status: 'accepted', acceptedBy: user.id, acceptedAt: ctx.now });
	return ok({ roles: [...invitation.roles] });
}

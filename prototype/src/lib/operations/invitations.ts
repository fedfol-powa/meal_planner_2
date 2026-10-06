import { addDaysToTime } from '#lib/domain/calendar.ts';
import type { DemoDatabase, LocalDateTime } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';
import { isInvitationActive, writableFamily } from './family';

export const INVITATION_DAYS = 7;

/**
 * What the invitation page shows. `removed`: the person was removed after this link was created, so it no
 * longer lets them back in (review R2, round 4); they need a new link.
 */
export type InvitationStatus = 'valid' | 'already_member' | 'expired' | 'revoked' | 'removed' | 'not_found';

export interface InvitationView {
	status: InvitationStatus;
	familyId: string | null;
	familyName: string | null;
	invitedByName: string | null;
	expiresAt: LocalDateTime | null;
}

/** New link of the current family, valid for 7 days and reusable until then. */
export function createInvitation(db: DemoDatabase, ctx: OperationContext): OpResult<{ token: string }> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const token = `${found.value.id.replace(/^family-/, '')}-${Math.random().toString(36).slice(2, 7)}`;
	db.invitations.push({ token, familyId: found.value.id, createdBy: ctx.userId, createdAt: ctx.now, expiresAt: addDaysToTime(ctx.now, INVITATION_DAYS), revokedAt: null });
	return ok({ token });
}

export function revokeInvitation(db: DemoDatabase, ctx: OperationContext, token: string): OpResult<null> {
	const found = writableFamily(db, ctx, true);
	if (!found.ok) return found;
	const invitation = db.invitations.find((i) => i.token === token && i.familyId === found.value.id);
	if (!invitation) return fail('not_found');
	invitation.revokedAt ??= ctx.now;
	return ok(null);
}

/** Readable also before signing in (ctx.userId empty): family name, who invited and the link state. */
export function getInvitation(db: DemoDatabase, ctx: OperationContext, token: string): InvitationView {
	const invitation = db.invitations.find((i) => i.token === token);
	const family = invitation ? db.families.find((f) => f.id === invitation.familyId) : undefined;
	if (!invitation || !family) return { status: 'not_found', familyId: null, familyName: null, invitedByName: null, expiresAt: null };
	const base = {
		familyId: family.id,
		familyName: family.name,
		invitedByName: db.users.find((u) => u.id === invitation.createdBy)?.displayName ?? null,
		expiresAt: invitation.expiresAt
	};
	const status: InvitationStatus = family.members.some((m) => m.userId === ctx.userId)
		? 'already_member'
		: invitation.revokedAt !== null
			? 'revoked'
			: !isInvitationActive(invitation, ctx.now)
				? 'expired'
				: db.removals.some((r) => r.familyId === family.id && r.userId === ctx.userId && r.removedAt >= invitation.createdAt)
					? 'removed'
					: 'valid';
	return { status, ...base };
}

/** Joins as a member; already being a member changes nothing (spec section 7). */
export function acceptInvitation(db: DemoDatabase, ctx: OperationContext, token: string): OpResult<{ familyId: string }> {
	if (ctx.offline) return fail('offline');
	if (!db.users.some((u) => u.id === ctx.userId)) return fail('forbidden');
	const view = getInvitation(db, ctx, token);
	if (view.status === 'already_member') return ok({ familyId: view.familyId! });
	if (view.status !== 'valid') return fail('not_allowed');
	db.families.find((f) => f.id === view.familyId)!.members.push({ userId: ctx.userId, role: 'member', joinedAt: ctx.now });
	return ok({ familyId: view.familyId! });
}

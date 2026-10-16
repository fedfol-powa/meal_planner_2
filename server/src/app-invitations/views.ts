import type { AppInvitationView, GlobalRole } from '@app/contract';

/** A row of app.app_invitations_view(); roles arrive as jsonb, already an array. */
export interface InvitationRow {
	id: string; email: string | null; roles: GlobalRole[]; status: 'pending' | 'accepted' | 'revoked';
	created_by: string | null; created_by_name: string | null; created_at: Date; expires_at: Date;
	accepted_by_name: string | null; accepted_at: Date | null; revoked_at: Date | null;
}

export function invitationView(row: InvitationRow, now: Date): AppInvitationView {
	return {
		id: row.id,
		email: row.email,
		roles: row.roles,
		status: row.status === 'pending' && row.expires_at <= now ? 'expired' : row.status,
		createdBy: row.created_by,
		createdByName: row.created_by_name,
		createdAt: row.created_at.toISOString(),
		expiresAt: row.expires_at.toISOString(),
		acceptedByName: row.accepted_by_name,
		acceptedAt: row.accepted_at?.toISOString() ?? null,
		revokedAt: row.revoked_at?.toISOString() ?? null,
	};
}

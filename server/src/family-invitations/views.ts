import type { FamilyInvitationView, FamilyJoinView } from '@app/contract';
import type { Tx } from '../db.ts';

interface InvitationRow {
	id: string; created_by: string | null; created_by_name: string | null; created_at: Date; expires_at: Date;
	registrations: number; pending_registrations: number; expired: boolean;
}
interface JoinRow {
	joined_at: Date; mode: 'new_account' | 'existing_account'; user_name: string | null; invitation_id: string;
	invitation_created_by_name: string | null; invitation_created_at: Date;
}

/** Not versioned (spec W11, section 1): reservations and expiries change it without touching the family. */
export async function invitationsView(tx: Tx, familyId: string): Promise<FamilyInvitationView[]> {
	const rows = await tx<InvitationRow[]>`select * from app.family_invitations_view(${familyId}::uuid)`;
	return rows.map((row) => ({
		id: row.id,
		createdBy: row.created_by,
		createdByName: row.created_by_name,
		createdAt: row.created_at.toISOString(),
		expiresAt: row.expires_at.toISOString(),
		registrations: row.registrations,
		pendingRegistrations: row.pending_registrations,
		expired: row.expired,
	}));
}

export async function joinsView(tx: Tx, familyId: string): Promise<FamilyJoinView[]> {
	const rows = await tx<JoinRow[]>`select * from app.family_joins_view(${familyId}::uuid)`;
	return rows.map((row) => ({
		joinedAt: row.joined_at.toISOString(),
		mode: row.mode,
		userName: row.user_name,
		invitationId: row.invitation_id,
		invitationCreatedByName: row.invitation_created_by_name,
		invitationCreatedAt: row.invitation_created_at.toISOString(),
	}));
}

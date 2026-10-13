import { appError } from '../errors.ts';

/** SQLSTATEs raised by the functions of 20261013100000_app_invitations.sql. */
export function mapInvitationError(error: unknown): never {
	const code = (error as { code?: unknown } | null)?.code;
	switch (code) {
		case '42501': throw appError('forbidden');
		case 'P0A01': throw appError('invitation_unavailable');
		case 'P0A02': throw appError('invalid', { issues: [{ path: ['email'], code: 'email_mismatch' }] });
		case 'P0A03': throw appError('not_allowed', { reason: 'account_exists' });
		case 'P0A04': throw appError('not_allowed', { reason: 'already_accepted' });
		case 'P0A06': throw appError('not_found');
		// An id reused with other data is the client's mistake: invalid, not conflict (which carries catalogue data).
		case 'P0A05':
		case '23514':
			throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
		default: throw error;
	}
}

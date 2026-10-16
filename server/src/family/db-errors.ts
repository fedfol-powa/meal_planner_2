import { appError } from '../errors.ts';

/**
 * SQLSTATEs raised by the functions of 20261016100000_family_management.sql (spec W11, section 1).
 * `successorField` names the input field of a refused successor.
 */
export function mapFamilyError(error: unknown, successorField = 'successorId'): never {
	const code = (error as { code?: unknown } | null)?.code;
	switch (code) {
		case '42501': throw appError('forbidden');
		case 'P0A01': throw appError('invitation_unavailable');
		case 'P0A03': throw appError('not_allowed', { reason: 'account_exists' });
		case 'P0A05': throw appError('invalid', { issues: [{ path: ['id'], code: 'in_use' }] });
		case 'P0A06': throw appError('not_found');
		case 'P0A09': throw appError('last_admin');
		case 'P0A10': throw appError('sole_member');
		case 'P0A13': throw appError('invalid', { issues: [{ path: [successorField], code: 'successor' }] });
		case 'P0A14': throw appError('not_found');
		default: throw error;
	}
}

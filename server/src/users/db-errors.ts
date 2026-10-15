import { appError } from '../errors.ts';

/** SQLSTATEs raised by the functions of 20261015100000_user_admin.sql. */
export function mapUsersError(error: unknown): never {
	const code = (error as { code?: unknown } | null)?.code;
	switch (code) {
		case '42501': throw appError('forbidden');
		case '22023': throw appError('invalid', { issues: [{ path: ['role'], code: 'invalid_value' }] });
		case 'P0A07': throw appError('not_found');
		case 'P0A08': throw appError('last_app_admin');
		default: throw error;
	}
}

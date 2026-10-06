import type { OpErrorCode } from '#lib/operations/context.ts';
import type { MessageKey } from './messages';

const KEYS: Record<OpErrorCode, MessageKey> = {
	forbidden: 'error.forbidden',
	not_found: 'error.notFound',
	invalid: 'error.invalid',
	offline: 'error.offline',
	not_allowed: 'error.notAllowed',
	last_admin: 'error.lastAdmin',
	last_app_admin: 'error.lastAppAdmin',
	sole_member: 'error.soleMember',
	web_only: 'error.webOnly'
};

export const errorKey = (code: OpErrorCode): MessageKey => KEYS[code];

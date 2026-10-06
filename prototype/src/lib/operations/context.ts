import type { Channel, LocalDateTime } from '#lib/domain/types.ts';

/** Who is acting, on which family, through which channel. Shared shape for web and MCP. */
export interface OperationContext {
	userId: string;
	familyId: string;
	channel: Channel;
	now: LocalDateTime;
	offline: boolean;
}

/**
 * last_admin: the family would be left without an administrator; last_app_admin: the same for the app;
 * sole_member: leaving would leave the family empty (delete it instead); web_only: only possible in the
 * web app (MCP gets the page link, spec section 7).
 */
export type OpErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'offline' | 'not_allowed' | 'last_admin' | 'last_app_admin' | 'sole_member' | 'web_only';
export type OpResult<T> = { ok: true; value: T } | { ok: false; error: OpErrorCode };

export const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
export const fail = <T>(error: OpErrorCode): OpResult<T> => ({ ok: false, error });

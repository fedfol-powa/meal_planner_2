import type { Channel, LocalDateTime } from '#lib/domain/types.ts';

/** Who is acting, on which family, through which channel. Shared shape for web and MCP. */
export interface OperationContext {
	userId: string;
	familyId: string;
	channel: Channel;
	now: LocalDateTime;
	offline: boolean;
}

export type OpErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'offline' | 'not_allowed' | 'no_candidates';
export type OpResult<T> = { ok: true; value: T } | { ok: false; error: OpErrorCode };

export const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
export const fail = <T>(error: OpErrorCode): OpResult<T> => ({ ok: false, error });

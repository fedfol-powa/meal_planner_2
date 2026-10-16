import type { PhotoIssueCode } from '@app/contract';

/** A photo refused for a reason the curator can fix: `invalid` on the image field. */
export class PhotoError extends Error {
	readonly code: PhotoIssueCode;
	constructor(code: PhotoIssueCode) {
		super(code);
		this.code = code;
		this.name = 'PhotoError';
	}
}

/** The Images service failed; `limit` when the monthly transformations are used up (9422). */
export class PhotoServiceError extends Error {
	readonly limit: boolean;
	constructor(cause: unknown) {
		const message = cause instanceof Error ? cause.message : String(cause);
		super('images service failed', { cause });
		this.name = 'PhotoServiceError';
		this.limit = message.includes('9422') || (cause as { code?: unknown } | null)?.code === 9422;
	}
}

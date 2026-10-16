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

/** The Images error code of a failure of the binding, from `code` or from the «ERROR 9xxx» of the message. */
function imagesCode(error: unknown): number | null {
	const code = (error as { code?: unknown } | null)?.code;
	if (typeof code === 'number') return code;
	const found = /\b(9\d{3})\b/.exec(error instanceof Error ? error.message : String(error));
	return found ? Number(found[1]) : null;
}

/**
 * Images errors that mean the input cannot be decoded (Cloudflare's troubleshooting page): not an
 * image (9412), format not supported (9520), invalid format (9523). Every other code, internal
 * ones such as 9516 included, is the service's fault.
 */
const UNDECODABLE = new Set([9412, 9520, 9523]);

/** The input the binding could not decode: the curator's image, not the service. */
export function isUndecodable(error: unknown): boolean {
	const code = imagesCode(error);
	return code !== null && UNDECODABLE.has(code);
}

/** The Images service failed; `limit` when the monthly transformations are used up (9422). */
export class PhotoServiceError extends Error {
	readonly limit: boolean;
	constructor(cause: unknown) {
		super('images service failed', { cause });
		this.name = 'PhotoServiceError';
		this.limit = imagesCode(cause) === 9422;
	}
}

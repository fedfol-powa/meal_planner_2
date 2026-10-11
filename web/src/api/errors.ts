import type { MessageKey } from '../i18n/translate';

export type ApiErrorCode = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unauthorized' | 'network' | 'unknown';

/** Errors are codes, never texts (spec section 1): the web translates them. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly data?: unknown;
  constructor(code: ApiErrorCode, data?: unknown) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  // fetch rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return new ApiError('network');
  return new ApiError('unknown');
}

export function errorKey(error: unknown): MessageKey {
  return `errors.${toApiError(error).code}`;
}

/** Offline, the stored copy stays readable; any other error hides it (review, finding 2). */
export function isBlocking(error: unknown, hasData: boolean): boolean {
  return toApiError(error).code !== 'network' || !hasData;
}

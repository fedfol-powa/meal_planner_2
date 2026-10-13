import type { ErrorCode } from '@app/contract';
import type { MessageKey } from '../i18n/translate';

/** The codes of the contract, written here so that no contract code enters the bundle. */
export const CONTRACT_ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'not_found',
  'invalid',
  'conflict',
  'not_allowed',
  'last_admin',
  'last_app_admin',
  'sole_member',
  'web_only',
  'invitation_unavailable',
  'rate_limited',
  'internal'
] as const satisfies readonly ErrorCode[];
// Fails to compile when the contract adds a code missing above.
const complete: [Exclude<ErrorCode, (typeof CONTRACT_ERROR_CODES)[number]>] extends [never] ? true : never = true;
void complete;

/** Contract codes, plus `network` (no answer) and `unknown` (an answer that is not the contract's). */
export type ApiErrorCode = ErrorCode | 'network' | 'unknown';

/** Thrown by `call` on a closed session (or one superseded by a new identity): `run` is not executed. */
export class SessionClosedError extends Error {
  constructor() {
    super('session closed');
    this.name = 'SessionClosedError';
  }
}

export function isContractErrorCode(code: string): code is ErrorCode {
  return (CONTRACT_ERROR_CODES as readonly string[]).includes(code);
}

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

import { errorDefinitions, isErrorCode, type ErrorCode, type Locale } from '@app/contract';
import { ORPCError, ValidationError } from '@orpc/server';
import { messageFor } from './messages.ts';

export interface ErrorScope {
	requestId: string;
	path?: readonly string[];
}

export function appError(code: ErrorCode, data?: unknown): ORPCError<ErrorCode, unknown> {
	return new ORPCError(code, { status: errorDefinitions[code].status, data });
}

const CODE_SHAPE = /^[A-Z0-9_]{2,40}$/;

/**
 * Name and code of the innermost cause. Messages, queries, parameters and causes are
 * never logged: they can hold passwords, tokens, connection strings or personal data.
 */
export function diagnosticOf(error: unknown): { name: string; code?: string } {
	let current = error;
	for (let depth = 0; depth < 5 && current instanceof Error && current.cause !== undefined; depth++) current = current.cause;
	const name = current instanceof Error ? current.name : typeof current;
	const code = (current as { code?: unknown } | null)?.code;
	return typeof code === 'string' && CODE_SHAPE.test(code) ? { name, code } : { name };
}

/** Every error leaving an operation becomes one of the contract codes. */
export function normalizeError(error: unknown, scope: ErrorScope): ORPCError<ErrorCode, unknown> {
	if (error instanceof ORPCError) {
		if (error.code === 'BAD_REQUEST' && error.cause instanceof ValidationError) {
			const issues = error.cause.issues.map((issue) => ({
				path: (issue.path ?? []).map((part) => {
					const key = typeof part === 'object' ? part.key : part;
					return typeof key === 'number' ? key : String(key);
				}),
				code: (issue as { code?: string }).code ?? 'invalid',
			}));
			return new ORPCError('invalid', { status: 400, data: { issues } });
		}
		if (isErrorCode(error.code)) return error as ORPCError<ErrorCode, unknown>;
	}
	console.error(
		JSON.stringify({ event: 'unexpected_error', requestId: scope.requestId, path: scope.path?.join('.'), ...diagnosticOf(error) }),
	);
	return new ORPCError('internal', { status: 500, data: { requestId: scope.requestId } });
}

/** Interceptor for handlers and router clients: run, then normalise what is thrown. */
export async function mapErrors<T>(options: {
	next: () => Promise<T>;
	context?: { requestId?: string };
	path?: readonly string[];
}): Promise<T> {
	try {
		return await options.next();
	} catch (error) {
		throw normalizeError(error, { requestId: options.context?.requestId ?? 'unknown', path: options.path });
	}
}

export function toolErrorBody(
	error: unknown,
	locale: Locale,
	scope: ErrorScope,
): { code: ErrorCode; data?: unknown; message: string } {
	const normalized = normalizeError(error, scope);
	return { code: normalized.code, data: normalized.data, message: messageFor(normalized.code, locale) };
}

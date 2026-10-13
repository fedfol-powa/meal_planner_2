import { errorCodes, locales } from '@app/contract';
import { ORPCError, ValidationError } from '@orpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountServiceError } from '../src/accounts/index.ts';
import { appError, diagnosticOf, normalizeError, toolErrorBody } from '../src/errors.ts';
import { messages } from '../src/messages.ts';

const scope = { requestId: 'req-1', path: ['session', 'whoami'] };

afterEach(() => vi.restoreAllMocks());

describe('messages', () => {
	it('has a non-empty text for every code in both languages', () => {
		for (const code of errorCodes) for (const locale of locales) expect(messages[code][locale].length).toBeGreaterThan(0);
	});
});

describe('normalizeError', () => {
	it('turns input validation into invalid with field paths', () => {
		const validation = new ORPCError('BAD_REQUEST', {
			cause: new ValidationError({
				message: 'Input validation failed',
				issues: [{ message: 'Invalid UUID', path: ['familyId'], code: 'invalid_format' } as never],
				data: {},
			}),
		});
		const error = normalizeError(validation, scope);
		expect(error.code).toBe('invalid');
		expect(error.status).toBe(400);
		expect(error.data).toEqual({ issues: [{ path: ['familyId'], code: 'invalid_format' }] });
	});

	it("a contract refinement names its code in the message (e.g. password_too_long)", () => {
		const validation = new ORPCError('BAD_REQUEST', {
			cause: new ValidationError({
				message: 'Input validation failed',
				issues: [{ message: 'password_too_long', path: ['password'], code: 'custom' } as never],
				data: {},
			}),
		});
		expect(normalizeError(validation, scope).data).toEqual({ issues: [{ path: ['password'], code: 'password_too_long' }] });
	});

	it('keeps known codes', () => {
		const error = normalizeError(appError('forbidden'), scope);
		expect(error.code).toBe('forbidden');
		expect(error.status).toBe(403);
	});

	it('hides unexpected errors as internal with the request id', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = normalizeError(new Error('postgres://user:secret@host/db refused'), scope);
		expect(error.code).toBe('internal');
		expect(error.status).toBe(500);
		expect(error.data).toEqual({ requestId: 'req-1' });
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
	});

	it('logs chosen fields only, never secrets', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const inner = Object.assign(
			new Error('connect ECONNREFUSED postgres://app_server:hunter2@db.local:5432/postgres, Authorization: Bearer eyJhbGciOi.secret'),
			{ code: 'ECONNREFUSED', query: 'select secret_column', parameters: ['hunter2'] },
		);
		normalizeError(new ORPCError('INTERNAL_SERVER_ERROR', { cause: inner }), scope);
		const logged = JSON.stringify(log.mock.calls);
		for (const secret of ['hunter2', 'postgres://', 'Bearer', 'eyJhbGciOi', 'secret_column']) {
			expect(logged).not.toContain(secret);
		}
		expect(logged).toContain('ECONNREFUSED');
		expect(logged).toContain('req-1');
		expect(logged).toContain('session.whoami');
	});
});

describe('diagnosticOf', () => {
	it('takes the innermost name and a code only when it looks like one', () => {
		const pg = Object.assign(new Error('relation "x" does not exist'), { name: 'PostgresError', code: '42P01' });
		expect(diagnosticOf(new Error('outer', { cause: pg }))).toEqual({ name: 'PostgresError', code: '42P01' });
		expect(diagnosticOf(Object.assign(new Error('x'), { code: 'postgres://u:p@h' }))).toEqual({ name: 'Error' });
		expect(diagnosticOf('a string')).toEqual({ name: 'string' });
	});
});

describe('toolErrorBody', () => {
	it('adds the message in the user language', () => {
		expect(toolErrorBody(appError('web_only', { url: 'https://x/family' }), 'en-GB', scope)).toEqual({
			code: 'web_only',
			data: { url: 'https://x/family' },
			message: messages.web_only['en-GB'],
		});
	});
});

describe('account service errors', () => {
	it('become internal with one log line: the reason and the HTTP status only', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const error = normalizeError(new AccountServiceError('auth_admin_failed', 503), scope);
		expect(error.code).toBe('internal');
		expect(error.data).toEqual({ requestId: 'req-1' });
		expect(log).toHaveBeenCalledTimes(1);
		expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ event: 'auth_admin_failed', requestId: 'req-1', status: 503 });
	});
});

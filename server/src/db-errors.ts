import { appError } from './errors.ts';

/** Check violations and invalid parameters (an unknown time zone) are the caller's input. */
const INPUT_CODES = new Set(['23514', '22023']);

/**
 * Runs a write whose database checks validate `path`: their failures become `invalid` on
 * that field instead of `internal`. The transaction is aborted either way.
 */
export async function withInvalidOn<T>(path: (string | number)[], run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (typeof code === 'string' && INPUT_CODES.has(code)) throw appError('invalid', { issues: [{ path, code: 'invalid' }] });
		throw error;
	}
}

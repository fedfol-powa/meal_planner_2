import type { Locale } from '@app/contract';
import type { Env } from '../env.ts';

const TIMEOUT_MS = 10_000;

export interface InvitedAccount {
	id: string;
	email: string;
	password: string;
	displayName: string;
	locale: Locale;
}
/** `weak_password`: Auth's password policy refused it and nothing was created (production may be stricter than the contract). */
export type AccountOutcome = { status: 'created' } | { status: 'existing' } | { status: 'email_taken' } | { status: 'weak_password' };

/** Supabase Auth could not be used: an outage, answered as `internal`. The message never carries data. */
export class AccountServiceError extends Error {
	override name = 'AccountServiceError';
	readonly reason: 'auth_admin_key_missing' | 'auth_admin_failed';
	readonly status: number | null;
	constructor(reason: 'auth_admin_key_missing' | 'auth_admin_failed', status: number | null = null) {
		super(reason);
		this.reason = reason;
		this.status = status;
	}
}

/**
 * The only module that reads the secret key (spec W9). Creates a confirmed account with the id
 * reserved on the invitation. Any answer but 200 is ambiguous (two creations can both pass Auth's
 * email check; a creation can succeed and time out): the reserved id is read back. An existing
 * account is never rewritten: no PUT, so password, name and language stay those of the first
 * successful attempt. The secret key goes in `apikey`: it is not a JWT.
 */
export async function createInvitedAccount(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	account: InvitedAccount,
	options: { fetch?: typeof fetch } = {},
): Promise<AccountOutcome> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	/** null: the request did not get an answer (network, timeout). */
	const send = async (method: 'POST' | 'GET', path: string, body?: unknown): Promise<Response | null> => {
		try {
			return await (options.fetch ?? fetch)(new URL(`/auth/v1/admin/users${path}`, env.SUPABASE_URL).toString(), {
				method,
				headers: { apikey: key, 'content-type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(TIMEOUT_MS),
			});
		} catch {
			return null;
		}
	};
	const created = await send('POST', '', {
		id: account.id,
		email: account.email,
		password: account.password,
		email_confirm: true,
		user_metadata: { display_name: account.displayName, locale: account.locale },
	});
	if (created?.ok) return { status: 'created' };
	const refusal = created?.status === 422 ? await errorCode(created) : undefined;
	const emailExists = refusal === 'email_exists';
	const read = await send('GET', `/${account.id}`);
	if (!read) throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	if (read.status === 404) {
		if (emailExists) return { status: 'email_taken' };
		if (refusal === 'weak_password') return { status: 'weak_password' };
		throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	}
	if (!read.ok) throw new AccountServiceError('auth_admin_failed', read.status);
	const user = (await read.json()) as { id?: unknown; email?: unknown };
	const same = user.id === account.id && typeof user.email === 'string' && user.email.toLowerCase() === account.email;
	return same ? { status: 'existing' } : { status: 'email_taken' };
}

async function errorCode(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as { error_code?: unknown } | null;
		return typeof body?.error_code === 'string' ? body.error_code : undefined;
	} catch {
		return undefined;
	}
}

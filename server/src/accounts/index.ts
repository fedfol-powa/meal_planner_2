import type { Locale } from '@app/contract';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { passwordEmail } from '../mail/password-email.ts';
import { sendEmail } from '../mail/transport.ts';

const TIMEOUT_MS = 10_000;

export interface InvitedAccount {
	id: string;
	email: string;
	displayName: string;
	locale: Locale;
}
/** `existing`: created by an earlier attempt; `confirmed` once its email was confirmed from the link. */
export type AccountOutcome = { status: 'created' } | { status: 'existing'; confirmed: boolean } | { status: 'email_taken' }
	/** `beforeCreate` answered true: no request reached Auth. */
	| { status: 'skipped' };

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

type Method = 'POST' | 'GET' | 'PUT' | 'DELETE';

/** null: the request did not get an answer (network, timeout). `path` is under /auth/v1/admin. */
async function send(
	env: Pick<Env, 'SUPABASE_URL'>,
	key: string,
	method: Method,
	path: string,
	options: { fetch?: typeof fetch },
	body?: unknown,
): Promise<Response | null> {
	try {
		return await (options.fetch ?? fetch)(new URL(`/auth/v1/admin${path}`, env.SUPABASE_URL).toString(), {
			method,
			headers: { apikey: key, 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		return null;
	}
}

/**
 * The only module that reads the secret key (spec W9). Creates the account with the id reserved
 * on the invitation, the email to confirm and no password anyone knows (spec W15, section 2): the
 * person chooses it from the link of the email. Any answer but 200 is ambiguous (two creations can
 * both pass Auth's email check; a creation can succeed and time out): the reserved id is read
 * back. An existing account is never rewritten: no PUT, so name and language stay those of the
 * first successful attempt. The secret key goes in `apikey`: it is not a JWT. `beforeCreate`,
 * called right before the POST, can stop it (an id deleted meanwhile, spec W11).
 */
export async function createInvitedAccount(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	account: InvitedAccount,
	options: { fetch?: typeof fetch; beforeCreate?: () => Promise<boolean> } = {},
): Promise<AccountOutcome> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	if (options.beforeCreate && (await options.beforeCreate())) return { status: 'skipped' };
	const created = await send(env, key, 'POST', '/users', options, {
		id: account.id,
		email: account.email,
		email_confirm: false,
		user_metadata: { display_name: account.displayName, locale: account.locale },
	});
	if (created?.ok) return { status: 'created' };
	const emailExists = created?.status === 422 && (await errorCode(created)) === 'email_exists';
	const read = await send(env, key, 'GET', `/users/${account.id}`, options);
	if (!read) throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	if (read.status === 404) {
		if (emailExists) return { status: 'email_taken' };
		throw new AccountServiceError('auth_admin_failed', created?.status ?? null);
	}
	if (!read.ok) throw new AccountServiceError('auth_admin_failed', read.status);
	const user = (await read.json()) as { id?: unknown; email?: unknown; email_confirmed_at?: unknown };
	const same = user.id === account.id && typeof user.email === 'string' && user.email.toLowerCase() === account.email;
	return same ? { status: 'existing', confirmed: typeof user.email_confirmed_at === 'string' } : { status: 'email_taken' };
}

export type PasswordLink = { status: 'ok'; url: string } | { status: 'absent' } | { status: 'failed' };

/**
 * Spec W15, section 2: a recovery link for an existing account; never sends, never creates (the
 * `recovery` type of generate_link answers 404 for an unknown email). The link opens the app's
 * page with the hashed token in the fragment; the `action_link` of the answer is not used (it
 * would carry the token in a query through /auth/v1/verify). A new link replaces the previous one.
 */
export async function generatePasswordLink(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	email: string,
	origin: string,
	options: { fetch?: typeof fetch } = {},
): Promise<PasswordLink> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	const response = await send(env, key, 'POST', '/generate_link', options, { type: 'recovery', email });
	if (response?.status === 404) return { status: 'absent' };
	if (response?.ok) {
		const body = (await response.json().catch(() => null)) as { hashed_token?: unknown } | null;
		if (typeof body?.hashed_token === 'string' && body.hashed_token !== '') {
			return { status: 'ok', url: `${origin}/password#token_hash=${encodeURIComponent(body.hashed_token)}&type=recovery` };
		}
	}
	logEvent('auth_generate_link_failed', { status: response?.status ?? null }, 'error');
	return { status: 'failed' };
}

/**
 * The "choose your password" email (spec W15, section 2): link, text, one request to Resend (or
 * Mailpit), no retries nor idempotency key: a failure is told by the invitation page, which offers
 * to send it again. `absent`: the account is gone, nothing sent.
 */
export async function sendPasswordEmail(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY' | 'RESEND_API_KEY' | 'MAILPIT_API_URL'>,
	input: { email: string; locale: Locale; familyName: string | null },
	origin: string,
	options: { fetch?: typeof fetch } = {},
): Promise<'sent' | 'failed' | 'absent'> {
	const link = await generatePasswordLink(env, input.email, origin, options);
	if (link.status !== 'ok') return link.status;
	const mail = passwordEmail({ url: link.url, email: input.email, locale: input.locale, familyName: input.familyName });
	const sent = await sendEmail(env, { to: input.email, ...mail }, options);
	if (sent.ok) return 'sent';
	logEvent('password_email_failed', { status: sent.status }, 'error');
	return 'failed';
}

/**
 * The language of Supabase's own emails (spec W15, section 2): Auth merges the keys into the
 * metadata, so only `locale` is sent. A concurrent write may lose it: harmless, accepted.
 */
export async function updateAccountLocale(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	userId: string,
	locale: Locale,
	options: { fetch?: typeof fetch } = {},
): Promise<void> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	const response = await send(env, key, 'PUT', `/users/${userId}`, options, { user_metadata: { locale } });
	if (!response?.ok) throw new AccountServiceError('auth_admin_failed', response?.status ?? null);
}

/**
 * Hard deletion of an Auth account (spec W11, section 2): no body, so no soft delete; Auth
 * removes sessions, identities, OAuth consents and authorisations by cascade. `absent`: already
 * gone, a success for the caller.
 */
export async function deleteAccount(
	env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
	userId: string,
	options: { fetch?: typeof fetch } = {},
): Promise<'deleted' | 'absent'> {
	const key = env.SUPABASE_SECRET_KEY;
	if (!key) throw new AccountServiceError('auth_admin_key_missing');
	const response = await send(env, key, 'DELETE', `/users/${userId}`, options);
	if (!response) throw new AccountServiceError('auth_admin_failed');
	if (response.ok) return 'deleted';
	if (response.status === 404 && (await errorCode(response)) === 'user_not_found') return 'absent';
	throw new AccountServiceError('auth_admin_failed', response.status);
}

async function errorCode(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as { error_code?: unknown } | null;
		return typeof body?.error_code === 'string' ? body.error_code : undefined;
	} catch {
		return undefined;
	}
}

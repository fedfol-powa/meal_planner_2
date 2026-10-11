import { appError } from '../errors.ts';

const TIMEOUT_MS = 5000;
/** Supabase Auth's answer when the user has no active grant for the client (verified on gotrue v2.197.0). */
const NO_ACTIVE_GRANT = 'oauth_consent_not_found';

/** Supabase Auth could not revoke the grant: an outage, answered as `internal`. */
export class GrantRevocationError extends Error {
	override name = 'GrantRevocationError';
}

/**
 * Revokes the caller's grant to an OAuth client through Supabase Auth, which deletes that
 * client's sessions for this user: the session check of every request then refuses its
 * tokens. Only 204 and the documented 404 `oauth_consent_not_found` (no active grant) mean
 * "not connected any more": any other answer, including other 404s, is an outage.
 */
export async function revokeGrant(options: {
	supabaseUrl: string;
	publishableKey: string;
	accessToken: string;
	clientId: string;
	fetch?: typeof fetch;
}): Promise<void> {
	const url = new URL('/auth/v1/user/oauth/grants', options.supabaseUrl);
	url.searchParams.set('client_id', options.clientId);
	let response: Response;
	try {
		response = await (options.fetch ?? fetch)(url.toString(), {
			method: 'DELETE',
			headers: { authorization: `Bearer ${options.accessToken}`, apikey: options.publishableKey },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch (error) {
		throw new GrantRevocationError('Supabase Auth unreachable', { cause: error });
	}
	if (response.status === 204) return;
	if (response.status === 404 && (await errorCode(response)) === NO_ACTIVE_GRANT) return;
	if (response.status === 401 || response.status === 403) throw appError('unauthorized');
	throw new GrantRevocationError(`Supabase Auth answered ${response.status}`);
}

/** `error_code` of a Supabase Auth error body; undefined for HTML, malformed JSON or another shape. */
async function errorCode(response: Response): Promise<string | undefined> {
	try {
		const body: unknown = await response.json();
		const code = (body as { error_code?: unknown } | null)?.error_code;
		return typeof code === 'string' ? code : undefined;
	} catch {
		return undefined;
	}
}

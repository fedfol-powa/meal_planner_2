import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet } from 'jose';
import { z } from 'zod';

/**
 * Claims the server relies on, validated after the signature: they are the security
 * boundary (identity, session for revocation, channel). Other claims pass through to
 * Postgres unchanged as `request.jwt.claims`.
 */
const claimsSchema = z.looseObject({
	sub: z.uuid(),
	role: z.literal('authenticated'),
	session_id: z.uuid(),
	exp: z.number(),
	/** Present only on tokens issued by the OAuth server to an agent (MCP channel). */
	client_id: z.string().min(1).optional(),
});

export type Claims = z.infer<typeof claimsSchema>;
export type Channel = 'web' | 'mcp';

export function channelOf(claims: Claims): Channel {
	return claims.client_id === undefined ? 'web' : 'mcp';
}

export type KeySource = (forceRefresh: boolean) => Promise<JSONWebKeySet>;

/** The signing keys could not be read: an infrastructure outage, never the token's fault. */
export class KeySourceError extends Error {
	override name = 'KeySourceError';
}

const KEYS_TTL_MS = 10 * 60 * 1000;
/** Unknown `kid`s cannot make every request refetch: one forced refetch per interval. */
const FORCED_REFRESH_INTERVAL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

const keySetSchema = z.looseObject({ keys: z.array(z.looseObject({})) });

/**
 * Public signing keys of the Supabase project. Only resolved data is shared across
 * requests: a Worker request must never await I/O started by another request (it hangs
 * and gets cancelled), so concurrent callers on an empty cache each fetch.
 */
export function remoteKeySource(supabaseUrl: string): KeySource {
	let cached: { keys: JSONWebKeySet; fetchedAt: number } | undefined;
	let forcedAt: number | undefined;
	return async (forceRefresh) => {
		if (forceRefresh) {
			// Within the interval the cached keys stand: a still unknown `kid` is refused.
			if (cached && forcedAt !== undefined && Date.now() - forcedAt < FORCED_REFRESH_INTERVAL_MS) return cached.keys;
			forcedAt = Date.now();
		} else if (cached && Date.now() - cached.fetchedAt < KEYS_TTL_MS) {
			return cached.keys;
		}
		const keys = await fetchKeySet(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
		cached = { keys, fetchedAt: Date.now() };
		return keys;
	};
}

async function fetchKeySet(url: string): Promise<JSONWebKeySet> {
	let body: unknown;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!response.ok) throw new KeySourceError(`JWKS unavailable: ${response.status}`);
		body = await response.json();
	} catch (error) {
		throw error instanceof KeySourceError ? error : new KeySourceError('JWKS unavailable', { cause: error });
	}
	const parsed = keySetSchema.safeParse(body);
	if (!parsed.success) throw new KeySourceError('JWKS is not a key set');
	return parsed.data as JSONWebKeySet;
}

export async function verifyAccessToken(token: string, options: { issuer: string; keys: KeySource }): Promise<Claims> {
	let keys = await options.keys(false);
	// A rotated key has an unknown `kid`: refetch once before refusing the token.
	const { kid } = decodeProtectedHeader(token);
	if (kid && !keys.keys.some((key) => key.kid === kid)) keys = await options.keys(true);
	const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
		issuer: options.issuer,
		audience: 'authenticated',
		algorithms: ['ES256', 'RS256'],
		requiredClaims: ['exp', 'sub', 'session_id'],
	});
	const claims = claimsSchema.safeParse(payload);
	if (!claims.success) throw new Error('Token claims are not valid');
	return claims.data;
}

/** Token of an `Authorization: Bearer` header; the scheme name is case-insensitive (RFC 9110). */
export function bearerToken(header: string | null): string | undefined {
	const match = header?.match(/^Bearer (.*)$/i);
	return match?.[1].trim() || undefined;
}

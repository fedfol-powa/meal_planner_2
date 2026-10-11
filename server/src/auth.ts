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

const KEYS_TTL_MS = 10 * 60 * 1000;

/**
 * Public signing keys of the Supabase project. Only resolved data is shared across
 * requests: a Worker request must never await I/O started by another request (it hangs
 * and gets cancelled), so concurrent callers on an empty cache each fetch.
 */
export function remoteKeySource(supabaseUrl: string): KeySource {
	let cached: { keys: JSONWebKeySet; fetchedAt: number } | undefined;
	return async (forceRefresh) => {
		if (!forceRefresh && cached && Date.now() - cached.fetchedAt < KEYS_TTL_MS) return cached.keys;
		const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
		if (!response.ok) throw new Error(`JWKS unavailable: ${response.status}`);
		const keys = (await response.json()) as JSONWebKeySet;
		cached = { keys, fetchedAt: Date.now() };
		return keys;
	};
}

export async function verifyAccessToken(token: string, options: { issuer: string; keys: KeySource }): Promise<Claims> {
	let keys = await options.keys(false);
	// A rotated key has an unknown `kid`: refetch once before refusing the token.
	const { kid } = decodeProtectedHeader(token);
	if (kid && !keys.keys.some((key) => key.kid === kid)) keys = await options.keys(true);
	const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
		issuer: options.issuer,
		audience: 'authenticated',
		requiredClaims: ['exp', 'sub', 'session_id'],
	});
	const claims = claimsSchema.safeParse(payload);
	if (!claims.success) throw new Error('Token claims are not valid');
	return claims.data;
}

export function bearerToken(header: string | null): string | undefined {
	if (!header?.startsWith('Bearer ')) return undefined;
	const token = header.slice('Bearer '.length).trim();
	return token || undefined;
}

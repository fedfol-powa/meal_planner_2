import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';

export interface Env {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
}

/** Claims of a verified Supabase access token, forwarded to Postgres as `request.jwt.claims`. */
export interface Claims extends JWTPayload {
	sub: string;
	role: string;
	/** Present only on tokens issued by the OAuth server to an agent (MCP channel). */
	client_id?: string;
}

export type Channel = 'web' | 'mcp';

export function channelOf(claims: Claims): Channel {
	return claims.client_id ? 'mcp' : 'web';
}

// Only resolved data is shared across requests: a Worker request must never await I/O
// started by another request (it hangs and gets cancelled), so no shared fetch promises.
let cachedKeys: { keys: JSONWebKeySet; fetchedAt: number } | undefined;
const KEYS_TTL_MS = 10 * 60 * 1000;

async function signingKeys(env: Env, forceRefresh = false): Promise<JSONWebKeySet> {
	if (!forceRefresh && cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_TTL_MS) return cachedKeys.keys;
	const response = await fetch(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
	if (!response.ok) throw new Error(`JWKS unavailable: ${response.status}`);
	const keys = (await response.json()) as JSONWebKeySet;
	cachedKeys = { keys, fetchedAt: Date.now() };
	return keys;
}

export async function verifyAccessToken(env: Env, token: string): Promise<Claims> {
	let keys = await signingKeys(env);
	// A rotated key has an unknown `kid`: refetch once before refusing the token.
	const { kid } = decodeProtectedHeader(token);
	if (kid && !keys.keys.some((key) => key.kid === kid)) keys = await signingKeys(env, true);
	const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
		issuer: `${env.SUPABASE_URL}/auth/v1`,
		audience: 'authenticated',
	});
	if (typeof payload.sub !== 'string' || payload.role !== 'authenticated') {
		throw new Error('Token is not an authenticated user token');
	}
	return payload as Claims;
}

export function bearerToken(request: Request): string | undefined {
	const header = request.headers.get('authorization');
	return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

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

// Kept per isolate: jose caches the keys and refetches only on an unknown `kid`.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function verifyAccessToken(env: Env, token: string): Promise<Claims> {
	jwks ??= createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
	const { payload } = await jwtVerify(token, jwks, {
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

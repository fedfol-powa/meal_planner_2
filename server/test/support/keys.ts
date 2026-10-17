import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import type { KeySource } from '../../src/auth.ts';

export const TEST_SUPABASE_URL = 'https://test.supabase.local';
export const TEST_ISSUER = `${TEST_SUPABASE_URL}/auth/v1`;
/** Mailpit's send API in the test env: the fake Auth records what reaches it (spec W15). */
export const TEST_MAIL_URL = 'https://mail.test';

export interface TestKeys {
	keys: KeySource;
	issuer: string;
	sign(
		claims: Record<string, unknown> & { sub: string },
		options?: { expiresIn?: string; noExpiry?: boolean; kid?: string },
	): Promise<string>;
}

/** An ES256 key pair like Supabase asymmetric signing keys, served from memory. */
export async function createTestKeys(): Promise<TestKeys> {
	const { publicKey, privateKey } = await generateKeyPair('ES256');
	const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
	const jwks: JSONWebKeySet = { keys: [jwk] };
	return {
		keys: async () => jwks,
		issuer: TEST_ISSUER,
		async sign(claims, options = {}) {
			// JSON drops undefined values: `session_id: undefined` removes the default.
			const payload = JSON.parse(
				JSON.stringify({ role: 'authenticated', aud: 'authenticated', session_id: crypto.randomUUID(), ...claims }),
			);
			const jwt = new SignJWT(payload)
				.setProtectedHeader({ alg: 'ES256', kid: options.kid ?? 'test-key' })
				.setIssuer(TEST_ISSUER)
				.setIssuedAt();
			if (!options.noExpiry) jwt.setExpirationTime(options.expiresIn ?? '1h');
			return jwt.sign(privateKey);
		},
	};
}

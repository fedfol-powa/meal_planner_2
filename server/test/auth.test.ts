import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, channelOf, KeySourceError, remoteKeySource, verifyAccessToken } from '../src/auth.ts';
import { createTestKeys, TEST_ISSUER } from './support/keys.ts';

const userId = '11111111-1111-4111-8111-111111111111';

describe('verifyAccessToken', () => {
	it('accepts a valid user token', async () => {
		const t = await createTestKeys();
		const sessionId = crypto.randomUUID();
		const claims = await verifyAccessToken(await t.sign({ sub: userId, session_id: sessionId }), { issuer: TEST_ISSUER, keys: t.keys });
		expect(claims.sub).toBe(userId);
		expect(claims.session_id).toBe(sessionId);
		expect(claims.client_id).toBeUndefined();
	});

	it('keeps a valid client_id', async () => {
		const t = await createTestKeys();
		const claims = await verifyAccessToken(await t.sign({ sub: userId, client_id: 'codex' }), { issuer: TEST_ISSUER, keys: t.keys });
		expect(channelOf(claims)).toBe('mcp');
	});

	it('rejects an expired token or one without expiry', async () => {
		const t = await createTestKeys();
		const expired = await t.sign({ sub: userId }, { expiresIn: '-1m' });
		const endless = await t.sign({ sub: userId }, { noExpiry: true });
		await expect(verifyAccessToken(expired, { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(endless, { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('rejects invalid identity claims', async () => {
		const t = await createTestKeys();
		const cases: Record<string, unknown>[] = [
			{ sub: 'not-a-uuid' },
			{ sub: userId, session_id: undefined },
			{ sub: userId, session_id: 'not-a-uuid' },
			{ sub: userId, client_id: '' },
			{ sub: userId, client_id: false },
			{ sub: userId, client_id: 42 },
		];
		for (const claims of cases) {
			const token = await t.sign(claims as { sub: string });
			await expect(verifyAccessToken(token, { issuer: TEST_ISSUER, keys: t.keys }), JSON.stringify(claims)).rejects.toThrow();
		}
	});

	it('rejects another issuer, audience or role', async () => {
		const t = await createTestKeys();
		await expect(verifyAccessToken(await t.sign({ sub: userId }), { issuer: 'https://other/auth/v1', keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(await t.sign({ sub: userId, aud: 'other' }), { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
		await expect(verifyAccessToken(await t.sign({ sub: userId, role: 'anon' }), { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('rejects a token signed by another key', async () => {
		const a = await createTestKeys();
		const b = await createTestKeys();
		await expect(verifyAccessToken(await b.sign({ sub: userId }), { issuer: TEST_ISSUER, keys: a.keys })).rejects.toThrow();
	});

	it('rejects garbage', async () => {
		const t = await createTestKeys();
		await expect(verifyAccessToken('not-a-jwt', { issuer: TEST_ISSUER, keys: t.keys })).rejects.toThrow();
	});

	it('refetches the keys once for an unknown kid', async () => {
		const t = await createTestKeys();
		const keys = vi.fn(t.keys);
		const token = await t.sign({ sub: userId }, { kid: 'rotated' });
		await expect(verifyAccessToken(token, { issuer: TEST_ISSUER, keys })).rejects.toThrow();
		expect(keys.mock.calls).toEqual([[false], [true]]);
	});

	it('accepts only the ES256 and RS256 algorithms', async () => {
		const pairs = { RS256: await generateKeyPair('RS256'), RS384: await generateKeyPair('RS384') };
		// Keys without `alg`, as a key set may publish them: only the verifier limits the algorithm.
		const jwks = { keys: [{ ...(await exportJWK(pairs.RS256.publicKey)), kid: 'RS256' }, { ...(await exportJWK(pairs.RS384.publicKey)), kid: 'RS384' }] };
		const keys = async () => jwks;
		const sign = (alg: 'RS256' | 'RS384') =>
			new SignJWT({ sub: userId, role: 'authenticated', aud: 'authenticated', session_id: crypto.randomUUID() })
				.setProtectedHeader({ alg, kid: alg })
				.setIssuer(TEST_ISSUER)
				.setExpirationTime('1h')
				.sign(pairs[alg].privateKey);
		await expect(verifyAccessToken(await sign('RS256'), { issuer: TEST_ISSUER, keys })).resolves.toMatchObject({ sub: userId });
		await expect(verifyAccessToken(await sign('RS384'), { issuer: TEST_ISSUER, keys })).rejects.toThrow();
	});

	it('lets a key source failure through, distinct from an invalid token', async () => {
		const t = await createTestKeys();
		const keys = async () => {
			throw new KeySourceError('down');
		};
		await expect(verifyAccessToken(await t.sign({ sub: userId }), { issuer: TEST_ISSUER, keys })).rejects.toBeInstanceOf(KeySourceError);
	});
});

describe('remoteKeySource', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('does not share in-flight fetches between concurrent callers', async () => {
		const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
		vi.stubGlobal('fetch', fetchMock);
		const source = remoteKeySource('https://concurrent.supabase.local');
		await Promise.all([source(false), source(false)]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await source(false);
		expect(fetchMock).toHaveBeenCalledTimes(2); // resolved keys are cached
	});

	it('fetches with a timeout', async () => {
		const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ keys: [] }));
		vi.stubGlobal('fetch', fetchMock);
		await remoteKeySource('https://timeout.supabase.local')(false);
		expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
	});

	it('reports an unreachable, failing or malformed key set as a key source failure', async () => {
		const answers: (() => Promise<Response>)[] = [
			async () => {
				throw new TypeError('network down');
			},
			async () => new Response('down', { status: 503 }),
			async () => new Response('not json', { status: 200 }),
			async () => Response.json({ nokeys: true }),
			async () => Response.json({ keys: 'nope' }),
			async () => Response.json([]),
		];
		for (const answer of answers) {
			vi.stubGlobal('fetch', vi.fn(answer));
			await expect(remoteKeySource('https://failing.supabase.local')(false)).rejects.toBeInstanceOf(KeySourceError);
		}
	});

	it('forces a refetch at most once a minute', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
		vi.stubGlobal('fetch', fetchMock);
		const source = remoteKeySource('https://throttled.supabase.local');
		await source(false);
		await source(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(30_000);
		await source(true); // an unknown kid again: the cached keys, so the token is refused
		expect(fetchMock).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(31_000);
		await source(true);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});
});

describe('bearer header', () => {
	it('reads only well-formed bearer headers', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('Bearer ')).toBeUndefined();
		expect(bearerToken('Basic abc')).toBeUndefined();
		expect(bearerToken('Bearerabc')).toBeUndefined();
		expect(bearerToken(null)).toBeUndefined();
	});

	it('matches the scheme name case-insensitively (RFC 9110, 11.1)', () => {
		expect(bearerToken('bearer abc')).toBe('abc');
		expect(bearerToken('BEARER abc')).toBe('abc');
	});
});

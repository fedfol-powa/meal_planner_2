import { afterEach, describe, expect, it, vi } from 'vitest';
import { bearerToken, channelOf, remoteKeySource, verifyAccessToken } from '../src/auth.ts';
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
});

describe('remoteKeySource', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('does not share in-flight fetches between concurrent callers', async () => {
		const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
		vi.stubGlobal('fetch', fetchMock);
		const source = remoteKeySource('https://concurrent.supabase.local');
		await Promise.all([source(false), source(false)]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await source(false);
		expect(fetchMock).toHaveBeenCalledTimes(2); // resolved keys are cached
	});
});

describe('bearer header', () => {
	it('reads only well-formed bearer headers', () => {
		expect(bearerToken('Bearer abc')).toBe('abc');
		expect(bearerToken('bearer abc')).toBeUndefined();
		expect(bearerToken('Bearer ')).toBeUndefined();
		expect(bearerToken(null)).toBeUndefined();
	});
});

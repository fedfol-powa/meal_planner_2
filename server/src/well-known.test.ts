import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseAuthMetadata } from './well-known.ts';

describe('supabaseAuthMetadata', () => {
	afterEach(() => vi.restoreAllMocks());

	it('reads the RFC 8414 document of the hosted project', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ issuer: 'hosted' }));
		expect(await supabaseAuthMetadata('https://hosted.supabase.local')).toEqual({ issuer: 'hosted' });
		expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://hosted.supabase.local/.well-known/oauth-authorization-server/auth/v1']);
	});

	it('falls back to the Auth server path when the gateway does not route the RFC 8414 one (local stack)', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
			String(url).endsWith('/auth/v1') ? new Response('404 page not found', { status: 404 }) : Response.json({ issuer: 'local' }),
		);
		expect(await supabaseAuthMetadata('http://127.0.0.1:54321')).toEqual({ issuer: 'local' });
		expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
			'http://127.0.0.1:54321/.well-known/oauth-authorization-server/auth/v1',
			'http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server',
		]);
	});

	it('fails when neither document is there', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
		await expect(supabaseAuthMetadata('https://missing.supabase.local')).rejects.toThrow(/unavailable: 404/);
	});
});

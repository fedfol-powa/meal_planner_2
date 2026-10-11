import { ORPCError } from '@orpc/server';
import { describe, expect, it } from 'vitest';
import { GrantRevocationError, revokeGrant } from './grants.ts';

const CLIENT = '6a046a4a-3adc-4818-b1b1-47c5966d7fa7';

function fakeFetch(answer: () => Response | Promise<Response>) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = (async (url: string | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return answer();
	}) as typeof globalThis.fetch;
	return { calls, fetch };
}

const options = (fetch: typeof globalThis.fetch) => ({
	supabaseUrl: 'https://project.supabase.co',
	publishableKey: 'sb_publishable_x',
	accessToken: 'token-1',
	clientId: CLIENT,
	fetch,
});

describe('revokeGrant', () => {
	it('deletes the grant of the client with the caller token and the publishable key', async () => {
		const { calls, fetch } = fakeFetch(() => new Response(null, { status: 204 }));
		await revokeGrant(options(fetch));
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe(`https://project.supabase.co/auth/v1/user/oauth/grants?client_id=${CLIENT}`);
		expect(calls[0]!.init.method).toBe('DELETE');
		expect(calls[0]!.init.headers).toEqual({ authorization: 'Bearer token-1', apikey: 'sb_publishable_x' });
		expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
	});

	it('treats the documented "no active grant" answer as already disconnected', async () => {
		const { fetch } = fakeFetch(() => Response.json({ code: 404, error_code: 'oauth_consent_not_found', msg: 'No active grant found' }, { status: 404 }));
		await expect(revokeGrant(options(fetch))).resolves.toBeUndefined();
	});

	it('never takes another 404 for a revocation', async () => {
		const answers = [
			() => new Response(null, { status: 404 }),
			() => new Response('<html><body>Not Found</body></html>', { status: 404, headers: { 'content-type': 'text/html' } }),
			() => new Response('{"error_code":', { status: 404, headers: { 'content-type': 'application/json' } }),
			() => Response.json({ code: 404, error_code: 'not_found', msg: 'Not found' }, { status: 404 }),
			() => Response.json({ message: 'no Route matched with those values' }, { status: 404 }),
		];
		for (const answer of answers) {
			const { fetch } = fakeFetch(answer);
			await expect(revokeGrant(options(fetch))).rejects.toBeInstanceOf(GrantRevocationError);
		}
	});

	it('refuses with unauthorized when Supabase does not accept the token', async () => {
		for (const [status, code] of [[401, 'bad_jwt'], [403, 'session_not_found'], [401, 'no_authorization']] as const) {
			const { fetch } = fakeFetch(() => Response.json({ code: status, error_code: code, msg: 'refused' }, { status }));
			const error = await revokeGrant(options(fetch)).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ORPCError);
			expect((error as ORPCError<string, unknown>).code).toBe('unauthorized');
		}
	});

	it('takes a refusal of the publishable key (placeholder, rotated) for an outage, never for an expired session', async () => {
		const answers = [
			() => Response.json({ message: 'Invalid API key' }, { status: 401 }),
			() => new Response(null, { status: 401 }),
			() => new Response(null, { status: 403 }),
		];
		for (const answer of answers) {
			const { fetch } = fakeFetch(answer);
			await expect(revokeGrant(options(fetch))).rejects.toBeInstanceOf(GrantRevocationError);
		}
	});

	it('fails without claiming success on other answers, network errors and timeouts', async () => {
		const answers = [
			() => new Response('boom', { status: 500 }),
			() => new Response(null, { status: 200 }),
			() => Promise.reject(new TypeError('fetch failed')),
			() => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
		];
		for (const answer of answers) {
			const { fetch } = fakeFetch(answer);
			await expect(revokeGrant(options(fetch))).rejects.toBeInstanceOf(GrantRevocationError);
		}
	});
});

import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv } from './support/requests.ts';
import { testContract, testRouter } from './support/test-contract.ts';

const userId = '11111111-1111-4111-8111-111111111111';
let keys: TestKeys;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	keys = await createTestKeys();
	app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'Cosa si mangia (test)' });
});

describe('routes', () => {
	it('serves the OpenAPI document from the contract', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/openapi.json');
		expect(response.status).toBe(200);
		const spec: any = await response.json();
		expect(spec.openapi).toMatch(/^3\.1/);
		expect(Object.keys(spec.paths)).toContain('/session/whoami');
		expect(spec.servers).toEqual([{ url: 'https://app.test/api' }]);
	});

	it('declares the public operations without authentication and keeps the others protected', async () => {
		const spec: any = await (await rest(app, testEnv(), 'GET', '/api/openapi.json')).json();
		expect(spec.security).toEqual([{ bearerAuth: [] }]);
		for (const path of ['/app-invitations/open', '/app-invitations/accept']) expect(spec.paths[path].post.security, path).toEqual([]);
		for (const [path, method] of [['/app-invitations', 'post'], ['/session/whoami', 'get']] as const)
			expect(spec.paths[path][method].security, path).toBeUndefined();
	});

	it('answers 404 not_found for unknown API paths, never the SPA', async () => {
		for (const path of ['/api/nothing', '/api/rpc/nothing/here']) {
			const response = await rest(app, testEnv(), 'POST', path, undefined, {});
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ code: 'not_found' });
		}
	});

	it('answers a malformed request body with invalid on RPC and REST', async () => {
		const testApp = createApp({ contract: testContract, router: testRouter, keys: () => keys.keys, resourceName: 'test' });
		for (const path of ['/api/rpc/test/member', '/api/test/member']) {
			const response = await testApp.fetch(
				new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' }),
				testEnv(),
			);
			expect(response.status, path).toBe(400);
			const body: any = await response.json();
			expect(body.json ?? body, path).toMatchObject({ code: 'invalid', status: 400, data: { issues: [] } });
		}
	});

	it('hands every other path to the static assets', async () => {
		const response = await rest(app, testEnv(), 'GET', '/menu/today');
		expect(await response.text()).toContain('SPA');
	});
});

describe('authentication on every channel, without reaching the database', () => {
	it('RPC: unauthorized without token, with a malformed header or with invalid claims', async () => {
		const anonymous = rpcClient<ContractRouterClient<Contract>>(app, testEnv());
		await expect(anonymous.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
		// A valid RPC body: input is validated before authentication (task 6).
		const malformed = await app.fetch(
			new Request('https://app.test/api/rpc/session/whoami', {
				method: 'POST',
				headers: { authorization: 'bearer x', 'content-type': 'application/json' },
				body: JSON.stringify({ json: {} }),
			}),
			testEnv(),
		);
		expect(malformed.status).toBe(401);
		const badClient = rpcClient<ContractRouterClient<Contract>>(app, testEnv(), await keys.sign({ sub: userId, client_id: '' }));
		await expect(badClient.session.whoami({})).rejects.toMatchObject({ code: 'unauthorized' });
	});

	it('REST: unauthorized with the error code', async () => {
		const response = await rest(app, testEnv(), 'GET', '/api/session/whoami', 'not-a-jwt');
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'unauthorized' });
	});

	it('MCP: 401 with the protected resource metadata link, for any method', async () => {
		for (const [token, method] of [
			[undefined, 'tools/list'],
			['not-a-jwt', 'initialize'],
			[await keys.sign({ sub: userId, client_id: 'codex' }, { noExpiry: true }), 'tools/list'],
		] as const) {
			const result = await mcp(app, testEnv(), token, method);
			expect(result.status).toBe(401);
			expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
		}
	});

	it('MCP: a database failure while checking the session is a server error, not a 401, and is logged', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const result = await mcp(app, testEnv(), await keys.sign({ sub: userId, client_id: 'codex' }), 'tools/list');
			expect(result.status).toBe(500);
			expect(result.headers.get('www-authenticate')).toBeNull();
			const lines = log.mock.calls.map((args) => args.join(' '));
			expect(lines.some((line) => line.includes('unexpected_error') && line.includes('"path":"mcp"'))).toBe(true);
			// The connection string's password never reaches the log.
			expect(lines.join('\n')).not.toContain('secret');
		} finally {
			log.mockRestore();
		}
	});

	it('signing keys that cannot be fetched are a logged server error, not a 401, on every channel', async () => {
		const remote = createApp({ contract, router, resourceName: 'Cosa si mangia (test)' });
		const token = await keys.sign({ sub: userId, client_id: 'codex' });
		const original = globalThis.fetch;
		globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const viaMcp = await mcp(remote, testEnv(), token, 'tools/list');
			expect(viaMcp.status).toBe(500);
			expect(viaMcp.headers.get('www-authenticate')).toBeNull();
			const client = rpcClient<ContractRouterClient<Contract>>(remote, testEnv(), token);
			await expect(client.session.whoami({})).rejects.toMatchObject({ code: 'internal', status: 500 });
			const viaRest = await rest(remote, testEnv(), 'GET', '/api/session/whoami', token);
			expect(viaRest.status).toBe(500);
			expect(await viaRest.json()).toMatchObject({ code: 'internal' });
			const lines = log.mock.calls.map((args) => args.join(' '));
			expect(lines.filter((line) => line.includes('unexpected_error') && line.includes('KeySourceError'))).toHaveLength(3);
			expect(lines.join('\n')).not.toContain(token);
		} finally {
			globalThis.fetch = original;
			log.mockRestore();
		}
	});
});

describe('OAuth metadata', () => {
	it('serves the protected resource metadata for /mcp', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			Response.json({
				issuer: 'https://test.supabase.local/auth/v1',
				authorization_endpoint: 'https://test.supabase.local/auth/v1/oauth/authorize',
				token_endpoint: 'https://test.supabase.local/auth/v1/oauth/token',
				response_types_supported: ['code'],
			})) as typeof fetch;
		try {
			const response = await rest(app, testEnv(), 'GET', '/.well-known/oauth-protected-resource/mcp');
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({ resource: 'https://app.test/mcp' });
		} finally {
			globalThis.fetch = original;
		}
	});

	it('answers 404 for other /.well-known paths without fetching the metadata', async () => {
		const original = globalThis.fetch;
		const fetchSpy = vi.fn(async () => Response.json({}));
		globalThis.fetch = fetchSpy as unknown as typeof fetch;
		try {
			const env = { ...testEnv(), SUPABASE_URL: 'https://unrelated.supabase.local' };
			const response = await rest(app, env, 'GET', '/.well-known/security.txt');
			expect(response.status).toBe(404);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = original;
		}
	});
});

describe('unexpected errors outside oRPC', () => {
	it('answer 500 internal with a requestId and log it without the error message', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error('boom secret-token');
		}) as typeof fetch;
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			// A Supabase URL whose metadata is not cached by an earlier test.
			const env = { ...testEnv(), SUPABASE_URL: 'https://failing.supabase.local' };
			const response = await rest(app, env, 'GET', '/.well-known/oauth-authorization-server');
			expect(response.status).toBe(500);
			const body: any = await response.json();
			expect(body).toMatchObject({ code: 'internal', status: 500 });
			expect(body.data.requestId).toMatch(/^[0-9a-f-]{36}$/);
			expect(JSON.stringify(body)).not.toContain('boom');
			const lines = log.mock.calls.map((args) => args.join(' '));
			expect(lines.some((line) => line.includes('unexpected_error') && line.includes(body.data.requestId))).toBe(true);
			expect(lines.join('\n')).not.toContain('boom');
		} finally {
			globalThis.fetch = original;
			log.mockRestore();
		}
	});
});

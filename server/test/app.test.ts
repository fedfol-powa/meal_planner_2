import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { router } from '../src/router.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv } from './support/requests.ts';

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

	it('answers 404 not_found for unknown API paths, never the SPA', async () => {
		for (const path of ['/api/nothing', '/api/rpc/nothing/here']) {
			const response = await rest(app, testEnv(), 'POST', path, undefined, {});
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ code: 'not_found' });
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

	it('MCP: a database failure while checking the session is a server error, not a 401', async () => {
		const result = await mcp(app, testEnv(), await keys.sign({ sub: userId, client_id: 'codex' }), 'tools/list');
		expect(result.status).toBe(500);
		expect(result.headers.get('www-authenticate')).toBeNull();
	});

	it('MCP: signing keys that cannot be fetched refuse the token (401)', async () => {
		const remote = createApp({ contract, router, resourceName: 'Cosa si mangia (test)' });
		const original = globalThis.fetch;
		globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
		try {
			const result = await mcp(remote, testEnv(), await keys.sign({ sub: userId, client_id: 'codex' }), 'tools/list');
			expect(result.status).toBe(401);
		} finally {
			globalThis.fetch = original;
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
});

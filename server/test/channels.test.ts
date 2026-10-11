import type { Contract } from '@app/contract';
import { contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { ORPCError } from '@orpc/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { collectTools } from '../src/mcp.ts';
import { messages } from '../src/messages.ts';
import { router } from '../src/router.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { mcp, rest, rpcClient, testEnv, toolBody } from './support/requests.ts';
import { testContract, testRouter } from './support/test-contract.ts';

describe.skipIf(!hasDatabase)('channels with a real session', () => {
	let db: TestDatabase;
	let keys: TestKeys;
	let app: ReturnType<typeof createApp>;
	let testApp: ReturnType<typeof createApp>;
	const env = () => testEnv(db.appServerUrl);
	const tokenFor = (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra });

	beforeAll(async () => {
		db = await setupDatabase();
		keys = await createTestKeys();
		app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
		testApp = createApp({ contract: testContract, router: testRouter, keys: () => keys.keys, resourceName: 'test' });
	});
	afterAll(() => db?.close());

	describe('session.whoami', () => {
		it('answers on RPC as the web app', async () => {
			const user = await db.createUser();
			const client = rpcClient<ContractRouterClient<Contract>>(app, env(), await tokenFor(user));
			await expect(client.session.whoami({})).resolves.toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'it-IT' });
		});

		it('answers on REST', async () => {
			const user = await db.createUser({ locale: 'en-GB' });
			const response = await rest(app, env(), 'GET', '/api/session/whoami', await tokenFor(user));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
		});

		it('answers on MCP as an agent', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			const result = await mcp(app, env(), token, 'tools/call', { name: 'session_whoami', arguments: {} });
			expect(toolBody(result)).toEqual({ userId: user.userId, channel: 'mcp', clientId: 'codex', locale: 'it-IT' });
		});
	});

	describe('revocation at the MCP entrance', () => {
		it('refuses initialize, tools/list and tools/call once the session has ended', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			expect((await mcp(app, env(), token, 'tools/list')).status).toBe(200);
			await db.endSession(user.sessionId);
			for (const [method, params] of [
				['initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }],
				['tools/list', {}],
				['tools/call', { name: 'session_whoami', arguments: {} }],
			] as const) {
				const result = await mcp(app, env(), token, method, params);
				expect(result.status, method).toBe(401);
				expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
			}
		});

		it('refuses a deleted account the same way', async () => {
			const user = await db.createUser();
			const token = await tokenFor(user, { client_id: 'codex' });
			await db.deleteUser(user.userId);
			expect((await mcp(app, env(), token, 'tools/list')).status).toBe(401);
		});
	});

	describe('MCP tools', () => {
		it('has exactly one tool per exposed operation, with the contract input schema', async () => {
			const user = await db.createUser();
			const result = await mcp(testApp, env(), await tokenFor(user, { client_id: 'codex' }), 'tools/list');
			const listed = result.body.result.tools as { name: string; inputSchema: { required?: string[] } }[];
			expect(listed.map((tool) => tool.name).sort()).toEqual(collectTools(testContract).map((tool) => tool.name).sort());
			expect(listed.find((tool) => tool.name === 'test_member')?.inputSchema.required).toEqual(['familyId']);
		});

		it('answers invalid input with the contract error, field path and language of the profile', async () => {
			for (const locale of ['it-IT', 'en-GB'] as const) {
				const user = await db.createUser({ locale });
				const token = await tokenFor(user, { client_id: 'codex' });
				const result = await mcp(testApp, env(), token, 'tools/call', { name: 'test_member', arguments: { familyId: 'bad' } });
				expect(result.body.result.isError).toBe(true);
				const body = toolBody(result);
				expect(body.code).toBe('invalid');
				expect(body.data.issues[0].path).toEqual(['familyId']);
				expect(body.message).toBe(messages.invalid[locale]);
			}
		});
	});

	describe('web_only', () => {
		it('sends a valid agent to the page, in the language of the profile, on MCP and RPC', async () => {
			const admin = await db.createUser({ locale: 'en-GB' });
			const familyId = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
			const token = await tokenFor(admin, { client_id: 'codex' });
			const url = `https://app.test/family/${familyId}/delete`;

			const viaMcp = await mcp(testApp, env(), token, 'tools/call', { name: 'test_removeFamily', arguments: { familyId } });
			expect(toolBody(viaMcp)).toEqual({ code: 'web_only', data: { url }, message: messages.web_only['en-GB'] });

			const client = rpcClient<ContractRouterClient<typeof testContract>>(testApp, env(), token);
			const error = await client.test.removeFamily({ familyId }).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(ORPCError);
			expect(error).toMatchObject({ code: 'web_only', data: { url } });
		});

		it('refuses a revoked agent instead of sending it to the page', async () => {
			const admin = await db.createUser();
			const familyId = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
			const token = await tokenFor(admin, { client_id: 'codex' });
			await db.endSession(admin.sessionId);
			const client = rpcClient<ContractRouterClient<typeof testContract>>(testApp, env(), token);
			await expect(client.test.removeFamily({ familyId })).rejects.toMatchObject({ code: 'unauthorized' });
			expect((await mcp(testApp, env(), token, 'tools/call', { name: 'test_removeFamily', arguments: { familyId } })).status).toBe(401);
		});
	});
});

import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { TEST_SUPABASE_URL } from './support/keys.ts';
import { mcp, rest, rpcClient, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('agents', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());
	afterEach(() => vi.restoreAllMocks());

	async function oauthClient(name: string | null): Promise<string> {
		const id = crypto.randomUUID();
		await actors.db.admin`
			insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_type, token_endpoint_auth_method, client_name)
			values (${id}, 'dynamic', 'http://localhost/cb', 'authorization_code,refresh_token', 'public', 'none', ${name})`;
		return id;
	}

	/** Consent plus one session of the client, as Supabase leaves them after the flow; returns the agent token. */
	async function connect(userId: string, clientId: string, at: { grantedAt: string; renewedAt: string }) {
		await actors.db.admin`
			insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at)
			values (${crypto.randomUUID()}, ${userId}, ${clientId}, 'openid', ${at.grantedAt})
			on conflict (user_id, client_id) do nothing`;
		const sessionId = crypto.randomUUID();
		await actors.db.admin`
			insert into auth.sessions (id, user_id, oauth_client_id, updated_at) values (${sessionId}, ${userId}, ${clientId}, ${at.renewedAt})`;
		const token = await actors.keys.sign({ sub: userId, session_id: sessionId, email: `${userId}@test.local`, client_id: clientId });
		return { token, sessionId, client: rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env, token) };
	}

	/** What Supabase does on DELETE /user/oauth/grants: consent revoked, sessions of the client deleted. */
	async function supabaseRevokes(userId: string, clientId: string) {
		await actors.db.admin`update auth.oauth_consents set revoked_at = now() where user_id = ${userId} and client_id = ${clientId}`;
		await actors.db.admin`delete from auth.sessions where user_id = ${userId} and oauth_client_id = ${clientId}`;
	}

	/** Supabase Auth answers of DELETE /user/oauth/grants: 204, the documented 404, or an outage. */
	const ANSWERS = {
		revoked: () => new Response(null, { status: 204 }),
		noGrant: () => Response.json({ code: 404, error_code: 'oauth_consent_not_found', msg: 'No active grant found' }, { status: 404 }),
		otherNotFound: () => new Response('<html>Not Found</html>', { status: 404, headers: { 'content-type': 'text/html' } }),
		down: () => new Response('boom', { status: 500 }),
		refused: () => new Response(null, { status: 401 }),
	};

	function stubSupabase(answer: () => Response) {
		const calls: { url: string; init?: RequestInit }[] = [];
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			calls.push({ url: String(input), init });
			return answer();
		});
		return calls;
	}

	it('lists the own agents, most recently renewed first, never other people\'s', async () => {
		const anna = await actors.user();
		const bruno = await actors.user();
		const claude = await oauthClient('Claude Code');
		const codex = await oauthClient('Codex');
		const silent = await oauthClient(null);
		await connect(anna.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-10T09:30:00Z' });
		await connect(anna.userId, codex, { grantedAt: '2026-10-02T10:00:00Z', renewedAt: '2026-10-11T08:00:00Z' });
		await connect(anna.userId, silent, { grantedAt: '2026-10-03T10:00:00Z', renewedAt: '2026-10-03T10:00:00Z' });
		await actors.db.admin`delete from auth.sessions where oauth_client_id = ${silent}`;
		await connect(bruno.userId, claude, { grantedAt: '2026-10-05T10:00:00Z', renewedAt: '2026-10-11T12:00:00Z' });

		expect(await anna.client.agents.list({})).toEqual([
			{ clientId: codex, name: 'Codex', connectedAt: '2026-10-02T10:00:00.000Z', lastRenewedAt: '2026-10-11T08:00:00.000Z', current: false },
			{ clientId: claude, name: 'Claude Code', connectedAt: '2026-10-01T10:00:00.000Z', lastRenewedAt: '2026-10-10T09:30:00.000Z', current: false },
			{ clientId: silent, name: '', connectedAt: '2026-10-03T10:00:00.000Z', lastRenewedAt: null, current: false },
		]);
	});

	it('marks the calling agent as current, over MCP', async () => {
		const carla = await actors.user();
		const claude = await oauthClient('Claude Code');
		const agent = await connect(carla.userId, claude, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'agents_list', arguments: {} });
		expect(result.status).toBe(200);
		expect(toolBody(result)).toEqual([expect.objectContaining({ clientId: claude, current: true })]);
	});

	it('publishes agents_list as read-only and agents_disconnect as a tool', async () => {
		const dario = await actors.user();
		const result = await mcp(actors.app, actors.env, dario.token, 'tools/list');
		const tools = result.body.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
		expect(tools.find((t) => t.name === 'agents_list')?.annotations?.readOnlyHint).toBe(true);
		expect(tools.find((t) => t.name === 'agents_disconnect')?.annotations?.readOnlyHint).toBe(false);
	});

	it('disconnects through Supabase Auth with the caller token; already disconnected is fine', async () => {
		const elena = await actors.user();
		const clientId = crypto.randomUUID();
		const calls = stubSupabase(ANSWERS.revoked);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe(`${TEST_SUPABASE_URL}/auth/v1/user/oauth/grants?client_id=${clientId}`);
		expect(calls[0]!.init?.headers).toEqual({ authorization: `Bearer ${elena.token}`, apikey: 'sb_publishable_test' });
		vi.restoreAllMocks();
		stubSupabase(ANSWERS.noGrant);
		expect(await elena.client.agents.disconnect({ clientId })).toEqual({ clientId });
	});

	it('answers internal when Supabase Auth fails or answers another 404, unauthorized when it refuses the token', async () => {
		const franco = await actors.user();
		for (const answer of [ANSWERS.down, ANSWERS.otherNotFound]) {
			stubSupabase(answer);
			expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('internal');
			vi.restoreAllMocks();
		}
		stubSupabase(ANSWERS.refused);
		expect((await errorOf(franco.client.agents.disconnect({ clientId: crypto.randomUUID() }))).code).toBe('unauthorized');
	});

	it('when the revocation fails the agent keeps working and stays in the list', async () => {
		const hugo = await actors.user();
		const a = await oauthClient('Agent A');
		const agent = await connect(hugo.userId, a, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		stubSupabase(ANSWERS.down);
		expect((await errorOf(hugo.client.agents.disconnect({ clientId: a }))).code).toBe('internal');
		vi.restoreAllMocks();
		expect((await agent.client.session.whoami({})).channel).toBe('mcp');
		expect((await hugo.client.agents.list({})).map((row) => row.clientId)).toEqual([a]);
	});

	it('after the revocation the agent token is refused on MCP, RPC and REST; the rest keeps working', async () => {
		const gina = await actors.user();
		const a = await oauthClient('Agent A');
		const b = await oauthClient('Agent B');
		const agentA = await connect(gina.userId, a, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		const agentB = await connect(gina.userId, b, { grantedAt: '2026-10-01T10:00:00Z', renewedAt: '2026-10-11T10:00:00Z' });
		// The agent disconnects itself over MCP: the answer arrives, then Supabase has removed its sessions.
		// Simulated here; the real path, with real tokens and Supabase, is the CI end-to-end check (Task 4).
		stubSupabase(ANSWERS.revoked);
		const own = await mcp(actors.app, actors.env, agentA.token, 'tools/call', { name: 'agents_disconnect', arguments: { clientId: a } });
		expect(own.status).toBe(200);
		expect(own.body.result.isError).toBeFalsy();
		expect(toolBody(own)).toEqual({ clientId: a });
		vi.restoreAllMocks();
		await supabaseRevokes(gina.userId, a);

		const refused = await mcp(actors.app, actors.env, agentA.token, 'tools/call', { name: 'session_whoami', arguments: {} });
		expect(refused.status).toBe(401);
		expect(refused.headers.get('www-authenticate')).toMatch(/^Bearer /);
		expect((await errorOf(agentA.client.session.whoami({}))).code).toBe('unauthorized');
		expect((await rest(actors.app, actors.env, 'GET', '/api/session/whoami', agentA.token)).status).toBe(401);

		expect((await agentB.client.session.whoami({})).channel).toBe('mcp');
		expect((await gina.client.session.whoami({})).channel).toBe('web');
		expect((await gina.client.agents.list({})).map((agent) => agent.clientId)).toEqual([b]);
	});
});

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { Env, RateLimiter } from '../../src/env.ts';
import { UNREACHABLE_DB } from './context.ts';
import { TEST_SUPABASE_URL } from './keys.ts';

export interface TestApp {
	fetch(request: Request, env: Env): Promise<Response>;
}

export const allowAll: RateLimiter = { limit: async () => ({ success: true }) };
export const refuseAll: RateLimiter = { limit: async () => ({ success: false }) };

export function testEnv(connectionString = UNREACHABLE_DB): Env {
	return {
		HYPERDRIVE: { connectionString } as Hyperdrive,
		SUPABASE_URL: TEST_SUPABASE_URL,
		SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
		CF_VERSION_METADATA: { id: 'deploy-1', tag: '', timestamp: '' },
		ASSETS: { fetch: async () => new Response('<!doctype html><title>SPA</title>', { headers: { 'content-type': 'text/html' } }) } as unknown as Fetcher,
		SUPABASE_SECRET_KEY: 'sb_secret_test',
		INVITE_READ_LIMIT: allowAll,
		INVITE_ACCEPT_LIMIT: allowAll,
	};
}

/** RPC client like the web app's, wired straight to the Worker's fetch. */
export function rpcClient<T>(app: TestApp, env: Env, token?: string): T {
	const link = new RPCLink({
		url: 'https://app.test/api/rpc',
		headers: () => (token ? { authorization: `Bearer ${token}` } : {}),
		fetch: (request, init) => app.fetch(new Request(request, init), env),
	});
	return createORPCClient(link) as T;
}

export async function rest(app: TestApp, env: Env, method: string, path: string, token?: string, body?: unknown): Promise<Response> {
	const headers: Record<string, string> = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	return app.fetch(new Request(`https://app.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}

/** One JSON-RPC call to the stateless MCP endpoint; reads JSON or a single SSE event. */
export async function mcp(app: TestApp, env: Env, token: string | undefined, method: string, params: unknown = {}): Promise<{ status: number; headers: Headers; body: any }> {
	const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
	if (token) headers.authorization = `Bearer ${token}`;
	const response = await app.fetch(
		new Request('https://app.test/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }),
		env,
	);
	const text = await response.text();
	const data = response.headers.get('content-type')?.includes('text/event-stream')
		? text.split('\n').find((line) => line.startsWith('data:'))?.slice('data:'.length)
		: text;
	return { status: response.status, headers: response.headers, body: data ? JSON.parse(data) : undefined };
}

/** Body of an MCP tool result (the JSON in its first text block). */
export function toolBody(result: { body: any }): any {
	return JSON.parse(result.body.result.content[0].text);
}

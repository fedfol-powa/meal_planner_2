import {
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	OAuthError,
	OAuthErrorCode,
	oauthMetadataResponse,
	requireBearerAuth,
	type AuthInfo,
} from '@modelcontextprotocol/server';
import type { AnyContractRouter } from '@orpc/contract';
import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ORPCError, type AnyRouter } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { bearerToken, remoteKeySource, verifyAccessToken, type Claims, type KeySource } from './auth.ts';
import { withDb } from './db.ts';
import type { Env } from './env.ts';
import { mapErrors } from './errors.ts';
import { buildMcpServer, collectTools } from './mcp.ts';
import type { RequestContext } from './pipeline.ts';
import { loadSession } from './session.ts';
import { supabaseAuthMetadata } from './well-known.ts';

export interface AppOptions {
	contract: AnyContractRouter;
	router: AnyRouter;
	/** Signing keys of Supabase; the default fetches the project JWKS once per isolate. */
	keys?: (env: Env) => KeySource;
	resourceName: string;
}

const notFound = () => Response.json({ code: 'not_found', status: 404, message: 'Not found' }, { status: 404 });

export function createApp(options: AppOptions) {
	const rpcHandler = new RPCHandler(options.router, { clientInterceptors: [mapErrors] });
	const openApiHandler = new OpenAPIHandler(options.router, { clientInterceptors: [mapErrors] });
	const openApiGenerator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
	const tools = collectTools(options.contract);
	const keySources = new Map<string, KeySource>();
	const keysFor = (env: Env): KeySource => {
		if (options.keys) return options.keys(env);
		let source = keySources.get(env.SUPABASE_URL);
		if (!source) keySources.set(env.SUPABASE_URL, (source = remoteKeySource(env.SUPABASE_URL)));
		return source;
	};
	const mcpHandler = createMcpHandler(({ authInfo }) => {
		const { context } = authInfo!.extra as { context: RequestContext };
		return buildMcpServer(options.router, tools, context);
	});

	function contextFor(request: Request, env: Env, token: string | undefined): RequestContext {
		const issuer = `${env.SUPABASE_URL}/auth/v1`;
		return {
			env,
			requestId: crypto.randomUUID(),
			origin: new URL(request.url).origin,
			token,
			verify: (t) => verifyAccessToken(t, { issuer, keys: keysFor(env) }),
			deployId: env.CF_VERSION_METADATA?.id ?? 'dev',
			state: {},
		};
	}

	/**
	 * Every MCP request (initialize and tools/list included) needs a valid token and a
	 * session that still exists: a disconnected agent gets 401 and must authorise again.
	 */
	async function serveMcp(request: Request, env: Env, mcpUrl: URL): Promise<Response> {
		const gate = requireBearerAuth({
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
			verifier: {
				async verifyAccessToken(token): Promise<AuthInfo> {
					const context = contextFor(request, env, token);
					let claims: Claims;
					try {
						claims = await context.verify(token);
					} catch {
						throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid');
					}
					try {
						context.state.locale = await withDb(env.HYPERDRIVE.connectionString, { kind: 'user', claims }, loadSession);
					} catch (error) {
						if (error instanceof ORPCError && error.code === 'unauthorized') {
							throw new OAuthError(OAuthErrorCode.InvalidToken, 'The session has ended');
						}
						throw error;
					}
					return { token, clientId: claims.client_id ?? '', scopes: [], expiresAt: claims.exp, extra: { context } };
				},
			},
		});
		const auth = await gate(request);
		if (auth instanceof Response) return auth;
		return mcpHandler.fetch(request, { authInfo: auth });
	}

	return {
		async fetch(request: Request, env: Env): Promise<Response> {
			const url = new URL(request.url);
			const mcpUrl = new URL('/mcp', url.origin);

			if (url.pathname.startsWith('/.well-known/')) {
				const metadata = oauthMetadataResponse(request, {
					oauthMetadata: await supabaseAuthMetadata(env.SUPABASE_URL),
					resourceServerUrl: mcpUrl,
					resourceName: options.resourceName,
				});
				return metadata ?? new Response('Not found', { status: 404 });
			}
			if (url.pathname === '/mcp') return serveMcp(request, env, mcpUrl);
			if (url.pathname === '/api/openapi.json') {
				const spec = await openApiGenerator.generate(options.contract, {
					info: { title: options.resourceName, version: env.CF_VERSION_METADATA?.id ?? 'dev' },
					servers: [{ url: `${url.origin}/api` }],
					security: [{ bearerAuth: [] }],
					components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
				});
				return Response.json(spec);
			}
			if (url.pathname.startsWith('/api/')) {
				const context = contextFor(request, env, bearerToken(request.headers.get('authorization')));
				const [prefix, handler] = url.pathname.startsWith('/api/rpc/')
					? (['/api/rpc', rpcHandler] as const)
					: (['/api', openApiHandler] as const);
				const { matched, response } = await handler.handle(request, { prefix, context });
				return matched ? response : notFound();
			}
			return env.ASSETS.fetch(request);
		},
	};
}

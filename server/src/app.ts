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
import { bearerToken, KeySourceError, remoteKeySource, verifyAccessToken, type Claims, type KeySource } from './auth.ts';
import { withDb } from './db.ts';
import type { Env } from './env.ts';
import { mapErrors, mapUnreadableRequest, normalizeError } from './errors.ts';
import { buildMcpServer, collectTools } from './mcp.ts';
import type { RequestContext } from './pipeline.ts';
import { serveBringPage } from './shopping/bring-page.ts';
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

/** The OAuth discovery documents served for MCP; other `/.well-known/` paths are 404. */
const OAUTH_METADATA_PATHS = new Set(['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server']);

export function createApp(options: AppOptions) {
	const handlerOptions = { interceptors: [mapUnreadableRequest], clientInterceptors: [mapErrors] };
	const rpcHandler = new RPCHandler(options.router, handlerOptions);
	const openApiHandler = new OpenAPIHandler(options.router, handlerOptions);
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

	function contextFor(request: Request, env: Env, requestId: string, token: string | undefined): RequestContext {
		const issuer = `${env.SUPABASE_URL}/auth/v1`;
		return {
			env,
			requestId,
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
	async function serveMcp(request: Request, env: Env, requestId: string, mcpUrl: URL): Promise<Response> {
		const gate = requireBearerAuth({
			resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
			verifier: {
				async verifyAccessToken(token): Promise<AuthInfo> {
					const context = contextFor(request, env, requestId, token);
					let claims: Claims;
					try {
						claims = await context.verify(token);
					} catch (error) {
						// Unreadable signing keys: logged and answered 500, like a database failure below.
						if (error instanceof KeySourceError) throw normalizeError(error, { requestId, path: ['mcp'] });
						throw new OAuthError(OAuthErrorCode.InvalidToken, 'The access token is not valid');
					}
					try {
						context.state.locale = await withDb(env.HYPERDRIVE.connectionString, { kind: 'user', claims }, loadSession);
					} catch (error) {
						if (error instanceof ORPCError && error.code === 'unauthorized') {
							throw new OAuthError(OAuthErrorCode.InvalidToken, 'The session has ended');
						}
						// Logged without the message; not an OAuthError, so the SDK answers 500.
						throw normalizeError(error, { requestId: context.requestId, path: ['mcp'] });
					}
					return { token, clientId: claims.client_id ?? '', scopes: [], expiresAt: claims.exp, extra: { context } };
				},
			},
		});
		const auth = await gate(request);
		if (auth instanceof Response) return auth;
		return mcpHandler.fetch(request, { authInfo: auth });
	}

	async function route(request: Request, env: Env, requestId: string): Promise<Response> {
		const url = new URL(request.url);
		const mcpUrl = new URL('/mcp', url.origin);

		if (url.pathname.startsWith('/.well-known/')) {
			// Only the discovery documents fetch Supabase's metadata.
			if (!OAUTH_METADATA_PATHS.has(url.pathname.replace(/\/+$/, ''))) return notFound();
			const metadata = oauthMetadataResponse(request, {
				oauthMetadata: await supabaseAuthMetadata(env.SUPABASE_URL),
				resourceServerUrl: mcpUrl,
				resourceName: options.resourceName,
			});
			return metadata ?? notFound();
		}
		if (url.pathname === '/mcp') return serveMcp(request, env, requestId, mcpUrl);
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
			const context = contextFor(request, env, requestId, bearerToken(request.headers.get('authorization')));
			const [prefix, handler] = url.pathname.startsWith('/api/rpc/')
				? (['/api/rpc', rpcHandler] as const)
				: (['/api', openApiHandler] as const);
			const { matched, response } = await handler.handle(request, { prefix, context });
			return matched ? response : notFound();
		}
		const bring = /^\/shopping-lists\/([^/]+)$/.exec(url.pathname);
		if (bring) return serveBringPage(request, env, bring[1]!);
		return env.ASSETS.fetch(request);
	}

	return {
		async fetch(request: Request, env: Env): Promise<Response> {
			const requestId = crypto.randomUUID();
			try {
				return await route(request, env, requestId);
			} catch (error) {
				// Anything thrown outside oRPC: logged with chosen fields only, never the message.
				const normalized = normalizeError(error, { requestId });
				return Response.json(
					{ code: normalized.code, status: normalized.status, data: normalized.data },
					{ status: normalized.status },
				);
			}
		},
	};
}

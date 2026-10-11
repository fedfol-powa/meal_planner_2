import {
	OAuthError,
	OAuthErrorCode,
	createMcpHandler,
	getOAuthProtectedResourceMetadataUrl,
	oauthMetadataResponse,
	requireBearerAuth,
	type AuthInfo,
} from '@modelcontextprotocol/server';
import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { bearerToken, verifyAccessToken, type Claims, type Env } from './auth.ts';
import { contract } from './contract.ts';
import { buildMcpServer } from './mcp.ts';
import { router } from './router.ts';

const rpcHandler = new RPCHandler(router);
const openApiHandler = new OpenAPIHandler(router);
const openApiGenerator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });

const mcpHandler = createMcpHandler(({ authInfo }) =>
	buildMcpServer(authInfo!.extra as { env: Env; claims: Claims }),
);

// Authorization server metadata of Supabase Auth, mirrored for MCP discovery. Only the
// resolved document is cached: requests must not share in-flight fetches (see auth.ts).
let authServerMetadata: any;
async function supabaseAuthMetadata(env: Env): Promise<any> {
	if (authServerMetadata) return authServerMetadata;
	const response = await fetch(`${env.SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`);
	if (!response.ok) throw new Error(`OAuth server metadata unavailable: ${response.status}`);
	authServerMetadata = await response.json();
	return authServerMetadata;
}

async function serveMcp(request: Request, env: Env, mcpUrl: URL): Promise<Response> {
	const gate = requireBearerAuth({
		resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
		verifier: {
			async verifyAccessToken(token): Promise<AuthInfo> {
				let claims: Claims;
				try {
					claims = await verifyAccessToken(env, token);
				} catch (error) {
					throw new OAuthError(OAuthErrorCode.InvalidToken, String(error));
				}
				return {
					token,
					clientId: claims.client_id ?? '',
					scopes: [],
					expiresAt: claims.exp,
					extra: { env, claims },
				};
			},
		},
	});
	const auth = await gate(request);
	if (auth instanceof Response) return auth;
	return mcpHandler.fetch(request, { authInfo: auth });
}

async function authenticate(request: Request, env: Env): Promise<Claims | Response> {
	const token = bearerToken(request);
	if (!token) return new Response('Unauthorized', { status: 401 });
	try {
		return await verifyAccessToken(env, token);
	} catch {
		return new Response('Unauthorized', { status: 401 });
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const mcpUrl = new URL('/mcp', url.origin);

		if (url.pathname.startsWith('/.well-known/')) {
			const metadata = oauthMetadataResponse(request, {
				oauthMetadata: await supabaseAuthMetadata(env),
				resourceServerUrl: mcpUrl,
				resourceName: 'Cosa si mangia (spike)',
			});
			return metadata ?? new Response('Not found', { status: 404 });
		}

		if (url.pathname === '/mcp') return serveMcp(request, env, mcpUrl);

		if (url.pathname === '/api/openapi.json') {
			const spec = await openApiGenerator.generate(contract, {
				info: { title: 'Cosa si mangia (spike)', version: '0.0.0' },
				servers: [{ url: `${url.origin}/api` }],
				security: [{ bearerAuth: [] }],
				components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
			});
			return Response.json(spec);
		}

		for (const [prefix, handler] of [['/rpc', rpcHandler], ['/api', openApiHandler]] as const) {
			if (!url.pathname.startsWith(prefix)) continue;
			const claims = await authenticate(request, env);
			if (claims instanceof Response) return claims;
			const { matched, response } = await handler.handle(request, { prefix, context: { env, claims } });
			if (matched) return response;
		}

		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;

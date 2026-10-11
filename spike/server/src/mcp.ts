import { McpServer } from '@modelcontextprotocol/server';
import { ORPCError, createRouterClient, traverseContractProcedures } from '@orpc/server';
import type { z } from 'zod';
import { contract, type ExposeMeta } from './contract.ts';
import { router, type Context } from './router.ts';

interface ToolSpec {
	name: string;
	path: readonly string[];
	description: string;
	inputSchema: z.ZodObject;
	readOnly: boolean;
}

// The contract is static: collect the exposed procedures once per isolate.
const tools: ToolSpec[] = [];
traverseContractProcedures({ router: contract, path: [] }, ({ contract: procedure, path }) => {
	const def = procedure['~orpc'];
	const meta = def.meta as ExposeMeta;
	if (!meta.mcp) return;
	tools.push({
		name: path.join('_'),
		path,
		description: def.route.summary ?? path.join('.'),
		inputSchema: def.inputSchema as z.ZodObject,
		readOnly: meta.mcp.readOnly,
	});
});

/** A fresh MCP server per request, with one tool per exposed operation of the contract. */
export function buildMcpServer(context: Context): McpServer {
	const server = new McpServer({ name: 'cosa-si-mangia-spike', version: '0.0.0' });
	const client = createRouterClient(router, { context });
	for (const tool of tools) {
		const call = tool.path.reduce<any>((node, key) => node[key], client) as (input: unknown) => Promise<unknown>;
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: tool.inputSchema,
				annotations: { readOnlyHint: tool.readOnly },
			},
			async (input: unknown) => {
				try {
					const result = await call(input);
					return { content: [{ type: 'text', text: JSON.stringify(result) }] };
				} catch (error) {
					// Same error codes as the web app, so the agent can show the same messages.
					const body = error instanceof ORPCError ? error.toJSON() : { code: 'INTERNAL_SERVER_ERROR' };
					return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
				}
			},
		);
	}
	return server;
}

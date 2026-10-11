import type { OperationMeta } from '@app/contract';
import { fromJsonSchema, McpServer, type JsonSchemaType, type JsonSchemaValidator, type jsonSchemaValidator } from '@modelcontextprotocol/server';
import type { AnyContractRouter } from '@orpc/contract';
import { createRouterClient, traverseContractProcedures, type AnyRouter } from '@orpc/server';
import { z } from 'zod';
import { mapErrors, toolErrorBody } from './errors.ts';
import type { RequestContext } from './pipeline.ts';

export interface ToolSpec {
	name: string;
	path: readonly string[];
	description: string;
	/** JSON Schema of the contract input, shown to agents. */
	inputSchema: JsonSchemaType;
	readOnly: boolean;
}

/**
 * The SDK would validate arguments itself and answer with its own English text. It
 * accepts them as they are here; oRPC validates with the contract's zod schema, so
 * agents get the same `invalid` error as the web, with field paths and a localised text.
 */
const acceptAsIs: jsonSchemaValidator = {
	getValidator<T>(): JsonSchemaValidator<T> {
		return (input) => ({ valid: true, data: input as T, errorMessage: undefined });
	},
};

/** One tool per operation exposed to MCP; computed once per isolate. */
export function collectTools(contract: AnyContractRouter): ToolSpec[] {
	const tools: ToolSpec[] = [];
	traverseContractProcedures({ router: contract, path: [] }, ({ contract: procedure, path }) => {
		const def = procedure['~orpc'];
		const meta = def.meta as OperationMeta;
		if (!meta.mcp) return;
		tools.push({
			name: path.join('_'),
			path,
			description: def.route.summary ?? path.join('.'),
			inputSchema: z.toJSONSchema(def.inputSchema as z.ZodType, { io: 'input' }) as JsonSchemaType,
			readOnly: meta.mcp.readOnly,
		});
	});
	return tools;
}

/** A fresh MCP server per request; calls go through the router with the web's context. */
export function buildMcpServer(router: AnyRouter, tools: ToolSpec[], context: RequestContext): McpServer {
	const server = new McpServer({ name: 'cosa-si-mangia', version: '0.1.0' });
	const client = createRouterClient(router, { context, interceptors: [mapErrors] });
	for (const tool of tools) {
		const call = tool.path.reduce<any>((node, key) => node[key], client) as (input: unknown) => Promise<unknown>;
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: fromJsonSchema(tool.inputSchema, acceptAsIs),
				annotations: { readOnlyHint: tool.readOnly },
			},
			async (input: unknown) => {
				try {
					const result = await call(input);
					return { content: [{ type: 'text', text: JSON.stringify(result) }] };
				} catch (error) {
					// Same codes as the web app, plus the text in the user's language.
					const body = toolErrorBody(error, context.state.locale ?? 'it-IT', { requestId: context.requestId, path: tool.path });
					return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
				}
			},
		);
	}
	return server;
}

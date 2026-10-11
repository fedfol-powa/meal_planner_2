import { oc } from '@orpc/contract';
import { z } from 'zod';

/** How an operation is exposed beyond the web app. MCP tools are generated from this. */
export interface ExposeMeta {
	mcp?: { readOnly: boolean };
}

const op = oc.$meta<ExposeMeta>({});

export const recipeSummary = z.object({
	id: z.uuid(),
	title: z.string(),
});

export const contract = {
	recipes: {
		list: op
			.meta({ mcp: { readOnly: true } })
			.route({ method: 'GET', path: '/recipes', summary: 'List the recipes visible to the caller' })
			.input(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }))
			.output(z.array(recipeSummary)),
	},
	session: {
		whoami: op
			.meta({ mcp: { readOnly: true } })
			.route({ method: 'GET', path: '/whoami', summary: 'Identify the caller and the channel' })
			.input(z.object({}))
			.output(z.object({ userId: z.uuid(), channel: z.enum(['web', 'mcp']), clientId: z.string().nullable() })),
	},
};

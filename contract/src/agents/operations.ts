import { z } from 'zod';
import { op } from '../op.ts';

export const connectedAgentSchema = z.object({
	/** OAuth client id assigned by Supabase (`auth.oauth_clients.id`). */
	clientId: z.uuid(),
	/** Name the client registered with; not verified, may be empty. */
	name: z.string(),
	/** When the person first allowed this client. */
	connectedAt: z.iso.datetime({ offset: true }),
	/**
	 * Last token issue or renewal of any live session of the client; null without sessions.
	 * Not the last use: a client may renew without calling the app, or call it without renewing.
	 */
	lastRenewedAt: z.iso.datetime({ offset: true }).nullable(),
	/** The caller is this client (MCP channel with the same `client_id`). */
	current: z.boolean(),
});
export type ConnectedAgent = z.infer<typeof connectedAgentSchema>;

export const agentsContract = {
	list: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
		.route({
			method: 'GET',
			path: '/agents',
			summary:
				'Agents (MCP clients) you have connected to your account, with the last renewal of their access (not their last use), most recently renewed first',
		})
		.input(z.object({}))
		.output(z.array(connectedAgentSchema)),
	disconnect: op({ mcp: { readOnly: false }, offline: false, role: 'user' })
		.route({
			method: 'POST',
			path: '/agents/disconnect',
			summary:
				'Disconnect an agent: revokes its authorisation and ends its sessions at once, including this agent if it is the caller. Access obtained otherwise (for example with a changed password) is not affected',
		})
		.input(z.object({ clientId: z.uuid() }))
		.output(z.object({ clientId: z.uuid() })),
};

import type { ConnectedAgent } from '@app/contract';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { revokeGrant } from './grants.ts';

interface AgentRow {
	client_id: string;
	name: string;
	connected_at: Date;
	last_renewed_at: Date | null;
}

/** Most recently renewed first, agents without sessions last, then the newest connection. */
function byLastRenewal(a: ConnectedAgent, b: ConnectedAgent): number {
	if (a.lastRenewedAt !== b.lastRenewedAt) {
		if (a.lastRenewedAt === null) return 1;
		if (b.lastRenewedAt === null) return -1;
		return a.lastRenewedAt < b.lastRenewedAt ? 1 : -1;
	}
	return a.connectedAt < b.connectedAt ? 1 : a.connectedAt > b.connectedAt ? -1 : 0;
}

export function agentsRouter(os: Implementer) {
	return {
		list: os.agents.list.handler(async ({ context }) => {
			const rows = await context.tx<AgentRow[]>`
				select client_id, name, connected_at, last_renewed_at from app.connected_agents()`;
			return rows
				.map((row) => ({
					clientId: row.client_id,
					name: row.name,
					connectedAt: row.connected_at.toISOString(),
					lastRenewedAt: row.last_renewed_at?.toISOString() ?? null,
					current: row.client_id === context.clientId,
				}))
				.sort(byLastRenewal);
		}),

		/** Supabase deletes the client's sessions; every next request of that agent is refused. */
		disconnect: os.agents.disconnect.handler(async ({ context, input }) => {
			if (!context.token) throw appError('unauthorized');
			await revokeGrant({
				supabaseUrl: context.env.SUPABASE_URL,
				publishableKey: context.env.SUPABASE_PUBLISHABLE_KEY,
				accessToken: context.token,
				clientId: input.clientId,
			});
			return { clientId: input.clientId };
		}),
	};
}

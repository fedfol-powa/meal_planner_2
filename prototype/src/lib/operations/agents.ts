import type { AgentClient, ConnectedAgent, DemoDatabase } from '#lib/domain/types.ts';
import { fail, ok, type OperationContext, type OpResult } from './context';

/** The own agents only, most recently used first. */
export function listConnectedAgents(db: DemoDatabase, ctx: OperationContext): OpResult<ConnectedAgent[]> {
	if (!db.users.some((u) => u.id === ctx.userId)) return fail('forbidden');
	return ok(db.connectedAgents.filter((a) => a.userId === ctx.userId).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)).map((a) => ({ ...a })));
}

/**
 * The consent given in the browser (simulated OAuth, round 6). Authorising the same client again
 * replaces the old access. The agent gets the user's own permissions, never more.
 */
export function authorizeAgent(db: DemoDatabase, ctx: OperationContext, client: AgentClient): OpResult<{ id: string }> {
	if (!db.users.some((u) => u.id === ctx.userId)) return fail('forbidden');
	if (ctx.offline) return fail('offline');
	db.connectedAgents = db.connectedAgents.filter((a) => !(a.userId === ctx.userId && a.client === client));
	const id = `agent-${Math.random().toString(36).slice(2, 8)}`;
	db.connectedAgents.push({ id, userId: ctx.userId, client, connectedAt: ctx.now, lastUsedAt: ctx.now });
	return ok({ id });
}

/** Revokes the access: the agent must ask for a new authorisation. */
export function disconnectAgent(db: DemoDatabase, ctx: OperationContext, agentId: string): OpResult<null> {
	if (!db.users.some((u) => u.id === ctx.userId)) return fail('forbidden');
	if (ctx.offline) return fail('offline');
	const agent = db.connectedAgents.find((a) => a.id === agentId && a.userId === ctx.userId);
	if (!agent) return fail('not_found');
	db.connectedAgents = db.connectedAgents.filter((a) => a !== agent);
	return ok(null);
}

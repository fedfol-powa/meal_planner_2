import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { deleteUserAccount, readDeletionPlan } from './delete.ts';

/** Deleting one's own account (spec W11, section 2). */
export function accountRouter(os: Implementer) {
	return {
		getDeletionPlan: os.account.getDeletionPlan.handler(async ({ context }) => {
			const plan = await readDeletionPlan(context.tx, context.userId);
			if (!plan) throw appError('not_found');
			const [{ n }] = await context.tx<{ n: number }[]>`select count(*)::int as n from app.connected_agents()`;
			return { ...plan, connectedAgents: n };
		}),
		delete: os.account.delete.handler(({ context, input }) =>
			deleteUserAccount(context, context.userId, input, '/profile/account/delete'),
		),
	};
}

import { shoppingContract } from '@app/contract';
import { call, ORPCError } from '@orpc/server';
import { mapErrors } from '../../src/errors.ts';
import type { RequestContext } from '../../src/pipeline.ts';
import { createImplementer } from '../../src/pipeline.ts';
import { mealRecipeVersionsAt } from '../../src/menu/versions.ts';
import { createShoppingRouter } from '../../src/shopping/router.ts';
import { shoppingPrepare } from '../../src/shopping/version.ts';
import { contextFor } from './context.ts';
import type { TestDatabase } from './db.ts';
import type { TestKeys } from './keys.ts';

export const shopping = createShoppingRouter(createImplementer(shoppingContract, { prepare: shoppingPrepare }), { mealRecipeVersions: mealRecipeVersionsAt });

export const callOptions = (context: RequestContext) => ({ context, interceptors: [mapErrors] });

/** getWeekList with its path, as the routers give it: the prepare hook is chosen by path. */
export const readList = (input: { familyId: string; weekStartsOn: string; knownVersion?: string }, options: ReturnType<typeof callOptions>) =>
	call(shopping.getWeekList, input, { ...options, path: ['shopping', 'getWeekList'] });

export async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

export function asUserFor(keys: TestKeys, db: TestDatabase) {
	return async (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}, clock?: () => Date) =>
		contextFor(keys, await keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra }), db.appServerUrl, clock);
}

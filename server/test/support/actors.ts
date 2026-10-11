import { contract, type Contract } from '@app/contract';
import { ORPCError } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { setupDatabase, type TestDatabase } from './db.ts';
import { createTestKeys, type TestKeys } from './keys.ts';
import { rpcClient, testEnv } from './requests.ts';

/** A signed-in person using the real app over RPC, like the web app. */
export interface Actor {
	userId: string;
	sessionId: string;
	token: string;
	client: ContractRouterClient<Contract>;
}

export interface Actors {
	db: TestDatabase;
	keys: TestKeys;
	app: ReturnType<typeof createApp>;
	env: Env;
	/** `agent`: the token carries a client_id, as for MCP. */
	user(options?: { locale?: 'it-IT' | 'en-GB'; agent?: boolean }): Promise<Actor>;
	close(): Promise<void>;
}

export async function setupActors(): Promise<Actors> {
	const db = await setupDatabase();
	const keys = await createTestKeys();
	const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	const env = testEnv(db.appServerUrl);
	return {
		db,
		keys,
		app,
		env,
		async user(options = {}) {
			const user = await db.createUser({ locale: options.locale });
			const token = await keys.sign({
				sub: user.userId,
				session_id: user.sessionId,
				email: `${user.userId}@test.local`,
				...(options.agent ? { client_id: 'test-agent' } : {}),
			});
			return { ...user, token, client: rpcClient<ContractRouterClient<Contract>>(app, env, token) };
		},
		close: () => db.close(),
	};
}

/** The contract error a call ends with; fails the test when it succeeds. */
export async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, any>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

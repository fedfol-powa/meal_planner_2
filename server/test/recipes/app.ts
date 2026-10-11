import { contract, type Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { createApp } from '../../src/app.ts';
import { router } from '../../src/router.ts';
import type { TestDatabase } from '../support/db.ts';
import { createTestKeys } from '../support/keys.ts';
import { rpcClient, testEnv } from '../support/requests.ts';

export interface TestMember {
	userId: string;
	sessionId: string;
	familyId: string;
	token: string;
	client: ContractRouterClient<Contract>;
}

/** The real app on the test database, with clients signed in as test users. */
export async function testApp(db: TestDatabase) {
	const keys = await createTestKeys();
	const app = createApp({ contract, router, keys: () => keys.keys, resourceName: 'test' });
	const env = testEnv(db.appServerUrl);
	async function clientFor(user: { userId: string; sessionId: string }) {
		const token = await keys.sign({ sub: user.userId, session_id: user.sessionId });
		return { token, client: rpcClient<ContractRouterClient<Contract>>(app, env, token) };
	}
	/** A user who is the only member (and admin) of a new family. */
	async function member(locale: 'it-IT' | 'en-GB' = 'it-IT'): Promise<TestMember> {
		const user = await db.createUser({ locale });
		const familyId = await db.createFamily([{ userId: user.userId, role: 'family_admin' }]);
		return { ...user, familyId, ...(await clientFor(user)) };
	}
	return { app, env, keys, clientFor, member };
}

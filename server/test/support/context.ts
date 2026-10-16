import { verifyAccessToken } from '../../src/auth.ts';
import type { Env } from '../../src/env.ts';
import type { RequestContext } from '../../src/pipeline.ts';
import { allowAll } from './requests.ts';
import { TEST_ISSUER, TEST_SUPABASE_URL, type TestKeys } from './keys.ts';

/** A connection string nobody listens on: any database access fails fast. */
export const UNREACHABLE_DB = 'postgres://nobody:secret@127.0.0.1:1/none';

export function contextFor(keys: TestKeys, token: string | undefined, connectionString = UNREACHABLE_DB, clock?: () => Date): RequestContext {
	const env = {
		HYPERDRIVE: { connectionString } as Hyperdrive,
		SUPABASE_URL: TEST_SUPABASE_URL,
		SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
		CF_VERSION_METADATA: { id: 'deploy-1', tag: '', timestamp: '' },
		ASSETS: {} as Fetcher,
		SUPABASE_SECRET_KEY: 'sb_secret_test',
		INVITE_READ_LIMIT: allowAll,
		INVITE_ACCEPT_LIMIT: allowAll,
		PHOTO_READ_LIMIT: allowAll,
	} satisfies Env as Env;
	return {
		env,
		requestId: crypto.randomUUID(),
		origin: 'https://app.test',
		token,
		verify: (t) => verifyAccessToken(t, { issuer: TEST_ISSUER, keys: keys.keys }),
		deployId: 'deploy-1',
		state: {},
		clientIp: '198.51.100.1',
		clock,
	};
}

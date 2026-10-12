// The test suites write to TEST_DATABASE_URL from their global setup (the app_server password) and the
// destructive ones empty it: only the local stack is allowed. Called at the top of every Vitest config
// that prepares the database, before the global setup and before any suite or client exists (review of
// PR #34, finding 2).
import { checkTarget } from '../import/load/target.ts';

export function assertLocalTestDatabase(env: Record<string, string | undefined>): void {
	const url = env.TEST_DATABASE_URL;
	if (!url) return; // the integration suites skip themselves (and fail in CI) as before
	try {
		checkTarget('TEST_DATABASE_URL', url, { role: 'postgres', target: 'local', ref: 'unused' });
	} catch (error) {
		throw new Error(`TEST_DATABASE_URL is not the local stack: ${error instanceof Error ? error.message : 'refused'}`);
	}
}

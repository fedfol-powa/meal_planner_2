import { defineConfig } from 'vitest/config';
import { assertLocalTestDatabase } from '../scripts/test-support/local-database.ts';

// Before the global setup and any suite: only the local stack (review of PR #34, finding 2).
assertLocalTestDatabase(process.env);

// The restore drill resets the local database: its own config, run last (CI) or on purpose.
export default defineConfig({
	test: {
		include: ['test/drill/**/*.test.ts'],
		globalSetup: ['test/global-setup.ts'],
		fileParallelism: false,
		testTimeout: 600_000,
		hookTimeout: 600_000,
	},
});

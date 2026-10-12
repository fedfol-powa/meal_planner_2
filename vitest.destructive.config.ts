import { defineConfig } from 'vitest/config';
import { assertLocalTestDatabase } from './scripts/test-support/local-database.ts';

// Before the global setup and any suite: only the local stack (review of PR #34, finding 2).
assertLocalTestDatabase(process.env);

// Service SQL that empties the database (detail spec, section 8): last in CI, after the restore drill.
// FRESH_DATABASE=1 runs only the phase 1 sequence, which drops schema app and the app roles: the very last step.
export default defineConfig({
	test: {
		include: process.env.FRESH_DATABASE ? ['scripts/destructive/fresh/*.test.ts'] : ['scripts/destructive/*.test.ts'],
		globalSetup: ['server/test/global-setup.ts'],
		fileParallelism: false,
		testTimeout: 120_000,
	},
});

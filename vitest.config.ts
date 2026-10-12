import { defineConfig } from 'vitest/config';
import { assertLocalTestDatabase } from './scripts/test-support/local-database.ts';

// Before the global setup and any suite: only the local stack (review of PR #34, finding 2).
assertLocalTestDatabase(process.env);

// Workspaces run their own tests; scripts/destructive runs last with vitest.destructive.config.ts.
export default defineConfig({
	test: {
		include: ['scripts/**/*.test.ts'],
		exclude: ['scripts/destructive/**', 'node_modules/**'],
		passWithNoTests: true,
		// Same database preparation as the server: app_server password, schema present.
		globalSetup: ['server/test/global-setup.ts'],
		// The load tests share the catalogue with the server suites: one file at a time.
		fileParallelism: false,
	},
});

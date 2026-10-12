import { defineConfig } from 'vitest/config';
import { assertLocalTestDatabase } from '../scripts/test-support/local-database.ts';

// Before the global setup and any suite: only the local stack (review of PR #34, finding 2).
assertLocalTestDatabase(process.env);

// Own config, otherwise Vitest picks up the root one (scripts/ only).
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		// The restore drill resets the database: vitest.drill.config.ts, run last.
		exclude: ['test/drill/**', 'node_modules/**'],
		// Prepares the test database once, before the files run in parallel.
		globalSetup: ['test/global-setup.ts'],
		// One file at a time: the files share the database, and a write in one (deleting a
		// user empties references in catalogue tables, which bumps the catalogue counter
		// by contract) would invalidate a version another file is comparing.
		fileParallelism: false,
	},
});

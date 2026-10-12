import { defineConfig } from 'vitest/config';

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

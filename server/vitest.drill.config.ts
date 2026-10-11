import { defineConfig } from 'vitest/config';

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

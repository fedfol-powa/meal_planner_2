import { defineConfig } from 'vitest/config';

// Own config, otherwise Vitest picks up the root one (scripts/ only).
export default defineConfig({
	test: { include: ['src/**/*.test.ts'] }
});

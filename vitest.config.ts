import { defineConfig } from 'vitest/config';

// Workspaces run their own tests; the prototype keeps its own Vitest setup in prototype/.
export default defineConfig({
	test: { include: ['scripts/**/*.test.ts'], passWithNoTests: true }
});

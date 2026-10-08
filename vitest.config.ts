import { defineConfig } from 'vitest/config';

// The prototype keeps its own Vitest setup in prototype/.
export default defineConfig({
	test: { include: ['domain/**/*.test.ts', 'scripts/**/*.test.ts'] }
});

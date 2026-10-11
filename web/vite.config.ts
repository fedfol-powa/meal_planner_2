import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// One value per build: cache names of the service worker and buster of the persisted query cache.
const buildVersion = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
  server: { port: 5174 },
  build: {
    rolldownOptions: {
      // The service worker is a second entry, emitted at the root as /sw.js.
      input: { main: 'index.html', sw: 'src/pwa/sw.ts' },
      output: { entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') }
    }
  },
  test: {
    environment: 'jsdom',
    // Node 26 has its own localStorage, undefined without a file, that hides jsdom's.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}']
  }
});

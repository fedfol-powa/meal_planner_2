import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { precacheList } from './src/pwa/precache.ts';

// One value per build: cache names of the service worker and buster of the persisted query cache.
const buildVersion = new Date().toISOString();
const fontsDir = fileURLToPath(new URL('./public/assets/fonts', import.meta.url));

/** Emits /precache.json: the shell the service worker installs as a whole (review, finding 7). */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const fonts = readdirSync(fontsDir);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(precacheList(Object.keys(bundle), fonts)) });
    }
  };
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
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

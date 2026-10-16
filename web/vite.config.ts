import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { assertSelfContained, injectPrecache, precacheList } from './src/pwa/precache.ts';

// One value per build: cache names, the version checked at install and the build of sw.js.
const buildVersion = new Date().toISOString();
const fontsDir = fileURLToPath(new URL('./public/assets/fonts', import.meta.url));

/**
 * The worker and the page carry their build (spec W8): sw.js gets the list of files it installs,
 * index.html its version, which the worker checks at install. No /precache.json any more.
 */
function pwaBuild(): Plugin {
  return {
    name: 'pwa-build',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-version', content: buildVersion }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      const worker = bundle['sw.js'];
      if (!worker || worker.type !== 'chunk') return this.error('sw.js is missing from the bundle');
      assertSelfContained(worker);
      worker.code = injectPrecache(worker.code, precacheList(Object.keys(bundle), readdirSync(fontsDir)));
    }
  };
}

export default defineConfig(({ mode }) => {
  // The Worker of W1 (`wrangler dev`, port 8787) answers /api in development and preview (second PR).
  const apiTarget = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_TARGET ?? 'http://localhost:8787';
  // The recipe photos are served by the Worker too (W12).
  const proxy = { '/api': { target: apiTarget, changeOrigin: true }, '/photos': { target: apiTarget, changeOrigin: true } };
  return {
    plugins: [react(), pwaBuild()],
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion),
      // «Collega un agente» shows `${origin}/mcp`: in production the Worker serves SPA and /mcp on one
      // origin; the Vite dev server forwards only /api, so the page shows the Worker's origin there.
      __SERVICE_ORIGIN__: JSON.stringify(mode === 'development' ? new URL(apiTarget).origin : null)
    },
    server: { port: 5174, proxy },
    preview: { proxy },
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
  };
});

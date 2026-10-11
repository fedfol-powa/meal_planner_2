export type Strategy = 'shell' | 'asset' | 'passthrough';

/** Routes answered by the Worker, never by the app shell (spec section 1, routes table). */
export const SERVER_PREFIXES = ['/api', '/mcp', '/internal', '/shopping-lists', '/.well-known', '/openapi.json', '/sw.js', '/precache.json'];
export const SHELL_URL = '/index.html';
export const PRECACHE_URL = '/precache.json';
const PREFIX = 'cosasimangia-';

export function strategyFor(request: { url: string; method: string; mode: string; origin: string }): Strategy {
  if (request.method !== 'GET') return 'passthrough';
  const url = new URL(request.url);
  if (url.origin !== request.origin) return 'passthrough';
  if (SERVER_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return 'passthrough';
  if (request.mode === 'navigate') return 'shell';
  if (url.pathname.startsWith('/assets/')) return 'asset';
  return 'passthrough';
}

export const cacheName = (version: string) => `${PREFIX}${version}`;

export const staleCaches = (names: string[], version: string) =>
  names.filter((name) => name.startsWith(PREFIX) && name !== cacheName(version));

export type Strategy = 'shell' | 'asset' | 'photo' | 'passthrough';

/** Routes answered by the Worker, never by the app shell (spec section 1, routes table). */
export const SERVER_PREFIXES = ['/api', '/mcp', '/internal', '/shopping-lists', '/.well-known', '/openapi.json', '/sw.js'];
export const SHELL_URL = '/index.html';
/** Written last in a version's cache: without it the cache is an interrupted attempt (spec W8). */
export const COMPLETE_URL = '/__precache-complete';
const PREFIX = 'cosasimangia-';
/**
 * The recipe photos seen (W12): the only copy of them, as the route answers `no-store`. Not tied to
 * a build: never precached, never rotated with the versions, emptied when the session closes.
 */
export const PHOTO_CACHE = `${PREFIX}photos-v1`;
export const PHOTO_CACHE_LIMIT = 300;

export function strategyFor(request: { url: string; method: string; mode: string; origin: string }): Strategy {
  if (request.method !== 'GET') return 'passthrough';
  const url = new URL(request.url);
  if (url.origin !== request.origin) return 'passthrough';
  if (SERVER_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return 'passthrough';
  // Files to download (the skill zip, W17): a download may come as a navigation; never cached, as each build may change them.
  if (url.pathname.startsWith('/downloads/')) return 'passthrough';
  // A photo opened as a page goes to the Worker, never to the shell.
  if (url.pathname.startsWith('/photos/')) return request.mode === 'navigate' ? 'passthrough' : 'photo';
  if (request.mode === 'navigate') return 'shell';
  if (url.pathname.startsWith('/assets/')) return 'asset';
  return 'passthrough';
}

export const cacheName = (version: string) => `${PREFIX}${version}`;

/** Caches kept besides the current one: pages still open (busy, or newer after a rollback) find their files there. */
const KEPT_OTHERS = 2;

/**
 * Every cache of ours but the current one and the two most recent others (names sort as build
 * dates). A simple limit, without tracking open pages: a page that skips more than two versions
 * may lose fonts or images not loaded yet, and gets them back at its reload (spec W8).
 */
export function staleCaches(names: string[], version: string): string[] {
  const current = cacheName(version);
  const others = names.filter((name) => name.startsWith(PREFIX) && name !== current && name !== PHOTO_CACHE).sort();
  return others.slice(0, Math.max(0, others.length - KEPT_OTHERS));
}

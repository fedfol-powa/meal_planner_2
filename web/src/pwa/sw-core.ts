import { cacheName, COMPLETE_URL, SHELL_URL, staleCaches, strategyFor } from './sw-rules';

export interface CacheLike {
  match(request: RequestInfo): Promise<Response | undefined>;
  put(request: RequestInfo, response: Response): Promise<void>;
}
export interface CachesLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
  match(request: RequestInfo): Promise<Response | undefined>;
}
export interface WorkerDeps {
  caches: CachesLike;
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  version: string;
  origin: string;
  /** The files of this build, put into sw.js by the build (spec W8). */
  precache: string[];
  /** The worker's own skipWaiting: a complete install takes over at once. */
  skipWaiting?: () => Promise<void>;
}

/**
 * Cloudflare's assets answer /index.html with a redirect to /: the followed redirect stays marked on
 * the response, and the browser refuses a redirected response for a navigation. Stored as a plain
 * response, whatever the host does (W6 test on the real stack).
 */
async function withoutRedirect(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

const VERSION_META = /<meta\s[^>]*name=["']app-version["'][^>]*>/i;

/** The version written by the build into index.html, or null. */
function versionOf(html: string): string | null {
  return VERSION_META.exec(html)?.[0].match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

/** One file of the build, checked: ok, and for the index the same version as this worker. */
async function download(url: string, deps: WorkerDeps): Promise<Response> {
  const response = await deps.fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
  if (url !== SHELL_URL) return withoutRedirect(response);
  const html = await response.text();
  if (versionOf(html) !== deps.version) throw new Error(`precache ${url}: another release`);
  // A new response: never marked as redirected, whatever the host did.
  return new Response(html, { status: 200, headers: response.headers });
}

/**
 * Only files of this build, all of them, or nothing (spec W8): a complete cache of this version
 * is reused untouched; one without the complete mark is an interrupted attempt and is rebuilt;
 * the cache is written only after every file is downloaded and checked, the mark last. A failed
 * attempt never touches a complete cache, and the previous worker stays.
 */
export async function install(deps: WorkerDeps): Promise<void> {
  const { caches, version } = deps;
  const name = cacheName(version);
  if ((await caches.keys()).includes(name)) {
    if (await (await caches.open(name)).match(COMPLETE_URL)) {
      await deps.skipWaiting?.();
      return;
    }
    await caches.delete(name);
  }
  const files = await Promise.all(deps.precache.map(async (url) => [url, await download(url, deps)] as const));
  try {
    const cache = await caches.open(name);
    for (const [url, response] of files) await cache.put(url, response);
    await cache.put(COMPLETE_URL, new Response(version));
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
  // Only a complete shell takes over; the pages open now get controllerchange.
  await deps.skipWaiting?.();
}

/** Runs only after a complete install: now the older versions can go. */
export async function activate({ caches, version }: WorkerDeps): Promise<void> {
  const names = await caches.keys();
  await Promise.all(staleCaches(names, version).map((name) => caches.delete(name)));
}

export interface MessagePortLike { postMessage(message: unknown): void }

/** The page asks the version of the worker in control, on the port of a MessageChannel (spec W8). */
export function handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): void {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'version') return;
  ports[0]?.postMessage({ type: 'version', version: deps.version });
}

export async function respond(info: { url: string; method: string; mode: string }, target: RequestInfo, deps: WorkerDeps): Promise<Response> {
  const { caches, fetch, version, origin } = deps;
  const cache = await caches.open(cacheName(version));
  const strategy = strategyFor({ ...info, origin });
  if (strategy === 'shell') {
    // The installed, complete shell of this version, never rewritten while in use: a new shell
    // serves only as a whole, after its own install (second review, C6).
    return (await cache.match(SHELL_URL)) ?? fetch(target);
  }
  if (strategy === 'asset') {
    const cached = (await cache.match(info.url)) ?? (await caches.match(info.url));
    if (cached) return cached;
    const response = await fetch(target);
    if (response.ok) await cache.put(info.url, response.clone());
    return response;
  }
  return fetch(target);
}

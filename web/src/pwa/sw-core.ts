import { cacheName, COMPLETE_URL, PHOTO_CACHE, PHOTO_CACHE_LIMIT, SHELL_URL, staleCaches, strategyFor } from './sw-rules';

export interface CacheLike {
  match(request: RequestInfo): Promise<Response | undefined>;
  put(request: RequestInfo, response: Response): Promise<void>;
  /** In insertion order, as Cache Storage gives them. */
  keys(): Promise<readonly Request[]>;
  delete(request: RequestInfo): Promise<boolean>;
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
  /**
   * Grows at every clearing of the photos (sign-out): a photo answer stores itself only if the
   * epoch it started in is still the current one (W12).
   */
  photoEpoch?: { value: number };
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

/**
 * The host answers a file it does not have with index.html and 200 (single-page-application
 * fallback): a file of another release, or one already gone, must never enter a cache (W8 review).
 */
function isFallbackPage(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').toLowerCase().startsWith('text/html');
}

/** One file of the build, checked: ok, not the fallback page, and for the index the same version as this worker. */
async function download(url: string, deps: WorkerDeps): Promise<Response> {
  const response = await deps.fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
  if (url !== SHELL_URL) {
    if (isFallbackPage(response)) throw new Error(`precache ${url}: index.html instead of the file`);
    return withoutRedirect(response);
  }
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

/**
 * Messages of the page, answered on the port of a MessageChannel: the version of the worker in
 * control (spec W8), and the clearing of the photos when the session closes (W12).
 */
export async function handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): Promise<void> {
  const type = typeof data === 'object' && data !== null ? (data as { type?: unknown }).type : undefined;
  if (type === 'version') ports[0]?.postMessage({ type: 'version', version: deps.version });
  if (type === 'clear-photos') {
    // First the epoch: an answer already on its way no longer stores itself.
    if (deps.photoEpoch) deps.photoEpoch.value++;
    await deps.caches.delete(PHOTO_CACHE);
    ports[0]?.postMessage({ type: 'photos-cleared' });
  }
}

const isImage = (response: Response) => response.status === 200 && (response.headers.get('content-type') ?? '').toLowerCase().startsWith('image/');

/**
 * Photos (W12): first the cache, then the network. The URL is immutable, so a copy never expires;
 * only 200 images are kept, at most PHOTO_CACHE_LIMIT, the oldest going first.
 */
async function respondPhoto(url: string, target: RequestInfo, deps: WorkerDeps): Promise<Response> {
  // Read before the first wait: a sign-out during the cache lookup must stop the store too.
  const epoch = deps.photoEpoch?.value;
  const cached = await (await deps.caches.open(PHOTO_CACHE)).match(url);
  if (cached) return cached;
  const response = await deps.fetch(target);
  if (!isImage(response)) return response;
  const cache = await deps.caches.open(PHOTO_CACHE);
  // A sign-out happened meanwhile: the photo goes to the page, not into the cache of the closed session.
  if (deps.photoEpoch?.value !== epoch) return response;
  await cache.put(url, response.clone());
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - PHOTO_CACHE_LIMIT)).map((key) => cache.delete(key)));
  return response;
}

export async function respond(info: { url: string; method: string; mode: string }, target: RequestInfo, deps: WorkerDeps): Promise<Response> {
  const { caches, fetch, version, origin } = deps;
  const strategy = strategyFor({ ...info, origin });
  if (strategy === 'photo') return respondPhoto(info.url, target, deps);
  const cache = await caches.open(cacheName(version));
  if (strategy === 'shell') {
    // The installed, complete shell of this version, never rewritten while in use: a new shell
    // serves only as a whole, after its own install (second review, C6).
    return (await cache.match(SHELL_URL)) ?? fetch(target);
  }
  if (strategy === 'asset') {
    const cached = (await cache.match(info.url)) ?? (await caches.match(info.url));
    if (cached) return cached;
    const response = await fetch(target);
    if (response.ok && !isFallbackPage(response)) await cache.put(info.url, response.clone());
    return response;
  }
  return fetch(target);
}

import { cacheName, PRECACHE_URL, SHELL_URL, staleCaches, strategyFor } from './sw-rules';

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

/** All or nothing: a missing file fails the install, the partial cache goes and the previous version stays. */
export async function install({ caches, fetch, version }: WorkerDeps): Promise<void> {
  const name = cacheName(version);
  try {
    const listing = await fetch(PRECACHE_URL, { cache: 'no-store' });
    if (!listing.ok) throw new Error(`precache list: ${listing.status}`);
    const urls = (await listing.json()) as string[];
    const responses = await Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
        return [url, await withoutRedirect(response)] as const;
      })
    );
    const cache = await caches.open(name);
    for (const [url, response] of responses) await cache.put(url, response);
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}

/** Runs only after a complete install: now the older versions can go. */
export async function activate({ caches, version }: WorkerDeps): Promise<void> {
  const names = await caches.keys();
  await Promise.all(staleCaches(names, version).map((name) => caches.delete(name)));
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

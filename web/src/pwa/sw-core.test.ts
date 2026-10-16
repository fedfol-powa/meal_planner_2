// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { activate, handleMessage, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';
import { COMPLETE_URL, PHOTO_CACHE } from './sw-rules';

const origin = 'https://app.example';
const url = (path: string) => `${origin}${path}`;

/** Like Cache Storage, a copy keeps the response's redirected flag (Node's clone() drops it). */
function copy(response: Response): Response {
  const result = response.clone();
  if (response.redirected) Object.defineProperty(result, 'redirected', { value: true });
  return result;
}

/** In-memory Cache Storage keyed by URL; `failPut` makes the write of that path fail. */
function memoryCaches(options: { failPut?: string } = {}): CachesLike & { names(): string[]; dump(name: string): Promise<Record<string, string>> } {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: RequestInfo) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const open = async (name: string): Promise<CacheLike> => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (request) => {
        const found = store.get(keyOf(request));
        return found && copy(found);
      },
      put: async (request, response) => {
        if (options.failPut && new URL(keyOf(request)).pathname === options.failPut) throw new Error('QuotaExceededError');
        // Like Cache Storage, a new entry goes last in the order of keys().
        store.delete(keyOf(request));
        store.set(keyOf(request), response);
      },
      keys: async () => [...store.keys()].map((key) => new Request(key)),
      delete: async (request) => store.delete(keyOf(request))
    };
  };
  return {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const store of stores.values()) {
        const found = store.get(keyOf(request));
        if (found) return copy(found);
      }
      return undefined;
    },
    names: () => [...stores.keys()],
    async dump(name) {
      const result: Record<string, string> = {};
      for (const [key, response] of stores.get(name) ?? []) result[new URL(key).pathname] = await copy(response).text();
      return result;
    }
  };
}

/** A deployed build on the network; `offline` and `failing` simulate trouble. */
function network(build: Record<string, string>) {
  const state = { offline: false, failing: new Set<string>() };
  const fetch = async (input: RequestInfo) => {
    const path = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
    if (state.offline) throw new TypeError('Failed to fetch');
    if (state.failing.has(path)) return new Response('error', { status: 500 });
    // Like W1's Worker: app routes fall back to index.html.
    const body = build[path] ?? (path.includes('.') ? undefined : build['/index.html']);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
  };
  return { fetch, state };
}

/** A page of a build: its version in the meta, as index.html is built (spec W8). */
const page = (version: string) => `<!doctype html><meta name="app-version" content="${version}"><title>index ${version}</title>`;
const build = (version: string, script: string) => ({ '/index.html': page(version), [script]: `script ${version}` });
const buildA = build('A', '/assets/a.js');
const buildB = build('B', '/assets/b.js');
const buildC = build('C', '/assets/c.js');
/** The list a build puts into its sw.js. */
const listOf = (b: Record<string, string>) => Object.keys(b);
const depsFor = (b: Record<string, string>, version: string, caches: ReturnType<typeof memoryCaches>, fetch = network(b).fetch, skipWaiting?: () => Promise<void>): WorkerDeps =>
  ({ caches, fetch, version, origin, precache: listOf(b), skipWaiting });
const navigate = (path: string) => ({ url: url(path), method: 'GET', mode: 'navigate' });
const asset = (path: string) => ({ url: url(path), method: 'GET', mode: 'cors' });
const text = async (response: Response) => response.text();

describe('service worker lifecycle', () => {
  it('opens offline after the first visit: shell and its assets are all installed', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps = depsFor(buildA, 'A', caches, net.fetch);
    await install(deps);
    await activate(deps);
    net.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toContain('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), deps))).toBe('script A');
  });
  it('updates A→B keeping A until B is complete, then opens offline on B', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA = depsFor(buildA, 'A', caches, netA.fetch);
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    const depsB = depsFor(buildB, 'B', caches, netB.fetch);
    await install(depsB);
    // B waits for the app to be reopened: A still serves with its own cache.
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B']);
    await activate(depsB);
    // A stays for the pages still open.
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B']);
    netB.state.offline = true;
    expect(await text(await respond(navigate('/recipes'), url('/recipes'), depsB))).toContain('index B');
    expect(await text(await respond(asset('/assets/b.js'), url('/assets/b.js'), depsB))).toBe('script B');
  });
  it('keeps A in service when the install of B is interrupted', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA = depsFor(buildA, 'A', caches, netA.fetch);
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    netB.state.failing.add('/assets/b.js');
    await expect(install(depsFor(buildB, 'B', caches, netB.fetch))).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-A']);
    netA.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), depsA))).toContain('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), depsA))).toBe('script A');
  });
  it('serves the installed shell online even after a new deploy', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps = depsFor(buildA, 'A', caches, net.fetch);
    await install(deps);
    await activate(deps);
    const deployB = network(buildB);
    const underA: WorkerDeps = { ...deps, fetch: deployB.fetch };
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toContain('index A');
  });
  it('keeps a whole shell when B is deployed, navigated online under A, and its install is interrupted (second review, C6)', async () => {
    const caches = memoryCaches();
    const depsA = depsFor(buildA, 'A', caches);
    await install(depsA);
    await activate(depsA);
    // Deploy B: the network now serves B, while worker A is still in control.
    const netB = network(buildB);
    const underA: WorkerDeps = { ...depsA, fetch: netB.fetch };
    await respond(navigate('/menu'), url('/menu'), underA);
    // B's install fails on one of its files and is rolled back.
    netB.state.failing.add('/assets/b.js');
    await expect(install(depsFor(buildB, 'B', caches, netB.fetch))).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-A']);
    // Reopening offline: A's shell with all of its files.
    netB.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toContain('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), underA))).toBe('script A');
  });
  it('serves the shell as a plain response when the host redirects /index.html to / (real-stack test)', async () => {
    // Cloudflare's assets answer /index.html with 307 to /; fetch follows it and marks the response
    // as redirected, which the browser refuses for a navigation (net::ERR_FAILED on every reopening).
    const caches = memoryCaches();
    const net = network(buildA);
    const fetch = async (input: RequestInfo) => {
      const response = await net.fetch(input);
      if (new URL(typeof input === 'string' ? input : input.url, origin).pathname !== '/index.html') return response;
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    };
    const deps = depsFor(buildA, 'A', caches, fetch);
    await install(deps);
    await activate(deps);
    net.state.offline = true;
    const shell = await respond(navigate('/menu'), url('/menu'), deps);
    expect(shell.redirected).toBe(false);
    expect(await text(shell)).toContain('index A');
  });
  it('falls back to the network when the shell is missing from the cache', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps = depsFor(buildA, 'A', caches, net.fetch);
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toContain('index A');
  });
});

async function installed(b: Record<string, string>, version: string, caches = memoryCaches(), skipWaiting?: () => Promise<void>) {
  const deps = depsFor(b, version, caches, network(b).fetch, skipWaiting);
  await install(deps);
  await activate(deps);
  return { caches, deps };
}

describe('install bound to the build', () => {
  it('takes over only after a complete, checked install, and marks the cache complete last', async () => {
    const caches = memoryCaches();
    const skipWaiting = vi.fn(async () => {});
    await install(depsFor(buildB, 'B', caches, network(buildB).fetch, skipWaiting));
    expect(skipWaiting).toHaveBeenCalledTimes(1);
    const content = await caches.dump('cosasimangia-B');
    expect(Object.keys(content).at(-1)).toBe(COMPLETE_URL);
  });
  it('release changed between sw.js and HTML: install fails, no cache, no takeover', async () => {
    const caches = memoryCaches();
    const skipWaiting = vi.fn(async () => {});
    // Worker B, but the server already serves C's index.
    const mixed = network({ ...buildB, '/index.html': page('C') });
    await expect(install(depsFor(buildB, 'B', caches, mixed.fetch, skipWaiting))).rejects.toThrow(/another release/);
    expect(caches.names()).toEqual([]);
    expect(skipWaiting).not.toHaveBeenCalled();
  });
  it('release changed between HTML and assets: install fails, no cache', async () => {
    const caches = memoryCaches();
    // Index B still served, but B's bundle is gone from the server (C deployed meanwhile).
    const mixed = network({ '/index.html': page('B'), '/assets/c.js': 'script C' });
    await expect(install(depsFor(buildB, 'B', caches, mixed.fetch))).rejects.toThrow();
    expect(caches.names()).toEqual([]);
  });
  it('release changed between HTML and assets on a host that answers missing files with index.html: install fails', async () => {
    const caches = memoryCaches();
    const skipWaiting = vi.fn(async () => {});
    // Like production (assets with single-page-application fallback): B's bundle is gone, the
    // host answers 200 with C's index.html.
    const fetch = async (input: RequestInfo) => {
      const path = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
      if (path === '/index.html') return new Response(page('B'), { headers: { 'content-type': 'text/html' } });
      return new Response(page('C'), { headers: { 'content-type': 'text/html' } });
    };
    await expect(install(depsFor(buildB, 'B', caches, fetch, skipWaiting))).rejects.toThrow(/index\.html instead/);
    expect(caches.names()).toEqual([]);
    expect(skipWaiting).not.toHaveBeenCalled();
  });
  it('never caches index.html served for a missing asset at runtime', async () => {
    const { caches, deps } = await installed(buildB, 'B');
    const fallback = async () => new Response(page('C'), { headers: { 'content-type': 'text/html' } });
    const before = await caches.dump('cosasimangia-B');
    await respond(asset('/assets/img-x.png'), url('/assets/img-x.png'), { ...deps, fetch: fallback });
    expect(await caches.dump('cosasimangia-B')).toEqual(before);
  });
  it('reuses a complete cache of the same version without the network and without writing', async () => {
    const { caches } = await installed(buildB, 'B');
    const before = await caches.dump('cosasimangia-B');
    const fetch = vi.fn(network(buildC).fetch);
    const skipWaiting = vi.fn(async () => {});
    await install(depsFor(buildB, 'B', caches, fetch, skipWaiting));
    expect(fetch).not.toHaveBeenCalled();
    expect(await caches.dump('cosasimangia-B')).toEqual(before);
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
  it('a write failing leaves the complete caches identical and no partial cache', async () => {
    const failing = memoryCaches({ failPut: '/assets/c.js' });
    const { caches } = await installed(buildB, 'B', failing);
    const before = await caches.dump('cosasimangia-B');
    await expect(install(depsFor(buildC, 'C', caches))).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-B']);
    expect(await caches.dump('cosasimangia-B')).toEqual(before);
  });
  it('rebuilds a cache left without the complete mark by an interrupted attempt', async () => {
    const caches = memoryCaches();
    const partial = await caches.open('cosasimangia-B');
    await partial.put('/index.html', new Response(page('B')));
    await install(depsFor(buildB, 'B', caches));
    const content = await caches.dump('cosasimangia-B');
    expect(Object.keys(content).sort()).toEqual(['/assets/b.js', '/index.html', COMPLETE_URL].sort());
  });
  it('answers its version on the port, and nothing without a port or to malformed messages', () => {
    const deps = depsFor(buildB, 'B', memoryCaches());
    const port = { postMessage: vi.fn() };
    handleMessage({ type: 'version' }, [port], deps);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'version', version: 'B' });
    port.postMessage.mockClear();
    handleMessage({ type: 'version' }, [], deps);
    handleMessage('version', [port], deps);
    handleMessage(null, [port], deps);
    handleMessage({ type: 'other' }, [port], deps);
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it('first release of the fix: A₀ cache without mark, B installs and takes over, A₀ stays', async () => {
    const caches = memoryCaches();
    // Today's production worker wrote its cache without the complete mark.
    const a0 = await caches.open('cosasimangia-A0');
    await a0.put('/index.html', new Response('index A0'));
    await a0.put('/assets/a0.js', new Response('script A0'));
    const skipWaiting = vi.fn(async () => {});
    const { deps: depsB } = await installed(buildB, 'B', caches, skipWaiting);
    expect(skipWaiting).toHaveBeenCalled();
    expect(caches.names().sort()).toEqual(['cosasimangia-A0', 'cosasimangia-B']);
    const offline = network(buildB);
    offline.state.offline = true;
    const underB = { ...depsB, fetch: offline.fetch };
    expect(await text(await respond(navigate('/menu'), url('/menu'), underB))).toContain('index B');
    // The A₀ page still open finds its bundle.
    expect(await text(await respond(asset('/assets/a0.js'), url('/assets/a0.js'), underB))).toBe('script A0');
  });
  it('a busy page of A that skips B still finds its assets under C', async () => {
    const { caches } = await installed(buildA, 'A');
    await installed(buildB, 'B', caches);
    const { deps: depsC } = await installed(buildC, 'C', caches);
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B', 'cosasimangia-C']);
    const offline = network(buildC);
    offline.state.offline = true;
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), { ...depsC, fetch: offline.fetch }))).toBe('script A');
  });
  it('rollback C → B reuses the complete B cache and keeps C', async () => {
    const { caches } = await installed(buildA, 'A');
    await installed(buildB, 'B', caches);
    await installed(buildC, 'C', caches);
    const before = await caches.dump('cosasimangia-B');
    // The server is back to B, then goes offline: B is reused, not downloaded again.
    const { deps: depsB } = await installed(buildB, 'B', caches);
    expect(await caches.dump('cosasimangia-B')).toEqual(before);
    expect(caches.names()).toContain('cosasimangia-C');
    const offline = network(buildB);
    offline.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...depsB, fetch: offline.fetch }))).toContain('index B');
    expect(await text(await respond(asset('/assets/c.js'), url('/assets/c.js'), { ...depsB, fetch: offline.fetch }))).toBe('script C');
  });
});

describe('referrer of the invitation page', () => {
  it('the shell served by the active worker keeps no-referrer for /invite/app (spec W9)', async () => {
    // The response of the worker carries no header of _headers: the policy lives in the page.
    // index.html as the build ships it: the version meta added (spec W8).
    const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').replace('<head>', `<head>${page('A')}`);
    const live = { '/index.html': shell, '/assets/a.js': 'script' };
    const caches = memoryCaches();
    const deps = depsFor(live, 'A', caches);
    await install(deps);
    await activate(deps);
    const response = await respond(navigate('/invite/app'), url('/invite/app'), deps);
    const policy = response.headers.get('Referrer-Policy') ?? /<meta name="referrer" content="([^"]+)"/.exec(await response.text())?.[1];
    expect(policy).toBe('no-referrer');
  });
});

describe('photos seen stay offline (W12)', () => {
  const photo = (key: string) => ({ url: url(`/photos/${key}.webp`), method: 'GET', mode: 'no-cors' });
  const key = (n: number) => String(n).padStart(22, 'A');
  /** The photo route: an image for known keys, 404 otherwise; `held` keeps the answers until released. */
  function photoNetwork(known = new Set<string>()) {
    const state = { offline: false, calls: 0, held: null as null | Promise<void> };
    const fetch = async (input: RequestInfo) => {
      state.calls++;
      if (state.held) await state.held;
      if (state.offline) throw new TypeError('Failed to fetch');
      const path = new URL(typeof input === 'string' ? input : input.url, origin).pathname;
      const name = path.slice('/photos/'.length, -'.webp'.length);
      return known.has(name) || known.size === 0
        ? new Response(`image ${name}`, { headers: { 'content-type': 'image/webp', 'cache-control': 'private, no-store' } })
        : new Response('{"code":"not_found"}', { status: 404, headers: { 'content-type': 'application/json' } });
    };
    return { fetch, state };
  }
  const photoDeps = (caches: ReturnType<typeof memoryCaches>, fetch: WorkerDeps['fetch'], photoEpoch = { value: 0 }): WorkerDeps =>
    ({ caches, fetch, version: 'A', origin, precache: [], photoEpoch });
  /** Keeps the first `open` or the first `match` of the cache waiting until released. */
  function holding(caches: ReturnType<typeof memoryCaches>, method: 'open' | 'match') {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let held = false;
    const hold = async () => {
      if (held) return;
      held = true;
      await gate;
    };
    const open = async (name: string): Promise<CacheLike> => {
      if (method === 'open') await hold();
      const cache = await caches.open(name);
      return method === 'match' ? { ...cache, match: async (request) => (await hold(), cache.match(request)) } : cache;
    };
    return { caches: { ...caches, open }, release };
  }

  it('first the cache, then the network: a photo seen opens offline', async () => {
    const caches = memoryCaches();
    const net = photoNetwork();
    const deps = photoDeps(caches, net.fetch);
    expect(await text(await respond(photo(key(1)), url(`/photos/${key(1)}.webp`), deps))).toBe(`image ${key(1)}`);
    expect(caches.names()).toContain(PHOTO_CACHE);
    net.state.offline = true;
    expect(await text(await respond(photo(key(1)), url(`/photos/${key(1)}.webp`), deps))).toBe(`image ${key(1)}`);
    expect(net.state.calls).toBe(1);
    // Never seen: the network error reaches the page, which shows the card without the photo.
    await expect(respond(photo(key(2)), url(`/photos/${key(2)}.webp`), deps)).rejects.toThrow();
  });

  it('stores only images that answered 200', async () => {
    const caches = memoryCaches();
    const net = photoNetwork(new Set([key(1)]));
    const deps = photoDeps(caches, net.fetch);
    expect((await respond(photo(key(9)), url(`/photos/${key(9)}.webp`), deps)).status).toBe(404);
    expect(await caches.dump(PHOTO_CACHE)).toEqual({});
    const html = async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } });
    await respond(photo(key(3)), url(`/photos/${key(3)}.webp`), photoDeps(caches, html));
    expect(await caches.dump(PHOTO_CACHE)).toEqual({});
  });

  it('keeps at most 300 photos, dropping the oldest', async () => {
    const caches = memoryCaches();
    const deps = photoDeps(caches, photoNetwork().fetch);
    for (let n = 0; n < 302; n++) await respond(photo(key(n)), url(`/photos/${key(n)}.webp`), deps);
    const kept = Object.keys(await caches.dump(PHOTO_CACHE));
    expect(kept).toHaveLength(300);
    expect(kept).not.toContain(`/photos/${key(0)}.webp`);
    expect(kept).not.toContain(`/photos/${key(1)}.webp`);
    expect(kept).toContain(`/photos/${key(301)}.webp`);
  });

  it('install and activate of a new version leave the photo cache alone', async () => {
    const { caches, deps } = await installed(buildA, 'A');
    await respond(photo(key(1)), url(`/photos/${key(1)}.webp`), { ...deps, fetch: photoNetwork().fetch });
    for (const [b, version] of [[buildB, 'B'], [buildC, 'C']] as const) {
      const next = depsFor(b, version, caches);
      await install(next);
      await activate(next);
    }
    expect(Object.keys(await caches.dump(PHOTO_CACHE))).toEqual([`/photos/${key(1)}.webp`]);
  });

  it('clear-photos empties the cache and answers on the port', async () => {
    const caches = memoryCaches();
    const deps = photoDeps(caches, photoNetwork().fetch);
    await respond(photo(key(1)), url(`/photos/${key(1)}.webp`), deps);
    const port = { postMessage: vi.fn() };
    await handleMessage({ type: 'clear-photos' }, [port], deps);
    expect(caches.names()).not.toContain(PHOTO_CACHE);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'photos-cleared' });
  });

  it('a response arriving during sign-out is not stored', async () => {
    const caches = memoryCaches();
    const net = photoNetwork();
    let release = () => {};
    net.state.held = new Promise<void>((resolve) => (release = resolve));
    const deps = photoDeps(caches, net.fetch);
    const pending = respond(photo(key(1)), url(`/photos/${key(1)}.webp`), deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleMessage({ type: 'clear-photos' }, [], deps);
    release();
    // The page still gets its photo, the closed session's cache stays empty.
    expect(await text(await pending)).toBe(`image ${key(1)}`);
    expect(await caches.dump(PHOTO_CACHE)).toEqual({});
  });

  it.each(['open', 'match'] as const)('a sign-out completed while the cache %s is pending stops the store', async (method) => {
    const base = memoryCaches();
    const { caches, release } = holding(base, method);
    const deps = photoDeps(caches, photoNetwork().fetch);
    const pending = respond(photo(key(1)), url(`/photos/${key(1)}.webp`), deps);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleMessage({ type: 'clear-photos' }, [], deps);
    release();
    expect(await text(await pending)).toBe(`image ${key(1)}`);
    expect(await base.dump(PHOTO_CACHE)).toEqual({});
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { activate, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';

const origin = 'https://app.example';
const url = (path: string) => `${origin}${path}`;

/** In-memory Cache Storage keyed by URL, enough for the worker's needs. */
function memoryCaches(): CachesLike & { names(): string[] } {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: RequestInfo) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const open = async (name: string): Promise<CacheLike> => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (request) => store.get(keyOf(request))?.clone(),
      put: async (request, response) => void store.set(keyOf(request), response)
    };
  };
  return {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const store of stores.values()) {
        const found = store.get(keyOf(request));
        if (found) return found.clone();
      }
      return undefined;
    },
    names: () => [...stores.keys()]
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

const buildA = { '/precache.json': JSON.stringify(['/index.html', '/assets/a.js']), '/index.html': 'index A', '/assets/a.js': 'script A' };
const buildB = { '/precache.json': JSON.stringify(['/index.html', '/assets/b.js']), '/index.html': 'index B', '/assets/b.js': 'script B' };
const navigate = (path: string) => ({ url: url(path), method: 'GET', mode: 'navigate' });
const asset = (path: string) => ({ url: url(path), method: 'GET', mode: 'cors' });
const text = async (response: Response) => response.text();

describe('service worker lifecycle', () => {
  it('opens offline after the first visit: shell and its assets are all installed', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps: WorkerDeps = { caches, fetch: net.fetch, version: 'A', origin };
    await install(deps);
    await activate(deps);
    net.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), deps))).toBe('script A');
  });
  it('updates A→B keeping A until B is complete, then opens offline on B', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA: WorkerDeps = { caches, fetch: netA.fetch, version: 'A', origin };
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    const depsB: WorkerDeps = { caches, fetch: netB.fetch, version: 'B', origin };
    await install(depsB);
    // B waits for the app to be reopened: A still serves with its own cache.
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B']);
    await activate(depsB);
    expect(caches.names()).toEqual(['cosasimangia-B']);
    netB.state.offline = true;
    expect(await text(await respond(navigate('/recipes'), url('/recipes'), depsB))).toBe('index B');
    expect(await text(await respond(asset('/assets/b.js'), url('/assets/b.js'), depsB))).toBe('script B');
  });
  it('keeps A in service when the install of B is interrupted', async () => {
    const caches = memoryCaches();
    const netA = network(buildA);
    const depsA: WorkerDeps = { caches, fetch: netA.fetch, version: 'A', origin };
    await install(depsA);
    await activate(depsA);
    const netB = network(buildB);
    netB.state.failing.add('/assets/b.js');
    await expect(install({ caches, fetch: netB.fetch, version: 'B', origin })).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-A']);
    netA.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), depsA))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), depsA))).toBe('script A');
  });
  it('serves the installed shell online even after a new deploy', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps: WorkerDeps = { caches, fetch: net.fetch, version: 'A', origin };
    await install(deps);
    await activate(deps);
    const deployB = network(buildB);
    const underA: WorkerDeps = { ...deps, fetch: deployB.fetch };
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toBe('index A');
  });
  it('keeps a whole shell when B is deployed, navigated online under A, and its install is interrupted (second review, C6)', async () => {
    const caches = memoryCaches();
    const depsA: WorkerDeps = { caches, fetch: network(buildA).fetch, version: 'A', origin };
    await install(depsA);
    await activate(depsA);
    // Deploy B: the network now serves B, while worker A is still in control.
    const netB = network(buildB);
    const underA: WorkerDeps = { ...depsA, fetch: netB.fetch };
    await respond(navigate('/menu'), url('/menu'), underA);
    // B's install fails on one of its files and is rolled back.
    netB.state.failing.add('/assets/b.js');
    await expect(install({ caches, fetch: netB.fetch, version: 'B', origin })).rejects.toThrow();
    expect(caches.names()).toEqual(['cosasimangia-A']);
    // Reopening offline: A's shell with all of its files.
    netB.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), underA))).toBe('script A');
  });
  it('falls back to the network when the shell is missing from the cache', async () => {
    const caches = memoryCaches();
    const net = network(buildA);
    const deps: WorkerDeps = { caches, fetch: net.fetch, version: 'A', origin };
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps))).toBe('index A');
  });
});

import { activate, handleMessage, install, respond, type MessagePortLike, type WorkerDeps } from './sw-core';
import { strategyFor } from './sw-rules';

// Built by Vite as a second entry (/sw.js). Minimal local types: the project compiles with the DOM library only.
interface ExtendableEventLike extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike { readonly request: Request; respondWith(response: Promise<Response>): void }
interface MessageEventLike extends Event { readonly data: unknown; readonly ports: readonly MessagePortLike[] }
interface WorkerScope {
  readonly location: Location;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
}

// Replaced at build time by the list of this build's files (vite.config.ts, injectPrecache).
const precache: string[] = ['__PRECACHE_LIST__'];

const worker = self as unknown as WorkerScope;
const deps: WorkerDeps = {
  caches,
  fetch: (input, init) => fetch(input, init),
  version: __BUILD_VERSION__,
  origin: worker.location.origin,
  precache,
  skipWaiting: () => worker.skipWaiting()
};

// A complete, checked install takes over at once; the pages reload themselves when free (update.ts).
worker.addEventListener('install', (event) => event.waitUntil(install(deps)));
worker.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
worker.addEventListener('message', (event) => handleMessage(event.data, event.ports, deps));
worker.addEventListener('fetch', (event) => {
  const info = { url: event.request.url, method: event.request.method, mode: event.request.mode };
  if (strategyFor({ ...info, origin: deps.origin }) === 'passthrough') return;
  event.respondWith(respond(info, event.request, deps));
});

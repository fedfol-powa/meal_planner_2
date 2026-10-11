import { activate, install, respond, type WorkerDeps } from './sw-core';
import { strategyFor } from './sw-rules';

// Built by Vite as a second entry (/sw.js). Minimal local types: the project compiles with the DOM library only.
interface ExtendableEventLike extends Event { waitUntil(promise: Promise<unknown>): void }
interface FetchEventLike extends ExtendableEventLike { readonly request: Request; respondWith(response: Promise<Response>): void }
interface WorkerScope {
  readonly location: Location;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

const worker = self as unknown as WorkerScope;
const deps: WorkerDeps = { caches, fetch: (input, init) => fetch(input, init), version: __BUILD_VERSION__, origin: worker.location.origin };

// No skipWaiting: a new version takes over when the app is reopened, with its cache already complete.
worker.addEventListener('install', (event) => event.waitUntil(install(deps)));
worker.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
worker.addEventListener('fetch', (event) => {
  const info = { url: event.request.url, method: event.request.method, mode: event.request.mode };
  if (strategyFor({ ...info, origin: deps.origin }) === 'passthrough') return;
  event.respondWith(respond(info, event.request, deps));
});

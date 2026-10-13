# Aggiornamento della PWA installata (W8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** con la rete, aprire o riportare in primo piano la PWA installata porta alla versione
pubblicata, senza perdere scritture, sessione o lista della spesa offline (issue #42).

**Architecture:** il service worker scritto a mano serve le navigazioni dalla rete con un
timeout di 3 secondi e ripiego sulla shell installata, prende il controllo con `skipWaiting`
dopo un precache completo e conserva la cache precedente. La pagina chiede al worker la sua
versione all'avvio, al ritorno in primo piano e a `controllerchange`, e si ricarica solo se il
worker è più nuovo e la pagina è libera. Una guardia in linea in `index.html` evita la pagina
bianca e il `buster` della copia persistita diventa una costante di forma.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4 (jsdom e Node), TanStack Query persist
client, Service Worker e Cache Storage API, agent-browser per la prova nel browser.

**Spec:** `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (leggila prima di
iniziare); specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`,
sezioni 1, 6, 15, 16.

## Global Constraints

- Nessuna libreria nuova: service worker scritto a mano, niente Workbox, niente Playwright.
- Codice, commenti e test in inglese; documenti e messaggi di commit in italiano.
- Testi per l'utente in italiano e inglese britannico (qui solo la guardia, che ha i testi in
  linea perché i cataloghi stanno nel bundle).
- Timeout delle navigazioni: **3000 ms**; segno `use-shell`: **10 s**; limite dei tentativi
  della guardia: **30 s**; timeout della domanda di versione: **1000 ms**.
- `CACHE_SCHEMA = '1'`; i `buster` in forma di data ISO valgono come `'1'`.
- Rotte del server mai intercettate (`SERVER_PREFIXES` invariato).
- Shell atomica: la risposta di rete di una navigazione non si scrive mai in cache.
- Non toccare il server, la specifica principale, `main` o altri worktree; nessun rilascio.
- Comandi dalla radice del worktree `.worktrees/pwa`: test web con
  `npm test -w web -- <file>`, tutto con `npm test`, tipi con `npm run typecheck`, build con
  `npm run build -w web`.

## Review Focus

1. **Tab nascosta durante `controllerchange`:** una scheda in background non deve
   ricaricarsi; lo farà al ritorno visibile. → test in Task 4.
2. **`registration.update()` che fallisce offline:** nessun errore non gestito, nessun
   ricaricamento. → test in Task 4.
3. **Navigazione di rete che risponde 200 ma poi il corpo non arriva entro il timeout:** il
   timeout copre tutta la risposta (anche `withoutRedirect`), quindi si serve la shell. → test
   in Task 2.
4. **Errore della guardia per un'immagine con hash sotto `/assets/`:** ignorato (solo script e
   fogli di stile). → test in Task 5.
5. **Pagina di login senza coda della spesa:** senza persona collegata la coda non conta come
   «occupata», altrimenti la pagina di login non si aggiornerebbe mai. → test in Task 7.

---

## File Structure

- `web/src/pwa/sw-rules.ts` (modifica): `staleCaches` tiene la precedente.
- `web/src/pwa/sw-core.ts` (modifica): navigazioni dalla rete con timeout, `use-shell`,
  messaggi, `skipWaiting`, stato del worker.
- `web/src/pwa/sw.ts` (modifica): collega `skipWaiting`, `message` e lo stato.
- `web/src/pwa/busy.ts` (nuovo): registro di «occupata» e controlli sul DOM, hook React.
- `web/src/pwa/update-rules.ts` (nuovo): `shouldReload`, regola pura.
- `web/src/pwa/update.ts` (nuovo, sostituisce `register.ts`): registrazione e ciclo
  dell'aggiornamento nella pagina.
- `web/src/pwa/shell-guard.ts` (nuovo): guardia contro la pagina bianca e testo da inserire.
- `web/vite.config.ts` (modifica): plugin che inserisce la guardia in `index.html`.
- `web/src/main.tsx` (modifica): importa da `update.ts`.
- `web/src/api/persister.ts` (modifica): `CACHE_SCHEMA`, `buster` delle copie di A₀.
- `web/src/session/SessionScope.tsx` (modifica): `CACHE_SCHEMA`, mutazioni in volo.
- `web/src/features/meals/UndoProvider.tsx` (modifica): «Annulla» come «occupata».
- `web/src/features/shopping/ShoppingQueueProvider.tsx` (modifica): coda come «occupata».

---

### Task 1: Build A₀ e cache precedente conservata

**Files:**
- Modify: `web/src/pwa/sw-rules.ts`
- Test: `web/src/pwa/sw-rules.test.ts`

**Interfaces:**
- Produces: `staleCaches(names: string[], version: string): string[]`, con la stessa firma ma
  senza la cache precedente nel risultato.

- [ ] **Step 1: Costruire A₀ prima di ogni modifica (serve al Task 8)**

Il branch parte da `origin/main` (`3e043f6`) e non ha ancora modifiche al codice.

```bash
git diff --quiet 3e043f6 -- web || echo "STOP: web differs from 3e043f6"
npm run build -w web
SCRATCH=/private/tmp/claude-501/w8-builds   # oppure la scratchpad della sessione
rm -rf "$SCRATCH/a0" && mkdir -p "$SCRATCH" && cp -R web/dist "$SCRATCH/a0"
ls "$SCRATCH/a0"   # index.html, sw.js, precache.json, assets/
```

- [ ] **Step 2: Test che fallisce**

In `web/src/pwa/sw-rules.test.ts` sostituire il test `names caches by build and finds the old ones` con:

```ts
  it('names caches by build and finds the old ones, keeping the previous version', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    const names = ['cosasimangia-2026-10-01T00:00:00.000Z', 'cosasimangia-2026-10-05T00:00:00.000Z', 'cosasimangia-2026-10-09T00:00:00.000Z', 'other'];
    // The current is the 9th: the 5th stays for the pages still open, the 1st goes.
    expect(staleCaches(names, '2026-10-09T00:00:00.000Z')).toEqual(['cosasimangia-2026-10-01T00:00:00.000Z']);
  });
  it('drops caches newer than the current one (after a rollback) and keeps a lone previous one', () => {
    const names = ['cosasimangia-2026-10-05T00:00:00.000Z', 'cosasimangia-2026-10-09T00:00:00.000Z', 'cosasimangia-2026-10-12T00:00:00.000Z'];
    expect(staleCaches(names, '2026-10-09T00:00:00.000Z')).toEqual(['cosasimangia-2026-10-12T00:00:00.000Z']);
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b'], 'b')).toEqual([]);
  });
```

- [ ] **Step 3: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/sw-rules.test.ts`
Expected: FAIL (oggi `staleCaches` restituisce anche la precedente).

- [ ] **Step 4: Implementazione**

In `web/src/pwa/sw-rules.ts` sostituire `staleCaches`:

```ts
/**
 * Every cache of ours but the current one and the previous one: a page of the previous version
 * still open under the new worker finds its fonts and images there. Names sort as ISO dates;
 * a cache newer than the current one (left by a rolled-back release) goes too.
 */
export function staleCaches(names: string[], version: string): string[] {
  const current = cacheName(version);
  const ours = names.filter((name) => name.startsWith(PREFIX) && name !== current);
  const previous = ours.filter((name) => name < current).sort().at(-1);
  return ours.filter((name) => name !== previous);
}
```

- [ ] **Step 5: Verificare**

Run: `npm test -w web -- src/pwa/sw-rules.test.ts src/pwa/sw-core.test.ts`
Expected: `sw-rules` PASS. In `sw-core.test.ts` il test `updates A→B keeping A until B is complete` fallisce su `expect(caches.names()).toEqual(['cosasimangia-B'])`: aggiornarlo a `expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B'])` con il commento `// A stays as the previous version for the pages still open.` e rilanciare: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pwa/sw-rules.ts web/src/pwa/sw-rules.test.ts web/src/pwa/sw-core.test.ts
git commit -m "PWA: il worker nuovo conserva la cache della versione precedente"
```

---

### Task 2: Service worker, navigazioni dalla rete, messaggi e presa di controllo

**Files:**
- Modify: `web/src/pwa/sw-core.ts`, `web/src/pwa/sw.ts`
- Test: `web/src/pwa/sw-core.test.ts`

**Interfaces:**
- Consumes: `staleCaches` (Task 1).
- Produces:
  - `WorkerDeps` con i campi facoltativi `navigationTimeoutMs?: number`,
    `skipWaiting?: () => Promise<void>`, `now?: () => number`;
  - `interface WorkerState { preferShellUntil: number }`, `createWorkerState(): WorkerState`;
  - `respond(info, target, deps, state?: WorkerState): Promise<Response>`;
  - `handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps, state: WorkerState): void`
    con `interface MessagePortLike { postMessage(message: unknown): void }`;
  - costanti `NAVIGATION_TIMEOUT_MS = 3000`, `USE_SHELL_WINDOW_MS = 10_000`;
  - messaggi: pagina → worker `{ type: 'version' }` (con porta) e `{ type: 'use-shell' }`;
    worker → pagina `{ type: 'version', version: string }`.

- [ ] **Step 1: Test che falliscono**

In `web/src/pwa/sw-core.test.ts`:

1. Aggiornare l'import:

```ts
import { activate, createWorkerState, handleMessage, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';
```

2. Sostituire il test `serves the installed shell online even after a new deploy` con:

```ts
  it('serves navigations from the network when it answers, without writing them in the cache', async () => {
    const caches = memoryCaches();
    const deps: WorkerDeps = { caches, fetch: network(buildA).fetch, version: 'A', origin };
    await install(deps);
    await activate(deps);
    const deployB = network(buildB);
    const underA: WorkerDeps = { ...deps, fetch: deployB.fetch };
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toBe('index B');
    // The installed shell is still A's, whole: B's index is not in the cache.
    deployB.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA))).toBe('index A');
  });
```

3. Aggiungere un `describe` nuovo in fondo al file:

```ts
/** A network that never answers until aborted, like a supermarket with one bar. */
function hangingNetwork() {
  const signals: AbortSignal[] = [];
  const fetch = (_input: RequestInfo, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      if (init?.signal) {
        signals.push(init.signal);
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }
    });
  return { fetch, signals };
}

async function installed(build: Record<string, string>, version: string, caches = memoryCaches()) {
  const deps: WorkerDeps = { caches, fetch: network(build).fetch, version, origin, navigationTimeoutMs: 20 };
  await install(deps);
  await activate(deps);
  return { caches, deps };
}

describe('navigations, messages and taking over', () => {
  it('falls back to the installed shell on a network error, a non-ok answer or no network', async () => {
    const { deps } = await installed(buildA, 'A');
    const failing = network(buildB);
    failing.state.failing.add('/menu');
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...deps, fetch: failing.fetch }))).toBe('index A');
    const offline = network(buildB);
    offline.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...deps, fetch: offline.fetch }))).toBe('index A');
  });
  it('serves the shell after the timeout and aborts the slow request', async () => {
    const { deps } = await installed(buildA, 'A');
    const slow = hangingNetwork();
    const started = Date.now();
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...deps, fetch: slow.fetch }))).toBe('index A');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(slow.signals[0]?.aborted).toBe(true);
  });
  it('serves the shell when the headers arrive but the body does not within the timeout', async () => {
    const { deps } = await installed(buildA, 'A');
    // A redirected answer whose body never ends: withoutRedirect would wait for it forever.
    const fetch = async () => {
      const body = new ReadableStream({ start() {} });
      const response = new Response(body);
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    };
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...deps, fetch }))).toBe('index A');
  });
  it('takes over only after a complete install', async () => {
    const caches = memoryCaches();
    const skipWaiting = vi.fn(async () => {});
    const broken = network(buildB);
    broken.state.failing.add('/assets/b.js');
    await expect(install({ caches, fetch: broken.fetch, version: 'B', origin, skipWaiting })).rejects.toThrow();
    expect(skipWaiting).not.toHaveBeenCalled();
    await install({ caches, fetch: network(buildB).fetch, version: 'B', origin, skipWaiting });
    expect(skipWaiting).toHaveBeenCalledTimes(1);
  });
  it('answers the version on the port, and nothing to malformed messages', () => {
    const deps: WorkerDeps = { caches: memoryCaches(), fetch: network(buildA).fetch, version: 'B', origin };
    const port = { postMessage: vi.fn() };
    handleMessage({ type: 'version' }, [port], deps, createWorkerState());
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'version', version: 'B' });
    port.postMessage.mockClear();
    handleMessage({ type: 'version' }, [], deps, createWorkerState());
    handleMessage('version', [port], deps, createWorkerState());
    handleMessage(null, [port], deps, createWorkerState());
    expect(port.postMessage).not.toHaveBeenCalled();
  });
  it('after use-shell serves the installed shell without the network, once and within 10 seconds', async () => {
    let now = 1_000_000;
    const { deps: base } = await installed(buildA, 'A');
    const net = network(buildB);
    const fetch = vi.fn(net.fetch);
    const deps: WorkerDeps = { ...base, fetch, now: () => now };
    const state = createWorkerState();
    handleMessage({ type: 'use-shell' }, [], deps, state);
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps, state))).toBe('index A');
    expect(fetch).not.toHaveBeenCalled();
    // Consumed: the next navigation asks the network again.
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps, state))).toBe('index B');
    handleMessage({ type: 'use-shell' }, [], deps, state);
    now += 10_001;
    expect(await text(await respond(navigate('/menu'), url('/menu'), deps, state))).toBe('index B');
  });
  it('recovers when B arrives from the network under A and its bundle does not (blank page case)', async () => {
    const { deps: depsA } = await installed(buildA, 'A');
    const netB = network(buildB);
    const state = createWorkerState();
    const underA: WorkerDeps = { ...depsA, fetch: netB.fetch };
    // The navigation brings B's index from the network...
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA, state))).toBe('index B');
    // ...then the network drops and B's bundle cannot be served: no cache has it.
    netB.state.offline = true;
    await expect(respond(asset('/assets/b.js'), url('/assets/b.js'), underA, state)).rejects.toThrow();
    // The guard asks for the shell and reloads: A's shell and A's bundle, all offline.
    handleMessage({ type: 'use-shell' }, [], underA, state);
    expect(await text(await respond(navigate('/menu'), url('/menu'), underA, state))).toBe('index A');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), underA, state))).toBe('script A');
  });
  it('lets a page of A still open under B find its assets in the previous cache', async () => {
    const { caches } = await installed(buildA, 'A');
    const { deps: depsB } = await installed(buildB, 'B', caches);
    const offline = network(buildB);
    offline.state.offline = true;
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), { ...depsB, fetch: offline.fetch }))).toBe('script A');
  });
  it('first release of the fix: A₀ cache-first installed, then B takes over and serves from the network', async () => {
    // A₀ is today's production worker: same install, so its cache looks the same.
    const { caches } = await installed(buildA, 'A0');
    const netB = network(buildB);
    const skipWaiting = vi.fn(async () => {});
    const depsB: WorkerDeps = { caches, fetch: netB.fetch, version: 'B', origin, skipWaiting, navigationTimeoutMs: 20 };
    await install(depsB);
    expect(skipWaiting).toHaveBeenCalled();
    await activate(depsB);
    expect(caches.names().sort()).toEqual(['cosasimangia-A0', 'cosasimangia-B']);
    expect(await text(await respond(navigate('/menu'), url('/menu'), depsB))).toBe('index B');
    netB.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), depsB))).toBe('index B');
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), depsB))).toBe('script A');
  });
});
```

Aggiungere `vi` all'import di vitest: `import { describe, expect, it, vi } from 'vitest';`.

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test -w web -- src/pwa/sw-core.test.ts`
Expected: FAIL (`createWorkerState`/`handleMessage` non esportati, navigazioni dalla cache).

- [ ] **Step 3: Implementazione in `sw-core.ts`**

Sostituire l'interfaccia `WorkerDeps` e aggiungere tipi e costanti:

```ts
export interface WorkerDeps {
  caches: CachesLike;
  fetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  version: string;
  origin: string;
  /** How long a navigation waits for the network before the installed shell (3 s in production). */
  navigationTimeoutMs?: number;
  /** The worker's own skipWaiting: a complete install takes over at once. */
  skipWaiting?: () => Promise<void>;
  now?: () => number;
}

/** What the worker keeps in memory between events; lost when the browser stops it. */
export interface WorkerState { preferShellUntil: number }
export const createWorkerState = (): WorkerState => ({ preferShellUntil: 0 });

export interface MessagePortLike { postMessage(message: unknown): void }

/**
 * index.html is a few kB served from the nearest Cloudflare node: 100–300 ms on 4G, under 2 s on a
 * poor but working network. Beyond 3 s the network is useless in practice and the installed shell
 * beats a blank page (spec W8, «Perché 3 secondi»).
 */
export const NAVIGATION_TIMEOUT_MS = 3000;
/** The shell guard reloads at once: its navigation comes well within this window. */
export const USE_SHELL_WINDOW_MS = 10_000;
```

In `install`, dopo il ciclo `for (const [url, response] of responses) await cache.put(url, response);` (dentro il `try`) aggiungere:

```ts
    // Only a complete shell takes over; the pages open now get controllerchange (spec W8).
    await deps.skipWaiting?.();
```

e cambiare la firma in `export async function install(deps: WorkerDeps): Promise<void> {` con `const { caches, fetch, version } = deps;` come prima riga.

Aggiungere, prima di `respond`:

```ts
/** The page's index from the network, whole within the timeout, or undefined; the request is aborted on timeout. */
async function fromNetwork(target: RequestInfo, deps: WorkerDeps): Promise<Response | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, deps.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS);
  });
  const network = deps
    .fetch(target, { signal: controller.signal })
    .then((response) => (response.ok ? withoutRedirect(response) : undefined))
    .catch(() => undefined);
  try {
    return await Promise.race([network, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Messages from the pages: the version on a port, and the shell guard's request (spec W8). */
export function handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps, state: WorkerState): void {
  if (!isRecord(data)) return;
  if (data.type === 'version') ports[0]?.postMessage({ type: 'version', version: deps.version });
  if (data.type === 'use-shell') state.preferShellUntil = (deps.now ?? Date.now)() + USE_SHELL_WINDOW_MS;
}
```

Sostituire `respond`:

```ts
export async function respond(
  info: { url: string; method: string; mode: string },
  target: RequestInfo,
  deps: WorkerDeps,
  state: WorkerState = createWorkerState()
): Promise<Response> {
  const { caches, fetch, version, origin } = deps;
  const cache = await caches.open(cacheName(version));
  const strategy = strategyFor({ ...info, origin });
  if (strategy === 'shell') {
    // The installed shell is complete and never rewritten while in use (second review, C6):
    // the network's index is served, never stored.
    if (state.preferShellUntil > (deps.now ?? Date.now)()) {
      state.preferShellUntil = 0;
      const shell = await cache.match(SHELL_URL);
      if (shell) return shell;
    }
    return (await fromNetwork(target, deps)) ?? (await cache.match(SHELL_URL)) ?? fetch(target);
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
```

- [ ] **Step 4: Collegare `sw.ts`**

Sostituire il contenuto di `web/src/pwa/sw.ts`:

```ts
import { activate, createWorkerState, handleMessage, install, respond, type MessagePortLike, type WorkerDeps } from './sw-core';
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

const worker = self as unknown as WorkerScope;
const deps: WorkerDeps = {
  caches,
  fetch: (input, init) => fetch(input, init),
  version: __BUILD_VERSION__,
  origin: worker.location.origin,
  skipWaiting: () => worker.skipWaiting()
};
const state = createWorkerState();

// skipWaiting after a complete install: the pages reload themselves when free (update.ts).
worker.addEventListener('install', (event) => event.waitUntil(install(deps)));
worker.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
worker.addEventListener('message', (event) => handleMessage(event.data, event.ports, deps, state));
worker.addEventListener('fetch', (event) => {
  const info = { url: event.request.url, method: event.request.method, mode: event.request.mode };
  if (strategyFor({ ...info, origin: deps.origin }) === 'passthrough') return;
  event.respondWith(respond(info, event.request, deps, state));
});
```

- [ ] **Step 5: Verificare**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS. Se il test `keeps a whole shell when B is deployed, navigated online under A` fallisce, verificare solo che la sua prima navigazione online ora riceva `index B` (non letto dal test) e che il resto passi invariato.

- [ ] **Step 6: Commit**

```bash
git add web/src/pwa/sw-core.ts web/src/pwa/sw-core.test.ts web/src/pwa/sw.ts
git commit -m "PWA: navigazioni dalla rete con ripiego sulla shell, skipWaiting e messaggi del worker"
```

---

### Task 3: Pagina occupata (`busy.ts`)

**Files:**
- Create: `web/src/pwa/busy.ts`
- Test: `web/src/pwa/busy.test.tsx`

**Interfaces:**
- Produces: `registerBusyCheck(check: () => boolean): () => void`,
  `isBusy(doc?: Document): boolean`, `registeredBusy(): boolean` (solo i controlli registrati,
  senza DOM), `useBusyCheck(check: () => boolean): void`, `resetBusyChecks(): void` (solo test).

- [ ] **Step 1: Test che fallisce**

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isBusy, registerBusyCheck, resetBusyChecks, useBusyCheck } from './busy';

afterEach(() => {
  resetBusyChecks();
  document.body.innerHTML = '';
});

describe('busy page', () => {
  it('is free with nothing registered and nothing open', () => {
    expect(isBusy()).toBe(false);
  });
  it('is busy while a registered check says so, and free once it is removed', () => {
    let writing = true;
    const remove = registerBusyCheck(() => writing);
    expect(isBusy()).toBe(true);
    writing = false;
    expect(isBusy()).toBe(false);
    writing = true;
    remove();
    expect(isBusy()).toBe(false);
  });
  it('counts a check that throws as busy', () => {
    registerBusyCheck(() => {
      throw new Error('boom');
    });
    expect(isBusy()).toBe(true);
  });
  it('is busy with an open sheet', () => {
    document.body.innerHTML = '<dialog open></dialog>';
    expect(isBusy()).toBe(true);
    document.body.innerHTML = '<dialog></dialog>';
    expect(isBusy()).toBe(false);
  });
  it('is busy with the focus in a text field, not on a button or checkbox', () => {
    document.body.innerHTML = '<input id="t" type="text"><textarea id="a"></textarea><input id="c" type="checkbox"><button id="b">x</button><div id="e" contenteditable="true"></div>';
    const focus = (id: string) => (document.getElementById(id) as HTMLElement).focus();
    focus('t');
    expect(isBusy()).toBe(true);
    focus('a');
    expect(isBusy()).toBe(true);
    focus('c');
    expect(isBusy()).toBe(false);
    focus('b');
    expect(isBusy()).toBe(false);
    focus('e');
    expect(isBusy()).toBe(true);
  });
  it('registers a hook check while mounted, reading its latest value', () => {
    function Probe({ busy }: { busy: boolean }) {
      useBusyCheck(() => busy);
      return null;
    }
    const view = render(<Probe busy={false} />);
    expect(isBusy()).toBe(false);
    view.rerender(<Probe busy />);
    expect(isBusy()).toBe(true);
    view.unmount();
    expect(isBusy()).toBe(false);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/busy.test.tsx`
Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implementazione**

```ts
import { useEffect, useRef } from 'react';

/**
 * Whether reloading now would interrupt something (spec W8, «Pagina occupata»): registered checks
 * for writes, «Annulla» and the shopping queue, plus open sheets and the focus in a text field.
 */
const checks = new Set<() => boolean>();

export function registerBusyCheck(check: () => boolean): () => void {
  const entry = () => check();
  checks.add(entry);
  return () => void checks.delete(entry);
}

/** Tests only. */
export function resetBusyChecks(): void {
  checks.clear();
}

const NOT_TEXT = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);

function isTextField(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !NOT_TEXT.has(element.type);
  return element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

/** The registered checks only, without the DOM: writes, «Annulla», shopping queue. */
export function registeredBusy(): boolean {
  for (const check of checks) {
    try {
      if (check()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function isBusy(doc: Document = document): boolean {
  if (doc.querySelector('dialog[open]')) return true;
  if (isTextField(doc.activeElement)) return true;
  return registeredBusy();
}

/** Registers `check` while the component is mounted; the latest render's check is the one asked. */
export function useBusyCheck(check: () => boolean): void {
  const latest = useRef(check);
  latest.current = check;
  useEffect(() => registerBusyCheck(() => latest.current()), []);
}
```

- [ ] **Step 4: Verificare**

Run: `npm test -w web -- src/pwa/busy.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pwa/busy.ts web/src/pwa/busy.test.tsx
git commit -m "PWA: registro della pagina occupata per l'aggiornamento"
```

---

### Task 4: Regole e ciclo dell'aggiornamento nella pagina

**Files:**
- Create: `web/src/pwa/update-rules.ts`, `web/src/pwa/update.ts`
- Delete: `web/src/pwa/register.ts`
- Modify: `web/src/main.tsx`
- Test: `web/src/pwa/update-rules.test.ts`, `web/src/pwa/update.test.ts`

**Interfaces:**
- Consumes: messaggio `{ type: 'version' }` con porta e risposta
  `{ type: 'version', version }` (Task 2); `isBusy()` (Task 3).
- Produces:
  - `type Trigger = 'start' | 'visible' | 'controllerchange'`;
  - `shouldReload(input: { pageVersion: string; workerVersion: string | null; busy: boolean; interacted: boolean; trigger: Trigger }): boolean`;
  - `startUpdates(env: UpdateEnv): Promise<void>` con
    `UpdateEnv = { container: ContainerLike; document: DocumentLike; reload: () => void; pageVersion: string; isBusy: () => boolean; askTimeoutMs?: number }`;
  - `registerServiceWorker(): void` (stesso nome di prima, ora in `update.ts`).

- [ ] **Step 1: Test delle regole**

`web/src/pwa/update-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { shouldReload, type Trigger } from './update-rules';

const base = { pageVersion: '2026-10-13T10:00:00.000Z', workerVersion: '2026-10-14T10:00:00.000Z', busy: false, interacted: false, trigger: 'visible' as Trigger };

describe('update rules', () => {
  it('reloads towards a newer worker when the page is free', () => {
    for (const trigger of ['start', 'visible', 'controllerchange'] as const) expect(shouldReload({ ...base, trigger })).toBe(true);
  });
  it('never reloads towards the same or an older worker (rollback), or without an answer', () => {
    expect(shouldReload({ ...base, workerVersion: base.pageVersion })).toBe(false);
    expect(shouldReload({ ...base, workerVersion: '2026-10-12T10:00:00.000Z' })).toBe(false);
    expect(shouldReload({ ...base, workerVersion: null })).toBe(false);
  });
  it('waits while the page is busy', () => {
    expect(shouldReload({ ...base, busy: true })).toBe(false);
  });
  it('after a touch, waits on controllerchange but not on the next return to the foreground', () => {
    expect(shouldReload({ ...base, interacted: true, trigger: 'controllerchange' })).toBe(false);
    expect(shouldReload({ ...base, interacted: true, trigger: 'visible' })).toBe(true);
  });
});
```

- [ ] **Step 2: Verificare che fallisca, poi implementare `update-rules.ts`**

Run: `npm test -w web -- src/pwa/update-rules.test.ts` → FAIL (modulo mancante).

```ts
export type Trigger = 'start' | 'visible' | 'controllerchange';

/**
 * Reload only towards a newer worker (build versions are ISO dates, compared as text): towards an
 * older one, after a rollback, a page served from the network under the old worker would loop.
 * Never while busy; on controllerchange only if nobody has touched the screen since the return.
 */
export function shouldReload(input: { pageVersion: string; workerVersion: string | null; busy: boolean; interacted: boolean; trigger: Trigger }): boolean {
  if (input.workerVersion === null || input.workerVersion <= input.pageVersion) return false;
  if (input.busy) return false;
  return input.trigger !== 'controllerchange' || !input.interacted;
}
```

Run di nuovo: PASS.

- [ ] **Step 3: Test del ciclo**

`web/src/pwa/update.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUpdates, type ContainerLike, type DocumentLike } from './update';

const PAGE = '2026-10-13T10:00:00.000Z';
const NEWER = '2026-10-14T10:00:00.000Z';
const OLDER = '2026-10-12T10:00:00.000Z';

/** A worker that answers its version on the port, or never when `silent`. */
function fakeWorker(version: string, silent = false) {
  return {
    postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
      if (!silent && (message as { type: string }).type === 'version') transfer[0]!.postMessage({ type: 'version', version });
    })
  };
}

function world(options: { worker?: ReturnType<typeof fakeWorker> | null; busy?: boolean; updateFails?: boolean } = {}) {
  const docTarget = new EventTarget();
  const containerTarget = new EventTarget();
  const doc = Object.assign(docTarget, { visibilityState: 'visible' as DocumentVisibilityState }) as EventTarget & DocumentLike;
  const update = vi.fn(async () => {
    if (options.updateFails) throw new TypeError('Failed to fetch');
  });
  const container = Object.assign(containerTarget, {
    controller: options.worker === undefined ? fakeWorker(PAGE) : options.worker,
    register: vi.fn(async () => ({ update }))
  }) as EventTarget & ContainerLike;
  const state = { busy: options.busy ?? false };
  const reload = vi.fn();
  const env = { container, document: doc, reload, pageVersion: PAGE, isBusy: () => state.busy, askTimeoutMs: 50 };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
  const show = async () => {
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
  };
  const hide = () => {
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const takeOver = async (version: string) => {
    container.controller = fakeWorker(version);
    container.dispatchEvent(new Event('controllerchange'));
    await settle();
  };
  return { env, container, doc, reload, update, state, show, hide, takeOver, settle };
}

afterEach(() => vi.restoreAllMocks());

describe('page updates', () => {
  it('registers the worker bypassing the HTTP cache and does not reload on the same version', async () => {
    const w = world();
    await startUpdates(w.env);
    await w.settle();
    expect(w.container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('back in the foreground: asks for updates, then reloads once a newer worker takes over', async () => {
    const w = world();
    await startUpdates(w.env);
    await w.show();
    expect(w.update).toHaveBeenCalled();
    await w.takeOver(NEWER);
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('reloads at once on return when the newer worker is already in control', async () => {
    const w = world({ worker: fakeWorker(NEWER) });
    w.state.busy = true;
    await startUpdates(w.env);
    expect(w.reload).not.toHaveBeenCalled();
    w.state.busy = false;
    await w.show();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a busy page waits, and reloads on the next return once free', async () => {
    const w = world({ busy: true });
    await startUpdates(w.env);
    await w.takeOver(NEWER);
    expect(w.reload).not.toHaveBeenCalled();
    w.state.busy = false;
    await w.show();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('after a touch, controllerchange waits for the next return to the foreground', async () => {
    const w = world();
    await startUpdates(w.env);
    await w.show();
    w.doc.dispatchEvent(new Event('pointerdown'));
    await w.takeOver(NEWER);
    expect(w.reload).not.toHaveBeenCalled();
    await w.show();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a hidden tab does not reload on controllerchange, only when it becomes visible', async () => {
    const w = world();
    await startUpdates(w.env);
    w.hide();
    await w.takeOver(NEWER);
    expect(w.reload).not.toHaveBeenCalled();
    await w.show();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('never reloads towards an older worker (rollback)', async () => {
    const w = world();
    await startUpdates(w.env);
    await w.takeOver(OLDER);
    await w.show();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('does nothing when the worker does not answer', async () => {
    const w = world({ worker: fakeWorker(NEWER, true) });
    await startUpdates(w.env);
    await w.show();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('offline: a failing update check throws nothing and reloads nothing', async () => {
    const w = world({ updateFails: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await startUpdates(w.env);
    await w.show();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(w.reload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/update.test.ts`
Expected: FAIL (modulo mancante).

- [ ] **Step 5: Implementare `update.ts`**

```ts
import { isBusy } from './busy';
import { shouldReload, type Trigger } from './update-rules';

interface WorkerLike { postMessage(message: unknown, transfer: MessagePort[]): void }
interface RegistrationLike { update(): Promise<unknown> }
export interface ContainerLike extends EventTarget {
  readonly controller: WorkerLike | null;
  register(url: string, options: { updateViaCache: 'none' }): Promise<RegistrationLike>;
}
export interface DocumentLike extends EventTarget { readonly visibilityState: DocumentVisibilityState }
export interface UpdateEnv {
  container: ContainerLike;
  document: DocumentLike;
  reload: () => void;
  pageVersion: string;
  isBusy: () => boolean;
  askTimeoutMs?: number;
}

/** The version of the worker in control, or null without an answer within the timeout. */
function askVersion(worker: WorkerLike, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => done(null), timeoutMs);
    function done(version: string | null) {
      clearTimeout(timer);
      channel.port1.close();
      resolve(version);
    }
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; version?: unknown } | null;
      done(data?.type === 'version' && typeof data.version === 'string' ? data.version : null);
    };
    try {
      worker.postMessage({ type: 'version' }, [channel.port2]);
    } catch {
      done(null);
    }
  });
}

/**
 * At start, at every return to the foreground and at every controllerchange the page asks the
 * worker in control for its version and reloads towards a newer one when free (spec W8). Back in
 * the foreground it also asks the browser to check /sw.js: a new version installs, takes over and
 * fires controllerchange.
 */
export async function startUpdates(env: UpdateEnv): Promise<void> {
  let interacted = false;
  let registration: RegistrationLike | undefined;
  const check = async (trigger: Trigger) => {
    if (trigger !== 'controllerchange') interacted = false;
    if (env.document.visibilityState !== 'visible') return;
    const controller = env.container.controller;
    const workerVersion = controller ? await askVersion(controller, env.askTimeoutMs ?? 1000) : null;
    if (shouldReload({ pageVersion: env.pageVersion, workerVersion, busy: env.isBusy(), interacted, trigger })) {
      env.reload();
      return;
    }
    if (trigger === 'visible') await registration?.update().catch(() => undefined);
  };
  const touched = () => {
    interacted = true;
  };
  env.document.addEventListener('pointerdown', touched, true);
  env.document.addEventListener('keydown', touched, true);
  env.document.addEventListener('visibilitychange', () => void check('visible'));
  env.container.addEventListener('controllerchange', () => void check('controllerchange'));
  registration = await env.container.register('/sw.js', { updateViaCache: 'none' });
  await check('start');
}

/** Production only, and only where the browser allows it (HTTPS or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const env: UpdateEnv = {
      container: navigator.serviceWorker as unknown as ContainerLike,
      document,
      reload: () => location.reload(),
      pageVersion: __BUILD_VERSION__,
      isBusy: () => isBusy()
    };
    void startUpdates(env).catch(() => undefined);
  });
}
```

Nota per il test «a hidden tab»: `hide()` cambia lo stato prima di `controllerchange`; il controllo in `check` esce subito. Al ritorno `visible` la versione nuova è già in controllo e la pagina si ricarica.

- [ ] **Step 6: Togliere `register.ts` e aggiornare `main.tsx`**

```bash
git rm web/src/pwa/register.ts
```

In `web/src/main.tsx` cambiare `import { registerServiceWorker } from './pwa/register';` in `import { registerServiceWorker } from './pwa/update';`.

- [ ] **Step 7: Verificare**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/pwa/update-rules.ts web/src/pwa/update-rules.test.ts web/src/pwa/update.ts web/src/pwa/update.test.ts web/src/main.tsx
git commit -m "PWA: la pagina passa alla versione nuova al ritorno in primo piano, quando è libera"
```

---

### Task 5: Guardia contro la pagina bianca

**Files:**
- Create: `web/src/pwa/shell-guard.ts`
- Modify: `web/vite.config.ts`
- Test: `web/src/pwa/shell-guard.test.ts`

**Interfaces:**
- Consumes: messaggio `{ type: 'use-shell' }` (Task 2).
- Produces: `installShellGuard(win: Window): void`, `shellGuardScript(): string`,
  costante `SHELL_GUARD_KEY = 'shell-guard-at'` (chiave di `sessionStorage`).

- [ ] **Step 1: Test che fallisce**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installShellGuard, SHELL_GUARD_KEY, shellGuardScript } from './shell-guard';

/** A window whose listeners we can drop after each test: the guard adds one per install. */
function guardedWindow(options: { controller?: boolean; language?: string } = {}) {
  const postMessage = vi.fn();
  const reload = vi.fn();
  const listeners: [string, EventListener, boolean][] = [];
  const win = {
    document,
    sessionStorage,
    // jsdom resolves element URLs against its own location: the guard must see the same origin.
    location: { href: window.location.href, origin: window.location.origin, reload },
    navigator: { language: options.language ?? 'it-IT', serviceWorker: options.controller === false ? undefined : { controller: { postMessage } } },
    addEventListener: (type: string, listener: EventListener, capture: boolean) => {
      listeners.push([type, listener, capture]);
      window.addEventListener(type, listener, capture);
    }
  } as unknown as Window;
  const dispose = () => listeners.forEach(([type, listener, capture]) => window.removeEventListener(type, listener, capture));
  return { win, postMessage, reload, dispose };
}

/** Fires a resource error like the browser: on the element, seen by window in the capture phase. */
function failLoading(tag: 'script' | 'link' | 'img', url: string) {
  const element = document.createElement(tag);
  if (tag === 'script') (element as HTMLScriptElement).src = url;
  if (tag === 'link') Object.assign(element as HTMLLinkElement, { rel: 'stylesheet', href: url });
  if (tag === 'img') (element as HTMLImageElement).src = url;
  document.head.append(element);
  element.dispatchEvent(new Event('error'));
}

let current: ReturnType<typeof guardedWindow> | undefined;
const install = (options?: Parameters<typeof guardedWindow>[0]) => {
  current = guardedWindow(options);
  installShellGuard(current.win);
  return current;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
  sessionStorage.clear();
});
afterEach(() => {
  current?.dispose();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('shell guard', () => {
  it('on a missing bundle asks the worker for the installed shell and reloads', () => {
    const g = install();
    failLoading('script', '/assets/index-b.js');
    expect(g.postMessage).toHaveBeenCalledWith({ type: 'use-shell' });
    expect(g.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SHELL_GUARD_KEY)).toBe(String(Date.now()));
  });
  it('a missing stylesheet counts too', () => {
    const g = install();
    failLoading('link', '/assets/index-b.css');
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
  it('within 30 seconds of a try it does not reload again and shows «Riprova»', () => {
    sessionStorage.setItem(SHELL_GUARD_KEY, String(Date.now() - 29_000));
    const g = install();
    failLoading('script', '/assets/index-b.js');
    expect(g.reload).not.toHaveBeenCalled();
    expect(g.postMessage).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Non riesco a caricare l'app");
    (document.body.querySelector('button') as HTMLButtonElement).click();
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
  it('after 30 seconds it tries again', () => {
    sessionStorage.setItem(SHELL_GUARD_KEY, String(Date.now() - 31_000));
    const g = install();
    failLoading('script', '/assets/index-b.js');
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
  it('without a worker it shows the message at once, in British English for English devices', () => {
    const g = install({ controller: false, language: 'en-GB' });
    failLoading('script', '/assets/index-b.js');
    expect(g.reload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("The app couldn't load");
    expect(document.body.querySelector('button')?.textContent).toBe('Try again');
  });
  it('ignores images, other origins and files outside /assets/, and acts once per page', () => {
    const g = install();
    failLoading('img', '/assets/photo-a1.jpg');
    failLoading('script', 'https://cdn.example/assets/x.js');
    failLoading('script', '/sw-helper.js');
    expect(g.reload).not.toHaveBeenCalled();
    failLoading('script', '/assets/index-b.js');
    failLoading('link', '/assets/index-b.css');
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
  it('the inlined text runs as a whole script', () => {
    const g = guardedWindow();
    current = g;
    new Function('window', shellGuardScript())(g.win);
    failLoading('script', '/assets/index-b.js');
    expect(g.reload).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/shell-guard.test.ts`
Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implementazione**

`web/src/pwa/shell-guard.ts`:

```ts
export const SHELL_GUARD_KEY = 'shell-guard-at';

/**
 * Inlined in index.html before the bundle (vite.config.ts): no imports and nothing from module
 * scope, because it runs from its source text. When the bundle or the styles of the page cannot
 * load (a new index from the network, then the network drops), it asks the worker for the
 * installed shell and reloads; at most once every 30 seconds, then a message with «Riprova»
 * (spec W8, «Guardia contro la pagina bianca»).
 */
export function installShellGuard(win: Window): void {
  const key = 'shell-guard-at';
  let handled = false;
  win.addEventListener(
    'error',
    (event) => {
      const element = event.target as (HTMLScriptElement & HTMLLinkElement) | null;
      if (handled || !element || !element.tagName) return;
      const isScript = element.tagName === 'SCRIPT';
      if (!isScript && !(element.tagName === 'LINK' && element.rel === 'stylesheet')) return;
      const url = new URL(isScript ? element.src : element.href, win.location.href);
      if (url.origin !== win.location.origin || url.pathname.indexOf('/assets/') !== 0) return;
      handled = true;
      const worker = win.navigator.serviceWorker && win.navigator.serviceWorker.controller;
      try {
        const last = Number(win.sessionStorage.getItem(key)) || 0;
        if (worker && Date.now() - last > 30000) {
          win.sessionStorage.setItem(key, String(Date.now()));
          worker.postMessage({ type: 'use-shell' });
          win.location.reload();
          return;
        }
      } catch {
        // No sessionStorage: no way to stop a loop, so no reload.
      }
      const english = !/^it\b/i.test(win.navigator.language || '');
      const doc = win.document;
      const box = doc.createElement('div');
      const text = doc.createElement('p');
      const button = doc.createElement('button');
      text.textContent = english ? "The app couldn't load. Check your connection and try again." : "Non riesco a caricare l'app. Controlla la connessione e riprova.";
      button.textContent = english ? 'Try again' : 'Riprova';
      button.addEventListener('click', () => win.location.reload());
      box.style.cssText = 'padding:24px;font-family:system-ui,sans-serif';
      box.append(text, button);
      (doc.body || doc.documentElement).append(box);
    },
    true
  );
}

/** The script inlined in index.html: the same function the tests run. */
export function shellGuardScript(): string {
  return `(${installShellGuard.toString()})(window);`;
}
```

Se il test `the inlined text runs as a whole script` fallisce con `__name is not defined`, il
trasformatore ha aggiunto un helper per i nomi delle funzioni: tenere solo funzioni freccia
anonime passate direttamente (come sopra) ed evitare `function` con nome dentro la guardia.

`key` duplica `SHELL_GUARD_KEY` di proposito: la funzione non può leggere lo scope del modulo; il test controlla che coincidano scrivendo con la costante.

In `web/vite.config.ts` aggiungere l'import `import { shellGuardScript } from './src/pwa/shell-guard.ts';` e il plugin:

```ts
/** Inlines the shell guard in index.html, before the bundle (spec W8). */
function shellGuard(): Plugin {
  return {
    name: 'shell-guard',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'script', children: shellGuardScript(), injectTo: 'head' }]
  };
}
```

e `plugins: [react(), precacheManifest(), shellGuard()],`.

- [ ] **Step 4: Verificare test e build**

Run: `npm test -w web -- src/pwa/shell-guard.test.ts` → PASS.

Run: `npm run build -w web && grep -c "shell-guard-at" web/dist/index.html && node -e "const h=require('fs').readFileSync('web/dist/index.html','utf8'); if (h.indexOf('shell-guard-at') > h.indexOf('/assets/index-')) process.exit(1)"`
Expected: `1` e uscita 0 (la guardia sta prima del bundle).

- [ ] **Step 5: Commit**

```bash
git add web/src/pwa/shell-guard.ts web/src/pwa/shell-guard.test.ts web/vite.config.ts
git commit -m "PWA: guardia in index.html contro la pagina bianca quando il bundle non arriva"
```

---

### Task 6: `CACHE_SCHEMA` al posto della versione della build

**Files:**
- Modify: `web/src/api/persister.ts`, `web/src/session/SessionScope.tsx`
- Test: `web/src/api/persister.test.ts`, `web/src/session/SessionScope.test.tsx`

**Interfaces:**
- Produces: `export const CACHE_SCHEMA = '1'` in `persister.ts`; `restoreClient` restituisce
  le copie con `buster` in forma di data ISO come `buster: CACHE_SCHEMA`.

- [ ] **Step 1: Test che falliscono**

In `web/src/api/persister.test.ts` aggiungere `CACHE_SCHEMA` all'import da `./persister` e in fondo al `describe('persister', ...)`:

```ts
  it('keeps the copy across builds: the buster is the shape of the data, not the build (spec W8)', async () => {
    const list = ['shopping', 'getWeekList', { familyId: 'f', weekStartsOn: '2026-10-12', locale: 'it-IT' }];
    const store = createMemoryStore();
    const persister = createPersister(store, 'user-a');
    const before = createQueryClient();
    before.setQueryData(list, { version: 'v1', data: 'list' });
    await persistQueryClientSave({ queryClient: before, persister, buster: CACHE_SCHEMA, dehydrateOptions: options(CACHE_SCHEMA) });
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(list)).toEqual({ version: 'v1', data: 'list' });
  });
  it('restores a copy saved before the fix, whose buster is the build date', async () => {
    const { store } = await saved(createMemoryStore(), '2026-10-13T08:12:30.123Z');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('drops a copy of another shape', async () => {
    const { store } = await saved(createMemoryStore(), '0');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toBeUndefined();
  });
```

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test -w web -- src/api/persister.test.ts`
Expected: FAIL (`CACHE_SCHEMA` non esportato).

- [ ] **Step 3: Implementazione**

In `web/src/api/persister.ts`, dopo `REVOKED_PREFIX`:

```ts
/**
 * Shape of the copy on the device, its buster. Change it only when the saved data changes in an
 * incompatible way (a field removed or renamed, a type changed): that is exactly when the rule of
 * additive-only changes is broken (spec section 1), and the copy is then dropped once. A new
 * release alone never drops it: with the network every read checks the server again (spec W8).
 */
export const CACHE_SCHEMA = '1';
/** Copies saved before W8 have the build date as buster: same shape as CACHE_SCHEMA '1'. */
const LEGACY_BUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
```

In `restoreClient` sostituire `if (isPersistedClient(value)) return withoutRevoked(value, revoked);` con:

```ts
      if (isPersistedClient(value)) {
        const client = LEGACY_BUSTER.test(value.buster) ? { ...value, buster: CACHE_SCHEMA } : value;
        return withoutRevoked(client, revoked);
      }
```

In `web/src/session/SessionScope.tsx`: importare `CACHE_SCHEMA` da `../api/persister` e sostituire `persistOptions(persister, env.buildVersion)` con `persistOptions(persister, CACHE_SCHEMA)`. Se `env` non ha altri usi nel file, togliere l'import.

In `web/src/session/SessionScope.test.tsx` sostituire le due occorrenze `buster: env.buildVersion` con `buster: CACHE_SCHEMA` (importato da `../api/persister`) e togliere l'import di `env` se resta inutilizzato.

- [ ] **Step 4: Verificare**

Run: `npm test -w web -- src/api/persister.test.ts src/session/` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/persister.ts web/src/api/persister.test.ts web/src/session/SessionScope.tsx web/src/session/SessionScope.test.tsx
git commit -m "Copia sul dispositivo: buster sulla forma dei dati, la lista della spesa sopravvive ai rilasci"
```

---

### Task 7: Registrazioni di «occupata»

**Files:**
- Modify: `web/src/session/SessionScope.tsx`, `web/src/features/meals/UndoProvider.tsx`,
  `web/src/features/shopping/ShoppingQueueProvider.tsx`
- Test: `web/src/pwa/busy.integration.test.tsx`

**Interfaces:**
- Consumes: `useBusyCheck`, `registeredBusy`, `resetBusyChecks` (Task 3); `undoOf(session)` da
  `features/meals/sessionState.ts`; `ShoppingQueue.record().ops` e `useShoppingQueue()`.
- Produces: `queueBusy(queue: ShoppingQueue | null, signedIn: boolean): boolean` esportata da
  `ShoppingQueueProvider.tsx`.

- [ ] **Step 1: Test che falliscono**

`web/src/pwa/busy.integration.test.tsx`. Per `SessionScope` e `UndoProvider` usare l'app di test dei pasti (`realMealsApp` in `features/meals/testApp.tsx`), che monta sessione, Menu e `UndoProvider` con un server oRPC finto; per la coda la funzione pura.

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { realMealsApp } from '../features/meals/testApp';
import { queueBusy } from '../features/shopping/ShoppingQueueProvider';
import type { ShoppingQueue } from '../features/shopping/queue/queue';
import { emptyRecord } from '../features/shopping/queue/ops';
import { registeredBusy, resetBusyChecks } from './busy';

afterEach(() => resetBusyChecks());

const queueWith = (ops: unknown[]) => ({ record: () => ({ ...emptyRecord(), ops }) }) as unknown as ShoppingQueue;

describe('busy registrations', () => {
  it('the shopping queue is busy before it is read and while it holds operations, never without a person', () => {
    expect(queueBusy(null, true)).toBe(true);
    expect(queueBusy(queueWith([{}]), true)).toBe(true);
    expect(queueBusy(queueWith([]), true)).toBe(false);
    // The sign-in page has no queue: it must still update.
    expect(queueBusy(null, false)).toBe(false);
  });
  it('a meal change keeps the page busy while it is sent and while «Annulla» is offered', async () => {
    const { server } = realMealsApp('/menu');
    // Hold the server's answer: the mutation stays in flight.
    const release = server.holdNext('meals');
    await screen.findAllByRole('button', { name: /modifica/i });
    // Registered checks only: an open sheet would make the DOM check pass on its own.
    expect(registeredBusy()).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: /porzioni|più/i })[0]!);
    await waitFor(() => expect(registeredBusy()).toBe(true));
    release();
    // Answer arrived: «Annulla» is offered, still busy.
    await screen.findByRole('button', { name: 'Annulla' });
    expect(registeredBusy()).toBe(true);
  });
});
```

Prima di scrivere il secondo test leggere `web/src/test/rpcServer.ts` e `web/src/features/meals/MealActions.test.tsx`: usare i nomi reali dei pulsanti (porzioni nella scheda) e il modo esistente di trattenere una risposta del server finto. Se `holdNext` non esiste, aggiungere al server di test un metodo equivalente nello stile del file (una promessa che trattiene la prossima risposta dell'area indicata), senza cambiarne il comportamento per gli altri test. Il test deve provare entrambe le cose: mutazione in volo → occupata; «Annulla» offerto → occupata.

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test -w web -- src/pwa/busy.integration.test.tsx`
Expected: FAIL (`queueBusy` non esportata; nessuna registrazione).

- [ ] **Step 3: Implementazione**

In `ShoppingQueueProvider.tsx` importare `useBusyCheck` da `../../pwa/busy` ed esportare:

```ts
/** Busy for the update (spec W8): until the record is read, and while it holds operations; never without a person. */
export function queueBusy(queue: ShoppingQueue | null, signedIn: boolean): boolean {
  if (!signedIn) return false;
  return queue === null || queue.record().ops.length > 0;
}
```

e dentro `ShoppingQueueProvider`, dopo `useState`:

```ts
  useBusyCheck(() => queueBusy(queue, Boolean(session.userId)));
```

In `UndoProvider.tsx`, dopo `const slot = undoOf(useSession());`:

```ts
  // An offered «Annulla» keeps the page from reloading into a new version (spec W8).
  useBusyCheck(() => slot.get() !== null);
```

con `import { useBusyCheck } from '../../pwa/busy';`.

In `SessionScope.tsx`, nel corpo di `SessionScope` prima di `if (!session || !api || !value) return null;`:

```ts
  // A write in flight keeps the page from reloading into a new version (spec W8).
  useBusyCheck(() => (session ? session.queryClient.isMutating() > 0 : false));
```

con `import { useBusyCheck } from '../pwa/busy';`. L'hook va prima di ogni `return` per le regole degli hook.

- [ ] **Step 4: Verificare**

Run: `npm test -w web -- src/pwa/ src/session/ src/features/` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pwa/busy.integration.test.tsx web/src/session/SessionScope.tsx web/src/features/meals/UndoProvider.tsx web/src/features/shopping/ShoppingQueueProvider.tsx web/src/test/rpcServer.ts
git commit -m "PWA: scritture in volo, «Annulla» e coda della spesa rimandano l'aggiornamento"
```

---

### Task 8: Verifica completa e prova nel browser vero

**Files:**
- Modify: `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (solo se la prova
  rivela differenze dal comportamento descritto: correggere la spec, non la prova)

- [ ] **Step 1: Verifica automatica**

Run: `npm test && npm run typecheck && npm run build -w web`
Expected: tutto verde. Annotare i numeri dei test per la PR.

- [ ] **Step 2: Preparare le build**

```bash
SCRATCH=/private/tmp/claude-501/w8-builds          # la stessa del Task 1
rm -rf "$SCRATCH/b" "$SCRATCH/c" "$SCRATCH/d" "$SCRATCH/served"
cp -R web/dist "$SCRATCH/b"
npm run build -w web && cp -R web/dist "$SCRATCH/c"   # versione diversa: altro __BUILD_VERSION__
npm run build -w web && cp -R web/dist "$SCRATCH/d"
serve() { rm -rf "$SCRATCH/served" && cp -R "$SCRATCH/$1" "$SCRATCH/served"; }
serve a0
(cd web && npx vite preview --outDir "$SCRATCH/served" --port 8768 --strictPort) &
```

La cartella servita si sostituisce con `serve <nome>` senza fermare il server (le richieste
leggono i file a ogni accesso). Le build sono in modalità finta: nessuna variabile Supabase
nell'ambiente. Se `vite preview` tiene in memoria `index.html`, fermarlo e riavviarlo dopo ogni
`serve`, sullo stesso porto.

- [ ] **Step 3: Prova con agent-browser** (skill `agent-browser`; se la sessione non risponde,
  `caffeinate` e una sessione nuova, come da memoria del progetto)

La versione caricata si legge con
`document.querySelector('script[type=module][src*="/assets/index-"]').src` (hash diverso per
A₀, B, C, D); il worker attivo con
`navigator.serviceWorker.controller && (await navigator.serviceWorker.getRegistration()).active.scriptURL`
e, da B in poi, con il messaggio `version`.

1. A₀: aprire `http://localhost:8768/menu`, aspettare `navigator.serviceWorker.controller`
   (ricaricare una volta se serve: la prima visita non è controllata). Aprire la Spesa (la
   lista entra nella copia).
2. `serve b`, ricaricare: si vede ancora A₀ (cache-first). Aspettare che il worker attivo sia
   quello di B (`registration.active` cambia, `controllerchange`); la pagina A₀ resta usabile
   (navigare Menu → Ricettario → Menu). Ricaricare: si vede B. La lista della spesa è ancora
   nella copia (aprirla con la rete spenta, passo 5) e la sessione finta resta.
3. `serve c`, simulare il ritorno in primo piano:
   `document.dispatchEvent(new Event('visibilitychange'))`. Entro pochi secondi la pagina si
   ricarica da sola su C, sullo stesso indirizzo.
4. `serve d`, cambiare le porzioni di un pasto (compare «Annulla») e subito simulare il
   ritorno: nessun ricaricamento mentre l'«Annulla» è visibile. Scaduti i 6 secondi, simulare
   di nuovo il ritorno: la pagina passa a D.
5. Rete spenta (agent-browser offline) e riapertura di `/shopping`: shell servita dalla
   cache, lista della spesa visibile.
6. Rete accesa, `serve c` non serve: aprire una seconda scheda sulla versione corrente, poi
   portare una build nuova (`npm run build -w web`, `cp -R web/dist "$SCRATCH/e"`, `serve e`) e
   farla attivare dalla prima scheda; nella seconda, rimasta sulla versione precedente,
   navigare fra le pagine: nessun errore in console, font e icone presenti.

Annotare per ogni passo l'esito e gli hash visti; salvare uno screenshot dei passi 2, 3 e 5.

- [ ] **Step 4: Chiudere il server e verificare che il worktree sia pulito**

```bash
kill %1 2>/dev/null; git status --short
```

Expected: nessun file non tracciato (le build stanno in `$SCRATCH`, `web/dist` è ignorata).

- [ ] **Step 5: Commit (solo se la spec è cambiata)**

```bash
git add progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md
git commit -m "Aggiornamento della PWA: spec allineata alla prova nel browser"
```

Poi push e PR secondo il protocollo dei worker (fase 6), con gli esiti della prova nella
descrizione.

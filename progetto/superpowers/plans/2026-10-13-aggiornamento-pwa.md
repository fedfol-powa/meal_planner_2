# Aggiornamento della PWA installata (W8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** con la rete, aprire o riportare in primo piano la PWA installata porta alla versione
pubblicata, senza perdere scritture, sessione o lista della spesa offline (issue #42).

**Architecture:** le navigazioni restano servite dalla shell installata del worker attivo, così
pagina e file sono sempre della stessa versione. Il worker nuovo prende il controllo con
`skipWaiting` dopo un precache completo e conserva le ultime tre cache. La pagina chiede
aggiornamenti all'avvio e al ritorno visibile e si ricarica quando il worker attivo ha una
versione diversa, solo se libera, visibile e non toccata, al massimo una volta per coppia di
versioni. Il `buster` della copia persistita diventa una costante di forma.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4 (jsdom e Node), TanStack Query persist
client, Service Worker e Cache Storage API, agent-browser per la prova nel browser.

**Spec:** `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (leggila prima di
iniziare); specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`,
sezioni 1, 6, 15, 16. Rilievi della prima revisione:
`progetto/coordinamento/revisioni/w8-spec-piano.md`.

## Global Constraints

- Nessuna libreria nuova: service worker scritto a mano, niente Workbox, niente Playwright.
- Codice, commenti e test in inglese; documenti e messaggi di commit in italiano; ogni commit
  termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Navigazioni **sempre** dalla shell installata (nessuna navigazione dalla rete, nessun
  timeout, nessuna guardia in `index.html`).
- Cache conservate: la corrente più le **due** più recenti fra le altre.
- Timeout della domanda di versione: **1000 ms**; chiave del limite in `sessionStorage`:
  `pwa-reload:<versione pagina>><versione worker>`.
- `CACHE_SCHEMA = '1'`; i `buster` in forma di data ISO valgono **sempre** `'1'`.
- Rotte del server mai intercettate (`SERVER_PREFIXES` invariato).
- Non toccare il server, la specifica principale, `main` o altri worktree; nessun rilascio.
- Comandi dalla radice del worktree `.worktrees/pwa`: test web con
  `npm test -w web -- <file>`, tutto con `npm test`, tipi con `npm run typecheck`, build con
  `npm run build -w web`. Il bundle si chiama `/assets/main-<hash>.js`.

## Review Focus

1. **Tocco, pagina nascosta o pagina occupata mentre si aspetta la risposta del worker:** niente
   ricaricamento. → Task 4.
2. **Controllo superato da un `controllerchange` o da una nuova visibilità:** scartato. → Task 4.
3. **Rollback con reinstallazione fallita:** la cache della versione già presente resta, nessun
   ciclo di ricaricamenti. → Task 2 e Task 4 (limite per coppia).
4. **Scritture fuori da TanStack (password, lingua, uscita, accodamento):** pagina occupata fino
   alla fine. → Task 6.
5. **Pagina di login senza coda:** non occupata, altrimenti non si aggiornerebbe mai. → Task 6.

---

## File Structure

- `web/src/pwa/sw-rules.ts` (modifica): `staleCaches` tiene le ultime tre.
- `web/src/pwa/sw-core.ts` (modifica): `skipWaiting`, cache già presente non cancellata,
  `handleMessage` per la versione.
- `web/src/pwa/sw.ts` (modifica): collega `skipWaiting` e `message`.
- `web/src/pwa/busy.ts` (nuovo): `trackBusy`, registro di controlli, controlli sul DOM, hook.
- `web/src/pwa/update-rules.ts` (nuovo): `needsReload`, `claimReload`.
- `web/src/pwa/update.ts` (nuovo, sostituisce `register.ts`): ciclo dell'aggiornamento.
- `web/src/main.tsx` (modifica): importa da `update.ts`.
- `web/src/api/persister.ts` (modifica): `CACHE_SCHEMA`, copie di A₀.
- `web/src/session/SessionScope.tsx` (modifica): `CACHE_SCHEMA`, mutazioni e lingua occupate.
- `web/src/features/meals/UndoProvider.tsx`, `web/src/features/shopping/ShoppingQueueProvider.tsx`,
  `web/src/features/shopping/queue/queue.ts`, `web/src/routes/profile/PasswordPage.tsx`,
  `web/src/auth/AuthProvider.tsx` (modifica): «occupata».
- `web/src/test/stubBackend.ts` (modifica): `holdSignOut()` per i test.

---

### Task 1: Build A₀ e ultime tre cache

**Files:**
- Modify: `web/src/pwa/sw-rules.ts`
- Test: `web/src/pwa/sw-rules.test.ts`, `web/src/pwa/sw-core.test.ts`

**Interfaces:**
- Produces: `staleCaches(names: string[], version: string): string[]` (stessa firma): tutte le
  cache del prefisso tranne la corrente e le due più recenti fra le altre.

- [ ] **Step 1: Costruire A₀ prima di ogni modifica al codice (serve al Task 8)**

```bash
git diff --quiet 3e043f6 -- web || echo "STOP: web differs from 3e043f6"
npm run build -w web
SCRATCH=/private/tmp/claude-501/w8-builds
rm -rf "$SCRATCH/a0" && mkdir -p "$SCRATCH" && cp -R web/dist "$SCRATCH/a0"
ls "$SCRATCH/a0" "$SCRATCH/a0/assets" | grep -E "sw.js|precache.json|main-"
```

Expected: `sw.js`, `precache.json` e un `main-<hash>.js`.

- [ ] **Step 2: Test che fallisce**

In `web/src/pwa/sw-rules.test.ts` sostituire il test `names caches by build and finds the old ones` con:

```ts
  it('names caches by build and keeps the current one plus the two most recent others', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    const c = (day: string) => `cosasimangia-2026-10-${day}T00:00:00.000Z`;
    const names = [c('01'), c('05'), c('07'), c('09'), 'other'];
    // Current 09: 07 and 05 stay for the pages still open (a busy page may skip a version), 01 goes.
    expect(staleCaches(names, '2026-10-09T00:00:00.000Z')).toEqual([c('01')]);
  });
  it('after a rollback keeps the newer caches, which pages still open may need', () => {
    const c = (day: string) => `cosasimangia-2026-10-${day}T00:00:00.000Z`;
    // Rolled back to 05: 09 (the page still open) and 07 stay, 01 goes.
    expect(staleCaches([c('01'), c('05'), c('07'), c('09')], '2026-10-05T00:00:00.000Z')).toEqual([c('01')]);
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b'], 'b')).toEqual([]);
  });
```

- [ ] **Step 3: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/sw-rules.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementazione**

In `web/src/pwa/sw-rules.ts` sostituire `staleCaches`:

```ts
/** Caches kept besides the current one: pages still open (busy, or newer after a rollback) find their files there. */
const KEPT_OTHERS = 2;

/**
 * Every cache of ours but the current one and the two most recent others (names sort as build
 * dates). A simple limit, without tracking open pages: a page that skips more than two versions
 * may lose fonts or images not loaded yet, and gets them back at its reload (spec W8).
 */
export function staleCaches(names: string[], version: string): string[] {
  const current = cacheName(version);
  const others = names.filter((name) => name.startsWith(PREFIX) && name !== current).sort();
  return others.slice(0, Math.max(0, others.length - KEPT_OTHERS));
}
```

- [ ] **Step 5: Verificare e adeguare il test esistente**

Run: `npm test -w web -- src/pwa/`
Expected: `sw-rules` PASS. In `sw-core.test.ts` il test `updates A→B keeping A until B is complete` fallisce su `expect(caches.names()).toEqual(['cosasimangia-B'])`: sostituire con `expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B']);` preceduto da `// A stays for the pages still open.`; rilanciare: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/pwa/sw-rules.ts web/src/pwa/sw-rules.test.ts web/src/pwa/sw-core.test.ts
git commit -m "PWA: il worker conserva le ultime tre versioni in cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Presa di controllo, cache già presente e versione del worker

**Files:**
- Modify: `web/src/pwa/sw-core.ts`, `web/src/pwa/sw.ts`
- Test: `web/src/pwa/sw-core.test.ts`

**Interfaces:**
- Consumes: `staleCaches` (Task 1).
- Produces:
  - `WorkerDeps` con il campo facoltativo `skipWaiting?: () => Promise<void>`;
  - `interface MessagePortLike { postMessage(message: unknown): void }`;
  - `handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): void`;
  - protocollo: pagina → worker `{ type: 'version' }` con una porta; worker → porta
    `{ type: 'version', version: string }`.

- [ ] **Step 1: Test che falliscono**

In `web/src/pwa/sw-core.test.ts` cambiare gli import in:

```ts
import { describe, expect, it, vi } from 'vitest';
import { activate, handleMessage, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';
```

e aggiungere in fondo:

```ts
const buildC = { '/precache.json': JSON.stringify(['/index.html', '/assets/c.js']), '/index.html': 'index C', '/assets/c.js': 'script C' };

async function installed(build: Record<string, string>, version: string, caches = memoryCaches(), skipWaiting?: () => Promise<void>) {
  const deps: WorkerDeps = { caches, fetch: network(build).fetch, version, origin, skipWaiting };
  await install(deps);
  await activate(deps);
  return { caches, deps };
}

describe('taking over and living with older pages', () => {
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
  it('answers its version on the port, and nothing without a port or to malformed messages', () => {
    const deps: WorkerDeps = { caches: memoryCaches(), fetch: network(buildA).fetch, version: 'B', origin };
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
  it('first release of the fix: A₀ installed, B takes over, A₀ stays, the shell is B also offline', async () => {
    // A₀ is today's production worker: same install, so its cache looks the same.
    const { caches } = await installed(buildA, 'A0');
    const skipWaiting = vi.fn(async () => {});
    const { deps: depsB } = await installed(buildB, 'B', caches, skipWaiting);
    expect(skipWaiting).toHaveBeenCalled();
    expect(caches.names().sort()).toEqual(['cosasimangia-A0', 'cosasimangia-B']);
    const offline = network(buildB);
    offline.state.offline = true;
    const underB = { ...depsB, fetch: offline.fetch };
    expect(await text(await respond(navigate('/menu'), url('/menu'), underB))).toBe('index B');
    // The A₀ page still open finds its bundle.
    expect(await text(await respond(asset('/assets/a.js'), url('/assets/a.js'), underB))).toBe('script A');
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
  it('rollback C → B: C stays, and a failed reinstall of B keeps the B cache it found', async () => {
    const { caches } = await installed(buildA, 'A');
    await installed(buildB, 'B', caches);
    await installed(buildC, 'C', caches);
    const broken = network(buildB);
    broken.state.failing.add('/assets/b.js');
    await expect(install({ caches, fetch: broken.fetch, version: 'B', origin })).rejects.toThrow();
    expect(caches.names().sort()).toEqual(['cosasimangia-A', 'cosasimangia-B', 'cosasimangia-C']);
    const { deps: depsB } = await installed(buildB, 'B', caches);
    expect(caches.names()).toContain('cosasimangia-C');
    const offline = network(buildB);
    offline.state.offline = true;
    expect(await text(await respond(navigate('/menu'), url('/menu'), { ...depsB, fetch: offline.fetch }))).toBe('index B');
    expect(await text(await respond(asset('/assets/c.js'), url('/assets/c.js'), { ...depsB, fetch: offline.fetch }))).toBe('script C');
  });
});
```

Il test esistente `serves the installed shell online even after a new deploy` resta invariato: è
la garanzia che le navigazioni non vengono dalla rete.

- [ ] **Step 2: Verificare che falliscano**

Run: `npm test -w web -- src/pwa/sw-core.test.ts`
Expected: FAIL (`handleMessage` non esportata, `skipWaiting` mai chiamato, cache B cancellata).

- [ ] **Step 3: Implementazione in `sw-core.ts`**

Aggiungere a `WorkerDeps`:

```ts
  /** The worker's own skipWaiting: a complete install takes over at once (spec W8). */
  skipWaiting?: () => Promise<void>;
```

Sostituire `install`:

```ts
/**
 * All or nothing: a missing file fails the install and the previous version stays. A cache of the
 * same version already there (a rollback to a kept version) is never deleted by a failed install.
 */
export async function install(deps: WorkerDeps): Promise<void> {
  const { caches, fetch, version } = deps;
  const name = cacheName(version);
  const existed = (await caches.keys()).includes(name);
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
    if (!existed) await caches.delete(name);
    throw error;
  }
  // Only a complete shell takes over; the pages open now get controllerchange.
  await deps.skipWaiting?.();
}
```

Aggiungere dopo `activate`:

```ts
export interface MessagePortLike { postMessage(message: unknown): void }

/** The page asks the version of the worker in control, on the port of a MessageChannel (spec W8). */
export function handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): void {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'version') return;
  ports[0]?.postMessage({ type: 'version', version: deps.version });
}
```

`respond` resta com'è.

- [ ] **Step 4: Collegare `sw.ts`**

Sostituire il contenuto di `web/src/pwa/sw.ts`:

```ts
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

const worker = self as unknown as WorkerScope;
const deps: WorkerDeps = {
  caches,
  fetch: (input, init) => fetch(input, init),
  version: __BUILD_VERSION__,
  origin: worker.location.origin,
  skipWaiting: () => worker.skipWaiting()
};

// A complete install takes over at once; the pages reload themselves when free (update.ts).
worker.addEventListener('install', (event) => event.waitUntil(install(deps)));
worker.addEventListener('activate', (event) => event.waitUntil(activate(deps)));
worker.addEventListener('message', (event) => handleMessage(event.data, event.ports, deps));
worker.addEventListener('fetch', (event) => {
  const info = { url: event.request.url, method: event.request.method, mode: event.request.mode };
  if (strategyFor({ ...info, origin: deps.origin }) === 'passthrough') return;
  event.respondWith(respond(info, event.request, deps));
});
```

- [ ] **Step 5: Verificare**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS. Prova di rottura: togliere `if (!existed)` (cancellare sempre): deve fallire il
test del rollback; ripristinare.

- [ ] **Step 6: Commit**

```bash
git add web/src/pwa/sw-core.ts web/src/pwa/sw-core.test.ts web/src/pwa/sw.ts
git commit -m "PWA: il worker nuovo prende il controllo dopo un precache completo e dice la sua versione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pagina occupata (`busy.ts`)

**Files:**
- Create: `web/src/pwa/busy.ts`
- Test: `web/src/pwa/busy.test.tsx`

**Interfaces:**
- Produces:
  - `trackBusy<T>(work: Promise<T>): Promise<T>`: conta `work` dalla chiamata fino al suo esito
    e restituisce una promessa con lo stesso valore o lo stesso errore;
  - `registerBusyCheck(check: () => boolean): () => void`;
  - `useBusyCheck(check: () => boolean): void`;
  - `registeredBusy(): boolean` (contatore e controlli registrati, senza DOM);
  - `isBusy(doc?: Document): boolean` (DOM più `registeredBusy()`);
  - `resetBusy(): void` (solo test: azzera contatore e registro).

- [ ] **Step 1: Test che fallisce**

`web/src/pwa/busy.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isBusy, registerBusyCheck, registeredBusy, resetBusy, trackBusy, useBusyCheck } from './busy';

afterEach(() => {
  resetBusy();
  document.body.innerHTML = '';
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('busy page', () => {
  it('is free with nothing running, registered or open', () => {
    expect(isBusy()).toBe(false);
    expect(registeredBusy()).toBe(false);
  });
  it('counts a tracked operation until it settles, resolved or rejected, and passes its outcome on', async () => {
    const ok = deferred<number>();
    const failing = deferred();
    const tracked = trackBusy(ok.promise);
    const trackedFailure = trackBusy(failing.promise);
    expect(registeredBusy()).toBe(true);
    ok.resolve(7);
    expect(await tracked).toBe(7);
    expect(registeredBusy()).toBe(true);
    failing.reject(new Error('no'));
    await expect(trackedFailure).rejects.toThrow('no');
    expect(registeredBusy()).toBe(false);
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
    document.body.innerHTML = '<input id="t" type="text"><input id="p" type="password"><textarea id="a"></textarea><input id="c" type="checkbox"><button id="b">x</button><div id="e" contenteditable="true" tabindex="0"></div>';
    const focus = (id: string) => (document.getElementById(id) as HTMLElement).focus();
    for (const [id, busy] of [['t', true], ['p', true], ['a', true], ['c', false], ['b', false], ['e', true]] as const) {
      focus(id);
      expect(isBusy(), id).toBe(busy);
    }
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

`web/src/pwa/busy.ts`:

```ts
import { useEffect, useRef } from 'react';

/**
 * Whether reloading into a new version now would interrupt something (spec W8, «Pagina
 * occupata»): operations in progress outside TanStack Query (password, language, sign-out,
 * shopping queue writes), registered checks (mutations, «Annulla», queue), open sheets and the
 * focus in a text field.
 */
let running = 0;
const checks = new Set<() => boolean>();

/** Counts `work` from now until it settles; call it where the operation starts. */
export function trackBusy<T>(work: Promise<T>): Promise<T> {
  running += 1;
  return work.finally(() => {
    running -= 1;
  });
}

export function registerBusyCheck(check: () => boolean): () => void {
  const entry = () => check();
  checks.add(entry);
  return () => void checks.delete(entry);
}

/** Registers `check` while the component is mounted; the latest render's check is the one asked. */
export function useBusyCheck(check: () => boolean): void {
  const latest = useRef(check);
  latest.current = check;
  useEffect(() => registerBusyCheck(() => latest.current()), []);
}

/** Operations in progress and registered checks, without the DOM. */
export function registeredBusy(): boolean {
  if (running > 0) return true;
  for (const check of checks) {
    try {
      if (check()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

const NOT_TEXT = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);

function isTextField(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !NOT_TEXT.has(element.type);
  return element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

export function isBusy(doc: Document = document): boolean {
  if (doc.querySelector('dialog[open]')) return true;
  if (isTextField(doc.activeElement)) return true;
  return registeredBusy();
}

/** Tests only. */
export function resetBusy(): void {
  running = 0;
  checks.clear();
}
```

- [ ] **Step 4: Verificare**

Run: `npm test -w web -- src/pwa/busy.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/pwa/busy.ts web/src/pwa/busy.test.tsx
git commit -m "PWA: pagina occupata, con operazioni in corso e controlli registrati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ciclo dell'aggiornamento nella pagina

**Files:**
- Create: `web/src/pwa/update-rules.ts`, `web/src/pwa/update.ts`
- Delete: `web/src/pwa/register.ts`
- Modify: `web/src/main.tsx`
- Test: `web/src/pwa/update-rules.test.ts`, `web/src/pwa/update.test.ts`

**Interfaces:**
- Consumes: protocollo `version` (Task 2); `isBusy()` (Task 3).
- Produces:
  - `type StorageLike = Pick<Storage, 'getItem' | 'setItem'>`;
  - `needsReload(pageVersion: string, workerVersion: string | null): boolean`;
  - `claimReload(storage: StorageLike | null, pageVersion: string, workerVersion: string): boolean`;
  - `startUpdates(env: UpdateEnv): Promise<void>` con
    `UpdateEnv = { container: ContainerLike; document: DocumentLike; loaded: Promise<void>; storage: StorageLike | null; reload: () => void; pageVersion: string; isBusy: () => boolean; askTimeoutMs?: number }`;
  - `registerServiceWorker(): void` (stesso nome di prima, ora in `update.ts`).

- [ ] **Step 1: Test delle regole**

`web/src/pwa/update-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { claimReload, needsReload } from './update-rules';

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items };
}

describe('update rules', () => {
  it('reloads towards any different worker, also an older one after a rollback', () => {
    expect(needsReload('2026-10-13T10:00:00.000Z', '2026-10-14T10:00:00.000Z')).toBe(true);
    expect(needsReload('2026-10-13T10:00:00.000Z', '2026-10-12T10:00:00.000Z')).toBe(true);
    expect(needsReload('2026-10-13T10:00:00.000Z', '2026-10-13T10:00:00.000Z')).toBe(false);
    expect(needsReload('2026-10-13T10:00:00.000Z', null)).toBe(false);
  });
  it('allows one automatic reload per pair of versions', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'A', 'B')).toBe(true);
    expect(claimReload(storage, 'A', 'B')).toBe(false);
    expect(claimReload(storage, 'B', 'A')).toBe(true);
    expect(storage.items.has('pwa-reload:A>B')).toBe(true);
  });
  it('never reloads without a working sessionStorage', () => {
    expect(claimReload(null, 'A', 'B')).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      }
    };
    expect(claimReload(throwing, 'A', 'B')).toBe(false);
  });
});
```

- [ ] **Step 2: Verificare che fallisca, poi implementare `update-rules.ts`**

Run: `npm test -w web -- src/pwa/update-rules.test.ts` → FAIL.

```ts
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Any different version, also an older one: after the reload the shell comes from the worker in
 * control, so page and worker match and no loop is possible, rollback included (spec W8).
 */
export function needsReload(pageVersion: string, workerVersion: string | null): boolean {
  return workerVersion !== null && workerVersion !== pageVersion;
}

/** Defensive limit: one automatic reload per (page, worker) pair in this tab; none without storage. */
export function claimReload(storage: StorageLike | null, pageVersion: string, workerVersion: string): boolean {
  if (!storage) return false;
  const key = `pwa-reload:${pageVersion}>${workerVersion}`;
  try {
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}
```

Run di nuovo: PASS.

- [ ] **Step 3: Test del ciclo**

`web/src/pwa/update.test.ts`. Le risposte del worker sono **trattenute**: il test decide quando
arrivano, una alla volta o tutte.

```ts
import { describe, expect, it, vi } from 'vitest';
import { startUpdates, type ContainerLike, type DocumentLike } from './update';

const PAGE = 'v-page';
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** A worker whose answers to «version» wait until the test delivers them. */
function heldWorker(version: string) {
  const pending: (() => void)[] = [];
  return {
    version,
    pending,
    postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
      if ((message as { type?: string }).type === 'version') pending.push(() => transfer[0]!.postMessage({ type: 'version', version }));
    }),
    /** Delivers the oldest held answer and lets the page react. */
    async answerFirst() {
      pending.shift()?.();
      await tick();
    },
    /** Delivers every held answer and lets the page react. */
    async answer() {
      pending.splice(0).forEach((send) => send());
      await tick();
    }
  };
}

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), items };
}

function world(options: { worker?: ReturnType<typeof heldWorker> | null; updateFails?: boolean; busy?: boolean } = {}) {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState }) as EventTarget & DocumentLike & { visibilityState: DocumentVisibilityState };
  const update = vi.fn(async () => {
    if (options.updateFails) throw new TypeError('Failed to fetch');
  });
  let worker: ReturnType<typeof heldWorker> | null = options.worker === undefined ? heldWorker(PAGE) : options.worker;
  const container = Object.assign(new EventTarget(), {
    register: vi.fn(async () => ({ update }))
  }) as EventTarget & ContainerLike;
  Object.defineProperty(container, 'controller', { get: () => worker });
  let markLoaded!: () => void;
  const loaded = new Promise<void>((resolve) => (markLoaded = resolve));
  const state = { busy: options.busy ?? false };
  const reload = vi.fn();
  const storage = memoryStorage();
  const env = { container, document: doc, loaded, storage, reload, pageVersion: PAGE, isBusy: () => state.busy, askTimeoutMs: 1000 };
  let started: Promise<void> | undefined;
  return {
    env, doc, container, update, state, reload, storage,
    get worker() {
      return worker!;
    },
    /** Runs the module's start: listeners now, registration at load. */
    begin() {
      started = startUpdates(env);
      return started;
    },
    load() {
      markLoaded();
    },
    /** begin + load; resolves when the start check is done (deliver held answers first). */
    start() {
      const run = this.begin();
      this.load();
      return run;
    },
    visible() {
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    hidden() {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    touch() {
      doc.dispatchEvent(new Event('pointerdown'));
    },
    takeOver(version: string) {
      worker = heldWorker(version);
      container.dispatchEvent(new Event('controllerchange'));
      return worker;
    }
  };
}

/** Starts the world and answers the start check with the same version: a quiet start. */
async function quietStart(w: ReturnType<typeof world>) {
  const starting = w.start();
  await tick();
  await w.worker.answer();
  await starting;
}

describe('page updates', () => {
  it('registers bypassing the HTTP cache, checks for updates at start, stays on the same version', async () => {
    const w = world();
    await quietStart(w);
    expect(w.container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(w.update).toHaveBeenCalledTimes(1);
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a new worker taking over a free, untouched page reloads it once', async () => {
    const w = world();
    await quietStart(w);
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('back in the foreground: checks for updates and reloads at once when the worker is already different', async () => {
    const w = world({ worker: heldWorker('v-new'), busy: true });
    await w.start(); // busy: the start check stops before asking
    expect(w.reload).not.toHaveBeenCalled();
    w.state.busy = false;
    w.hidden();
    w.visible();
    expect(w.update).toHaveBeenCalledTimes(2);
    await tick();
    await w.worker.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a touch while waiting for the answer stops the reload, at start and back in the foreground', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const starting = w.start();
    await tick();
    w.touch();
    await w.worker.answer();
    await starting;
    expect(w.reload).not.toHaveBeenCalled();
    // Back in the foreground the touch is forgotten, but a new one during the wait counts again.
    w.hidden();
    w.visible();
    await tick();
    w.touch();
    await w.worker.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a touch on controllerchange stops the reload until the next return', async () => {
    const w = world();
    await quietStart(w);
    w.touch();
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
    w.hidden();
    w.visible();
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a touch before the page finished loading counts', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const started = w.begin();
    w.touch();
    await tick();
    expect(w.container.register).not.toHaveBeenCalled();
    w.load();
    await tick();
    await w.worker.answer();
    await started;
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page hidden while waiting for the answer does not reload', async () => {
    const w = world();
    await quietStart(w);
    const next = w.takeOver('v-new');
    await tick();
    w.doc.visibilityState = 'hidden'; // hidden without the event: the check must look again
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page that became busy while waiting for the answer does not reload', async () => {
    const w = world();
    await quietStart(w);
    const next = w.takeOver('v-new');
    await tick();
    w.state.busy = true;
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a check overtaken by controllerchange is dropped, and the new check decides', async () => {
    const w = world();
    await quietStart(w);
    const first = w.takeOver('v-1');
    await tick();
    const second = w.takeOver('v-2');
    await tick();
    // The answer of the first check arrives after the second controllerchange: dropped.
    await first.answer();
    expect(w.reload).not.toHaveBeenCalled();
    await second.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(w.storage.items.has(`pwa-reload:${PAGE}>v-2`)).toBe(true);
    expect(w.storage.items.has(`pwa-reload:${PAGE}>v-1`)).toBe(false);
  });
  it('a check overtaken by a new return to the foreground is dropped', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const starting = w.start();
    await tick();
    // The start check is waiting; the page goes away and comes back: a new check starts.
    w.hidden();
    w.visible();
    await tick();
    expect(w.worker.pending).toHaveLength(2);
    // The start check's answer arrives first: overtaken, dropped even though the page is free.
    await w.worker.answerFirst();
    expect(w.reload).not.toHaveBeenCalled();
    await w.worker.answerFirst();
    await starting;
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('never reloads twice for the same pair of versions', async () => {
    const w = world({ worker: heldWorker('v-new') });
    w.storage.items.set(`pwa-reload:${PAGE}>v-new`, '1');
    const starting = w.start();
    await tick();
    await w.worker.answer();
    await starting;
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('does nothing without a worker in control or without an answer', async () => {
    const none = world({ worker: null });
    await none.start();
    expect(none.reload).not.toHaveBeenCalled();
    const silent = world({ worker: heldWorker('v-new') });
    silent.env.askTimeoutMs = 20;
    await silent.start();
    expect(silent.reload).not.toHaveBeenCalled();
  });
  it('offline: failing update checks leave no unhandled error and no reload', async () => {
    const w = world({ updateFails: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await quietStart(w);
    w.hidden();
    w.visible();
    await tick();
    await w.worker.answer();
    await tick();
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
import { claimReload, needsReload, type StorageLike } from './update-rules';

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
  /** Resolves at the window's load: registration waits for it, listeners do not. */
  loaded: Promise<void>;
  storage: StorageLike | null;
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
 * The page follows the worker in control (spec W8): at load, at every return to the foreground and
 * at every controllerchange it asks the worker's version and reloads when it differs, only if the
 * page is visible, untouched since the last return and not busy, checked again right before the
 * reload, at most once per pair of versions. Back in the foreground it also asks the browser to
 * check /sw.js: a new version installs, takes over and fires controllerchange.
 */
export async function startUpdates(env: UpdateEnv): Promise<void> {
  let interacted = false;
  let generation = 0;
  let registration: RegistrationLike | undefined;
  const free = () => env.document.visibilityState === 'visible' && !interacted && !env.isBusy();
  const update = () => void registration?.update().catch(() => undefined);
  const check = async () => {
    const started = generation;
    const controller = env.container.controller;
    if (!controller || !free()) return;
    const workerVersion = await askVersion(controller, env.askTimeoutMs ?? 1000);
    // Overtaken by a newer check, same version, or no longer free: nothing.
    if (started !== generation || workerVersion === null || !needsReload(env.pageVersion, workerVersion) || !free()) return;
    if (claimReload(env.storage, env.pageVersion, workerVersion)) env.reload();
  };
  const touched = () => {
    interacted = true;
  };
  env.document.addEventListener('pointerdown', touched, true);
  env.document.addEventListener('keydown', touched, true);
  env.document.addEventListener('visibilitychange', () => {
    generation += 1;
    if (env.document.visibilityState !== 'visible') return;
    interacted = false;
    void check();
    update();
  });
  env.container.addEventListener('controllerchange', () => {
    generation += 1;
    void check();
  });
  await env.loaded;
  registration = await env.container.register('/sw.js', { updateViaCache: 'none' });
  update();
  await check();
}

function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Production only, and only where the browser allows it (HTTPS or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const loaded = new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
  void startUpdates({
    container: navigator.serviceWorker as unknown as ContainerLike,
    document,
    loaded,
    storage: sessionStore(),
    reload: () => location.reload(),
    pageVersion: __BUILD_VERSION__,
    isBusy: () => isBusy()
  }).catch(() => undefined);
}
```

Nota sul test `back in the foreground: ... already different`: all'avvio la pagina è occupata,
quindi il controllo si ferma prima di chiedere e `start()` si risolve subito.

- [ ] **Step 6: Togliere `register.ts` e aggiornare `main.tsx`**

```bash
git rm web/src/pwa/register.ts
```

In `web/src/main.tsx` cambiare `import { registerServiceWorker } from './pwa/register';` in `import { registerServiceWorker } from './pwa/update';`.

- [ ] **Step 7: Verificare, con prove di rottura**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS.

Prove di rottura, una per volta, ripristinando dopo ciascuna:
- togliere `|| !free()` dopo `askVersion`: devono fallire `touch while waiting`, `hidden while
  waiting`, `busy while waiting`;
- togliere `started !== generation`: devono fallire i due test `overtaken`;
- sostituire `claimReload(...)` con `true`: deve fallire `never reloads twice`;
- spostare `interacted = false` fuori dal ramo `visible`: deve fallire `a touch before the page
  finished loading` o `a touch on controllerchange`.

- [ ] **Step 8: Commit**

```bash
git add web/src/pwa/update-rules.ts web/src/pwa/update-rules.test.ts web/src/pwa/update.ts web/src/pwa/update.test.ts web/src/main.tsx
git commit -m "PWA: la pagina segue il worker attivo quando è libera, visibile e non toccata

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `CACHE_SCHEMA` al posto della versione della build

**Files:**
- Modify: `web/src/api/persister.ts`, `web/src/session/SessionScope.tsx`
- Test: `web/src/api/persister.test.ts`, `web/src/session/SessionScope.test.tsx`,
  `web/src/pwa/survives-update.test.tsx` (nuovo)

**Interfaces:**
- Produces: `export const CACHE_SCHEMA = '1'`; `restoreClient` restituisce le copie con
  `buster` in forma di data ISO con `buster: '1'` (letterale, non `CACHE_SCHEMA`).

- [ ] **Step 1: Test del persister che falliscono**

In `web/src/api/persister.test.ts` aggiungere `CACHE_SCHEMA` all'import da `./persister` e in
fondo a `describe('persister', ...)`:

```ts
  it('keeps the copy across builds: the buster is the shape of the data (spec W8)', async () => {
    const { store } = await saved(createMemoryStore(), CACHE_SCHEMA);
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('restores a copy saved before W8, whose buster is the build date, as schema 1', async () => {
    const { store } = await saved(createMemoryStore(), '2026-10-13T08:12:30.123Z');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: '1' });
    expect(after.getQueryData(week)).toEqual({ version: 'v1', data: 'week' });
  });
  it('drops a pre-W8 copy once the schema is 2: no migration', async () => {
    const { store } = await saved(createMemoryStore(), '2026-10-13T08:12:30.123Z');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: '2' });
    expect(after.getQueryData(week)).toBeUndefined();
  });
  it('drops a copy of another schema', async () => {
    const { store } = await saved(createMemoryStore(), '0');
    const after = createQueryClient();
    await persistQueryClientRestore({ queryClient: after, persister: createPersister(store, 'user-a'), buster: CACHE_SCHEMA });
    expect(after.getQueryData(week)).toBeUndefined();
  });
```

Run: `npm test -w web -- src/api/persister.test.ts` → FAIL (`CACHE_SCHEMA` non esportato).

- [ ] **Step 2: Implementazione nel persister e nella sessione**

In `web/src/api/persister.ts`, dopo `REVOKED_PREFIX`:

```ts
/**
 * Shape of the copy on the device, its buster. Change it only when the saved data or the query
 * keys change in an incompatible way (a field removed or renamed, a type changed, another key for
 * the same read): exactly when the rule of additive-only changes is broken (spec section 1). The
 * copy is then dropped, with no migration: the only exception to keeping the shopping list offline.
 * The compatibility period of the API is still required: this protects the copy, not queued
 * requests or agents. A release alone never drops it: online every read checks the server again.
 */
export const CACHE_SCHEMA = '1';
/** Copies saved before W8 have the build date as buster: they are schema '1', whatever the current one. */
const PRE_SCHEMA_BUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
```

In `restoreClient` sostituire `if (isPersistedClient(value)) return withoutRevoked(value, revoked);` con:

```ts
      if (isPersistedClient(value)) {
        const client = PRE_SCHEMA_BUSTER.test(value.buster) ? { ...value, buster: '1' } : value;
        return withoutRevoked(client, revoked);
      }
```

In `web/src/session/SessionScope.tsx` importare `CACHE_SCHEMA` da `../api/persister` e sostituire
`persistOptions(persister, env.buildVersion)` con `persistOptions(persister, CACHE_SCHEMA)`;
togliere l'import di `env` se resta inutilizzato. In `web/src/session/SessionScope.test.tsx`
sostituire le due occorrenze `buster: env.buildVersion` con `buster: CACHE_SCHEMA` (importato da
`../api/persister`) e togliere l'import di `env` se resta inutilizzato.

Run: `npm test -w web -- src/api/persister.test.ts src/session/` → PASS.

- [ ] **Step 3: Test dell'app intera: lista e coda dopo un cambio di build**

Prima di scriverlo leggere `web/src/features/shopping/queue/ops.ts` (`QueuedOp`: il campo
dell'identificativo generato dal dispositivo) e `web/src/features/shopping/testServer.ts`
(`reads`, `calls`, `applied`), e usare i nomi reali: le asserzioni sotto usano `id` sul record e
`input.id` sulla richiesta come segnaposto di forma, da allineare ai tipi. Le due asserzioni da
mantenere: stessi identificativi sul dispositivo prima e dopo; inviati con quegli
identificativi al ritorno della rete.

`web/src/pwa/survives-update.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheKey, createMemoryStore } from '../api/persister';
import { DEMO_FAMILY_ID } from '../api/fake/seed';
import { DEMO_USER } from '../auth/backend';
import { env } from '../env';
import { MONDAY } from '../features/shopping/fixtures';
import { queueKey } from '../features/shopping/storage';
import { createShoppingServer } from '../features/shopping/testServer';
import { setOnline } from '../test/connectivity';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';

const SHOPPING = `/shopping/${MONDAY}?day=2026-10-14`;
const originalBuild = env.buildVersion;
afterEach(() => {
  (env as { buildVersion: string }).buildVersion = originalBuild;
});

/** One opening of the app on the same device (store), with the build given: a reload into a new version. */
function openApp(store: ReturnType<typeof createMemoryStore>, server: ReturnType<typeof createShoppingServer>, path: string, build: string) {
  (env as { buildVersion: string }).buildVersion = build;
  return renderApp(path, { store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
}

const tomatoes = () => screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });

describe('what survives a new version (spec W8)', () => {
  it('the shopping list saved by one build opens offline after the app reloaded on the Menu with another', async () => {
    const store = createMemoryStore();
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const first = openApp(store, server, SHOPPING, '2026-10-13T08:00:00.000Z');
    await tomatoes();
    // The persister writes at most once a second.
    await waitFor(() => expect(JSON.stringify(store.entries.get(cacheKey(DEMO_USER.id)))).toContain('Pomodori'), { timeout: 3000 });
    first.unmount();
    // New version, opened on the Menu: the list is not read again, and the copy is written again.
    const second = openApp(store, server, '/menu', '2026-10-14T08:00:00.000Z');
    await screen.findAllByRole('heading', { level: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    second.unmount();
    // At the supermarket, offline.
    setOnline(false);
    const readsBefore = server.reads.mock.calls.length;
    openApp(store, server, SHOPPING, '2026-10-14T08:00:00.000Z');
    expect(await tomatoes()).toBeTruthy();
    expect(server.reads.mock.calls.length).toBe(readsBefore);
  });
  it('the queued changes keep their identifiers across a new version and leave with them', async () => {
    const store = createMemoryStore();
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    const first = openApp(store, server, SHOPPING, '2026-10-13T08:00:00.000Z');
    fireEvent.click(await tomatoes());
    setOnline(false);
    const record = () => store.entries.get(queueKey(DEMO_USER.id)) as { ops: { id: string }[] } | undefined;
    // Offline before the click lands: one queued change on the device.
    await waitFor(() => expect(record()?.ops.length).toBe(1));
    const ids = record()!.ops.map((op) => op.id);
    first.unmount();
    openApp(store, server, SHOPPING, '2026-10-14T08:00:00.000Z');
    await tomatoes();
    expect(record()!.ops.map((op) => op.id)).toEqual(ids);
    setOnline(true);
    await waitFor(() => expect(server.calls).toContain('setItemChecked'));
    expect(server.applied.map((request) => (request as { input: { id: string } }).input.id)).toContain(ids[0]);
  });
});
```

Se l'ordine «clic poi offline» rende il test instabile (l'invio parte subito online), invertirlo
come nei test offline di `ShoppingPage.test.tsx` (andare offline prima del clic).

Run: `npm test -w web -- src/pwa/survives-update.test.tsx` → PASS.

Prova di rottura: in `SessionScope.tsx` rimettere `persistOptions(persister, env.buildVersion)`:
il primo test deve fallire; ripristinare.

- [ ] **Step 4: Verificare tutto il web e i tipi**

Run: `npm test -w web` e `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/persister.ts web/src/api/persister.test.ts web/src/session/SessionScope.tsx web/src/session/SessionScope.test.tsx web/src/pwa/survives-update.test.tsx
git commit -m "Copia sul dispositivo: buster sulla forma dei dati, la lista della spesa sopravvive ai rilasci

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Registrazioni di «occupata» nei punti di scrittura

**Files:**
- Modify: `web/src/session/SessionScope.tsx`, `web/src/features/meals/UndoProvider.tsx`,
  `web/src/features/shopping/ShoppingQueueProvider.tsx`,
  `web/src/features/shopping/queue/queue.ts`, `web/src/routes/profile/PasswordPage.tsx`,
  `web/src/auth/AuthProvider.tsx`, `web/src/test/stubBackend.ts`
- Test: `web/src/pwa/busy.app.test.tsx` (nuovo)

**Interfaces:**
- Consumes: `trackBusy`, `useBusyCheck`, `registeredBusy`, `resetBusy` (Task 3).
- Produces: `StubBackend.holdSignOut(): () => void` (la prossima `signOut()` aspetta finché la
  funzione restituita non la conclude).

- [ ] **Step 1: `holdSignOut` nello stub**

In `web/src/test/stubBackend.ts`, nell'interfaccia `StubBackend`:

```ts
  /** The next signOut() waits until the returned function ends it. */
  holdSignOut(): () => void;
```

e nell'implementazione, nello stile di `holdChangePassword`:

```ts
  let heldSignOut: Promise<void> | null = null;
  // ...
    holdSignOut() {
      let end: () => void = () => {};
      heldSignOut = new Promise<void>((resolve) => (end = resolve));
      return end;
    },
```

La `signOut()` esistente, dopo aver contato la chiamata e prima del resto, aspetta
`heldSignOut` se presente (`const pending = heldSignOut; heldSignOut = null; if (pending) await pending;`);
se non è `async`, renderla tale lasciando invariato il resto.

- [ ] **Step 2: Test con i provider veri, che falliscono**

`web/src/pwa/busy.app.test.tsx`. Ogni test trattiene un'operazione vera e controlla
`registeredBusy()` (senza DOM: un foglio aperto o il focus non devono far passare il test da
soli). I passi d'interfaccia indicati con un commento `// as in <file>` si scrivono copiando i
ruoli, i nomi accessibili e il modo di trattenere le risposte da quel file di test esistente.

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeClients } from '../api/fake/fakeApi';
import { DEMO_FAMILY_ID } from '../api/fake/seed';
import { createMemoryStore, type KeyValueStore } from '../api/persister';
import { DEMO_USER } from '../auth/backend';
import { realMealsApp } from '../features/meals/testApp';
import { MONDAY } from '../features/shopping/fixtures';
import { createShoppingServer } from '../features/shopping/testServer';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';
import { createStubBackend } from '../test/stubBackend';
import { registeredBusy, resetBusy } from './busy';

afterEach(() => resetBusy());

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('busy page with the real providers (spec W8)', () => {
  it('is free on a quiet Menu', async () => {
    realMealsApp('/menu');
    await screen.findAllByRole('heading', { level: 1 });
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('is free on the sign-in page, where there is no shopping queue', async () => {
    renderApp('/', { backend: createStubBackend(null) });
    await screen.findByRole('button', { name: /accedi/i });
    expect(registeredBusy()).toBe(false);
  });
  it('a meal change is busy while sent and while «Annulla» is offered', async () => {
    realMealsApp('/menu');
    // as in features/meals/MealActions.test.tsx: hold the server's next meals answer,
    // open the pencil of the lunch and change the servings.
    await waitFor(() => expect(registeredBusy()).toBe(true));
    // release the held answer, as in MealActions.test.tsx
    await screen.findByRole('button', { name: 'Annulla' });
    expect(registeredBusy()).toBe(true);
  });
  it('a password change is busy until its answer', async () => {
    const backend = createStubBackend(DEMO_USER);
    const answer = backend.holdChangePassword();
    renderApp('/profile/password', { backend });
    // as in routes/profile/PasswordPage.test.tsx: fill the three fields and submit.
    await waitFor(() => expect(backend.changePasswordCalls).toHaveLength(1));
    expect(registeredBusy()).toBe(true);
    answer({ ok: true });
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a language change is busy until the profile answers', async () => {
    const held = deferred();
    const base = fakeClients({ latencyMs: 0 });
    const createApi: typeof base = (user) => (locale) => {
      const api = base(user)(locale);
      return { ...api, profile: { ...api.profile, update: async (input) => (await held.promise, api.profile.update(input)) } };
    };
    renderApp('/menu', { createApi, backend: createStubBackend(DEMO_USER), extra: <LanguageSwitch /> });
    await screen.findAllByRole('heading', { level: 1 });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'test: english' }));
    await waitFor(() => expect(registeredBusy()).toBe(true));
    held.resolve();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a sign-out is busy until the cleanup and backend.signOut() end', async () => {
    const backend = createStubBackend(DEMO_USER);
    const end = backend.holdSignOut();
    renderApp('/profile', { backend });
    // as in the existing «Esci» tests (session/SessionScope.test.tsx or the Profile page tests): press «Esci».
    await waitFor(() => expect(backend.signOutCalls).toBe(1));
    expect(registeredBusy()).toBe(true);
    end();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a shopping change is busy from the start of the device transaction, and while queued', async () => {
    const inner = createMemoryStore();
    let hold: ReturnType<typeof deferred> | null = null;
    const store: KeyValueStore = {
      ...inner,
      transact: async (prefixes, change) => {
        if (hold && prefixes.some((prefix) => prefix.startsWith('shopping-queue:'))) await hold.promise;
        return inner.transact(prefixes, change);
      }
    };
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(`/shopping/${MONDAY}?day=2026-10-14`, { store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    const box = await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    hold = deferred();
    server.holdNextWrite();
    fireEvent.click(box);
    // The record is not written yet: busy already.
    expect(registeredBusy()).toBe(true);
    hold.resolve();
    hold = null;
    // Queued and being sent (held by the server): busy.
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    expect(registeredBusy()).toBe(true);
  });
});
```

Se una delle pagine non è all'indirizzo usato qui (`/profile/password`, `/profile`, `/`),
usare quello dei test esistenti.

- [ ] **Step 3: Verificare che falliscano**

Run: `npm test -w web -- src/pwa/busy.app.test.tsx`
Expected: FAIL in tutti i casi «busy»; PASS nei due casi «free».

- [ ] **Step 4: Collegamenti**

`web/src/session/SessionScope.tsx` (import `trackBusy, useBusyCheck` da `../pwa/busy`):

- prima di `if (!session || !api || !value) return null;` (gli hook prima di ogni `return`):

```ts
  // A write in flight keeps the page from reloading into a new version (spec W8).
  useBusyCheck(() => (session ? session.queryClient.isMutating() > 0 : false));
```

- in `chooseLocale`, avvolgere la chiamata:

```ts
        const { view: saved, applied } = await trackBusy(
          runAreaMutation({ queryClient: session.queryClient, session, currentLocale }, 'profile.updateLocale', undefined, () =>
            client.profile.update({ locale: next })
          )
        );
```

`web/src/features/meals/UndoProvider.tsx` (import `useBusyCheck` da `../../pwa/busy`), dopo
`const slot = undoOf(useSession());`:

```ts
  // An offered «Annulla» keeps the page from reloading into a new version (spec W8).
  useBusyCheck(() => slot.get() !== null);
```

`web/src/features/shopping/ShoppingQueueProvider.tsx` (import `useBusyCheck` da
`../../pwa/busy`), dopo `useState`:

```ts
  // Busy until the record is read and while it holds operations; never without a person, or the
  // sign-in page would never update (a sign-out in progress is tracked by AuthProvider).
  useBusyCheck(() => Boolean(session.userId) && (queue === null || queue.record().ops.length > 0));
```

`web/src/features/shopping/queue/queue.ts` (import `trackBusy` da `../../../pwa/busy`):
rinominare la funzione `mutate` esistente in `mutateRecord` (corpo invariato) e aggiungere

```ts
  /** Every write of the record counts as busy from the start of the device transaction (spec W8). */
  function mutate<T>(change: (record: QueueRecord) => { next?: QueueRecord; value: T }, options?: { quiet?: boolean }): Promise<T> {
    return trackBusy(mutateRecord(change, options));
  }
```

e in `add` avvolgere tutto il corpo, perché aspetta `loading` prima della transazione:

```ts
    add(op, label) {
      return trackBusy(
        (async () => {
          if (!userId || gone()) throw new SessionClosedError();
          await loading;
          await mutate((record) => ({ next: { ...record, ops: enqueue(record.ops, { userId, queuedAt: now(), state: 'pending', label, op }) }, value: null }));
          if (isOnline()) void flush(true);
        })()
      );
    },
```

`web/src/routes/profile/PasswordPage.tsx` (import `trackBusy` da `../../pwa/busy`):

```ts
    const result = await trackBusy(backend.changePassword(values.current, values.next));
```

`web/src/auth/AuthProvider.tsx` (import `trackBusy` da `../pwa/busy`): avvolgere `signOut` dal
controllo iniziale alla fine:

```ts
  const signOut = useCallback(
    (userId: string, cleanup: () => Promise<void>) =>
      // From signedOut to the end of the cleanup and of backend.signOut(): busy (spec W8).
      trackBusy(
        (async () => {
          if (currentUser(stateRef.current) !== userId) return;
          closing.current = userId;
          commit({ status: 'signedOut' });
          try {
            await cleanup().catch(() => undefined);
            // Someone else signed in meanwhile (another tab): their session is not ours to end.
            if (stateRef.current.status !== 'signedOut') return;
            await backend.signOut();
          } catch {
            // Local data are already gone; the session is over on this device anyway.
          } finally {
            if (closing.current === userId) closing.current = null;
          }
        })()
      ),
    [backend, commit]
  );
```

- [ ] **Step 5: Verificare, con prove di rottura**

Run: `npm test -w web` e `npm run typecheck`
Expected: PASS.

Prove di rottura, una per volta, ripristinando dopo ciascuna: togliere `useBusyCheck` da
`UndoProvider`, da `ShoppingQueueProvider`, da `SessionScope`; togliere `trackBusy` da
`chooseLocale`, `PasswordPage`, `AuthProvider.signOut`, `queue.add`, `mutate`. Ogni volta deve
fallire il test corrispondente di `busy.app.test.tsx`. Annotare gli esiti per la PR.

- [ ] **Step 6: Commit**

```bash
git add web/src/pwa/busy.app.test.tsx web/src/session/SessionScope.tsx web/src/features/meals/UndoProvider.tsx web/src/features/shopping/ShoppingQueueProvider.tsx web/src/features/shopping/queue/queue.ts web/src/routes/profile/PasswordPage.tsx web/src/auth/AuthProvider.tsx web/src/test/stubBackend.ts
git commit -m "PWA: scritture, password, lingua, uscita, «Annulla» e coda della spesa rimandano l'aggiornamento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Aggiungere `web/src/test/rpcServer.ts` se è servito un metodo nuovo per trattenere le risposte.)

---

### Task 7: Verifica completa

- [ ] **Step 1: Suite, tipi, build**

Run: `npm test && npm run typecheck && npm run build -w web`
Expected: tutto verde. Annotare i numeri dei test per la PR.

- [ ] **Step 2: Controlli sulla build**

```bash
grep -q "skipWaiting" web/dist/sw.js && echo "sw ok"
grep -o '/assets/main-[A-Za-z0-9_-]*\.js' web/dist/index.html || echo "STOP: bundle not found"
```

Expected: `sw ok` e il nome del bundle.

---

### Task 8: Prova nel browser vero

**Files:**
- Modify: `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (solo se la prova
  rivela differenze dal comportamento descritto: correggere la spec, non la prova)

- [ ] **Step 1: Preparare le build**

```bash
SCRATCH=/private/tmp/claude-501/w8-builds          # la stessa del Task 1, con a0
for v in b c d e; do npm run build -w web && rm -rf "$SCRATCH/$v" && cp -R web/dist "$SCRATCH/$v"; done
serve() { rm -rf "$SCRATCH/served" && cp -R "$SCRATCH/$1" "$SCRATCH/served"; }
serve a0
(cd web && npx vite preview --outDir "$SCRATCH/served" --port 8768 --strictPort) &
```

Se `vite preview` non vede i file cambiati dopo `serve`, fermarlo e riavviarlo sullo stesso
porto dopo ogni `serve` (stessa origine, quindi stessa registrazione del worker).

- [ ] **Step 2: Prova con agent-browser** (skill `agent-browser`; se la sessione non risponde,
  `caffeinate` e una sessione nuova)

Versione della pagina:
`document.querySelector('script[type=module][src*="/assets/main-"]').getAttribute('src')`.
Versione del worker attivo: un `MessageChannel` con `{ type: 'version' }` al controller (da B in
poi; per A₀ `caches.keys()` e `registration.active.scriptURL`). Contare i ricaricamenti con
`performance.getEntriesByType('navigation')` e un contatore in `sessionStorage` scritto dalla
console a ogni caricamento osservato.

1. **A₀:** aprire `http://localhost:8768/menu`, aspettare `navigator.serviceWorker.controller`
   (ricaricare una volta: la prima visita non è controllata); aprire la Spesa.
2. **A₀ → B:** `serve b`; ricaricare: si vede ancora A₀; aspettare che il worker attivo dica la
   versione di B; navigare Menu → Ricettario → Spesa nella pagina A₀ (funziona). Ricaricare: si
   vede B; a rete spenta la lista è visibile; riaccendere.
3. **B → C:** `serve c`; `document.dispatchEvent(new Event('visibilitychange'))` senza toccare la
   pagina: entro pochi secondi la pagina è C, stesso indirizzo.
4. **Rollback C → B:** `serve b`; ritorno simulato: il worker B si reinstalla, la pagina passa a
   B una volta sola; nei 30 secondi seguenti nessun altro ricaricamento.
5. **Pagina occupata che salta una versione:** cambiare le porzioni di un pasto (compare
   «Annulla») e subito `serve d`, ritorno simulato, poi `serve e`, ritorno simulato: nessun
   passaggio mentre «Annulla» è visibile; font e icone a posto. Scaduto «Annulla», senza
   toccare, ritorno simulato: la pagina passa a E.
6. **Coda non vuota:** rete spenta, spuntare una voce della spesa; `serve c` (versione diversa
   da E); rete accesa e ritorno simulato subito: la pagina non passa finché la coda non è
   inviata; al ritorno simulato successivo passa a C e la voce resta spuntata.
7. **Offline:** rete spenta, riaprire `/menu` e la Spesa: shell dalla cache, lista visibile.

Annotare per ogni passo l'esito e le versioni viste; salvare uno screenshot dei passi 2, 3, 4
e 7. La sessione Supabase vera non si prova qui (backend finto): resta nel collaudo
sull'iPhone.

- [ ] **Step 3: Chiudere il server e controllare il worktree**

```bash
kill %1 2>/dev/null; git status --short
```

Expected: nessun file non tracciato.

- [ ] **Step 4: Commit (solo se la spec è cambiata)**

```bash
git add progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md
git commit -m "Aggiornamento della PWA: spec allineata alla prova nel browser

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Poi push e PR secondo il protocollo dei worker (fase 6), con gli esiti della prova, delle prove
di rottura e i numeri dei test nella descrizione.

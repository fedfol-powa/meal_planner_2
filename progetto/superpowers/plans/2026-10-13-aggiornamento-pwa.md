# Aggiornamento della PWA installata (W8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** con la rete, aprire o riportare in primo piano la PWA installata porta alla versione
pubblicata, senza perdere scritture, sessione o lista della spesa offline (issue #42).

**Architecture:** le navigazioni restano servite dalla shell installata del worker attivo. La
build mette in `sw.js` la propria versione e l'elenco dei file, e in `index.html` la versione;
il worker installa solo file verificati della propria versione, scrive in cache per ultimo un
segno di completezza, prende il controllo con `skipWaiting` e conserva le ultime tre cache. La
pagina chiede aggiornamenti all'avvio e al ritorno visibile e si ricarica quando il worker attivo
ha una versione diversa, solo se libera, visibile e non toccata, con un limite contro i
tentativi senza convergenza. Il `buster` della copia persistita diventa una costante di forma.

**Tech Stack:** TypeScript, React 19, Vite 8 (Rolldown), Vitest 4 (jsdom e Node), TanStack Query
persist client, Service Worker e Cache Storage API, agent-browser per la prova nel browser.

**Spec:** `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (leggila prima di
iniziare); specifica principale `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`,
sezioni 1, 6, 15, 16. Revisioni: `progetto/coordinamento/revisioni/w8-spec-piano.md`,
`w8-spec-piano-2.md`.

## Global Constraints

- Nessuna libreria nuova: service worker scritto a mano, niente Workbox, niente Playwright.
- Codice, commenti e test in inglese; documenti e messaggi di commit in italiano; ogni commit
  termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Navigazioni **sempre** dalla shell installata (nessuna navigazione dalla rete, nessun
  timeout, nessuna guardia in `index.html`).
- Precache: elenco dentro `sw.js` (segnaposto `['__PRECACHE_LIST__']`), versione in
  `<meta name="app-version">`, segno di completezza `COMPLETE_URL = '/__precache-complete'`
  scritto per ultimo; `/precache.json` non esiste più.
- Cache conservate: la corrente più le **due** più recenti fra le altre.
- Timeout della domanda di versione: **1000 ms**; segno dei tentativi in `sessionStorage`:
  chiave `pwa-reload`, valore `<versione pagina>><versione worker>`, cancellato quando pagina e
  worker sono allineati.
- `CACHE_SCHEMA = '1'`; i `buster` in forma di data ISO valgono **sempre** `'1'`.
- Rotte del server mai intercettate.
- Non toccare il server, la specifica principale, il piano generale, `main` o altri worktree;
  nessun rilascio.
- Comandi dalla radice del worktree `.worktrees/pwa`: test web con
  `npm test -w web -- <file>`, tutto con `npm test`, tipi con `npm run typecheck`, build con
  `npm run build -w web`. Il bundle si chiama `/assets/main-<hash>.js`.

## Review Focus

1. **Rilascio cambiato durante l'installazione** (sw.js di una build, HTML o asset di un'altra):
   installazione fallita, nessuna cache, worker precedente in servizio. → Task 2.
2. **Cache completa già presente durante un tentativo fallito:** resta identica. → Task 2.
3. **Ripubblicazione dopo un rollback (B → C → B → C):** ogni passaggio avviene; un
   ricaricamento senza progresso non si ripete. → Task 4.
4. **Registrazione iniziale fallita:** recuperata al ritorno visibile. → Task 4.
5. **Finestre distinte di «occupata»** (pulizia del logout, transazione della coda, coda non
   vuota): ciascuna protetta e provata da sola. → Task 6.

---

## File Structure

- `web/src/pwa/precache.ts` (modifica): `injectPrecache`.
- `web/vite.config.ts` (modifica): plugin che inserisce l'elenco in `sw.js` e `app-version` in
  `index.html`, al posto di `/precache.json`.
- `web/src/pwa/sw-rules.ts` (modifica): `staleCaches` tiene le ultime tre; `COMPLETE_URL`; via
  `PRECACHE_URL` e `/precache.json`.
- `web/src/pwa/sw-core.ts` (modifica): installazione verificata e atomica, `skipWaiting`,
  `handleMessage` per la versione.
- `web/src/pwa/sw.ts` (modifica): elenco, `skipWaiting`, `message`.
- `web/src/pwa/busy.ts` (nuovo): `trackBusy`, registro di controlli, controlli sul DOM, hook.
- `web/src/pwa/update-rules.ts` (nuovo): `claimReload`, `settleReload`.
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

### Task 2: Precache legato alla build, installazione verificata e versione del worker

**Files:**
- Modify: `web/src/pwa/precache.ts`, `web/vite.config.ts`, `web/src/pwa/sw-rules.ts`,
  `web/src/pwa/sw-core.ts`, `web/src/pwa/sw.ts`
- Test: `web/src/pwa/precache.test.ts`, `web/src/pwa/sw-rules.test.ts`, `web/src/pwa/sw-core.test.ts`

**Interfaces:**
- Consumes: `staleCaches` (Task 1).
- Produces:
  - `injectPrecache(code: string, list: string[]): string` in `precache.ts`;
  - `COMPLETE_URL = '/__precache-complete'` in `sw-rules.ts` (via `PRECACHE_URL`);
  - `WorkerDeps` con i campi `precache: string[]` (obbligatorio) e
    `skipWaiting?: () => Promise<void>`;
  - `interface MessagePortLike { postMessage(message: unknown): void }`;
  - `handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): void`;
  - protocollo: pagina → worker `{ type: 'version' }` con una porta; worker → porta
    `{ type: 'version', version: string }`;
  - `index.html` costruito con `<meta name="app-version" content="<__BUILD_VERSION__>">`.

- [ ] **Step 1: Test di `injectPrecache` che fallisce**

In `web/src/pwa/precache.test.ts` cambiare l'import in `import { injectPrecache, precacheList } from './precache';`, aggiungere `describe` agli import di vitest se serve, e aggiungere:

```ts
it('puts the precache list into the built worker in place of its one placeholder', () => {
  const list = ['/index.html', '/assets/main-a1.js'];
  expect(injectPrecache('const p=["__PRECACHE_LIST__"];run(p)', list)).toBe('const p=["/index.html","/assets/main-a1.js"];run(p)');
  expect(injectPrecache("const p = [ '__PRECACHE_LIST__' ];", list)).toBe('const p = ["/index.html","/assets/main-a1.js"];');
});
it('fails the build without the placeholder or with more than one', () => {
  expect(() => injectPrecache('const p=[];', ['/index.html'])).toThrow(/placeholder/);
  expect(() => injectPrecache('a=["__PRECACHE_LIST__"];b=["__PRECACHE_LIST__"]', ['/index.html'])).toThrow(/placeholder/);
});
```

Run: `npm test -w web -- src/pwa/precache.test.ts` → FAIL.

- [ ] **Step 2: `injectPrecache` e plugin della build**

In `web/src/pwa/precache.ts` aggiungere:

```ts
const PLACEHOLDER = /\[\s*(["'])__PRECACHE_LIST__\1\s*\]/g;

/**
 * Puts the precache list into the built sw.js in place of `['__PRECACHE_LIST__']`: the worker
 * carries its own list, never one read from the network at install (spec W8). Fails the build
 * when the placeholder is missing or repeated.
 */
export function injectPrecache(code: string, list: string[]): string {
  const found = code.match(PLACEHOLDER)?.length ?? 0;
  if (found !== 1) throw new Error(`sw.js: expected one precache placeholder, found ${found}`);
  return code.replace(PLACEHOLDER, JSON.stringify(list));
}
```

In `web/vite.config.ts`: importare `injectPrecache` accanto a `precacheList` e sostituire il plugin `precacheManifest` con:

```ts
/**
 * The worker and the page carry their build (spec W8): sw.js gets the list of files it installs,
 * index.html its version, which the worker checks at install. No /precache.json any more.
 */
function pwaBuild(): Plugin {
  return {
    name: 'pwa-build',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-version', content: buildVersion }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      const worker = bundle['sw.js'];
      if (!worker || worker.type !== 'chunk') return this.error('sw.js is missing from the bundle');
      worker.code = injectPrecache(worker.code, precacheList(Object.keys(bundle), readdirSync(fontsDir)));
    }
  };
}
```

e `plugins: [react(), pwaBuild()]`. Aggiornare il commento di `buildVersion` («cache names, the
version checked at install and the build of sw.js»).

Se Rolldown non applica la modifica di `worker.code` in `generateBundle` (verifica nello Step 9),
spostare la stessa sostituzione in `writeBundle`, leggendo e riscrivendo `<outDir>/sw.js` con
`readFileSync`/`writeFileSync`, sempre con `injectPrecache`.

Run: `npm test -w web -- src/pwa/precache.test.ts` → PASS.

- [ ] **Step 3: Regole**

In `web/src/pwa/sw-rules.ts`: togliere `PRECACHE_URL` e `'/precache.json'` da `SERVER_PREFIXES`; aggiungere:

```ts
/** Written last in a version's cache: without it the cache is an interrupted attempt (spec W8). */
export const COMPLETE_URL = '/__precache-complete';
```

In `web/src/pwa/sw-rules.test.ts` togliere la riga `expect(strategyFor(req('/precache.json'))).toBe('passthrough');`
(il file non esiste più; la regola resta comunque `passthrough` perché fuori da `/assets/`).

- [ ] **Step 4: Fixture dei test del worker**

In `web/src/pwa/sw-core.test.ts`:

1. import:

```ts
import { describe, expect, it, vi } from 'vitest';
import { activate, handleMessage, install, respond, type CacheLike, type CachesLike, type WorkerDeps } from './sw-core';
import { COMPLETE_URL } from './sw-rules';
```

2. `memoryCaches` accetta un'opzione per far fallire una scrittura e restituisce anche il contenuto di una cache, per confrontarlo:

```ts
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
        store.set(keyOf(request), response);
      }
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
```

3. build e dipendenze:

```ts
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
```

4. Nei test esistenti: sostituire ogni `{ caches, fetch: X, version: 'V', origin }` con
   `depsFor(buildV, 'V', caches, X)` (stessa build della versione: `buildA` per `'A'`,
   `buildB` per `'B'`), sostituire ogni `toBe('index X')` con `toContain('index X')`, e nel
   test del redirect lasciare la logica (ora la risposta salvata è nuova per costruzione). Il
   test `updates A→B keeping A until B is complete` resta con la riga adeguata nel Task 1.

- [ ] **Step 5: Test nuovi che falliscono**

In fondo a `sw-core.test.ts`:

```ts
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
```

Il test esistente `serves the installed shell online even after a new deploy` resta: è la
garanzia che le navigazioni non vengono dalla rete.

Run: `npm test -w web -- src/pwa/sw-core.test.ts` → FAIL (nessun `precache` in `WorkerDeps`, nessun controllo della versione, nessun segno, nessuna `handleMessage`).

- [ ] **Step 6: Implementazione in `sw-core.ts`**

Import da `./sw-rules`: `cacheName, COMPLETE_URL, SHELL_URL, staleCaches, strategyFor` (via `PRECACHE_URL`).

`WorkerDeps`:

```ts
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
```

Al posto di `install`:

```ts
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
```

Dopo `activate`:

```ts
export interface MessagePortLike { postMessage(message: unknown): void }

/** The page asks the version of the worker in control, on the port of a MessageChannel (spec W8). */
export function handleMessage(data: unknown, ports: readonly MessagePortLike[], deps: WorkerDeps): void {
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'version') return;
  ports[0]?.postMessage({ type: 'version', version: deps.version });
}
```

`respond` resta com'è.

- [ ] **Step 7: `sw.ts`**

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
```

- [ ] **Step 8: Verificare i test, con prove di rottura**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS.

Prove di rottura, una per volta, ripristinando: togliere il confronto `versionOf(html) !== deps.version`
(deve fallire `release changed between sw.js and HTML`); togliere il ramo di riuso (deve fallire
`reuses a complete cache`); scrivere in cache prima di scaricare tutto, cioè dentro il `map`
(deve fallire `release changed between HTML and assets` o `a write failing`).

- [ ] **Step 9: Verificare la build**

```bash
npm run build -w web
grep -c "__PRECACHE_LIST__" web/dist/sw.js            # atteso 0
grep -o '"/assets/main-[A-Za-z0-9_-]*\.js"' web/dist/sw.js   # atteso: il bundle nell'elenco
grep -o '<meta name="app-version" content="[^"]*"' web/dist/index.html
test ! -e web/dist/precache.json && echo "no precache.json"
node -e "const fs=require('fs');const v=fs.readFileSync('web/dist/index.html','utf8').match(/app-version\" content=\"([^\"]+)/)[1];if(!fs.readFileSync('web/dist/sw.js','utf8').includes(v))process.exit(1);console.log('same version',v)"
```

Expected: `0`, il bundle, la meta, `no precache.json`, `same version …`.

- [ ] **Step 10: Commit**

```bash
git add web/src/pwa/precache.ts web/src/pwa/precache.test.ts web/vite.config.ts web/src/pwa/sw-rules.ts web/src/pwa/sw-rules.test.ts web/src/pwa/sw-core.ts web/src/pwa/sw-core.test.ts web/src/pwa/sw.ts
git commit -m "PWA: precache legato alla build, installazione verificata e atomica, versione del worker

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
  - `type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`;
  - `claimReload(storage: StorageLike | null, pageVersion: string, workerVersion: string): boolean`;
  - `settleReload(storage: StorageLike | null): void`;
  - `startUpdates(env: UpdateEnv): Promise<void>` con
    `UpdateEnv = { container: ContainerLike; document: DocumentLike; loaded: Promise<void>; storage: StorageLike | null; reload: () => void; pageVersion: string; isBusy: () => boolean; askTimeoutMs?: number }`
    e `ContainerLike` con `controller`, `register(url, { updateViaCache: 'none' })`,
    `getRegistration()`;
  - `registerServiceWorker(): void` (stesso nome di prima, ora in `update.ts`).

- [ ] **Step 1: Test delle regole**

`web/src/pwa/update-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { claimReload, settleReload } from './update-rules';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items
  };
}

describe('reload attempts', () => {
  it('allows a reload, then refuses the same one without progress', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    // Reloaded, still B under C: the reload did not converge.
    expect(claimReload(storage, 'B', 'C')).toBe(false);
  });
  it('allows the same pair again once page and worker were aligned (B → C → B → C)', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    settleReload(storage); // the page is C under C
    expect(claimReload(storage, 'C', 'B')).toBe(true);
    settleReload(storage); // B under B
    expect(claimReload(storage, 'B', 'C')).toBe(true);
  });
  it('a different pair is progress', () => {
    const storage = memoryStorage();
    expect(claimReload(storage, 'B', 'C')).toBe(true);
    expect(claimReload(storage, 'B', 'D')).toBe(true);
  });
  it('never reloads without a working sessionStorage', () => {
    expect(claimReload(null, 'A', 'B')).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      }
    };
    expect(claimReload(throwing, 'A', 'B')).toBe(false);
    expect(() => settleReload(throwing)).not.toThrow();
  });
});
```

- [ ] **Step 2: Verificare che fallisca, poi implementare `update-rules.ts`**

Run: `npm test -w web -- src/pwa/update-rules.test.ts` → FAIL.

```ts
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'pwa-reload';

/**
 * Protection against reloads without convergence (spec W8): the pair of the last automatic
 * reload stays in sessionStorage until page and worker are aligned. The same pair again means the
 * last reload made no progress: no reload. No working storage: no reload at all.
 */
export function claimReload(storage: StorageLike | null, pageVersion: string, workerVersion: string): boolean {
  if (!storage) return false;
  const pair = `${pageVersion}>${workerVersion}`;
  try {
    if (storage.getItem(KEY) === pair) return false;
    storage.setItem(KEY, pair);
    return true;
  } catch {
    return false;
  }
}

/** Page and worker of the same version: the attempt is over. */
export function settleReload(storage: StorageLike | null): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to do: claimReload refuses without a working storage anyway.
  }
}
```

Run di nuovo: PASS.

- [ ] **Step 3: Test del ciclo**

`web/src/pwa/update.test.ts`. Le risposte del worker sono **trattenute**: il test decide quando
arrivano, una alla volta o tutte. Lo stesso `sessionStorage` si può passare a più «documenti»
(un `world` per ogni caricamento della pagina).

```ts
import { describe, expect, it, vi } from 'vitest';
import { startUpdates, type ContainerLike, type DocumentLike } from './update';

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
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items
  };
}

type Options = {
  page?: string;
  worker?: ReturnType<typeof heldWorker> | null;
  storage?: ReturnType<typeof memoryStorage>;
  busy?: boolean;
  updateFails?: boolean;
  /** How many register() calls fail before one succeeds. */
  registerFailures?: number;
  existing?: boolean;
};

function world(options: Options = {}) {
  const page = options.page ?? 'v-page';
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState }) as EventTarget & DocumentLike & { visibilityState: DocumentVisibilityState };
  const update = vi.fn(async () => {
    if (options.updateFails) throw new TypeError('Failed to fetch');
  });
  let failures = options.registerFailures ?? 0;
  let worker: ReturnType<typeof heldWorker> | null = options.worker === undefined ? heldWorker(page) : options.worker;
  const container = Object.assign(new EventTarget(), {
    register: vi.fn(async () => {
      if (failures > 0) {
        failures -= 1;
        throw new TypeError('Failed to fetch');
      }
      return { update };
    }),
    getRegistration: vi.fn(async () => (options.existing ? { update } : undefined))
  }) as EventTarget & ContainerLike;
  Object.defineProperty(container, 'controller', { get: () => worker });
  let markLoaded!: () => void;
  const loaded = new Promise<void>((resolve) => (markLoaded = resolve));
  const state = { busy: options.busy ?? false };
  const reload = vi.fn();
  const storage = options.storage ?? memoryStorage();
  const env = { container, document: doc, loaded, storage, reload, pageVersion: page, isBusy: () => state.busy, askTimeoutMs: 1000 };
  return {
    env, doc, container, update, state, reload, storage,
    get worker() {
      return worker!;
    },
    begin() {
      return startUpdates(env);
    },
    load() {
      markLoaded();
    },
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

/** Starts a world and delivers the answer of the start check. */
async function started(w: ReturnType<typeof world>) {
  const run = w.start();
  await tick();
  await w.worker.answer();
  await run;
}

describe('page updates', () => {
  it('registers bypassing the HTTP cache, checks for updates at start, stays on the same version', async () => {
    const w = world();
    await started(w);
    expect(w.container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(w.update).toHaveBeenCalledTimes(1);
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a new worker taking over a free, untouched page reloads it once', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a busy page waits; back in the foreground and free, it checks for updates and reloads', async () => {
    const w = world({ worker: heldWorker('v-new'), busy: true });
    await started(w);
    expect(w.reload).not.toHaveBeenCalled();
    w.state.busy = false;
    w.hidden();
    w.visible();
    await tick();
    expect(w.update).toHaveBeenCalledTimes(2);
    await w.worker.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a touch while waiting for the answer stops the reload, at start and back in the foreground', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const run = w.start();
    await tick();
    w.touch();
    await w.worker.answer();
    await run;
    expect(w.reload).not.toHaveBeenCalled();
    w.hidden();
    w.visible();
    await tick();
    w.touch();
    await w.worker.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a touch on controllerchange stops the reload until the next return', async () => {
    const w = world();
    await started(w);
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
    const run = w.begin();
    w.touch();
    await tick();
    expect(w.container.register).not.toHaveBeenCalled();
    w.load();
    await tick();
    await w.worker.answer();
    await run;
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page hidden while waiting for the answer does not reload', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    w.doc.visibilityState = 'hidden'; // hidden without the event: the check must look again
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page that became busy while waiting for the answer does not reload', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    w.state.busy = true;
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a check overtaken by controllerchange is dropped, and the new check decides', async () => {
    const w = world();
    await started(w);
    const first = w.takeOver('v-1');
    await tick();
    const second = w.takeOver('v-2');
    await tick();
    await first.answer();
    expect(w.reload).not.toHaveBeenCalled();
    await second.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(w.storage.items.get('pwa-reload')).toBe('v-page>v-2');
  });
  it('a check overtaken by a new return to the foreground is dropped', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const run = w.start();
    await tick();
    w.hidden();
    w.visible();
    await tick();
    expect(w.worker.pending).toHaveLength(2);
    // The start check's answer arrives first: overtaken, dropped even though the page is free.
    await w.worker.answerFirst();
    expect(w.reload).not.toHaveBeenCalled();
    await w.worker.answerFirst();
    await run;
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('B → C → B → C across documents with the same sessionStorage: every step happens', async () => {
    const storage = memoryStorage();
    // Document 1: page B, worker C takes over.
    const one = world({ page: 'B', storage });
    await started(one);
    const c = one.takeOver('C');
    await tick();
    await c.answer();
    expect(one.reload).toHaveBeenCalledTimes(1);
    // Document 2: page C under C (aligned), then the rollback to B takes over.
    const two = world({ page: 'C', worker: heldWorker('C'), storage });
    await started(two);
    expect(storage.items.has('pwa-reload')).toBe(false);
    const b = two.takeOver('B');
    await tick();
    await b.answer();
    expect(two.reload).toHaveBeenCalledTimes(1);
    // Document 3: page B under B, then C is published again.
    const three = world({ page: 'B', worker: heldWorker('B'), storage });
    await started(three);
    const again = three.takeOver('C');
    await tick();
    await again.answer();
    expect(three.reload).toHaveBeenCalledTimes(1);
  });
  it('a reload without progress is not repeated', async () => {
    const storage = memoryStorage();
    const one = world({ page: 'B', worker: heldWorker('C'), storage });
    await started(one);
    expect(one.reload).toHaveBeenCalledTimes(1);
    // The reload brought B again under C (no convergence): no second reload, at start or back.
    const two = world({ page: 'B', worker: heldWorker('C'), storage });
    await started(two);
    two.hidden();
    two.visible();
    await tick();
    await two.worker.answer();
    expect(two.reload).not.toHaveBeenCalled();
  });
  it('a failed first registration is recovered back in the foreground, and the update arrives', async () => {
    const w = world({ registerFailures: 1 });
    await started(w);
    expect(w.update).not.toHaveBeenCalled();
    // The network is back; the app returns to the foreground.
    w.hidden();
    w.visible();
    await tick();
    await w.worker.answer();
    expect(w.container.register).toHaveBeenCalledTimes(2);
    expect(w.update).toHaveBeenCalledTimes(1);
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('uses the existing registration when register fails', async () => {
    const w = world({ registerFailures: 1, existing: true });
    await started(w);
    expect(w.container.getRegistration).toHaveBeenCalled();
    expect(w.update).toHaveBeenCalledTimes(1);
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
  it('offline: failing registration and update checks leave no unhandled error and no reload', async () => {
    const w = world({ updateFails: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await started(w);
    w.hidden();
    w.visible();
    await tick();
    await w.worker.answer();
    const failing = world({ registerFailures: 5 });
    await started(failing);
    failing.hidden();
    failing.visible();
    await tick();
    await failing.worker.answer();
    await tick();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(w.reload).not.toHaveBeenCalled();
    expect(failing.reload).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Verificare che fallisca**

Run: `npm test -w web -- src/pwa/update.test.ts`
Expected: FAIL (modulo mancante).

- [ ] **Step 5: Implementare `update.ts`**

```ts
import { isBusy } from './busy';
import { claimReload, settleReload, type StorageLike } from './update-rules';

interface WorkerLike { postMessage(message: unknown, transfer: MessagePort[]): void }
interface RegistrationLike { update(): Promise<unknown> }
export interface ContainerLike extends EventTarget {
  readonly controller: WorkerLike | null;
  register(url: string, options: { updateViaCache: 'none' }): Promise<RegistrationLike>;
  getRegistration(): Promise<RegistrationLike | undefined>;
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
 * at every controllerchange it asks the worker's version. Aligned: the reload attempt is over.
 * Different: it reloads, only if the page is visible, untouched since the last return and not
 * busy, checked after the answer, and never twice for an attempt without progress. Back in the
 * foreground it also makes sure of the registration and asks the browser to check /sw.js.
 */
export async function startUpdates(env: UpdateEnv): Promise<void> {
  let interacted = false;
  let generation = 0;
  let registration: RegistrationLike | undefined;
  const free = () => env.document.visibilityState === 'visible' && !interacted && !env.isBusy();
  const ensureRegistration = async () => {
    if (registration) return;
    try {
      registration = await env.container.register('/sw.js', { updateViaCache: 'none' });
    } catch {
      registration = await env.container.getRegistration().catch(() => undefined);
    }
  };
  const update = async () => {
    await ensureRegistration();
    await registration?.update().catch(() => undefined);
  };
  const check = async () => {
    const started = generation;
    const controller = env.container.controller;
    if (!controller) return;
    const workerVersion = await askVersion(controller, env.askTimeoutMs ?? 1000);
    if (started !== generation || workerVersion === null) return;
    if (workerVersion === env.pageVersion) return settleReload(env.storage);
    if (!free()) return;
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
    void update();
  });
  env.container.addEventListener('controllerchange', () => {
    generation += 1;
    void check();
  });
  await env.loaded;
  await update();
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

Note per i test: `update()` all'avvio chiama `register` (che può fallire) e poi
`registration.update()`; al ritorno visibile `ensureRegistration` ritenta solo se manca. Nel test
`a failed first registration…` all'avvio `register` fallisce e `getRegistration` non trova
nulla: `update` non viene chiamato; al ritorno visibile `register` riesce e `update` sì.

- [ ] **Step 6: Togliere `register.ts` e aggiornare `main.tsx`**

```bash
git rm web/src/pwa/register.ts
```

In `web/src/main.tsx` cambiare `import { registerServiceWorker } from './pwa/register';` in `import { registerServiceWorker } from './pwa/update';`.

- [ ] **Step 7: Verificare, con prove di rottura**

Run: `npm test -w web -- src/pwa/` e `npm run typecheck`
Expected: PASS.

Prove di rottura, una per volta, ripristinando dopo ciascuna:
- togliere `if (!free()) return;`: devono fallire `touch while waiting`, `hidden while waiting`,
  `busy while waiting`;
- togliere `started !== generation`: devono fallire i due test `overtaken`;
- togliere `settleReload` (solo `return` quando allineati): deve fallire `B → C → B → C`;
- sostituire `claimReload(...)` con `true`: deve fallire `a reload without progress`;
- togliere il ritentativo (`if (registration) return;` sostituito da un solo `register` all'avvio):
  deve fallire `a failed first registration`.

- [ ] **Step 8: Commit**

```bash
git add web/src/pwa/update-rules.ts web/src/pwa/update-rules.test.ts web/src/pwa/update.ts web/src/pwa/update.test.ts web/src/main.tsx
git commit -m "PWA: la pagina segue il worker attivo quando è libera, con limite ai tentativi senza convergenza

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

Ogni finestra ha **una** protezione, e il suo test la prova da sola: nel momento osservato
nessun'altra protezione è attiva.

| Finestra | Protezione | Test |
|---|---|---|
| mutazione dei pasti in volo | `isMutating()` in `SessionScope` | risposta trattenuta |
| «Annulla» offerto | controllo in `UndoProvider` | dopo la risposta |
| cambio della password | `trackBusy` in `PasswordPage` | `holdChangePassword` |
| cambio della lingua | `trackBusy` in `chooseLocale` | `profile.update` trattenuto |
| uscita: pulizia | `trackBusy` in `AuthProvider.signOut` | scritture del dispositivo trattenute |
| uscita: `backend.signOut()` | lo stesso `trackBusy` | `holdSignOut` |
| scrittura del record della coda | `trackBusy` in `mutate` di `queue.ts` | transazione trattenuta, operazioni ancora vuote |
| coda con operazioni | controllo in `ShoppingQueueProvider` | invio trattenuto dal server, nessuna transazione in corso |

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
import { QUEUE_PREFIX } from '../features/shopping/storage';
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

/** A device store whose writes (transactions and deletes) matching `when` wait while held. */
function holdingStore(when: (prefixes: string[]) => boolean) {
  const inner = createMemoryStore();
  let held: ReturnType<typeof deferred> | null = null;
  const store: KeyValueStore = {
    ...inner,
    transact: async (prefixes, change) => {
      if (held && when(prefixes)) await held.promise;
      return inner.transact(prefixes, change);
    },
    delete: async (key) => {
      if (held && when([key])) await held.promise;
      return inner.delete(key);
    }
  };
  return {
    store,
    hold() {
      held = deferred();
    },
    release() {
      held?.resolve();
      held = null;
    }
  };
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
  it('a meal change in flight is busy (mutation window)', async () => {
    realMealsApp('/menu');
    // as in features/meals/MealActions.test.tsx: hold the server's next meals answer,
    // open the pencil of the lunch and change the servings.
    await waitFor(() => expect(registeredBusy()).toBe(true));
  });
  it('an offered «Annulla» is busy after the answer (undo window)', async () => {
    realMealsApp('/menu');
    // as in features/meals/MealActions.test.tsx: change the servings and let the answer arrive.
    await screen.findByRole('button', { name: 'Annulla' });
    // No mutation in flight any more: only the undo check protects this moment.
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
  it('a sign-out is busy during the cleanup, then during backend.signOut(), then free', async () => {
    const device = holdingStore(() => true);
    const backend = createStubBackend(DEMO_USER);
    const end = backend.holdSignOut();
    renderApp('/profile', { backend, store: device.store });
    await screen.findAllByRole('heading', { level: 1 });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    device.hold();
    // as in the existing «Esci» tests (session/SessionScope.test.tsx or the Profile page tests): press «Esci».
    // Cleanup held: backend.signOut() not reached yet.
    await waitFor(() => expect(registeredBusy()).toBe(true));
    expect(backend.signOutCalls).toBe(0);
    device.release();
    await waitFor(() => expect(backend.signOutCalls).toBe(1));
    expect(registeredBusy()).toBe(true);
    end();
    await waitFor(() => expect(registeredBusy()).toBe(false));
  });
  it('a shopping change is busy while its record is written, before any operation is in the record', async () => {
    const device = holdingStore((prefixes) => prefixes.some((prefix) => prefix.startsWith(QUEUE_PREFIX)));
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(`/shopping/${MONDAY}?day=2026-10-14`, { store: device.store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    const box = await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });
    await waitFor(() => expect(registeredBusy()).toBe(false));
    device.hold();
    fireEvent.click(box);
    // The transaction is held: the record has no operation yet, only mutate's trackBusy protects.
    await waitFor(() => expect(registeredBusy()).toBe(true));
    device.release();
  });
  it('a shopping change waiting to be sent is busy with no device write running', async () => {
    const device = holdingStore(() => false);
    const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
    renderApp(`/shopping/${MONDAY}?day=2026-10-14`, { store: device.store, createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
    const box = await screen.findByRole('checkbox', { name: 'Preso o già in casa: Pomodori' });
    server.holdNextWrite();
    fireEvent.click(box);
    // Sent and held by the server: the record writes are over, only the queue check protects.
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registeredBusy()).toBe(true);
  });
});
```

Se una delle pagine non è all'indirizzo usato qui (`/profile/password`, `/profile`, `/`),
usare quello dei test esistenti. Se `holdingStore(() => true)` trattiene anche scritture
precedenti all'uscita (il persister scrive la copia), chiamare `device.hold()` solo subito prima
di premere «Esci», come sopra, e verificare che nessuna scrittura della copia sia in corso in quel
momento (attendere `registeredBusy()` falso prima).

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
  /**
   * Every write of the record counts as busy from the start of the device transaction (spec W8).
   * `add` is called only once the queue is read, so its wait for `loading` opens no window.
   */
  function mutate<T>(change: (record: QueueRecord) => { next?: QueueRecord; value: T }, options?: { quiet?: boolean }): Promise<T> {
    return trackBusy(mutateRecord(change, options));
  }
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

Prove di rottura, una per volta, ripristinando dopo ciascuna; ognuna deve far fallire il test
della propria finestra (tabella sopra):
- togliere `useBusyCheck` da `SessionScope` → «meal change in flight»;
- togliere `useBusyCheck` da `UndoProvider` → «offered Annulla»;
- togliere `trackBusy` da `PasswordPage` → «password change»;
- togliere `trackBusy` da `chooseLocale` → «language change»;
- avvolgere con `trackBusy` solo `backend.signOut()` invece di tutto `signOut` → «sign-out»
  (fase della pulizia);
- togliere `trackBusy` da `mutate` → «while its record is written»;
- togliere `useBusyCheck` da `ShoppingQueueProvider` → «waiting to be sent».

Annotare gli esiti per la PR.

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
grep -c "__PRECACHE_LIST__" web/dist/sw.js                      # 0
grep -o '/assets/main-[A-Za-z0-9_-]*\.js' web/dist/index.html || echo "STOP: bundle not found"
test ! -e web/dist/precache.json && echo "no precache.json"
```

Expected: `sw ok`, `0`, il nome del bundle, `no precache.json`.

---

### Task 8: Prova nel browser vero

**Files:**
- Modify: `progetto/superpowers/specs/2026-10-13-aggiornamento-pwa.md` (solo se la prova
  rivela differenze dal comportamento descritto: correggere la spec, non la prova)

- [ ] **Step 1: Preparare le build**

```bash
SCRATCH=/private/tmp/claude-501/w8-builds          # la stessa del Task 1, con a0
for v in b c d e; do npm run build -w web && rm -rf "$SCRATCH/$v" && cp -R web/dist "$SCRATCH/$v"; done
# Mixed release for step 7: sw.js of d with index.html (and assets) of e.
rm -rf "$SCRATCH/mixed" && cp -R "$SCRATCH/e" "$SCRATCH/mixed" && cp "$SCRATCH/d/sw.js" "$SCRATCH/mixed/sw.js"
serve() { rm -rf "$SCRATCH/served" && cp -R "$SCRATCH/$1" "$SCRATCH/served"; }
serve a0
(cd web && npx vite preview --outDir "$SCRATCH/served" --port 8768 --strictPort) &
```

Se `vite preview` non vede i file cambiati dopo `serve`, fermarlo e riavviarlo sullo stesso
porto dopo ogni `serve` (stessa origine, quindi stessa registrazione del worker).

- [ ] **Step 2: Prova con agent-browser** (skill `agent-browser`; se la sessione non risponde,
  `caffeinate` e una sessione nuova)

Versione della pagina: `document.querySelector('meta[name=app-version]')?.content` (da B in
poi) e `document.querySelector('script[type=module][src*="/assets/main-"]').getAttribute('src')`.
Versione del worker attivo: un `MessageChannel` con `{ type: 'version' }` al controller (da B in
poi; per A₀ `caches.keys()` e `registration.active.scriptURL`). Contare i caricamenti con un
contatore in `sessionStorage` scritto dalla console a ogni caricamento osservato.

1. **A₀:** aprire `http://localhost:8768/menu`, aspettare `navigator.serviceWorker.controller`
   (ricaricare una volta: la prima visita non è controllata); aprire la Spesa.
2. **A₀ → B:** `serve b`; ricaricare: si vede ancora A₀; aspettare che il worker attivo dica la
   versione di B; navigare Menu → Ricettario → Spesa nella pagina A₀ (funziona). Ricaricare: si
   vede B; a rete spenta la lista è visibile; riaccendere.
3. **B → C:** `serve c`; `document.dispatchEvent(new Event('visibilitychange'))` senza toccare la
   pagina: entro pochi secondi la pagina è C, stesso indirizzo.
4. **Rollback C → B e ripubblicazione di C:** `serve b`; ritorno simulato: la pagina passa a B una
   volta sola; `serve c`; ritorno simulato: la pagina passa di nuovo a C.
5. **Pagina occupata che salta una versione:** cambiare le porzioni di un pasto (compare
   «Annulla») e subito `serve d`, ritorno simulato, poi `serve e`, ritorno simulato: nessun
   passaggio mentre «Annulla» è visibile; font e icone a posto. Scaduto «Annulla», senza
   toccare, ritorno simulato: la pagina passa a E.
6. **Coda non vuota:** rete spenta, spuntare una voce della spesa; `serve c`; rete accesa e
   ritorno simulato subito: la pagina non passa finché la coda non è inviata; al ritorno
   simulato successivo passa a C e la voce resta spuntata.
7. **Rilascio cambiato durante l'installazione:** `serve mixed` (sw.js di D, HTML di E);
   ritorno simulato: il worker D non si installa (errore nell'installazione), la pagina resta C
   e funziona; `serve e`; ritorno simulato: la pagina passa a E.
8. **Offline:** rete spenta, riaprire `/menu` e la Spesa: shell dalla cache, lista visibile.

Annotare per ogni passo l'esito e le versioni viste; salvare uno screenshot dei passi 2, 3, 4,
7 e 8. La sessione Supabase vera non si prova qui (backend finto): resta nel collaudo
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

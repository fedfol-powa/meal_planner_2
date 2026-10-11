# Prove tecniche: contratto del server e accesso OAuth per MCP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** verificare con due prove usa e getta che oRPC, già scelto, regga il
contratto unico su Workers e che il server OAuth 2.1 di Supabase funzioni con i client
MCP, prima di ripianificare M1.

**Architecture:** un Worker minimo in `spike/server/` con oRPC senza Hono (scelta
dell'utente dell'11 ottobre: meno dipendenze e architettura semplice, pochi utenti),
attorno all'operazione `recipes.list`. Dal contratto si ottengono API RPC per l'app, documento OpenAPI e
strumento MCP generato dal contratto. Il Worker legge Postgres tramite Hyperdrive
nel ruolo dell'utente, così che la RLS filtri i dati. La seconda prova pubblica il
Worker e lo collega ai quattro client MCP con il server OAuth di Supabase.

**Tech Stack:** Cloudflare Workers con `wrangler`, Hyperdrive, Postgres.js (senza ORM),
`jose`, Supabase Auth (server OAuth 2.1), `@modelcontextprotocol/sdk` (senza il
pacchetto `agents` di Cloudflare), oRPC, zod.

**Spec:** `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezioni 1
(stack), 13 (MCP) e 15 (righe «Architettura», «MCP», «Hosting e costi»).

## Global Constraints

- Codice, identificatori e commenti in inglese; documentazione e report in italiano.
- Un solo runtime server: Workers. Niente Edge Function né Deno.
- MCP sulla rotta `/mcp` con trasporto Streamable HTTP senza stato.
- Strumenti MCP generati dal contratto, mai scritti a mano.
- Canale MCP riconosciuto dal claim `client_id` del token, mai da un parametro.
- Pagina di consenso ospitata dall'app su `/authorize`.
- Progetto Supabase: quello già collegato al repository (scelta dell'utente dell'11
  ottobre). Niente file in `supabase/migrations/`: l'integrazione GitHub li
  applicherebbe. Le tabelle di prova vivono nello schema `spike` e si eliminano alla fine.
- Dipendenze al minimo: niente Hono, niente ORM, niente librerie in più se la
  piattaforma o le dipendenze già presenti bastano.
- Documentazione delle librerie consultata con Context7, non a memoria.
- Nessun push senza richiesta esplicita. Il codice della prova resta sul branch
  `prove-tecniche`; in `main` arrivano solo report e aggiornamenti della specifica.

## Review Focus

- Token di un altro utente o scaduto: `/mcp` e `/rpc` rispondono 401 con
  `WWW-Authenticate` che punta ai metadati della risorsa protetta.
- Utente senza righe visibili: la RLS restituisce lista vuota, non errore né dati
  altrui (connessione Hyperdrive condivisa tra richieste).
- Ruolo e claim impostati per una richiesta non devono restare sulla connessione
  riusata da Hyperdrive per la richiesta successiva (`set local` dentro transazione).
- Client MCP che non supporta la registrazione dinamica o PKCE: va annotato, non
  aggirato con eccezioni.
- Revoca dall'app: dopo lo scollegamento il token di aggiornamento del client non
  deve più funzionare.

---

## Prerequisiti dall'utente

- [ ] **P1:** `! npx wrangler login` e piano Workers a pagamento attivo (serve anche
  per la misura della CPU).
- [ ] **P2:** dalla dashboard Supabase del progetto collegato: stringa di connessione
  diretta (per Hyperdrive), URL del progetto e chiave pubblicabile, in un file
  `spike/server/.dev.vars` non versionato.
- [ ] **P3 (solo per la prova 2):** abilitare in Authentication > OAuth Server il
  server OAuth 2.1 e la registrazione dinamica; impostare Site URL all'indirizzo del
  Worker di prova. Se l'opzione non compare sul piano gratuito, la prova 2 si ferma qui
  e l'esito si riporta subito (è il primo dato che cerchiamo).

---

### Task 1: Base del Worker e dati di prova

**Files:**
- Create: `spike/server/package.json`, `spike/server/wrangler.jsonc`,
  `spike/server/tsconfig.json`, `spike/server/.gitignore` (`.dev.vars`, `.wrangler/`)
- Create: `spike/sql/setup.sql`, `spike/sql/teardown.sql`
- Create: `spike/server/src/db.ts`

**Interfaces:**
- Produces: `withUserDb<T>(env, claims, fn: (tx) => Promise<T>): Promise<T>` che apre
  una transazione, esegue `set local role authenticated` e
  `select set_config('request.jwt.claims', $1, true)`, poi chiama `fn` con la
  transazione di Postgres.js; `verifyAccessToken(env, token): Promise<Claims>` che verifica il JWT con le
  chiavi JWKS di `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`.

- [ ] **Step 1:** `setup.sql` crea lo schema `spike`, la tabella
  `spike.recipes(id uuid, owner uuid, title text)`, abilita la RLS con la policy
  `owner = auth.uid()` e inserisce righe per due utenti di prova creati in Auth.
  Eseguirlo dall'editor SQL di Supabase. `teardown.sql` fa `drop schema spike cascade`.
- [ ] **Step 2:** `wrangler hyperdrive create meal-planner-spike` con la stringa di
  connessione diretta; binding `HYPERDRIVE` e `localConnectionString` in
  `wrangler.jsonc`, `compatibility_flags: ["nodejs_compat"]`.
- [ ] **Step 3:** scrivere `db.ts` e una rotta temporanea `/health/db` che legge
  `spike.recipes` con i claim del primo utente.
- [ ] **Step 4:** verificare con `wrangler dev` e `curl`: il primo utente vede solo
  le sue righe; con i claim del secondo, solo quelle del secondo; richieste alternate
  in rapida successione non si scambiano i dati (Review Focus 2 e 3).
- [ ] **Step 5:** commit «Prove: base del Worker con Hyperdrive e RLS».

### Task 2: Operazione con oRPC

**Files:**
- Create: `spike/server/src/contract.ts`, `router.ts`, `mcp.ts`, `index.ts`

**Interfaces:**
- Consumes: `withUserDb`, `verifyAccessToken` (Task 1).
- Produces: operazione `recipes.list({ limit }) -> { id, title }[]` con metadato
  `expose: { web: true, mcp: true, readOnly: true }`.

- [ ] **Step 1:** contratto con `oc` di `@orpc/contract` e schemi zod; router che lo
  implementa leggendo il contesto `{ claims }`.
- [ ] **Step 2:** `RPCHandler` su `/rpc`, `OpenAPIHandler` su `/api`,
  `OpenAPIGenerator` con `ZodToJsonSchemaConverter` su `/api/openapi.json`.
- [ ] **Step 3:** `mcp.ts` percorre le procedure del contratto con `expose.mcp` e
  registra uno strumento per ciascuna su un `McpServer` creato per richiesta (schema
  di input dallo zod del contratto, esecuzione tramite il router con lo stesso
  contesto). Rotta `/mcp` con trasporto Streamable HTTP senza stato.
- [ ] **Step 4:** verificare con `curl`: `/rpc`, `/api/recipes` e `/api/openapi.json`;
  `/mcp` con `tools/list` e `tools/call` usando un token di prova del primo utente.
  `npx @modelcontextprotocol/inspector` per la conferma visiva.
- [ ] **Step 5:** annotare righe di codice, dimensione del pacchetto
  (`wrangler deploy --dry-run --outdir dist`), problemi incontrati. Commit.

### Task 3: Bilancio di oRPC

- [ ] **Step 1:** in `spike/REPORT.md` annotare per oRPC: righe di codice per
  operazione, dimensione del pacchetto, CPU per richiesta (misura ripetuta, come per
  il pianificatore), qualità del documento OpenAPI, tipizzazione del client per
  TanStack Query (`@orpc/tanstack-query`), sforzo per generare gli strumenti MCP,
  versione e stabilità della libreria. Elencare le dipendenze effettive del Worker.
- [ ] **Step 2:** se emerge un ostacolo serio, fermarsi e riportarlo all'utente prima
  della prova 2. Commit.

### Task 4: Prova 2, OAuth per MCP

**Files:**
- Create: `spike/server/src/oauth.ts` (metadati della risorsa protetta, 401 con
  `WWW-Authenticate`), `spike/server/public/authorize.html` (consenso minimo con
  `@supabase/supabase-js`: accesso con email, dettagli della richiesta, approva o nega)

- [ ] **Step 1:** P3 completato; se il server OAuth non è disponibile sul piano
  gratuito, fermarsi e riportarlo all'utente.
- [ ] **Step 2:** `/.well-known/oauth-protected-resource` che indica
  `https://<ref>.supabase.co/auth/v1` come server di autorizzazione; `/mcp` senza token
  risponde 401 con il collegamento ai metadati.
- [ ] **Step 3:** `wrangler deploy` su `*.workers.dev`; Site URL di Supabase su quel
  dominio, percorso di autorizzazione `/authorize`.
- [ ] **Step 4:** collegare in ordine Claude Code (`claude mcp add --transport http`),
  Codex CLI, Claude Desktop e ChatGPT. Per ciascuno annotare: registrazione dinamica,
  consenso, lettura con `recipes.list`, presenza del claim `client_id`, rinnovo del
  token. ChatGPT e Claude Desktop richiedono l'utente al comando.
- [ ] **Step 5:** revoca: rimuovere il grant del client dalla dashboard (o API) e
  verificare che il token di aggiornamento non funzioni più (Review Focus 5).
- [ ] **Step 6:** misurare la CPU per richiesta MCP con `wrangler tail`. Commit.

### Task 5: Esito e pulizia

- [ ] **Step 1:** `spike/REPORT.md` completo; riportare l'esito nella specifica:
  sezione 1 (oRPC senza Hono, accesso al database), sezione 13 (client verificati e differenze), sezione 15
  (voci chiuse o aggiornate), sezione 16 (riga dell'esito).
- [ ] **Step 2:** con l'utente: eseguire `teardown.sql`, eliminare il Worker e la
  configurazione Hyperdrive di prova, decidere se lasciare attivo il server OAuth
  (serve comunque in M1) e ripristinare la Site URL.
- [ ] **Step 3:** commit dell'esito; il merge in `main` e il push solo su richiesta.

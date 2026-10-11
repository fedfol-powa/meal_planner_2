# Piattaforma: spec di dettaglio

Creato: 11 ottobre 2026
Stato: brainstorming chiuso con il coordinatore l'11 ottobre 2026; da rivedere.
Attività: W1 dell'ondata 1 (`progetto/superpowers/plans/2026-10-11-piano-generale.md`),
branch `fondamenta/piattaforma`.

Estende la specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`), sezioni 1, 9, 13 e 15,
e parte dalla prova tecnica (`spike/REPORT.md`, `spike/server/`). In caso di
contrasto vale la specifica principale, salvo le scelte elencate in fondo come
decisioni da riportare.

## Obiettivo

Le fondamenta su cui le altre attività aggiungono operazioni:

1. **scheletro del repository** con workspace `domain/`, `contract/`, `server/`, `web/`,
   consegnato per primo in una PR piccola;
2. **Worker** che serve la SPA e le rotte `/api/rpc`, `/api`, `/api/openapi.json`, `/mcp`
   dal contratto;
3. **percorso della richiesta**: verifica del JWT, contesto, scelta del ruolo
   Postgres nella transazione, controllo dei permessi, errori a codici;
4. **convenzioni del contratto** con metadati obbligatori, errori, idempotenza e letture
   versionate con risposta «invariato», tutte verificate da test;
5. **ambienti** locale e di produzione su `workers.dev`, con Hyperdrive limitato;
6. **flusso Git e CI**, con la verifica dell'integrazione GitHub di Supabase;
7. **`session.whoami`** come operazione di esempio, provata su RPC, REST e MCP.

Fuori da questa attività: le rotte del job (`/internal/jobs/*`), la pagina di Bring!,
la pagina `/authorize` (nella SPA, ondata 2), lo scollegamento degli agenti, le
operazioni di dominio, lo schema del database (W2) e l'app web (W5).

## 1. Struttura del repository

```
package.json          workspaces: domain, contract, server, web
                      script: test, typecheck, deploy (su tutti i workspace)
tsconfig.base.json    opzioni comuni a tutti i workspace
tsconfig.json         solo scripts/ e vitest.config della radice
vitest.config.ts      test di scripts/ (domain ha il suo)
domain/               @app/domain   TypeScript puro, nessuna dipendenza di runtime
contract/             @app/contract contratto delle operazioni: @orpc/contract, zod
server/               @app/server   Worker: oRPC, MCP, jose, postgres, wrangler
web/                  @app/web      SPA (W5)
scripts/              resta nella radice, importa domain/src con percorsi relativi
.github/workflows/    ci.yml
```

- **npm workspaces, senza build intermedie.** Ogni pacchetto interno ha `"exports":
  { ".": "./src/index.ts" }`: Vite, Wrangler (esbuild), Vitest e `tsc` leggono
  direttamente i sorgenti TypeScript. I nomi `@app/*` sono solo interni.
- **Ogni workspace** ha `test` e `typecheck`; la radice li esegue con
  `npm run <script> --workspaces --if-present` più quelli di `scripts/`.
- **`domain/`** diventa un workspace senza cambiare codice né controllo dei tipi:
  `tsc -p domain/tsconfig.json` resta senza tipi di Node, i test del pianificatore
  girano come oggi. `scripts/` continua a importarlo con percorsi relativi.
- **Dipendenze per workspace**: `contract` dipende solo da `@orpc/contract` e `zod`
  (e da `@app/domain` quando ne riusa gli schemi); `server` da `@app/contract`,
  `@orpc/server`, `@orpc/openapi`, `@orpc/zod`, `@modelcontextprotocol/server`,
  `jose`, `postgres`, con `wrangler` e `@cloudflare/workers-types` in sviluppo; il web
  aggiunge `@orpc/client` (W5). TypeScript e Vitest stanno nella radice. Versioni
  fissate a quelle della prova (oRPC 1.15.5: l'opzione del generatore OpenAPI si chiama
  `schemaConverters`).
- **`spike/`** resta com'è: è il riferimento della prova, non un workspace.

**Prima consegna (scheletro).** PR piccola con soli `package.json`, `tsconfig`,
cartelle con `src/index.ts` minimo, un test segnaposto per `contract` e `server`,
`web/package.json` con script vuoti e il workflow di CI. Criterio: `npm ci`,
`npm test` e `npm run typecheck` passano nella radice e su GitHub Actions, e i test del
pianificatore girano come prima.

## 2. Rotte del Worker

Una funzione `fetch` smista le rotte (oRPC senza Hono, sezione 1 della specifica).

| Rotta | Gestione |
|---|---|
| `/api/rpc/*` | `RPCHandler` di oRPC (app web) |
| `/api/openapi.json` | generato dal contratto con `OpenAPIGenerator` |
| `/api/*` | `OpenAPIHandler` di oRPC (REST) |
| `/mcp` | SDK MCP, trasporto Streamable HTTP senza stato, strumenti generati dal contratto |
| `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server` | metadati della risorsa protetta (SDK MCP) e copia di quelli di Supabase Auth |
| altro | asset statici di `web/dist` |

- **Asset statici** con la configurazione `assets` di Wrangler: `directory:
  ../web/dist`, `not_found_handling: "single-page-application"`, `run_worker_first`
  limitato a `/api/*`, `/mcp` e `/.well-known/*`. Le altre richieste non eseguono il
  Worker e non consumano CPU.
- **401**: senza token o con token non valido le rotte `/api/*` rispondono con l'errore
  `unauthorized` (sezione 4); `/mcp` risponde 401 con `WWW-Authenticate` e il
  collegamento ai metadati della risorsa protetta, come nella prova.
- **Cache di modulo** (chiavi JWKS, metadati OAuth, elenco degli strumenti MCP): solo
  dati già risolti, mai promesse condivise fra richieste.

## 3. Percorso della richiesta

```
fetch → rotta → token (jose) → canale da client_id → webOnly?
      → transazione: ruolo e claim → profilo e sessione → permessi → versione?
      → handler → errori a codici
```

### 3.1 Verifica del token

Come nella prova (`spike/server/src/auth.ts`): chiavi pubbliche da
`/auth/v1/.well-known/jwks.json` tenute in memoria 10 minuti, nuova lettura una volta se
il `kid` è sconosciuto, `issuer` del progetto, `audience: authenticated`,
`role: authenticated`, `sub` presente. La sorgente delle chiavi è iniettabile, così i
test firmano token con chiavi generate al momento senza rete.

### 3.2 Contesto

| Campo | Origine |
|---|---|
| `userId` | `sub` del token |
| `channel` | `mcp` se il token ha `client_id`, altrimenti `web` |
| `clientId` | `client_id` o `null` |
| `sessionId` | `session_id` del token |
| `locale` | `profiles.locale` letto nella transazione (`it-IT` o `en-GB`) |
| `tx` | la transazione Postgres dell'operazione |
| `origin` | origine della richiesta, per gli URL assoluti di `web_only` |

La lingua viene dal profilo, non da un header: web e MCP la vedono uguale.

### 3.3 Transazione e scelta del ruolo

Il Worker si collega a Postgres tramite Hyperdrive come **`app_server`** (deciso con W2:
`LOGIN NOINHERIT`, membro di `authenticated`, `anon` e `app_job`, nessun altro
privilegio). Ogni transazione sceglie il ruolo con cui lavora; senza scelta
`app_server` non vede nessuna tabella.

```ts
type DbIdentity =
  | { kind: 'user'; claims: Claims }   // operazioni del contratto
  | { kind: 'anon' }                    // pagina di Bring! (ondata 2)
  | { kind: 'job' };                    // /internal/jobs/* (ondata 2)

withDb(env, identity, (tx) => …)
```

- `user`: `select set_config('request.jwt.claims', <claims>, true)` e poi
  `set local role authenticated`, come nella prova.
- `anon`: `set local role anon`, senza claim.
- `job`: `set local role app_job`.

Le impostazioni valgono solo nella transazione e non passano alla richiesta successiva
che riusa la connessione del pool. Un client Postgres.js per richiesta (`max: 1`,
`fetch_types: false`), chiuso alla fine: il pool vero è Hyperdrive. Questa attività
realizza e prova il meccanismo con i tre ruoli; usano `anon` e `job` solo le rotte
dell'ondata 2.

### 3.4 Profilo e sessione

Per ogni operazione nel ruolo dell'utente, subito dopo la scelta del ruolo, una sola
query:

```sql
select p.locale, app.session_is_active() as active
  from profiles p where p.id = auth.uid()
```

Nessuna riga (account cancellato) o `active = false` (logout, sessione scaduta,
agente scollegato: Supabase cancella la sessione) danno `unauthorized`. È la «revoca
immediata» della sezione 1. `app.session_is_active()` è una funzione `security definer`
di W2 che controlla `session_id` e `auth.uid()` in `auth.sessions`. Che lo
scollegamento di un agente cancelli davvero le sue sessioni si verifica nell'ondata 2,
insieme alla pagina degli agenti collegati.

### 3.5 Permessi

Ogni operazione dichiara il ruolo richiesto (sezione 4.1). Un middleware lo controlla
nella transazione, prima dell'handler:

| `role` | Controllo |
|---|---|
| `user` | nessuno oltre al token e alla sessione |
| `familyMember` | l'utente è membro della famiglia `input.familyId` |
| `familyAdmin` | l'utente è amministratore della famiglia `input.familyId` |
| `curator` | l'utente ha il ruolo globale di curatore |
| `appAdmin` | l'utente ha il ruolo globale di amministratore dell'app |

Errore `forbidden` se il controllo fallisce, anche per una famiglia inesistente: chi
non vi appartiene non deve poter distinguere i due casi. Le query usano le tabelle di appartenenza e dei ruoli globali di W2 (nomi
proposti `family_members(family_id, user_id, role)` e
`user_global_roles(user_id, role)`, definitivi nella spec di W2). La RLS resta la
garanzia di isolamento: questo controllo dà errori chiari, non sostituisce le policy.

### 3.6 Operazioni riservate al web

Se l'operazione ha `webOnly` e il canale è `mcp`, il middleware risponde `web_only`
con l'URL assoluto della pagina (`origin` + `webOnly.path`, con i parametri
dell'input se il percorso li prevede) **prima di aprire la transazione**. Vale su ogni
rotta: anche un token di agente usato su `/api/rpc` riceve `web_only`.

## 4. Convenzioni del contratto

### 4.1 Metadati obbligatori

`contract/src/op.ts` esporta il costruttore `op` con metadati tipizzati:

```ts
interface OperationMeta {
  mcp: { readOnly: boolean } | false;    // esposizione come strumento MCP
  webOnly?: { path: string };            // riservata al web: URL della pagina
  offline: boolean;                      // accodabile nella coda offline
  role: 'user' | 'familyMember' | 'familyAdmin' | 'curator' | 'appAdmin';
  reads?: ('family' | 'catalogue')[];    // lettura versionata e contatori usati
  creates?: true;                        // crea un'entità con id dal client
}
```

Un test in `contract/` percorre il contratto con `traverseContractProcedures` e
verifica per ogni operazione:

- `mcp`, `offline` e `role` presenti ed espliciti;
- `webOnly` solo con `mcp` diverso da `false` (lo strumento esiste e risponde
  `web_only` con l'URL, come chiede la sezione 13);
- `role` di famiglia solo con `familyId` uuid nell'input;
- `offline` o `creates` solo con un `id` uuid nell'input;
- `reads` solo con `knownVersion` facoltativo nell'input e output a unione
  `unchanged` (sezione 4.4);
- ogni operazione ha `route` con metodo, percorso e `summary` (servono a OpenAPI e
  alla descrizione dello strumento MCP).

Un test in `server/` verifica che ogni operazione con `mcp` diverso da `false` abbia
lo strumento MCP corrispondente e che nessun altro strumento esista.

### 4.2 Errori a codici

Codici della sezione 1, in minuscolo, definiti una volta in `contract/src/errors.ts`
con lo schema zod dei dati:

| Codice | Stato HTTP | Dati |
|---|---|---|
| `unauthorized` | 401 | |
| `forbidden` | 403 | |
| `not_found` | 404 | |
| `invalid` | 400 | `issues: { path: (string \| number)[], code: string }[]` |
| `conflict` | 409 | `by`, `at`, `fields` (forma definitiva con le bozze, ondata 2) |
| `last_admin`, `last_app_admin`, `sole_member` | 409 | |
| `web_only` | 403 | `url` |
| `internal` | 500 | |

- Ogni operazione dichiara i propri con `.errors()`; quelli comuni (`unauthorized`,
  `invalid`, `internal`, `forbidden` per i ruoli, `web_only` per le operazioni
  riservate) si aggiungono dal costruttore.
- La validazione dell'input di oRPC (`BAD_REQUEST` con i dettagli zod) diventa
  `invalid` con i percorsi dei campi; ogni altro errore non previsto diventa
  `internal` senza dettagli, registrato nei log del Worker.
- I testi per l'utente non viaggiano negli errori del web, che li traduce. Per MCP il
  server aggiunge `message` nella lingua del profilo, da un catalogo minimo
  `it-IT`/`en-GB` in `server/src/messages.ts`, con un test che verifica la presenza
  di entrambe le lingue per ogni codice.

### 4.3 Idempotenza

Nessuna tabella di chiavi di idempotenza:

- le operazioni che creano un'entità (`creates: true`) ricevono dal client l'`id` uuid
  dell'entità; il server fa `insert … on conflict (id) do nothing` e restituisce la riga
  esistente, così ripetere la richiesta non duplica nulla;
- le operazioni accodabili offline (`offline: true`) impostano uno stato assoluto,
  mai un'inversione (`setItemChecked(…, checked: true)`, non `toggle`), e portano
  anch'esse un `id` per riconoscere la richiesta;
- i test di ciascuna operazione dell'ondata 2 ripetono la stessa richiesta e
  verificano risultato e assenza di duplicati. Questa attività fornisce l'helper di
  test che esegue due volte una chiamata e confronta gli esiti.

### 4.4 Letture versionate e risposta «invariato»

Scelta concordata: la risposta «invariato» sta **dentro il contratto**, non in un 304
HTTP (decisione da riportare, sezione 1 della specifica).

```ts
input:  { …, knownVersion?: string }
output: { unchanged: true; version: string }
      | { unchanged: false; version: string; data: View }
```

`contract/src/versioned.ts` esporta gli aiuti per dichiararle
(`versionedInput(schema)`, `versionedOutput(viewSchema)`).

- **Contatori** (database, W2): `families.data_version` per famiglia e una riga unica
  `catalogue_state.version` per il ricettario. Li incrementano **trigger
  statement-level** nella stessa transazione della scrittura: tabelle di famiglia
  (settimane, pasti, modifiche, voti, esclusioni, spesa, impostazioni, membri) e del
  catalogo pubblicato (ricette, proiezioni, ingredienti). Un voto incrementa il
  contatore di tutte le famiglie dell'utente; le bozze non toccano il contatore del
  ricettario. Nessuna scrittura (operazione, job, import) può dimenticarsene.
- **Versione restituita**: `f{family}.c{catalogue}.{locale}.{deploy}`, con i soli
  contatori dichiarati in `reads`. `deploy` è l'id della versione del Worker (binding
  `version_metadata` di Wrangler): una nuova pubblicazione invalida le copie, perché
  può cambiare il calcolo delle viste. `locale` copre il cambio di lingua.
- **Middleware**: legge i contatori nella transazione (sotto RLS), compone la versione
  e, se coincide con `knownVersion`, risponde `{ unchanged: true, version }` senza
  eseguire l'handler; altrimenti esegue l'handler e avvolge la vista. La lettura dei
  contatori avviene prima della vista nella stessa transazione: una scrittura
  concorrente produce al massimo una vista più nuova della versione, che il client
  rilegge alla verifica successiva, mai una versione più nuova di una vista vecchia.
- **MCP**: gli agenti non passano `knownVersion` e ricevono sempre i dati; lo schema
  dello strumento lo mostra come campo facoltativo.

### 4.5 Strumenti MCP

Generati come nella prova (`spike/server/src/mcp.ts`): uno strumento per operazione
con `mcp` diverso da `false`, nome `area_operazione`, descrizione dal `summary`, schema
di input dal contratto, `readOnlyHint` da `mcp.readOnly`. La chiamata passa per il
router con lo stesso contesto del web. Gli errori tornano come `isError` con
`{ code, data, message }`. Il raggruppamento degli strumenti resta una questione
aperta dell'ondata 2 (sezione 15).

### 4.6 `session.whoami`

```ts
session.whoami: op
  .meta({ mcp: { readOnly: true }, offline: false, role: 'user' })
  .route({ method: 'GET', path: '/session/whoami', summary: 'Identify the caller, the channel and the language' })
  .input(z.object({}))
  .output(z.object({ userId: z.uuid(), channel: z.enum(['web', 'mcp']), clientId: z.string().nullable(), locale: z.enum(['it-IT', 'en-GB']) }))
```

Attraversa tutto il percorso (token, transazione, profilo, sessione) e serve come
verifica del collegamento per l'app e per gli agenti.

## 5. Interfacce con le altre attività

Registrate dal coordinatore nel piano generale.

**Con W2 (schema)**, già girate dal coordinatore e accolte nella spec di W2:

- ruolo `app_server` (`LOGIN NOINHERIT`, membro di `authenticated`, `anon`,
  `app_job`); `app_job` e la funzione `app.temporary_list_by_token` per `anon` sono di
  W2;
- `profiles.locale` (`it-IT` | `en-GB`);
- `app.session_is_active()` `security definer`, eseguibile da `authenticated`;
- `families.data_version`, `catalogue_state(version)` e i trigger della sezione 4.4;
- tabelle di appartenenza familiare e ruoli globali lette dai permessi (sezione 3.5).

**Con W5 (web)**:

- l'app importa il contratto da `@app/contract` e usa `@orpc/client` con `RPCLink`
  verso `/api/rpc`; niente `@orpc/tanstack-query` per ora: W5 scrive a mano le
  `queryOptions`;
- l'header `authorization: Bearer <access_token>` si legge dalla sessione di
  supabase-js a ogni chiamata; con `unauthorized` l'app rinnova la sessione o torna al
  login;
- le letture versionate passano `knownVersion` dalla copia in cache e, con
  `unchanged`, la mantengono;
- la build di Vite va in `web/dist`; in sviluppo Vite inoltra `/api`, `/mcp` e
  `/.well-known` a `wrangler dev` sulla porta 8787;
- il Worker legge `SUPABASE_URL`; l'app usa URL e chiave pubblicabile di Supabase
  dalla propria configurazione Vite.

## 6. Ambienti

**Locale**

- `npm run dev -w server`: `wrangler dev` sulla porta 8787 con
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` verso il database
  locale scelto da W2, collegato come `app_server`, e `SUPABASE_URL` dell'Auth locale.
- In locale Hyperdrive non fa da pool (prova dell'11 ottobre): le prove di concorrenza
  si fanno sul Worker pubblicato.
- Variabili in `server/.dev.vars` (non versionato), con `server/.dev.vars.example`.

**Produzione**

- Worker `cosasimangia` sull'indirizzo `workers.dev` dell'account Cloudflare di POWA;
  dominio vero rimandato all'ondata 3.
- Hyperdrive `cosasimangia` verso il Session pooler di Supabase (porta 5432) con
  utente `app_server`, cache disattivata e `origin_connection_limit` esplicito sotto la
  dimensione del pool del progetto (nella prova 10 su circa 15; il valore si fissa
  leggendo la dimensione effettiva del pool nella dashboard).
- Chiavi di firma asimmetriche attive nel progetto Supabase (requisito della sezione 1),
  da verificare.
- **Pubblicazione a mano** per ora: dopo il merge il coordinatore esegue `npm run
  deploy` nella radice (build di `web`, poi `wrangler deploy` di `server`). La
  procedura sta in `server/README.md`; l'automazione si rivede prima del traguardo A.
- Ogni creazione o modifica di risorse esterne (Worker, Hyperdrive, impostazioni di
  Supabase, segreti) passa da `STATO: DOMANDA` al coordinatore.

## 7. Flusso Git, CI e integrazione di Supabase

- **Flusso**: branch di attività → PR verso `main` → review → merge del coordinatore.
  `main` è la produzione. Nessun branch `sviluppo`.
- **CI** (`.github/workflows/ci.yml`, GitHub Actions su ogni PR e su `main`): `npm ci`,
  `npm run typecheck`, `npm test`. I test con il database si aggiungono al workflow
  quando W2 fissa l'ambiente locale (Docker è disponibile sui runner di Actions).
- **Integrazione GitHub di Supabase**: secondo la documentazione, con «Deploy to
  production» attivo applica le migrazioni di `supabase/migrations` al merge sul
  branch di produzione. Da verificare all'inizio dell'implementazione (CLI di Supabase
  e dashboard, quest'ultima con l'utente tramite il coordinatore): cartella `supabase`,
  branch di produzione `main`, «Deploy to production» attivo, nessun branch di
  anteprima (richiede il piano Pro). L'esito si registra nel README del server e nelle
  decisioni da riportare.
- **Ordine dei rilasci**: le migrazioni arrivano al merge, il Worker si pubblica
  subito dopo. Le migrazioni sono additive (sezione 1, «modifiche solo additive»),
  quindi il Worker precedente continua a funzionare nel frattempo.

## 8. Test

| Dove | Cosa | Database |
|---|---|---|
| `contract/` | metadati obbligatori e coerenti (4.1); schemi degli errori | no |
| `server/` | token: firma, scadenza, issuer, audience, `kid` ruotato, ruolo; canale da `client_id` | no |
| `server/` | `web_only` per canale `mcp` su RPC, REST e MCP prima della transazione | no |
| `server/` | conversione degli errori (validazione → `invalid`, imprevisti → `internal`); messaggi nelle due lingue | no |
| `server/` | uno strumento MCP per ogni operazione esposta e nessun altro; 401 con `WWW-Authenticate` | no |
| `server/` | rotte: OpenAPI generato, 404 per percorsi sconosciuti sotto `/api` | no |
| `server/` | `session.whoami` su RPC, REST e MCP con un utente vero del database locale | sì |
| `server/` | `unauthorized` con profilo assente o sessione cancellata | sì |
| `server/` | scelta del ruolo: `authenticated` con i claim, `anon`, `app_job`; nessuna impostazione che sopravvive alla transazione | sì |
| `server/` | permessi per ruolo (`familyMember`, `familyAdmin`, `curator`, `appAdmin`) con operazioni di prova | sì |
| `server/` | versione: `unchanged` con la versione corrente, dati dopo una scrittura che fa crescere il contatore | sì |

- Tutti i test girano con Vitest in Node chiamando direttamente la funzione `fetch` del
  Worker con un `env` di prova: stringa di connessione al database locale al posto di
  Hyperdrive, chiavi generate nel test, id di versione fisso.
- Le operazioni di prova per permessi e versioni (`test.*`) stanno in un contratto di
  test separato, non in quello pubblicato.
- **Dipendenza da W2.** I test con il database usano le migrazioni di `supabase/`.
  Finché W2 non è su `main`, una migrazione minima di prova in
  `server/test/fixtures/schema.sql` crea gli oggetti concordati con gli stessi nomi;
  si toglie quando arriva lo schema vero. Senza database disponibile questi test sono
  saltati con un avviso esplicito; in CI saranno obbligatori.
- Verifiche manuali prima della PR: `wrangler dev` con `session.whoami` da `curl` e da
  Claude Code su `/mcp`; dopo la pubblicazione, le stesse sul Worker di `workers.dev`.

## 9. Dipendenze

Tutte nell'elenco ammesso dal brief: oRPC (`@orpc/contract`, `@orpc/server`,
`@orpc/openapi`, `@orpc/zod`; `@orpc/client` nel web), zod, Postgres.js (`postgres`),
`jose`, `@modelcontextprotocol/server`, Wrangler, `@cloudflare/workers-types`,
TypeScript, Vitest. Nessuna dipendenza nuova; niente `@cloudflare/vitest-pool-workers`
(i test girano in Node, scelta del brainstorming).

## Decisioni da riportare nella specifica

**Prodotto**

- Nessuna.

**Tecniche**

| Decisione | Sezioni |
|---|---|
| Monorepo con npm workspaces (`domain`, `contract`, `server`, `web`) che esportano i sorgenti TypeScript, senza build intermedie | 1 (struttura) |
| Rotte: RPC su `/api/rpc`, REST su `/api`, OpenAPI su `/api/openapi.json`; SPA dagli asset statici di Workers con fallback SPA e Worker eseguito per primo solo su `/api/*`, `/mcp`, `/.well-known/*` | 1 |
| Risposta «invariato» nel contratto (`knownVersion` in input, output `{ unchanged: true, version }` o con `data`) al posto di HTTP 304 con `ETag` | 1 (letture dalla copia sul dispositivo) |
| Contatori incrementati da trigger statement-level nel database; versione `f{family}.c{catalogue}.{locale}.{deploy}` con i soli contatori dichiarati dall'operazione (`reads`); bozze fuori dal contatore del ricettario; un voto incrementa tutte le famiglie dell'utente | 1, 2, 15 (voce Architettura) |
| Idempotenza con `id` generato dal client e operazioni offline a stato assoluto, senza tabella di chiavi | 1 (idempotenza), 6 |
| Utenza tecnica `app_server` membro di `authenticated`, `anon` e `app_job`; ogni transazione sceglie il ruolo | 1 (query nel ruolo dell'utente), 4 |
| Contesto: lingua da `profiles.locale`; revoca immediata con verifica della sessione del token (`app.session_is_active()`) a ogni richiesta | 1 (revoca immediata), 13 |
| Metadati obbligatori `mcp`, `offline`, `role`, facoltativi `webOnly`, `reads`, `creates`; ruoli `user`, `familyMember`, `familyAdmin`, `curator`, `appAdmin` | 1 (contratto), 9 |
| Codici di errore in minuscolo con stato HTTP; validazione → `invalid`; `message` localizzato solo per MCP | 1, 13 |
| Test del server in Node con Vitest chiamando la `fetch` del Worker, senza il pool di Workers | 9 |
| Flusso Git: PR verso `main`, `main` è la produzione; CI su GitHub Actions; pubblicazione del Worker a mano dal coordinatore per ora; esito della verifica dell'integrazione GitHub di Supabase | 1, 10, 15 (voce Implementazione) |
| Worker `cosasimangia` su `workers.dev` di POWA e Hyperdrive con `origin_connection_limit` esplicito | 1 |

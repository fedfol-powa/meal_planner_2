# Piattaforma: spec di dettaglio

Creato: 11 ottobre 2026
Stato: brainstorming chiuso con il coordinatore l'11 ottobre 2026; corretta dopo la
review di spec e piano (sette rilievi, decisioni del coordinatore) l'11 ottobre 2026.
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
tsconfig.json         domain/ con i test, scripts/, vitest.config della radice
vitest.config.ts      test di scripts/ (ogni workspace ha la sua)
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
- **Ogni workspace** ha `test`, `typecheck` e una propria `vitest.config.ts` (senza,
  Vitest userebbe quella della radice e non troverebbe i test); la radice li esegue con
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
fetch → rotta → (MCP: token e sessione all'ingresso) → validazione dell'input
      → token (jose, claim obbligatori) → transazione nel ruolo dell'utente
      → profilo e sessione → webOnly? → permessi → versione? → handler
      → errori a codici (log senza segreti)
```

### 3.1 Verifica del token

Come nella prova (`spike/server/src/auth.ts`): chiavi pubbliche da
`/auth/v1/.well-known/jwks.json` tenute in memoria 10 minuti, nuova lettura una volta se
il `kid` è sconosciuto, `issuer` del progetto, `audience: authenticated`. La sorgente
delle chiavi è iniettabile, così i test firmano token con chiavi generate al momento
senza rete.

I claim sono il confine di sicurezza del server, quindi dopo la firma si validano tutti
quelli usati:

- `exp`, `sub` e `session_id` obbligatori (`requiredClaims` di `jose`): un token senza
  scadenza è rifiutato;
- `role` uguale a `authenticated`;
- `sub` e `session_id` UUID;
- `client_id`, se presente, stringa non vuota. Un `client_id` presente ma non valido
  (vuoto, numero, booleano) dà `unauthorized`: non diventa mai canale web.

Un token che non supera questi controlli è `unauthorized` e non raggiunge né il
database né l'handler.

### 3.2 Contesto

| Campo | Origine |
|---|---|
| `requestId` | UUID generato per ogni richiesta, per correlare log ed errori `internal` |
| `userId` | `sub` del token |
| `channel` | `mcp` se il token ha `client_id`, altrimenti `web` |
| `clientId` | `client_id` o `null` |
| `locale` | `app.profiles.locale` letto nella transazione (`it-IT` o `en-GB`) |
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

withDb(connectionString, identity, (tx) => …)
```

- `user`: `select set_config('request.jwt.claims', <claims>, true)` e poi
  `set local role authenticated`, come nella prova.
- `anon`: `set local role anon`, senza claim.
- `job`: `set local role app_job`.

Le impostazioni valgono solo nella transazione e non passano alla richiesta successiva
che riusa la connessione del pool, sia dopo un commit sia dopo un rollback. Un client
Postgres.js per richiesta (`max: 1`, `fetch_types: false`), chiuso alla fine: il pool
vero è Hyperdrive. Questa attività realizza e prova il meccanismo con i tre ruoli;
usano `anon` e `job` solo le rotte dell'ondata 2.

### 3.4 Profilo e sessione

Per ogni operazione nel ruolo dell'utente, subito dopo la scelta del ruolo, una sola
query sugli oggetti di W2 (schema `app`, non esposto dalla Data API):

```sql
select p.locale, app.session_is_active() as active
  from app.profiles p where p.user_id = auth.uid()
```

Nessuna riga (account cancellato: il profilo, creato da un trigger su `auth.users`,
sparisce con l'utente) o `active = false` (logout, sessione scaduta, agente
scollegato: Supabase cancella la sessione) danno `unauthorized`. È la «revoca
immediata» della sezione 1.

**All'ingresso di `/mcp`** lo stesso controllo avviene per ogni richiesta, compresi
`initialize` e `tools/list`, in una transazione breve nel ruolo dell'utente: con la
sessione chiusa la risposta è 401 con `WWW-Authenticate`, come per un token non valido,
e il client rifà l'autorizzazione. La lingua letta qui serve anche agli errori degli
strumenti. Costo: una query in più per richiesta MCP.

La prova reale della revoca di un agente non è di questa attività (sezione 10).

### 3.5 Operazioni riservate al web

Se l'operazione ha `webOnly` e il canale è `mcp`, il middleware risponde `web_only`
con l'URL assoluto della pagina (`origin` + `webOnly.path`, con i parametri
dell'input se il percorso li prevede) **dopo** il controllo di profilo e sessione e
**prima** del controllo del ruolo: un token revocato riceve `unauthorized`, non il
rimando, e il messaggio di `web_only` è nella lingua del profilo. I permessi li
verifica la pagina web, non il possesso del link. Vale su ogni rotta: anche un token di
agente usato su `/api/rpc` riceve `web_only`.

### 3.6 Permessi

Ogni operazione dichiara il ruolo richiesto (sezione 4.1). Il middleware lo controlla
nella transazione, prima dell'handler, con le funzioni di W2 (`security definer`,
basate su `auth.uid()`):

| `role` | Controllo |
|---|---|
| `user` | nessuno oltre al token e alla sessione |
| `familyMember` | `app.is_member(input.familyId)` |
| `familyAdmin` | `app.is_family_admin(input.familyId)` (ruolo `family_admin` in `app.family_members`) |
| `curator` | `app.has_role('recipe_curator')` (`app.user_roles`) |
| `appAdmin` | `app.has_role('app_admin')` |

Errore `forbidden` se il controllo fallisce, anche per una famiglia inesistente: chi
non vi appartiene non deve poter distinguere i due casi. Le funzioni nascondono al
server i nomi di tabelle e colonne; la RLS resta la garanzia di isolamento: questo
controllo dà errori chiari, non sostituisce le policy.

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

Un test in `contract/` percorre il contratto e verifica per ogni operazione:

- `mcp`, `offline` e `role` presenti ed espliciti;
- `webOnly` solo con `mcp` diverso da `false` (lo strumento esiste e risponde
  `web_only` con l'URL, come chiede la sezione 13);
- `role` di famiglia solo con `familyId` UUID nell'input, **obbligatorio e non
  nullabile**;
- `offline` o `creates` solo con un `id` UUID nell'input, obbligatorio e non nullabile;
- `reads` solo con `knownVersion` **stringa facoltativa** nell'input (accetta l'assenza
  e una stringa, rifiuta numeri e `null`) e output a unione `unchanged` (sezione 4.4);
- ogni operazione ha `route` con metodo, percorso e `summary` (servono a OpenAPI e
  alla descrizione dello strumento MCP).

Il controllo si prova anche con casi negativi (identificativi facoltativi o nullabili,
`knownVersion` numerica). Un test in `server/` verifica che ogni operazione con `mcp`
diverso da `false` abbia lo strumento MCP corrispondente e che nessun altro strumento
esista.

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
| `internal` | 500 | `requestId` |

- Il costruttore aggiunge a ogni operazione i codici comuni (`unauthorized`,
  `forbidden`, `invalid`, `web_only`, `internal`); ogni operazione dichiara con
  `.errors()` solo i propri (`not_found`, `conflict`, `last_admin`…).
- La validazione dell'input di oRPC (`BAD_REQUEST` con i dettagli zod) diventa
  `invalid` con i percorsi dei campi; ogni altro errore non previsto diventa
  `internal` con il solo `requestId`.
- **Log senza segreti.** Un errore imprevisto si registra con campi scelti: `requestId`,
  percorso dell'operazione, nome della classe e codice (SQLSTATE di Postgres o codice
  di sistema come `ECONNREFUSED`, solo se ha la forma di un codice) dell'errore più
  interno della catena delle cause. Mai messaggio, causa completa, query, parametri,
  header o stringa di connessione: possono contenere password, token o dati personali.
  Un test verifica che gli argomenti passati al logger non contengano password, bearer
  token né stringhe di connessione.
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
  verificano risultato e assenza di duplicati; il test delle convenzioni (4.1) controlla
  la presenza dell'`id`.

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

- **Contatori** (database, W2): `app.families.data_version` per famiglia e una riga
  unica `app.catalogue_state.version` per il ricettario. **Contratto osservabile** su
  cui conta il server: un contatore cresce quando una transazione cambia i dati da cui
  dipende, al massimo una volta per transazione, e non cresce per scritture che non li
  toccano (le bozze non toccano il ricettario; un voto o un profilo fanno crescere tutte
  le famiglie dell'utente). Il meccanismo è di W2: trigger per riga con incremento
  deduplicato per transazione. Nessuna scrittura (operazione, job, import) può
  dimenticarsene.
- **Versione restituita**: `f{familyId}:{family}.c{catalogue}.{locale}.{deploy}`, con
  le sole parti dichiarate in `reads`. L'id della famiglia è nella versione perché i
  contatori di famiglie diverse partono tutti da zero: una versione posseduta per una
  famiglia non deve mai valere come «invariato» per un'altra. `deploy` è l'id della
  versione del Worker (binding `version_metadata` di Wrangler): una nuova pubblicazione
  invalida le copie, perché può cambiare il calcolo delle viste. `locale` copre il
  cambio di lingua.
- **Middleware**: legge i contatori nella transazione (sotto RLS), compone la versione
  e, se coincide con `knownVersion`, risponde `{ unchanged: true, version }` senza
  eseguire l'handler; altrimenti mette la versione nel contesto e l'handler risponde
  con `fresh(context, view)`. La lettura dei contatori avviene prima della vista nella
  stessa transazione: una scrittura concorrente produce al massimo una vista più nuova
  della versione, che il client rilegge alla verifica successiva, mai una versione più
  nuova di una vista vecchia.
- **MCP**: gli agenti non passano `knownVersion` e ricevono sempre i dati; lo schema
  dello strumento lo mostra come campo facoltativo.

### 4.5 Strumenti MCP

Generati come nella prova (`spike/server/src/mcp.ts`): uno strumento per operazione
con `mcp` diverso da `false`, nome `area_operazione`, descrizione dal `summary`,
`readOnlyHint` da `mcp.readOnly`. La chiamata passa per il router con lo stesso
contesto del web.

- **Validazione unica.** L'SDK MCP valida gli argomenti prima di chiamare lo strumento
  e risponde con un proprio testo inglese. Per avere gli stessi errori del web, lo
  strumento si registra con lo schema JSON dell'input del contratto (`z.toJSONSchema`,
  lato input) e un validatore che lascia passare gli argomenti
  (`fromJsonSchema(schema, validator)` dell'SDK): la validazione la fa oRPC con lo
  schema zod, una volta sola. Verificato con l'SDK 2.3.1 della prova: l'elenco degli
  strumenti mostra lo schema completo e un argomento non valido arriva allo strumento.
- Gli errori tornano come `isError` con `{ code, data, message }`; per `invalid`,
  `data.issues` con i percorsi dei campi e `message` nella lingua del profilo.
- Il raggruppamento degli strumenti resta una questione aperta dell'ondata 2
  (sezione 15).

### 4.6 `session.whoami`

```ts
session.whoami: op({ mcp: { readOnly: true }, offline: false, role: 'user' })
  .route({ method: 'GET', path: '/session/whoami', summary: 'Identify the caller, the channel and the language' })
  .input(z.object({}))
  .output(z.object({ userId: z.uuid(), channel: z.enum(['web', 'mcp']), clientId: z.string().nullable(), locale: z.enum(['it-IT', 'en-GB']) }))
```

Attraversa tutto il percorso (token, transazione, profilo, sessione) e serve come
verifica del collegamento per l'app e per gli agenti.

## 5. Interfacce con le altre attività

Registrate dal coordinatore nel piano generale.

**Con W2 (schema)**, come nella spec di W2
(`progetto/superpowers/specs/2026-10-11-schema-e-permessi.md`, «Interfacce con altri
worker»):

- ruolo `app_server` (`LOGIN NOINHERIT`, membro di `authenticated`, `anon`,
  `app_job`); `app_job` e la funzione `app.temporary_list_by_token` per `anon` sono di
  W2;
- tutto nello schema `app`: `app.profiles(user_id, locale)` creato da un trigger su
  `auth.users`; `app.session_is_active()`; `app.is_member(family_id)`,
  `app.is_family_admin(family_id)`, `app.has_role(role)` con i ruoli `recipe_curator` e
  `app_admin` di `app.user_roles` e `family_admin`/`member` di `app.family_members`;
  `app.families.data_version` e `app.catalogue_state.version` con il contratto della
  sezione 4.4;
- i nomi usati dal server stanno in tre file (`session.ts`, `permissions.ts`,
  `versions.ts`) e negli aiuti dei test (`server/test/support/db.ts`).

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

- Database: Postgres di Supabase con la CLI su Podman (`supabase db start`, scelta di
  W2), con le migrazioni di `supabase/migrations`.
- `npm run dev -w server`: `wrangler dev` sulla porta 8787 con
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` verso il database locale,
  collegato come `app_server`, e `SUPABASE_URL` dell'Auth locale.
- In locale Hyperdrive non fa da pool (prova dell'11 ottobre): le prove di concorrenza
  si fanno sul Worker pubblicato.
- Variabili in `server/.env` (non versionato, come nella prova), con `server/.env.example`.
- npm 11 blocca lo script `postinstall` di `workerd`: per `wrangler dev` va approvato una
  volta (`npm install-scripts approve workerd`).

**Produzione**

- Worker `cosasimangia` sull'indirizzo `workers.dev` dell'account Cloudflare di POWA;
  dominio vero rimandato all'ondata 3.
- Hyperdrive `cosasimangia` verso il Session pooler di Supabase (porta 5432) con
  utente `app_server.<project_ref>`, cache disattivata e `origin_connection_limit`
  esplicito sotto la dimensione del pool del progetto (nella prova 10 su circa 15; il
  valore si fissa leggendo la dimensione effettiva del pool nella dashboard).
- Chiavi di firma asimmetriche attive nel progetto Supabase (requisito della sezione 1),
  da verificare.
- **Pubblicazione a mano** per ora: dopo il merge il coordinatore esegue `npm run
  deploy` nella radice (build di `web`, poi `wrangler deploy` di `server`). La
  procedura sta in `server/README.md`; l'automazione si rivede prima del traguardo A.
- Ogni creazione o modifica di risorse esterne (Worker, Hyperdrive, impostazioni di
  Supabase, segreti) passa da `STATO: DOMANDA` al coordinatore.

**Passi di produzione** (task 10, rimandato dal coordinatore l'11 ottobre 2026 alla
prima pubblicazione, dopo il merge di W2 e dell'app web). Già verificato: il JWKS del
progetto `lronuqvtjdhfyychnscr` contiene una chiave asimmetrica attiva (`EC`, `ES256`).
Restano quattro domande per l'utente:

1. **Dimensione del pool** del Session pooler di Supabase (Database > Connection
   pooling), per fissare `origin_connection_limit` almeno 5 sotto (nella prova 10 su
   circa 15).
2. **Password di `app_server`**: chi la imposta sul progetto (W2 prevede
   `alter role app_server with password …` dall'editor SQL) e come arriva a Hyperdrive
   senza passare dalla conversazione. Proposta: l'utente lancia lui il comando del punto 3.
3. **Creazione di Hyperdrive**, lanciata dall'utente. Opzioni verificate con la
   documentazione di Cloudflare (`--caching-disabled`, `--origin-connection-limit`, limite
   «soft» di connessioni verso l'origine):

   ```bash
   npx wrangler hyperdrive create cosasimangia \
     --connection-string="postgres://app_server.lronuqvtjdhfyychnscr:<password>@<host del Session pooler>:5432/postgres" \
     --caching-disabled \
     --origin-connection-limit=<pool del punto 1 meno almeno 5>
   ```

   L'id restituito va in `server/wrangler.jsonc` al posto del segnaposto.
4. **Prima pubblicazione** (`npm run deploy` sull'account POWA): chi la lancia, dopo
   l'applicazione delle migrazioni di W2 al progetto; poi le verifiche con `curl` del
   piano (task 10, passo 4). Da confermare anche che la produzione usi lo stesso progetto
   Supabase della prova.

## 7. Flusso Git, CI e integrazione di Supabase

- **Flusso**: branch di attività → PR verso `main` → review → merge del coordinatore.
  `main` è la produzione. Nessun branch `sviluppo`.
- **Due consegne.** Lo scheletro (PR #3) è uscito separato. La consegna completa di W1
  si apre dopo il merge di W2 e si verifica contro le sue migrazioni reali.
- **CI** (`.github/workflows/ci.yml`, GitHub Actions su ogni PR e su `main`): `npm ci`,
  `npm run typecheck`, `npm test`. Con la consegna completa la CI avvia il database con
  la CLI di Supabase (`supabase db start` con le migrazioni di W2), esegue anche
  `supabase test db` (pgTAP di W2) e imposta `TEST_DATABASE_URL`: in CI l'assenza del
  database o dello schema reale **fa fallire** i test, nessuna suite di integrazione può
  risultare saltata e la fixture provvisoria è rifiutata.
- **Integrazione GitHub di Supabase**: la verifica (cartella, branch di produzione,
  «Deploy to production», migrazioni applicate al merge) è un passo a sé del
  coordinatore con l'utente, **prima del merge di W2**. Questa attività ne riporta
  l'esito nel README del server.
- **Ordine dei rilasci**: le migrazioni arrivano al merge, il Worker si pubblica
  subito dopo. Le migrazioni sono additive (sezione 1, «modifiche solo additive»),
  quindi il Worker precedente continua a funzionare nel frattempo.

## 8. Test

| Dove | Cosa | Database |
|---|---|---|
| `contract/` | metadati obbligatori e coerenti (4.1), con casi negativi; schemi degli errori | no |
| `server/` | token: firma, scadenza obbligatoria, issuer, audience, `kid` ruotato, ruolo; `sub` e `session_id` UUID; `client_id` vuoto o non stringa rifiutato; canale | no |
| `server/` | token malformati e claim non validi danno `unauthorized` senza raggiungere il database | no |
| `server/` | conversione degli errori (validazione → `invalid`, imprevisti → `internal` con `requestId`); log senza password, token e stringhe di connessione; messaggi nelle due lingue | no |
| `server/` | uno strumento MCP per ogni operazione esposta e nessun altro; 401 con `WWW-Authenticate` | no |
| `server/` | rotte: OpenAPI generato, 404 per percorsi sconosciuti sotto `/api`, asset per il resto | no |
| `server/` | scelta del ruolo: `authenticated` con i claim, `anon`, `app_job`; nessuna impostazione che sopravvive alla transazione, dopo commit e dopo rollback | sì |
| `server/` | `session.whoami` su RPC, REST e MCP | sì |
| `server/` | `unauthorized` con utente cancellato o sessione chiusa, anche su `/mcp` per `initialize` e `tools/list` (401) | sì |
| `server/` | `web_only` dopo la sessione: token revocato → `unauthorized`; agente `en-GB` → messaggio inglese; su RPC e MCP | sì |
| `server/` | `invalid` via `/mcp` con percorso del campo e messaggio in italiano e in inglese | sì |
| `server/` | permessi per ruolo (`familyMember`, `familyAdmin`, `curator`, `appAdmin`) con operazioni di prova | sì |
| `server/` | versione: `unchanged` con la versione corrente, dati dopo una scrittura che fa crescere il contatore, mai «invariato» fra famiglie o lingue diverse | sì |

- Tutti i test girano con Vitest in Node chiamando direttamente la funzione `fetch` del
  Worker con un `env` di prova: stringa di connessione al database locale al posto di
  Hyperdrive, chiavi generate nel test, id di versione fisso.
- Le operazioni di prova per permessi e versioni (`test.*`) stanno in un contratto di
  test separato, non in quello pubblicato.
- **Database dei test.** Le suite con il database usano `TEST_DATABASE_URL`
  (superutente del Postgres locale di Supabase). Gli utenti di prova si creano in
  `auth.users`, con lingua in `raw_user_meta_data`: il profilo lo crea il trigger di W2.
- **Schema reale.** I test usano le migrazioni di W2 (`supabase db start`); se lo schema
  `app` manca falliscono con un messaggio che indica come avviare il database. La
  fixture provvisoria usata prima del merge di W2 è stata tolta (task 11). Il database
  si prepara una volta per esecuzione (setup globale di Vitest: password di prova di
  `app_server`) e i file di test girano uno alla volta, perché condividono il database e
  una scrittura in un file (per esempio la cancellazione di un utente, che fa crescere il
  contatore del ricettario per contratto) invaliderebbe una versione confrontata da un
  altro.
- Senza `TEST_DATABASE_URL`, in locale le suite con il database sono saltate con un
  avviso; in CI (`CI` impostata) falliscono.
- Verifiche manuali prima della PR: `wrangler dev` con `session.whoami` da `curl`;
  dopo la pubblicazione, le stesse sul Worker di `workers.dev`.

## 9. Dipendenze

Tutte nell'elenco ammesso dal brief: oRPC (`@orpc/contract`, `@orpc/server`,
`@orpc/openapi`, `@orpc/zod`; `@orpc/client` nel web e nei test del server), zod,
Postgres.js (`postgres`), `jose`, `@modelcontextprotocol/server`, Wrangler,
`@cloudflare/workers-types`, TypeScript, Vitest. Nessuna dipendenza nuova; niente
`@cloudflare/vitest-pool-workers` (i test girano in Node, scelta del brainstorming).

## 10. Fuori da questa attività: prova reale della revoca di un agente

Il collegamento con consenso richiede la pagina `/authorize`, che arriva nell'ondata 2:
questa attività non collega nuovi agenti. La prova reale della revoca spetta
all'attività «Collegamento degli agenti», con questo criterio: revocare un client,
riusare il suo access token non ancora scaduto su MCP, RPC e REST e verificare il
rifiuto (`unauthorized`, 401 su `/mcp`), mentre gli altri client e la sessione web dello
stesso utente restano attivi. Va verificato anche che i token degli agenti portino
`session_id` (da W2 sull'immagine locale).

## Decisioni da riportare nella specifica

**Prodotto**

- Nessuna.

**Tecniche**

| Decisione | Sezioni |
|---|---|
| Monorepo con npm workspaces (`domain`, `contract`, `server`, `web`) che esportano i sorgenti TypeScript, senza build intermedie; configurazione di Vitest per workspace | 1 (struttura) |
| Rotte: RPC su `/api/rpc`, REST su `/api`, OpenAPI su `/api/openapi.json`; SPA dagli asset statici di Workers con fallback SPA e Worker eseguito per primo solo su `/api/*`, `/mcp`, `/.well-known/*` | 1 |
| Risposta «invariato» nel contratto (`knownVersion` in input, output `{ unchanged: true, version }` o con `data`) al posto di HTTP 304 con `ETag` | 1 (letture dalla copia sul dispositivo) |
| Contratto dei contatori: crescono quando una transazione cambia i dati da cui dipendono, al massimo una volta per transazione (meccanismo di W2: trigger per riga deduplicati); versione `f{familyId}:{family}.c{catalogue}.{locale}.{deploy}` con le sole parti dichiarate dall'operazione (`reads`); bozze fuori dal contatore del ricettario; voti e profili fanno crescere tutte le famiglie dell'utente | 1, 2, 15 (voce Architettura) |
| Idempotenza con `id` generato dal client e operazioni offline a stato assoluto, senza tabella di chiavi | 1 (idempotenza), 6 |
| Utenza tecnica `app_server` membro di `authenticated`, `anon` e `app_job`; ogni transazione sceglie il ruolo | 1 (query nel ruolo dell'utente), 4 |
| Token: `exp`, `sub` (UUID) e `session_id` (UUID) obbligatori; `client_id` presente ma non valido → `unauthorized`, mai canale web | 1 (token verificati), 13 |
| Contesto: lingua da `app.profiles.locale`; revoca immediata con verifica della sessione del token (`app.session_is_active()`) a ogni richiesta, anche all'ingresso di `/mcp` per `initialize` e `tools/list`; `web_only` solo dopo il controllo della sessione | 1 (revoca immediata), 13 |
| Metadati obbligatori `mcp`, `offline`, `role`, facoltativi `webOnly`, `reads`, `creates`; ruoli `user`, `familyMember`, `familyAdmin`, `curator`, `appAdmin`, controllati con le funzioni di W2 | 1 (contratto), 9 |
| Codici di errore in minuscolo con stato HTTP; validazione → `invalid` su tutti i canali, MCP compreso (validazione dell'SDK disattivata, la fa oRPC); `message` localizzato solo per MCP; `internal` con `requestId`, log con campi scelti e senza segreti | 1, 13 |
| Test del server in Node con Vitest chiamando la `fetch` del Worker, senza il pool di Workers; in CI database con le migrazioni reali e nessuna suite saltata | 9 |
| Flusso Git: PR verso `main`, `main` è la produzione; CI su GitHub Actions; pubblicazione del Worker a mano dal coordinatore per ora; integrazione GitHub di Supabase verificata dal coordinatore con l'utente prima del merge di W2 | 1, 10, 15 (voce Implementazione) |
| Worker `cosasimangia` su `workers.dev` di POWA e Hyperdrive con `origin_connection_limit` esplicito | 1 |
| Prova reale della revoca di un agente nell'attività «Collegamento degli agenti»: revocare un client, riusare il suo access token non scaduto su MCP, RPC e REST e verificarne il rifiuto, con gli altri client e la sessione web ancora attivi | 13, 15 (voce MCP) |

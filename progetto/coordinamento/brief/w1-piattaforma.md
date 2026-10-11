# Brief W1: Piattaforma

Segui `progetto/coordinamento/protocollo-worker.md`.

- **Branch:** `fondamenta/piattaforma` · **Worktree:** `.worktrees/piattaforma`
- **Proprietà:** radice del repository (`package.json`, workspace, `tsconfig`, CI),
  `contract/` (struttura, convenzioni, errori, metadati), `server/`, configurazione
  Wrangler e Hyperdrive.
- **Specifica:** sezioni 1, 13 (parte tecnica), 9, 15, 16; `spike/REPORT.md` e il codice
  in `spike/server/` sono il punto di partenza provato.

## Obiettivo

Le fondamenta del server su cui le altre attività aggiungono operazioni:

- struttura del repository con workspace `contract/`, `server/`, `web/`, `domain/`
  (oggi `domain/` sta nella radice con `vitest` e `tsc`: mantienilo funzionante);
- Worker che serve la SPA come file statici e le rotte `/api/rpc`, `/api`,
  `openapi.json`, `/mcp` dal contratto, come nella prova;
- verifica dei JWT con `jose` (cache con soli dati risolti), contesto con utente,
  canale da `client_id` e lingua; transazione nel ruolo `authenticated` con i claim;
- convenzioni del contratto: metadati obbligatori (`mcp`, `webOnly`, `offline`, ruolo)
  con test che ne verifica la presenza; errori a codici della sezione 1; idempotenza;
- meccanismo dei contatori di versione e della risposta «invariato» (cosa li fa
  crescere è da proporre nel brainstorming, in accordo con W2);
- ambienti: sviluppo locale e produzione su `workers.dev` (dominio vero rimandato),
  Hyperdrive con limite di connessioni esplicito sotto il pool di Supabase;
- verifica dell'integrazione GitHub di Supabase (come applica le migrazioni) e proposta
  di flusso Git e CI;
- un'operazione di esempio end-to-end (per esempio `session.whoami`) con test.

## Vincoli dal coordinamento

- **Prima consegna separata e veloce: lo scheletro** (workspace, cartelle vuote con
  `package.json`, script `test`/`typecheck` che girano). Fai una prima PR piccola solo
  con questo appena il piano è approvato, prima del resto: gli altri worker la
  aspettano per implementare.
- Login dell'app per ora con utenze Supabase dirette (email e password o link):
  niente Google, niente Resend, niente dominio `qunidi.it` in questa attività.
- Interfacce da concordare tramite il coordinatore: ruolo tecnico del server e policy
  (W2), client oRPC e token nell'app web (W5).
- Dipendenze ammesse senza discussione: oRPC, zod, Postgres.js, `jose`, SDK MCP,
  Wrangler, TypeScript, Vitest. Altre: proponile.

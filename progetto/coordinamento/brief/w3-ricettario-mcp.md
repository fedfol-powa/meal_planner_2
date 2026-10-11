# Brief W3: Gestione del ricettario tramite MCP

Segui `progetto/coordinamento/protocollo-worker.md` e `brief/ondata2-comune.md`.

- **Branch:** `traguardo/ricettario-mcp` (da `origin/main`) · **Worktree:**
  `.worktrees/ricettario-mcp`
- **Area:** `catalogue` (nuova): gestione del ricettario da parte dei curatori, soprattutto
  tramite agente MCP. L'area `recipes` (consultazione, scheda, voti) è di W6: non toccarla.
- **Specifica:** sezioni 8 (bozze, controlli di completezza, conflitti, versioni,
  pubblicazione, archiviazione, ripristino della singola ricetta; preparazione dei dati
  facoltativa ma obbligatoria nelle due lingue per pubblicare) e 13 (strumenti MCP per i
  curatori), con 2 (tabelle `recipes`, `recipe_drafts`, `recipe_versions`, proiezioni,
  ingredienti, equivalenze, libri), 12 (campi bilingui), più 1, 15, 16.

## Obiettivo

- Operazioni del contratto e strumenti MCP per i curatori: creare e salvare bozze
  (anche di ricette pubblicate), vedere i problemi di completezza a codici e percorsi,
  gestire i conflitti fra bozze e versione corrente, pubblicare una versione nuova
  (immutabile, R1), archiviare e ripristinare una ricetta; gestione di ingredienti,
  sinonimi, equivalenze e libri se la sezione 8 lo richiede per pubblicare.
- Le bozze visibili nell'app ai curatori: la parte web va concordata con W6 (sua area
  `recipes`) e arriva dopo il merge della seconda PR di W5 (client oRPC reale).

## Su cosa costruisci (tutto su `main`)

- Documento ricetta, controlli, proiezioni, `toPublished`, `resolveReferences`
  (`domain/src/recipe/`, tuo, PR #9).
- Schema e permessi delle bozze e delle versioni (PR #4), policy dei curatori, contatori
  di versione, nessuna cancellazione fisica.
- Viste condivise di W6 (`server/src/recipes/views.ts`, PR #12) e lettura del ricettario
  (PR #14): riusale per mostrare le ricette, non duplicarle.
- Contratto, pipeline con implementatore unico in `server/src/router.ts` e factory delle
  aree, `versionedInput`, idempotenza a stato assoluto o id del client.

## Vincoli dal coordinamento (ordine dell'ondata 2)

- Prima del brainstorming leggi «Interfacce decise» e «Ordine dell'ondata 2» del piano
  generale. Nella spec scrivi esplicitamente cosa **usi** da altre attività e cosa
  **produci** per altre (per esempio, per W6: le bozze da mostrare nell'app), con le firme;
  il coordinatore le fissa prima dell'implementazione.
- Le operazioni di gestione richiedono il ruolo di curatore; un agente indica sempre
  `familyId` dove serve (famiglia esplicita, sezione 1).
- Migrazioni: dichiarale nella spec (tabelle e colonne), con test pgTAP.
- Dipendenze ammesse senza discussione: quelle già nel repository. Altre: proponile.

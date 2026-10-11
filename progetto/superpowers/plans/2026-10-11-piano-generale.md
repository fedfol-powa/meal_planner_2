# Piano generale dell'implementazione

Creato: 11 ottobre 2026
Ultimo aggiornamento: 11 ottobre 2026
Stato: approvato dall'utente l'11 ottobre 2026; ondata 1 avviata.

Coordina il lavoro dalla fine del prototipo all'app funzionante. Sostituisce la tabella
delle fasi della specifica, sezione 10 (da riscrivere a fine ondata 1 con questo
schema), e il piano M1a del 29 settembre. Ogni attività ha la sua spec di dettaglio e
il suo piano, che rimandano alla specifica principale e restano subordinati a essa.

## Obiettivo

**Traguardo A: l'app usata ogni settimana dalla famiglia di Federico**, con ricettario
gestito anche tramite agente MCP. Poi l'app diventa un prodotto aperto ad altre famiglie.

Scelte dell'utente dell'11 ottobre 2026 sul perimetro del traguardo A:

- comprende la gestione del ricettario tramite MCP (bozze, versioni, pubblicazione);
- accessi diretti con utenze Supabase; primi utenti e famiglie creati a mano da
  Supabase; inviti, wizard e accesso con Google arrivano dopo, nella fase prodotto;
- passi esterni (DNS di `qunidi.it`, Resend, Google) rimandati finché non servono:
  si parte dall'indirizzo `workers.dev`.

## Ondate

### Ondata 1: fondamenta (5 worker in parallelo)

| # | Attività | Branch | Proprietà (directory) | Contenuto |
|---|---|---|---|---|
| 1 | Piattaforma | `fondamenta/piattaforma` | radice (`package.json`, workspace, CI), `contract/` (struttura e convenzioni), `server/`, configurazione Wrangler | Scheletro del repository; Worker che serve SPA, `/api/rpc`, `/api`, OpenAPI e `/mcp` dal contratto; verifica JWT con `jose`; transazione nel ruolo dell'utente; Hyperdrive con limite di connessioni; errori a codici; metadati delle operazioni (`mcp`, `webOnly`, `offline`, ruolo) con test; contatori di versione e risposta «invariato» come meccanismo; deploy su `workers.dev`; verifica dell'integrazione GitHub di Supabase e flusso Git. **Prima consegna: scheletro minimo da unire subito** |
| 2 | Schema e permessi | `fondamenta/schema` | `supabase/` | Migrazioni delle sezioni 2 e 7: profili, ruoli globali, famiglie, membri, ricette, proiezioni, bozze, versioni, ingredienti, settimane, pasti, modifiche, voti, spesa, job. RLS con test delle policy; database locale per i test; dati iniziali a mano per la famiglia |
| 3 | Ricetta e import | `fondamenta/ricetta-import` | `domain/src/recipe/`, `scripts/import/` | Schema del documento ricetta (zod) con livello bozza e livello pubblicabile; scelta sui campi bilingui; controlli di completezza; proiezioni; import rilanciabile da `../meal_planner` con i casi R4, report delle ambiguità, traduzioni en-GB da rivedere |
| 4 | Unità e spesa | `fondamenta/unita-spesa` | `domain/src/units/`, `domain/src/shopping/` | Dominio puro: codici delle unità, sistema metrico e imperiale britannico, equivalenze per ingrediente, scalatura delle porzioni, consolidamento della lista, pezzi interi, unità di acquisto (sezione 6); si parte da `prototype/src/lib/units` e dai test del prototipo |
| 5 | App web di base | `fondamenta/web` | `web/` | React con Vite, TanStack Router e Query; token e componenti da `design/`; testi in italiano e inglese britannico; navbar, schermate principali del prototipo con dati finti; PWA; login con utenza Supabase |

**Interfacce da concordare fra worker** (le decide il coordinatore, registrate qui sotto):

- documento ricetta (3) ↔ tabelle `recipe_versions`, `recipe_drafts` e proiezioni (2);
- codici delle unità e struttura delle righe di ingrediente (3) ↔ dominio unità e spesa (4);
- convenzioni del contratto, errori e contesto (1) ↔ operazioni delle ondate successive;
- ruolo tecnico del server, impostazione dei claim e ruolo `authenticated` (1) ↔ policy (2);
- client oRPC, token di sessione e cache persistita (1) ↔ app web (5).

### Ondata 2: traguardo A

Ogni attività comprende operazioni del contratto, schermate e strumenti MCP derivati,
test. Ordine e parallelismo si fissano a fine ondata 1.

| Attività | Sezioni della specifica |
|---|---|
| Profilo, famiglia e impostazioni (senza inviti) | 2, 7 |
| Ricettario e voti | 2, 8, 12 |
| Menu, pianificatore, job del mercoledì e generazione pigra | 3, 4, 5 |
| Revisione dei pasti | 5 |
| Spesa, anche offline | 6 |
| Gestione del ricettario tramite MCP: bozze, conflitti, versioni, pubblicazione, archiviazione, ripristino della singola ricetta; bozze visibili nell'app | 8, 13 |
| Collegamento degli agenti (OAuth 2.1 di Supabase, pagina «Collega un agente», scollegamento) | 13 |
| Esportazione notturna in R2 | 8 |
| Messa in produzione: import del ricettario e dei dati della famiglia | 11 |

### Ondata 3: prodotto

Inviti familiari e all'app, wizard, accesso con Google, Resend e dominio
`cosasimangia.qunidi.it`, amministrazione dell'app, ripristino dell'intero catalogo,
Claude Desktop e ChatGPT, cancellazioni, apertura ad altre famiglie, modulo manuale del
ricettario (ultima priorità), giudice AI opzionale.

## Metodo per ogni attività

1. Worker Claude in una tab herdr, con branch e worktree dedicati in `.worktrees/`.
2. **Brainstorming** (skill `superpowers:brainstorming`): il coordinatore risponde ai
   dubbi; le decisioni dell'utente passano dal coordinatore o, se serve, dal Remote
   Control sul worker.
3. **Spec di dettaglio** in `progetto/superpowers/specs/` e **piano** in
   `progetto/superpowers/plans/`.
4. **Review avversariale di spec e piano** da un worker separato; correzioni.
5. **Implementazione** con TDD.
6. **Pull request** e **review avversariale del codice** da un worker separato;
   correzioni.
7. **Merge** su `main` del coordinatore (autorizzato dall'utente l'11 ottobre 2026),
   poi la spec principale riceve le decisioni dalla sezione «Decisioni da riportare»
   della spec di dettaglio.

La specifica principale, `design/percorsi.md`, `AGENTS.md` e questo piano li modifica
solo il coordinatore.

## Stato

| # | Attività | Fase | Note |
|---|---|---|---|
| 1 | Piattaforma | Brainstorming | |
| 2 | Schema e permessi | Brainstorming | |
| 3 | Ricetta e import | Brainstorming | |
| 4 | Unità e spesa | Brainstorming | |
| 5 | App web di base | Brainstorming | |

## Interfacce decise

(vuoto)

## Registro delle decisioni del coordinamento

| Data | Decisione |
|---|---|
| 11 ottobre 2026 | Piano generale approvato: tre ondate, cinque worker nell'ondata 1, traguardo A con gestione MCP, utenze dirette prima di Google, passi esterni rimandati; push, PR e merge delegati al coordinatore |

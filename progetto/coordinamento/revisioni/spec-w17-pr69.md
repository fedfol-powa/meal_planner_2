**Verdetto: APPROVABILE CON CORREZIONI**

Revisione della PR #69, branch `docs/specifica-w17`, commit `28a2cf6`, rispetto a `origin/main` (`cdbd7fe`, merge della PR #68). Il diff modifica soltanto la specifica principale: 140 righe aggiunte e 40 rimosse.

**Rilievi**

1. **Minore — La descrizione per gli utenti anticipa la disponibilità della skill.**

   **File e righe:** [specifica principale, riga 746](/Users/fedfol/Projects/meal_planner_2/.worktrees/doc-skill/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:746); stessa ambiguità nella tabella delle rotte, riga 886.

   **Problema:** «Dal 18 ottobre 2026 “Collega un agente” offre […]» presenta il download come già disponibile. L’intestazione, la sezione 13 e la [tabella dello stato, riga 3481](/Users/fedfol/Projects/meal_planner_2/.worktrees/doc-skill/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:3481) dichiarano invece correttamente che la PR #68 è unita ma il rilascio è in preparazione.

   **Perché conta:** confonde la presenza del codice su `main` con la disponibilità nell’app usata dalla famiglia.

   **Correzione proposta:** scrivere «Con la PR #68, unita il 18 ottobre 2026 e in attesa di rilascio, “Collega un agente” offrirà…». Nella tabella delle rotte sostituire «dal 18 ottobre 2026» con «PR #68, rilascio in preparazione».

**Verifiche sul contenuto**

- Le decisioni della sezione «Decisioni da riportare nella specifica» del piano W17 e del brief sono presenti: skill unica, perimetro senza spesa, inglese con risposte nella lingua dell’utente, guida del ricettario come fonte, conferme, download e istruzioni, versione condivisa e verifiche sul contratto.
- I dettagli tecnici corrispondono al codice unito su `origin/main`: sorgente in `agent-skill/`, zip deterministico con `node:zlib`, generazione tramite `sync-assets` in `predev` e `prebuild`, esclusione da Git, instradamento come asset statico, esclusione dalla cache del service worker, versione estratta da Vite e posizione della sezione in `AgentsPage.tsx`. Anche la descrizione dei test corrisponde ai test presenti.
- Lo stato di D riporta correttamente **17 ottobre 2026, 17:54 UTC**, versione **`21616921-3cfe-4390-b19c-9e42d824cebe`**, commit **`4e1483e`**. Il registro conferma gli identificativi; il piano generale del checkout principale, riga 300, conferma chiusura e prove riuscite, compresi invito, recupero password, allarme e iPhone.
- Le rimozioni relative al flusso precedente a D non eliminano regole ancora valide: restano la descrizione storica, prenotazione e chiusura degli inviti, protezione degli account esistenti e invariabilità degli account creati prima di D.
- Nessun’altra contraddizione introdotta o duplicazione problematica rilevata. I riepiloghi e i dettagli seguono la struttura già adottata dalla specifica; lingua e stile sono coerenti.

**Controlli eseguiti e limiti**

| Controllo | Esito |
|---|---|
| `git diff --check origin/main...HEAD` | Superato |
| `npm run typecheck` | Superato nella radice e nei quattro workspace |
| Test server mirati, con `--configLoader runner --no-cache` | 5 superati; 6 di `asset-routing` saltati per assenza del database locale |
| Test web mirati: zip, regole del service worker, pagina agenti | 20 superati |
| `npm test` standard | Bloccato all’avvio da `EPERM` sulla cache `.vite-temp` del checkout principale |
| `npm run build -w web --ignore-scripts` | TypeScript superato; Vite bloccato dallo stesso `EPERM` |

La build completa e l’integrazione dell’instradamento degli asset non risultano quindi verificate in questa sessione. Il `prebuild` è stato escluso per preservare la sola lettura del worktree.

Nessun file modificato; nessun commit o commento sulla PR.

**Punti da decidere dal coordinatore o dall’utente**

Nessuna nuova decisione di prodotto o tecnica. Restano le prove già previste dopo il rilascio di W17: caricamento su claude.ai, attivazione con domande sul menu e utilizzo dall’app Claude sull’iPhone.
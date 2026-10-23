**Verdetto: APPROVABILE CON CORREZIONI**

Revisione della PR #81, branch `docs/w22-w23-w24`, commit `1e42864`, sul diff `origin/main...HEAD`. Nessun file modificato.

**Rilievi**

1. **Minore — Finestra di consegna delle email formulata in modo ambiguo.**  
   In [specifica principale, riga 2189](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2189), «vale finché mancano almeno 1 minuto alla mezzanotte […] e 23 ore dal primo tentativo» non esprime correttamente il secondo limite. Il codice chiude la consegna quando sono trascorse 23 ore dal primo tentativo: [deliver.ts, riga 40](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/server/src/menu-emails/deliver.ts:40). La formulazione conta perché descrive la protezione dai doppioni. **Correzione:** «si può inviare finché manca più di un minuto alla mezzanotte locale del lunedì e sono trascorse meno di 23 ore dal primo tentativo».

2. **Minore — Motivazione del pulsante «Oggi» in contraddizione con la regola di apertura.**  
   In [specifica principale, riga 2303](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:2303), il pulsante viene descritto come assente «perché l'apertura porterebbe a un altro giorno», anche con soli slot vuoti o dati non disponibili. Non è necessariamente vero: `getOpening` può restituire oggi con soli slot vuoti, come correttamente precisato nella stessa specifica alla [riga 4535](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:4535) e implementato in [opening.ts, riga 18](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/server/src/menu/opening.ts:18). **Correzione:** eliminare quella motivazione oppure sostituirla con «perché non è accertata la presenza di un pasto con contenuto oggi». La regola di visibilità riportata è corretta.

3. **Minore — W22 manca in `design/percorsi.md`.**  
   Gli aggiornamenti del documento coprono W23 e W24, ma non riportano l’estensione dello skeleton alle pagine rare e alle sezioni dei curatori. Anche la descrizione di [`/password`, riga 1214](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/design/percorsi.md:1214) resta senza il nuovo stato di verifica e il comportamento offline. La specifica principale contiene queste decisioni, ma il riporto nei percorsi richiesto dall’incarico è incompleto. **Correzione:** aggiungere una breve nota trasversale su W22, con copertura, distinzione fra sezioni condizionali e pagine riservate, verifica di `/password` e rimando alla sezione 14; indicare «unita, rilascio in preparazione».

4. **Minore — W23 manca nelle «Interfacce decise».**  
   Nel [piano generale, riga 253](/Users/fedfol/Projects/meal_planner_2/.worktrees/docs-w22-w24/progetto/superpowers/plans/2026-10-11-piano-generale.md:253), le nuove voci passano da W22 direttamente a W24. W23 compare nel registro storico, ma manca nella sezione richiesta, insieme alla decisione successiva sul normale ciclo della query e alle precisazioni sul focus. **Correzione:** aggiungere una voce sintetica con osservazione della settimana di oggi tramite `menu.getWeek`, ricalcolo della data senza timer e focus solo all’arrivo effettivo; rimandare alla sezione 14 per i dettagli e precisare che non introduce operazioni server o MCP.

**Copertura e coerenza verificate**

- Tutte le voci delle tre sezioni «Decisioni da riportare» trovano riscontro nella specifica principale, salvo le imprecisioni dei rilievi 1 e 2. Sono recepite anche le decisioni dei messaggi del coordinatore su memoria delle bozze, annunci di caricamento, letture e focus di «Oggi», eccezioni MCP, miniature, invii incerti e primo rilascio.
- Tabelle, colonne, funzioni SQL, operazioni, rotte, variabili e nomi/livelli dei log riportati coincidono con il codice esaminato. Il codice del worktree nelle directory applicative coincide con `origin/main`.
- «Non manda notifiche sui menu» è sostituito correttamente. Le esclusioni delle pagine rare e delle sezioni dei curatori sono superate esplicitamente nel testo normativo; le menzioni precedenti nel registro rimangono riconoscibili come storiche.
- Lo stato di W22–W24 è correttamente **unito, rilascio in preparazione**; i collaudi successivi al rilascio restano da fare.
- Lunghezza e stile seguono l’impostazione già presente: requisiti nelle sezioni di prodotto, dettagli tecnici nella parte tecnica e registrazione storica finale. Nessun ulteriore rilievo di stile.

**Verifiche eseguite**

| Verifica | Esito |
|---|---|
| `git diff --check origin/main...HEAD` | Superata |
| `npm run typecheck` | Superato per tutti i workspace |
| Test contratto | 68 superati |
| Test dominio | 274 superati |
| Test web | 1.241 superati, 11 esclusi |
| Test server | 209 superati, 625 esclusi |

Test eseguiti con `--no-cache --configLoader runner`. Le verifiche d’integrazione che richiedono il database locale non sono state eseguite.

Build web tentata in memoria con `write: false`: interrotta da `ENOENT` su `web/public/assets/fonts`, directory preparata normalmente da `sync-assets`. Il prebuild non è stato eseguito per rispettare la richiesta di non modificare file. Non considero questo limite un difetto della PR documentale.

Worktree pulito al controllo finale; nessun commit, commento sulla PR o rapporto scritto su file.

**Punti da decidere dal coordinatore o dall’utente**

Nessuna nuova decisione di prodotto o tecnica: le correzioni proposte riallineano i documenti a decisioni già approvate.
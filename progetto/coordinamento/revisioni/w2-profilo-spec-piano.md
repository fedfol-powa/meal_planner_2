# Revisione W2 — Profilo, famiglia e impostazioni

**Verdetto: DA RIFARE**

Il perimetro funzionale è coerente con il brief, ma il piano richiede una revisione prima dell’implementazione: contiene problemi verificabili nella protezione dei dati, nella gestione della cache e nei test, oltre a interfacce incompatibili tra attività. Non occorre ripensare il prodotto; occorre rendere coerenti e verificabili i punti di integrazione.

Revisione svolta in sola lettura. Nessun file modificato, nessun commit. Non sono stati eseguiti test o build dell’implementazione W2, che è ancora descritta nei documenti.

## Rilievi

### 1. Importante — La nuova colonna rivela ai co-membri la famiglia mostrata da un altro utente

**Riferimenti:** [spec W2, riga 176](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/specs/2026-10-11-profilo-famiglia.md:176), [grant di lettura dei profili, riga 80](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/supabase/migrations/20261011100100_identity.sql:80), [policy `profiles_read`, riga 149](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/supabase/migrations/20261011100300_families.sql:149).

La migrazione aggiunge `current_family_id` a una tabella leggibile per intero dal ruolo `authenticated`; la policy consente di leggere anche i profili dei co-membri. Pertanto Bruno, membro soltanto dei Rossi, può leggere sul profilo di Anna l’identificativo dei Bianchi quando Anna seleziona quella famiglia.

La chiave esterna protegge la validità della selezione, non la sua riservatezza. Non emerge un endpoint W2 che esponga direttamente la colonna altrui, ma viene meno il confine garantito dall’RLS anche alle query del server. Le policy RLS filtrano righe, non singole colonne. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

**Correzione proposta:** mantenere la selezione privata al proprietario mediante una struttura separata oppure limitare la lettura dei profili al proprietario ed esporre ai co-membri soltanto identificativo e nome tramite una funzione/vista controllata. Aggiungere un test pgTAP con Anna in due famiglie e Bruno in una sola, verificando che Bruno non possa leggere la selezione di Anna.

### 2. Importante — Le risposte tardive possono sovrascrivere modifiche già confermate

**Riferimenti:** [piano W2, riga 1993](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:1993), [aggiornamento del profilo, riga 2008](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:2008), [modello già implementato da W5, riga 19](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/ratings.ts:19).

`applyFamilyMutation` scrive immediatamente la risposta nella cache senza cancellare le letture precedenti. Una `getSettings` partita prima del salvataggio può quindi arrivare dopo e ripristinare la vista vecchia. Per le altre letture viene inoltre usato `cancelRefetch: false`, che mantiene una richiesta già in corso invece di avviarne una aggiornata. [Documentazione TanStack Query](https://github.com/tanstack/query/blob/main/docs/framework/react/guides/migrating-to-react-query-4.md).

Mancano anche le verifiche di sessione e di ordine delle risposte già presenti in `useRateRecipe`. Disabilitare il singolo controllo non basta: due controlli diversi possono produrre risposte contenenti l’intera vista delle impostazioni e arrivare in ordine inverso.

**Correzione proposta:** adottare esplicitamente il modello W5: cancellazione delle letture interessate, verifica della sessione e della lingua, gestione delle mutazioni concorrenti sulla stessa vista. Aggiungere test con promesse controllate per:

- lettura vecchia completata dopo una mutazione;
- due mutazioni su chiavi diverse con risposte invertite;
- risposta dopo logout o cambio di lingua.

### 3. Importante — Le invalidazioni non coprono le dipendenze reali

**Riferimenti:** [spec W2, riga 224](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/specs/2026-10-11-profilo-famiglia.md:224), [piano W2, riga 2182](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:2182), [Spesa, riga 118](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:118), [Ricettario, riga 201](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:201).

Il piano prescrive `invalidates: 'self'` per quasi tutte le impostazioni, ma:

- aggiungere o togliere un ingrediente `avoid` cambia la lista della spesa;
- cambiare i libri posseduti cambia l’insieme delle ricette consultabili nella ricerca;
- cambiare il fuso deve aggiornare anche `profile.get`, da cui `useFamily()` ricava `timeZone`;
- cambiare il nome della persona modifica le attribuzioni in menu, spesa ed esclusioni, anche nelle altre famiglie dell’utente.

`profile.get` non ha `familyId` nella chiave e non viene intercettata da `familyOfKey`. Il Menu di W5 usa direttamente `family.timeZone`: invalidare soltanto le query familiari lascia quindi il calendario sul vecchio fuso. [MenuPage, riga 110](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/routes/MenuPage.tsx:110).

**Correzione proposta:** definire una matrice esplicita operazione → viste da aggiornare/invalidare, condivisa con W1, W4 e W6. Verificarla con test che popolino prima tutte le cache interessate. L’incremento del contatore sul server, da solo, non aggiorna la cache locale.

### 4. Importante — Il passaggio da `me` a `profile` non comprende tutti gli agganci della sessione W5

**Riferimenti:** [Task 11, riga 1919](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:1919), [wrapper W5, riga 170](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:170), [gestione della revoca, riga 96](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:96).

La base effettiva non avvolge genericamente tutte le aree: `wrapApi` restituisce esplicitamente soltanto `me`, `menu`, `recipes` e `ratings`. Aggiungere `api.profile` e `api.family` al client non le rende automaticamente disponibili attraverso `ApiProvider`, né applica il rinnovo della sessione e le protezioni sulle risposte.

Inoltre, dopo un `forbidden`, `SessionScope` invalida esplicitamente `['me']`. Sostituire i soli usi di `me.get` lascia questo riferimento alla vecchia chiave.

**Correzione proposta:** assegnare esplicitamente a W2 o alla seconda PR W5 l’aggiornamento di `wrapApi`, dei tipi/client finti, delle chiavi della sessione e delle relative prove. Testare una chiamata reale a entrambe le nuove aree attraverso `SessionScope`, compresi rinnovo e revoca. Il rinvio generico ad «adattare alla base unita» non chiude questa interfaccia.

### 5. Importante — W2 e W1 configurano diversamente l’implementatore condiviso

**Riferimenti:** [piano W2, riga 521](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:521), [piano W1 Menu, riga 1298](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/plans/2026-10-11-menu-pianificatore.md:1298), [interfaccia approvata `prepare`, riga 147](/Users/fedfol/Projects/meal_planner_2/progetto/superpowers/plans/2026-10-11-piano-generale.md:147).

W2 sposta `os` in `server/src/os.ts` e lo costruisce con `createImplementer(contract)`. W1 mantiene la costruzione in `server/src/router.ts`, passando `{ prepare: menuPrepare }`.

I due interventi insistono sullo stesso punto e non sono semplici registrazioni additive. Un merge che conservi l’implementatore W2 senza le opzioni elimina la generazione pigra; mantenere entrambe le costruzioni introduce due configurazioni diverse.

**Correzione proposta:** concordare un unico punto di costruzione e il suo proprietario. Una soluzione coerente con W6 è passare l’implementatore ai factory delle aree. In alternativa, `os.ts` deve ricevere esplicitamente la configurazione `prepare`. Il test finale deve attraversare il router composto e verificare che la preparazione del menu preceda `readVersion`.

### 6. Bloccante per l’integrazione — Le firme delle viste ricetta W1 ↔ W6 non coincidono

**Riferimenti:** [spec W1 Menu, riga 351](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:351), [spec W6, riga 100](/Users/fedfol/Projects/meal_planner_2/.worktrees/ricettario/progetto/superpowers/specs/2026-10-11-ricettario-e-voti.md:100), [proprietà approvata, riga 139](/Users/fedfol/Projects/meal_planner_2/progetto/superpowers/plans/2026-10-11-piano-generale.md:139).

Il percorso dei file coincide, ma non il contratto:

| Funzione | W1 si aspetta | W6 propone |
|---|---|---|
| `ratingSummaries` | `(tx, familyId, recipeIds)` | `(tx, familyId, userId, recipeIds)` |
| `ingredientLinesView` | caricatore asincrono in blocco, con `tx` e documenti | funzione pura su righe e nomi, risultato sincrono |
| Riepiloghi ricette | `recipeSummaryViews`, chiave `id:version` | `recipeViews`, chiave `id@version@servings` |

Anche lo schema del voto è chiamato `ratingSummary` da W1 e `ratingSummaryView` da W6. Inoltre W1 si riserva di creare il modulo se arriva prima, mentre l’accordo generale lo assegna a W6 con consegna anticipata.

**Perché conta:** gli import del Menu non possono compilare e funzionare seguendo entrambe le specifiche. È un rilievo trasversale, da assegnare a W1/W6, non da correggere costruendo un terzo adattatore in W2.

**Correzione proposta:** fissare un solo contratto, aggiornare entrambi i documenti e aggiungere nella PR anticipata W6 una prova del consumo da parte del Menu, comprese versioni R1 e ricette mai pubblicate.

### 7. Importante — `not_found` viene lanciato ma non dichiarato nelle operazioni W2

**Riferimenti:** [contratti libri e ingredienti, riga 1458](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:1458), [contratto esclusioni, riga 1608](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:1608), [errori comuni](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/contract/src/errors.ts:45).

`family.setBookOwned`, `family.setIngredientRestriction` e `family.addExclusion` lanciano `not_found`, ma le definizioni non aggiungono `.errors({ not_found: … })`. `op()` eredita soltanto gli errori comuni, che non comprendono quel codice.

Questo lascia incompleto il contratto destinato ai client e a OpenAPI. I test tramite chiamata diretta al gestore non verificano la dichiarazione dell’errore.

**Correzione proposta:** dichiarare gli errori specifici e verificarli nel contratto e attraverso RPC/REST. Allineare anche `setBookOwned({ owned: false })`: la spec promette `not_found` per un libro inesistente, il gestore esegue una cancellazione senza verificarne l’esistenza.

### 8. Importante — Le impostazioni malformate si leggono, ma possono impedire il successivo salvataggio

**Riferimenti:** [garanzia della spec, riga 73](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/specs/2026-10-11-profilo-famiglia.md:73), [scrittura JSONB, riga 1357](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:1357).

`resolveFamilySettings` accetta valori sporchi sostituendoli con default. `writeSettingsKey`, invece, conserva i genitori esistenti usando `coalesce`: un genitore JSON `null`, una stringa o un array non viene sostituito con un oggetto.

Con `{"slots":null}` oppure `{"slots":{"lunch":"broken"}}`, la pagina può mostrare una matrice valida, ma il successivo `setMeal` non dispone del percorso a oggetti richiesto. Il controllo `rows.length` verifica soltanto che l’UPDATE abbia trovato la famiglia, non che il valore richiesto sia stato salvato. [Semantica di `jsonb_set`](https://www.postgresql.org/docs/17/functions-json.html).

**Correzione proposta:** normalizzare il tipo di ogni genitore lungo il percorso, preservando le altre chiavi valide, nella stessa scrittura atomica. Testare lettura e successiva modifica di `slots`, `slots.lunch` e `groupRanges` malformati, oltre alle scritture concorrenti.

### 9. Importante — Il ciclo TDD descritto contiene test e comandi che non provano il comportamento richiesto

**Riferimenti:** [test pgTAP del piano, riga 368](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:368), [helper reali, riga 82](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/supabase/tests/helpers/setup.psql:82), [fixture reali, riga 82](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/supabase/tests/helpers/fixtures.psql:82), [comando dominio, riga 197](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:197).

Problemi verificati:

- `tests.family('test-Rossi')` cerca `test-test-Rossi`: l’helper aggiunge già il prefisso. Anche `family_version` viene chiamato con il nome errato.
- Anna appartiene ai Bianchi nelle fixture: correggere soltanto il prefisso non rende valido il test che dovrebbe rifiutare quella famiglia.
- Il comando del dominio, eseguito dalla radice con `-c domain/vitest.config.ts`, usa una configurazione con `include: ['src/**/*.test.ts']` e senza `root: domain`: non individua i test indicati come previsto.
- Avviare Postgres non imposta `TEST_DATABASE_URL`; fuori dalla CI i test server possono risultare saltati, anziché fallire nel passo rosso.
- Il test MCP finale verifica una lettura riuscita e una scrittura rifiutata, non una mutazione riuscita, contrariamente alla copertura dichiarata.

**Correzione proposta:** usare i nomi senza prefisso e una famiglia realmente estranea, per esempio Verdi; eseguire il dominio nel workspace; impostare esplicitamente l’ambiente dei test server e controllare che le suite siano eseguite. Aggiungere una scrittura MCP autorizzata con rilettura. Il passaggio rosso deve fallire per il comportamento mancante, non per fixture sbagliate o mancata raccolta dei test.

### 10. Minore — Il blocco `domain/package.json` ripropone una versione superata del file condiviso

**Riferimenti:** [piano W2, riga 106](/Users/fedfol/Projects/meal_planner_2/.worktrees/profilo/progetto/superpowers/plans/2026-10-11-profilo-famiglia.md:106), [file nel checkout principale, riga 5](/Users/fedfol/Projects/meal_planner_2/domain/package.json:5).

Il blocco completo del piano conserva soltanto gli export `./planner` e `./family`. Nel checkout principale sono già presenti `./units` e `./shopping`, oltre alla dipendenza zod.

**Correzione proposta:** descrivere una modifica additiva del solo export `./family`, preceduta dall’allineamento a `main`, preservando gli export di W4 e quelli successivi di W3. Non usare il blocco come sostituzione integrale del file.

## Esito delle altre verifiche incrociate

| Ambito | Esito |
|---|---|
| `resolveFamilySettings`, W2 → W1 | Firma `unknown → PlannerSettings`, percorso e proprietà coincidono. Tipi/default restano al pianificatore; schema salvato e risoluzione a W2. |
| `families.settings` | Struttura compatibile con i tipi attuali del pianificatore. Da correggere la gestione delle scritture su dati malformati, rilievo 8. |
| Esclusioni | Proprietà W2, nomi delle tre operazioni e input `{familyId, recipeId, reason?}` coerenti. L’aggiunta preserva primo autore e data tramite chiave naturale e `on conflict do nothing`. |
| `mealRecipeVersions`, W1 → W4 | Firma e campo `version: number \| null` compatibili; W1 aggiunge `isPast`, che W4 può ignorare. Il piano generale usa ancora il nome `versionId`: va aggiornato. Il file concreto di W1 è `server/src/menu/versions.ts`. |
| `ratings.set` | Proprietà W6 e input `{familyId, recipeId, stars: number \| null}` coerenti con W5. La divergenza riguarda i caricatori condivisi, rilievo 6. |
| Migrazioni | Nessuna collisione di timestamp rilevata: W2 propone `20261011120000_current_family.sql`; Menu, Ricettario e Spesa dichiarano di non aggiungere migrazioni. |
| Permessi delle operazioni | Ruoli dichiarati coerenti: profilo proprio, impostazioni agli amministratori familiari, esclusioni ai membri. La nuova lettura SQL del profilo richiede la correzione del rilievo 1. |
| MCP | Tutte le 19 operazioni W2 prevedono esposizione MCP e `offline: false`; nessuna eccezione `webOnly` impropria. Va completata la prova di scrittura riuscita. |
| Testi bilingui | Previsti dizionari italiani e britannici, nomi del catalogo localizzati e messaggi d’errore esistenti. Nessuna omissione sistematica rilevata; la verifica effettiva resta alla PR. |
| Perimetro | Inviti, rimozioni, wizard, cancellazioni e Google correttamente esclusi. Procedura bootstrap riusata senza introdurre un secondo script. |

## Punti da decidere dal coordinatore

1. **Contratto unico delle viste W6 → W1 e proprietà dell’implementatore server.** Chiudere firme, punto di configurazione di `prepare` e ordine di consegna prima di implementare i punti interessati.
2. **Passaggio definitivo `me.get` → `profile.get`.** W5 ammette l’allineamento dei nomi, ma occorre assegnare la migrazione completa di client, wrapper, cache e revoca; aggiornare anche la voce «Famiglia mostrata» del piano generale.
3. **Trattamento dei dati salvati non validi.** La risoluzione tollerante è elencata fra le decisioni da riportare, ma non compare fra quelle esplicitamente attribuite al coordinatore nel brainstorming. Confermarla, includendo il comportamento del primo salvataggio successivo.
4. **Consolidamento documentale.** Riportare nella specifica principale le decisioni W2 già concordate e correggere `versionId` in `version` nel piano generale. Non servono nuove decisioni dell’utente per correggere test, errori dichiarati o invalidazioni mancanti.
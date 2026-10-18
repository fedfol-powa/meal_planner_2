**Verdetto: APPROVABILE CON CORREZZIONI**

Seconda revisione di spec e piano W20 sul branch `evolutive/skeleton`, commit `038b49b`, confrontati con il codice web del worktree corrente. Le correzioni risolvono buona parte della prima revisione, ma **gli otto rilievi non sono ancora tutti chiusi**: restano problemi nel layout della Ricetta, nel passaggio dal gate al Ricettario e nei blocchi dell’intestazione della Spesa.

**Rilievi**

1. **Importante — I filtri interattivi possono rimontarsi quando il gate lascia posto alla vista.**

   **Riferimenti:** [piano, riga 282](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:282), [test previsto, riga 294](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:294), [RecipesPage.tsx, riga 26](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/routes/RecipesPage.tsx:26), [RecipeFilters.tsx, riga 12](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/components/RecipeFilters.tsx:12).

   Il piano costruisce i filtri in `RecipesPage` e passa lo stesso frammento al layout di attesa e alla vista. Questo non ne conserva automaticamente l’istanza: nel passaggio previsto da `waiting` a `RecipesView` cambia il ramo dell’albero che li contiene. `RecipeFilters` mantiene internamente l’apertura del pannello e il testo del campo.

   **Perché conta:** con il profilo lento, l’utente può aprire i filtri o iniziare a scrivere. All’arrivo del profilo il pannello può richiudersi e il campo perdere il focus, causando proprio uno spostamento durante l’interazione. Il test che accetta «stessi nodi **o stessa struttura**» non intercetta questa regressione. La conservazione dello stato dipende dalla posizione nell’albero, come conferma la [documentazione React consultata tramite Context7](https://react.dev/learn/preserving-and-resetting-state).

   **Correzione proposta:** mantenere layout e controlli in un ramo stabile, sostituendo soltanto l’area dipendente dalla famiglia. Aggiungere una prova che apra i filtri e metta il focus nel campo durante l’attesa del profilo, poi verifichi apertura, focus, valore e geometria dopo la risposta.

2. **Importante — Il test del Ricettario richiede sezioni dei curatori prima che il loro ruolo sia conoscibile.**

   **Riferimenti:** [piano, riga 294](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:294), [spec, riga 103](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:103), [queries.ts, riga 26](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/catalogue/queries.ts:26), [CatalogueDraftsSection.tsx, riga 22](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/catalogue/CatalogueDraftsSection.tsx:22).

   Il test trattiene la risposta del profilo e pretende già presenti le sezioni dei curatori. Nel codice attuale `useIsCurator()` ricava il ruolo proprio dal profilo e restituisce `false` finché manca. Inoltre Bozze e Archiviate richiedono la risposta di `catalogue.overview` e non vengono mostrate quando i rispettivi elenchi sono vuoti.

   **Perché conta:** montare gli stessi componenti nel layout non rende possibile l’aspettativa del test. La promessa di sezioni vere e ferme fin dall’attesa iniziale resta incompatibile con le dipendenze effettive.

   **Correzione proposta:** distinguere profilo sconosciuto, ruolo noto e catalogo disponibile. Precisare l’eventuale spostamento ammesso quando compaiono le sezioni dei curatori, oppure progettare esplicitamente lo spazio da riservare. Separare le prove per membro, curatore e profilo ritardato.

   Va inoltre chiarita la frase «`before` e `after` restano per le pagine che non danno `waiting`» ([piano, riga 271](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:271)): il Ricettario deve continuare a mostrare le sezioni autorizzate anche senza famiglia, comportamento esplicito di [RecipesPage.tsx, riga 23](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/routes/RecipesPage.tsx:23). La nuova prop deve cambiare l’attesa, senza sopprimere questa possibilità negli altri stati del gate.

3. **Importante — Il layout di attesa della Ricetta differisce ancora strutturalmente dalla pagina caricata.**

   **Riferimenti:** [piano, riga 314](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:314), [PageHeader.tsx, riga 4](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/components/PageHeader.tsx:4), [global.css, riga 114](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/design/global.css:114), [RecipePage.tsx, riga 90](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/routes/RecipePage.tsx:90).

   Nell’attesa prevista, `header.page-header` contiene soltanto il link indietro; il titolo segnaposto è nei `children`, dopo l’header. Nella pagina caricata `PageHeader` contiene invece sia link sia titolo. Il padding inferiore dell’header finisce quindi prima del titolo durante l’attesa e dopo il titolo all’arrivo.

   Anche la foto è descritta soltanto con `.meal-media`, mentre quella reale usa il margine inferiore di 16 px di [photo.module.css, riga 2](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/catalogue/photo/photo.module.css:2). Le due righe generiche per voto e descrizione non specificano la struttura del voto interattivo, che comprende controlli da 44 px e un margine inferiore.

   **Perché conta:** la correzione non soddisfa ancora la promessa di geometria coincidente nel caso comune; le differenze esistono anche con foto presente e titolo su una riga.

   **Correzione proposta:** condividere l’header completo, con titolo vero o segnaposto nella stessa posizione e link indietro accessibile. Riutilizzare anche gli stili strutturali della foto e del voto. Definire la fixture comune della Ricetta e confrontare posizione del titolo, foto e inizio degli ingredienti, oltre all’altezza complessiva.

4. **Importante — I nuovi blocchi isolati della Spesa sfuggono alla soglia e alla pausa offline.**

   **Riferimenti:** [piano, riga 155](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:155), [piano, riga 324](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:324), [verifica del movimento, riga 393](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:393).

   `SkeletonHidden` produce soltanto uno `span aria-hidden`, fuori da `LoadingArea`. Non riceve `shown` o `paused` e non applica `.skeleton`. La soglia agisce invece sul contenitore `.skeleton`, mentre la pausa CSS richiede un antenato `.skeleton[data-paused='true']`.

   **Perché conta:** almeno il blocco del menu «…» risulterebbe visibile subito e continuerebbe a pulsare offline, anche quando la lista sottostante è ferma. `aria-hidden` lo nasconde ai lettori di schermo, non alla vista. La verifica proposta sul primo `.skeleton` non esamina questi blocchi esterni.

   **Correzione proposta:** condividere lo stato di attesa fra intestazione e lista, mantenendo un solo annuncio e i controlli veri accessibili. Tutti i blocchi devono ricevere soglia e pausa. Verificare anche l’intestazione prima dei 200 ms e offline, ed esaminare tutte le animazioni degli skeleton presenti, non soltanto il primo sottoalbero.

**Esito degli otto rilievi precedenti**

| Rilievo originale | Esito | Verifica |
|---|---|---|
| 1. Cache, ripristino e coda | **Chiuso tecnicamente; decisione da confermare** | Spec distingue le quattro attese; piano include ripristino lento online/offline e coda con spunte pendenti. Conservata l’attesa richiesta da `useShoppingList`. |
| 2. Layout completo di `FamilyGate` | **Parzialmente chiuso** | Corretti contenitori e passaggio della prop; restano i rilievi 1–3 sopra. |
| 3. Pausa offline nel gate | **Chiuso** | Prevista estensione di `useFamily` con `paused` e prova senza profilo salvato, seguita dalla riconnessione. |
| 4. Geometria effettiva | **Parzialmente chiuso** | Corretti `display`, stili del Ricettario e struttura dei suggerimenti; resta la Ricetta, rilievo 3. |
| 5. Animazione e movimento ridotto | **Parzialmente chiuso** | Durata uniformata a 3,2 s complessivi e animazione su un solo livello; resta l’eccezione involontaria della Spesa, rilievo 4. |
| 6. Copertura dei test | **Parzialmente chiuso** | Corretti `holdCheck()`, casi cache/errori/vuoto, timer e verifica finale dopo il Menu; restano l’aspettativa impossibile sui curatori e le prove mancanti dei rilievi sopra. |
| 7. Censimento | **Chiuso nella sostanza** | Aggiunta `/password`, corretta la misura di Cerca, distinte misure CSS e browser, pagine rare dichiarate invariate. |
| 8. Comando lint inesistente | **Chiuso** | Rimossi i comandi non disponibili; nessuna nuova dipendenza richiesta. |

Il primo rapporto contiene anche un **nono rilievo**, non incluso negli otto del messaggio al worker: è **chiuso**. Spec e Task 6 collocano ora entrambi la pulizia delle varianti del prototipo prima della PR.

**Punti da decidere dal coordinatore o dall’utente**

- Confermare l’eccezione che permette lo skeleton durante un ripristino locale superiore a 200 ms, anche con copia salvata. È ora esplicitata e riportata nelle decisioni da consolidare.
- Confermare lo skeleton fermo durante l’attesa remota offline senza copia disponibile.
- Decidere quale stabilità garantire quando diventano disponibili ruolo e sezioni dei curatori, correggendo la promessa e i test del Ricettario.
- Mantenere il Menu dopo il merge di W21. La regola dei giorni segnaposto quando la settimana è sconosciuta risolve il dubbio precedente; i dettagli restano da completare sul codice risultante da W21.

**Verifiche e limiti**

Revisione documentale e confronto statico con il codice corrente, il brief, la scelta dell’utente, la specifica principale nelle sezioni pertinenti, la guida visiva e il piano generale del checkout principale. Consultata Context7 per [ripristino TanStack Query](https://github.com/TanStack/query/blob/main/docs/framework/react/plugins/persistQueryClient.md) e conservazione dello stato React: durante il ripristino le query possono renderizzare senza avviare la lettura, coerentemente con la nuova distinzione delle attese.

Non eseguiti test, build o prove visive: questa revisione riguarda spec e piano, non un’implementazione degli skeleton. Nessun file modificato; worktree pulito al termine.
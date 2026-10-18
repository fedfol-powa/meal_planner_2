**Verdetto: APPROVABILE CON CORREZIONI**

Terza revisione mirata di spec e piano W20, branch `evolutive/skeleton`, commit `523741a`. Confrontati i quattro rilievi della seconda revisione e le decisioni del coordinatore con il codice web corrente. **Due rilievi sono chiusi sul piano progettuale; due restano parzialmente aperti.** Sono emerse inoltre lacune nella nuova attesa delle Bozze e nella prova del ripristino locale.

**Rilievi**

1. **Importante — La garanzia sugli spostamenti dei curatori non è ancora realizzata dal piano.**

   **Riferimenti:** [spec, riga 111](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:111), [piano, riga 327](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:327), [test previsti, riga 345](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:345).

   La decisione è riportata, ma il piano equipara «profilo salvato» a «profilo già disponibile al primo render». Nel codice attuale [SessionScope.tsx, riga 228](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/session/SessionScope.tsx:228) monta i figli sotto `PersistQueryClientProvider` durante il ripristino asincrono. Fino alla sua conclusione il profilo può mancare: il nuovo `useCuratorState` restituisce quindi `unknown`, non riserva spazio e inserisce le Bozze successivamente **anche con profilo salvato**. Il caso è particolarmente visibile nel ripristino superiore a 200 ms, esplicitamente previsto dalla spec.

   Inoltre, senza profilo salvato, la sequenza prevista può produrre due spostamenti: arrivo del ruolo → inserimento dello skeleton delle Bozze; arrivo di un riepilogo vuoto → rimozione della sezione. Il codice corrente restituisce infatti `null` con zero bozze ([CatalogueDraftsSection.tsx, riga 31](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/catalogue/CatalogueDraftsSection.tsx:31)). La spec ammette questa variazione alla riga 116, ma subito dopo promette un unico spostamento. Anche più bozze possono cambiare l’altezza rispetto all’unica scheda riservata.

   **Perché conta:** i test descritti verificano soprattutto la comparsa della sezione; non dimostrano la garanzia approvata lungo l’intera sequenza ripristino → profilo → riepilogo.

   **Correzione proposta:** distinguere copia persistita da cache già ripristinata e definire come impedire l’inserimento tardivo sopra risultati già mostrati nel primo caso. Completare le prove con ripristino lento di un profilo curatore e con riepilogo successivo vuoto, con una bozza e con più bozze, misurando la posizione dei risultati a ogni passaggio. Allineare esplicitamente le eventuali eccezioni al vincolo del coordinatore.

2. **Importante — Il nuovo contratto degli skeleton lascia ancora scoperta la pausa offline di alcuni blocchi.**

   **Riferimenti:** [piano, riga 166](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:166), [regole CSS, riga 182](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:182), [titolo della Ricetta, riga 374](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:374), [intestazione della Spesa, riga 397](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:397).

   Il nuovo `LoadingScope` risolve la condivisione dello stato, ma il CSS continua a fermare card e blocchi **dentro** `.skeleton[data-paused='true']`. Il titolo della Ricetta e il riepilogo della Spesa hanno invece `.skeleton` e la classe animata **sullo stesso elemento**. Una regola per i discendenti non ferma quell’elemento: `data-paused` può essere corretto mentre la pulsazione continua.

   Inoltre `BusyArea` applica soltanto `aria-busy`; nei corpi di Ricetta e Spesa ora collocati al suo interno non è esplicitato il necessario involucro `Skeleton`. `LoadingScope` fornisce il contesto, ma non applica da solo visibilità, pausa o `aria-hidden` ai blocchi descritti.

   **Perché conta:** il quarto rilievo precedente non è completamente chiuso. I test sugli attributi possono passare senza provare che tutti i blocchi siano realmente invisibili prima della soglia e fermi offline.

   **Correzione proposta:** coprire nel CSS sia l’elemento stesso sia i discendenti; specificare l’involucro `Skeleton` dei corpi delle due pagine. Le prove devono includere blocchi animati sulla radice e annidati, verificando visibilità e animazioni effettive. Nel controllo finale includere anche gli elementi che **sono** `.skeleton`, oltre a quelli contenuti al suo interno.

3. **Importante — Il nuovo skeleton delle Bozze non è collegato alla pausa del riepilogo né all’attesa condivisa della pagina.**

   **Riferimenti:** [spec, riga 100](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:100), [piano, riga 321](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:321), [piano, riga 329](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:329).

   Il piano introduce un `LoadingArea` autonomo nelle Bozze, oltre a quello dei risultati. Ogni `LoadingArea` crea uno scope e uno status propri; per le Bozze non è indicato il collegamento a `query.fetchStatus`. Con ruolo curatore disponibile e riepilogo assente, offline la query del catalogo può essere in pausa: lo stato è già accessibile tramite [queries.ts, riga 58](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/catalogue/queries.ts:58).

   **Perché conta:** manca una soluzione concreta per lo skeleton fermo delle Bozze e, quando entrambe le letture attendono, per la promessa di comparsa coordinata e annuncio unico della pagina. Il test offline senza profilo salvato non copre questo caso, perché il ruolo resta sconosciuto e le Bozze non compaiono.

   **Correzione proposta:** definire la composizione delle due attese e il passaggio della pausa del catalogo. Aggiungere una prova con profilo curatore disponibile, riepilogo e ricette assenti, offline e successiva riconnessione; verificare tutti i blocchi e gli annunci.

4. **Importante — La prova del ripristino lento intercetta il metodo sbagliato dello store.**

   **Riferimenti:** [piano, riga 137](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:137), [test previsto, riga 356](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:356), [persister.ts, riga 246](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/api/persister.ts:246).

   Il piano propone di trattenere `store.get`. Il ripristino reale usa invece `store.transact([key, marksPrefix(userId)], …)`, leggendo copia e revoche nella stessa transazione. Bloccare `get` non ritarda quel ripristino.

   **Perché conta:** la decisione dello skeleton ammesso oltre 200 ms è scritta nella spec, ma la prova prescritta non esercita il comportamento richiesto. È una lacuna della verifica precedente, emersa dal controllo puntuale del codice attuale.

   **Correzione proposta:** trattenere selettivamente la transazione di ripristino della cache, lasciando funzionare le altre operazioni dello store. Verificare online e offline che il ripristino sia ancora pendente oltre 200 ms, che lo skeleton compaia senza pausa e che il rilascio mostri i dati persistiti anche mantenendo ferme le risposte remote.

**Esito dei quattro rilievi della seconda revisione**

| Rilievo | Esito |
|---|---|
| 1. Rimontaggio dei filtri | **Chiuso sul piano progettuale.** Albero stabile in `RecipesPage`; test su identità del nodo, focus, valore e pannello, più verifica geometrica finale. |
| 2. Sezioni dei curatori | **Parzialmente chiuso.** Distinti ruolo sconosciuto, membro e curatore; preservate le sezioni senza famiglia. Resta il rilievo 1 sopra. |
| 3. Geometria della Ricetta | **Chiuso sul piano progettuale.** Header completo condiviso, stili strutturali di foto e voto, fixture e confronti geometrici espliciti. |
| 4. Soglia e pausa dell’intestazione della Spesa | **Parzialmente chiuso.** Stato condiviso e verifiche estese introdotti; resta il rilievo 2 sopra. |

**Decisioni del coordinatore**

Tutte e tre sono riportate nella spec e richiamate nei test previsti. La loro verifica resta però incompleta: ripristino locale per il rilievo 4, pausa offline per i rilievi 2–3, unico spostamento dei curatori per il rilievo 1.

Non occorre riconfermare le decisioni già prese. Spetta al coordinatore stabilire se le variazioni dovute al riepilogo delle Bozze siano eccezioni ammesse: il testo attuale le introduce senza renderle coerenti con il vincolo dell’unico spostamento.

**Verifiche e limiti**

Revisione documentale e confronto statico con il codice corrente, le revisioni precedenti, il messaggio del coordinatore e le fonti progettuali pertinenti. Consultata Context7 per il [ripristino TanStack Query](https://github.com/TanStack/query/blob/main/docs/framework/react/plugins/persistQueryClient.md) e la [conservazione dello stato React](https://react.dev/learn/preserving-and-resetting-state).

Non eseguiti test, build o prove visive: questa è una revisione di spec e piano, non dell’implementazione. Nessun file modificato; worktree pulito al termine.
**Verdetto: APPROVABILE CON CORREZIONI**

Revisione di spec e piano W22 sul commit `f9643c8`, branch `evolutive/skeleton-pagine-rare`. Confrontati brief, W20, specifica principale, piano generale del checkout principale, design e codice web attuale. Nessun file modificato; test e build non eseguiti perché questa è una revisione documentale.

Il censimento copre le rotte pertinenti. Sono corretti l’accesso alle sezioni del Ricettario subordinato al ruolo noto e il trattamento di `/password`: verifica del link senza adozione della sessione, nessuna verifica avviata offline, ripresa al ritorno della rete e gestione dell’altro account aperto. L’impostazione è implementabile, ma alcuni dettagli prescritti dal piano violano le regole che la spec richiama.

**Rilievi**

1. **Importante — Le righe di alcune liste non produrrebbero blocchi visibili.**

   **Riferimenti:** [piano W22:128](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:128), utilizzi alle righe 213, 259 e 289; [global.css:173](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/design/global.css:173).

   `SkeletonRows` contiene soltanto `row-list`, `row-main` e `skeleton-line`. Il piano lo usa direttamente dentro `LoadingArea` nelle schede già vere di Membri, Agenti e Utenti. Tuttavia `LoadingArea` aggiunge il contenitore `.skeleton`, che gestisce visibilità e accessibilità, **non il riempimento**: quest’ultimo viene da `skeleton-card` o `skeleton-block`. Le `skeleton-line` sono trasparenti.

   Seguendo il piano, la lista Utenti rimarrebbe vuota anche dopo 200 ms; nelle altre liste potrebbe comparire soltanto il blocco del pulsante. Il test sulla presenza di `.skeleton[data-visible="true"]` passerebbe comunque.

   **Correzione proposta:** distinguere le righe usate dentro una scheda interamente a blocco da quelle inserite in una scheda vera. Per queste ultime prevedere esplicitamente il blocco esterno di ogni riga, con riempimento e pulsazione, e verificarne lo stile nel browser.

2. **Importante — `TitleSkeleton` non incorpora il controllo di soglia e pausa necessario agli usi nell’intestazione.**

   **Riferimenti:** [piano W22:142](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:142), utilizzi alle righe 292 e 341; [PageHeader.tsx:7](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/components/PageHeader.tsx:7), [Skeleton.tsx:48](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/components/Skeleton.tsx:48).

   Il componente è definito come un semplice `<span className="… skeleton-block">`. Il piano dice che i pezzi condivisi devono stare dentro `Skeleton`, ma per dettaglio utente e bozza prescrive direttamente `PageHeader title={<TitleSkeleton />} titleHidden`.

   `titleHidden` aggiunge soltanto `aria-hidden` all’`h1`: non applica i 200 ms né `data-paused`. Il titolo, composto così, sarebbe subito visibile e continuerebbe ad animare durante la pausa offline.

   **Correzione proposta:** definire esplicitamente il titolo come `Skeleton as="span"` nello stesso `LoadingScope` del corpo, oppure mostrare il relativo involucro negli utilizzi. Aggiungere verifiche sul titolo prima dei 200 ms e offline, oltre a quelle sul corpo. Il link indietro deve restare fuori dal sottoalbero nascosto.

3. **Importante — Alcuni layout prescritti differiscono strutturalmente dal contenuto anche a parità di dati.**

   **Riferimenti:** [piano W22:133](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:133), righe 211–215, 249–258 e 285–290.

   Ci sono differenze deterministiche, non riconducibili all’eccezione del “contenuto diverso dal caso comune”:

   - In Amministrazione, `SettingsCardSkeleton` rende le righe **prima** di `children`. La ricerca aggiunta alla scheda Utenti finirebbe quindi sotto le tre righe, mentre nel contenuto è sopra la lista ([UsersSection.tsx:32](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/UsersSection.tsx:32)).
   - In Membri, la scheda Link prima del dettaglio è soltanto `SettingsCardSkeleton rows={1}`. Mancano lo spazio del suggerimento e quello del pulsante «Crea un link», presenti appena arriva il dettaglio, anche quando la lista dei link resta in attesa ([MembersPage.tsx:146](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/MembersPage.tsx:146)). Il passaggio intermedio sposterebbe la scheda Ingressi e ciò che segue.
   - In Preferenze, la riga dell’email proposta contiene una sola `skeleton-line`; il contenuto ha etichetta e valore su due righe di una griglia con distanza di 6 px ([PreferencesPage.tsx:76](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/PreferencesPage.tsx:76), [profile.module.css:1](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/profile/profile.module.css:1)).
   - Nel Profilo le righe vere contengono `.row-link`, con una propria altezza minima, assente da `SkeletonRows` ([ProfilePage.tsx:124](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/ProfilePage.tsx:124), [global.css:131](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/design/global.css:131)). Inoltre il censimento non distingue le letture successive dei conteggi di membri ed esclusioni dal caricamento del profilo.

   **Perché conta:** W22 deve eliminare gli spostamenti; questi layout ne introdurrebbero anche usando esattamente il numero di righe previsto.

   **Correzione proposta:** descrivere gli elementi strutturali effettivi di ciascuna scheda, compresi contenitori intermedi, testi statici e pulsanti. Rendere configurabile l’ordine dei pezzi condivisi. Completare il censimento del Profilo con le letture secondarie e verificare le coordinate anche nel passaggio **profilo → dettaglio → liste**, non soltanto all’inizio e alla fine.

4. **Importante — Il conteggio del Ricettario introduce un secondo `role="status"` non considerato dal piano.**

   **Riferimenti:** [piano W22:328](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:328), test alle righe 352–356; [RecipesPage.tsx:80](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/routes/RecipesPage.tsx:80).

   Quando le ricette sono arrivate ma `catalogue.overview` è ancora in attesa, il nuovo scope annuncerebbe «Caricamento…» mentre il conteggio delle ricette mantiene il proprio `role="status"`. È precisamente lo scenario previsto dal nuovo test.

   `gather` elimina gli annunci degli scope figli, ma non raccoglie gli altri status già presenti nel contenuto. Esiste un caso analogo entrando in Amministrazione dopo una cancellazione ([AdminPage.tsx:22](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/admin/AdminPage.tsx:22)).

   **Correzione proposta:** chiarire e attuare il requisito: se deve esserci un solo `role="status"` complessivo, coordinare anche questi annunci preservandone l’informazione; se si intende soltanto un annuncio di caricamento, esplicitare questa distinzione nei documenti. Il test deve controllare tutti gli status pertinenti, non soltanto quelli con testo «Caricamento…».

5. **Importante — I test proposti non dimostrano la stabilità delle sezioni dei curatori e lasciano una regressione attesa nella suite di `/password`.**

   **Riferimenti:** [piano W22:357](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:357), righe 427–437 e 449–457; [spec W22:193](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md:193).

   Il test chiamato “results keep their place” libera **una** bozza dopo uno skeleton di **due** schede e controlla soltanto sezioni vere e assenza dello skeleton. Su telefono le schede sono impilate: una scheda in meno sposta necessariamente i risultati. Anche la prova iPhone promette assenza di salti «salvo zero bozze», mentre lo scostamento può verificarsi con qualsiasi quantità o altezza diversa dalla fixture scelta.

   Inoltre il test esistente di `/password` offline richiede espressamente l’assenza di qualsiasi `[aria-busy="true"]` ([ChoosePasswordPage.test.tsx:130](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/web/src/features/password/ChoosePasswordPage.test.tsx:130)). Il nuovo `LoadingArea loading paused` rende falsa quell’asserzione; il piano non ne prevede l’aggiornamento.

   **Correzione proposta:** usare una fixture coerente con il caso comune per il confronto geometrico, misurare il `top` dei risultati nel browser e separare i casi con quantità differenti. Aggiungere il passaggio ruolo sconosciuto → curatore con overview trattenuta. Aggiornare il test offline di `/password` conservando i controlli su zero chiamate Auth, frammento invariato e assenza di operazioni registrate come occupate: l’area visivamente in attesa non implica una verifica già avviata.

6. **Minore — Alcune interfacce e dipendenze dei task non corrispondono agli utilizzi successivi.**

   **Riferimenti:** [piano W22:133](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/plans/2026-10-23-skeleton-pagine-rare.md:133), righe 142–144, 168–171, 188–189 e 419–420.

   `SettingsCardSkeleton` non espone `action`, richiesta dal task Esclusioni; `TitleSkeleton` fissa `height: '1lh'` e non offre un parametro per le due righe richieste dall’Autorizzazione. Il task 3 rende obbligatorio `FamilyGate.waiting` prima che il task 4 aggiorni Membri, lasciando temporaneamente un chiamante incompatibile.

   **Correzione proposta:** completare le firme e il passaggio delle proprietà ai figli; rendere obbligatorio `waiting` dopo l’aggiornamento di tutti i chiamanti, oppure includere l’adattamento di Membri nello stesso task. Prevedere il typecheck al confine di questa migrazione.

7. **Minore — Il testo destinato al design omette l’eccezione per le pagine riservate.**

   **Riferimenti:** [spec W22:186](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md:186), confronto con righe 82–85 e 212–213.

   La nuova regola da riportare in `design/design.md` afferma senza eccezioni che chi non ha il ruolo non vede blocchi che poi spariscono. La stessa spec prevede invece lo skeleton delle pagine riservate mentre il ruolo è sconosciuto, seguito eventualmente dal diniego.

   **Correzione proposta:** distinguere nel testo del design le **sezioni condizionali**, che aspettano il ruolo noto, dalle **pagine riservate**, per cui è prevista l’eccezione. Precisare inoltre che “ruolo noto” significa disponibile nel profilo corrente, eventualmente ripristinato dalla cache, senza modificare i controlli di revoca esistenti.

**Punti da decidere dal coordinatore o dall’utente**

- **Caso comune delle bozze:** confermare il numero e la forma rappresentativa delle schede. Le due bozze sono dichiarate una stima ancora da verificare ([spec W22:109](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton-rare/progetto/superpowers/specs/2026-10-23-skeleton-pagine-rare.md:109)); da questa scelta dipende la promessa concreta sugli spostamenti residui.
- **Portata dell’unico status:** chiarire se il vincolo riguarda tutti i `role="status"` della pagina oppure soltanto gli annunci di caricamento, considerando conteggi, conferme operative e banner offline.
- **Eccezione delle pagine riservate:** confermare la proposta di mostrarne lo skeleton anche prima di conoscere il ruolo. È distinta dal requisito, correttamente mantenuto, di non mostrare le sezioni dei curatori a chi non risulta curatore.
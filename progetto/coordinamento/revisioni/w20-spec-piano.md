**Verdetto: APPROVABILE CON CORREZIONI**

Revisione di spec e piano W20 sul branch `evolutive/skeleton`, commit `a2b234d`. La variante B, le pagine coperte e il rinvio del Menu a dopo il merge di W21 rispettano la scelta dell’utente. Prima dell’implementazione vanno risolte le incongruenze seguenti.

**Rilievi**

1. **Importante — La regola sulla cache non distingue ripristino, dati disponibili e attesa della coda della Spesa.**

   **Riferimenti:** [spec, riga 49](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:49), [piano, riga 32](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:32) e [riga 265](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:265).

   La spec equipara `isPending` all’assenza di una copia salvata, ma all’avvio la copia IndexedDB non è ancora necessariamente ripristinata. `PersistQueryClientProvider` monta i figli durante il ripristino: una lettura locale superiore a 200 ms può quindi far comparire lo skeleton anche se i dati sono salvati. Il piano verifica soltanto l’assenza dello skeleton **dopo** il ripristino. Il comportamento del provider è confermato dalla [documentazione TanStack consultata tramite Context7](https://github.com/TanStack/query/blob/main/docs/framework/react/plugins/persistQueryClient.md).

   Inoltre il Task 5 prescrive esplicitamente lo skeleton con dati presenti quando manca `list.view`. Questo stato esiste realmente: [useShoppingList.ts, riga 35](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/shopping/useShoppingList.ts:35) aspetta la coda locale prima di applicare le modifiche pendenti.

   **Perché conta:** il worker non può soddisfare contemporaneamente «mai con la copia salvata» e la prescrizione della Spesa. Mostrare prematuramente la sola base della lista perderebbe temporaneamente le spunte locali.

   **Correzione proposta:** definire separatamente controllo dell’identità, ripristino della cache, ripristino della coda e lettura remota senza dati. Precisare l’eventuale eccezione per il ripristino locale, senza eliminare l’attesa della coda. Aggiungere prove con ripristino deliberatamente superiore a 200 ms, online e offline, e lista salvata con operazioni pendenti.

2. **Importante — Passare lo stesso frammento a `FamilyGate` non garantisce la stessa geometria della pagina.**

   **Riferimenti:** [piano, riga 234](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:234), [riga 259](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:259), [spec, riga 72](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:72).

   `RecipeListSkeleton` contiene conteggio e schede; `RecipePageSkeleton` esclude il link indietro; `ShoppingListSkeleton` esclude almeno parte dell’intestazione vera. Il piano li passa al gate, ma [FamilyGate.tsx, riga 20](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/components/FamilyGate.tsx:20) offre soltanto `section.secondary-view.app-view`. Mancano i contenitori `page-column`/`wide` e le intestazioni presenti nelle pagine. Nel Ricettario cambierebbe anche la posizione delle sezioni dei curatori: [RecipesPage.tsx, riga 49](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/routes/RecipesPage.tsx:49).

   **Perché conta:** durante il passaggio gate → pagina comparirebbero intestazioni e cambierebbero larghezze e altezze, contrariamente alla promessa di assenza di spostamenti.

   **Correzione proposta:** distinguere il layout completo di attesa della pagina dal frammento dei suoi dati. Condividere contenitori, intestazioni e disposizione con il gate; tenere i controlli veri fuori dal sottoalbero `aria-hidden`. Specificare anche il passaggio della prop nel Ricettario. Verificare il passaggio con profilo ritardato e, successivamente, query della pagina ritardata.

3. **Importante — La pausa offline non arriva al caricamento di `FamilyGate`.**

   **Riferimenti:** [piano, riga 131](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:131) e [riga 238](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:238).

   L’interfaccia condivisa richiede `paused`, ma il gate viene implementato come `<LoadingArea loading skeleton={skeleton} />`. Il suo hook [useFamily.ts, riga 8](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/session/useFamily.ts:8) espone soltanto `{ status: 'loading' }`, senza `fetchStatus`.

   **Perché conta:** offline senza profilo salvato si resta nel gate; le pagine non vengono montate e lo skeleton continuerebbe a pulsare. I test offline della ricerca e della Spesa non coprono necessariamente questo ingresso.

   **Correzione proposta:** definire come il gate conosce la pausa, tramite estensione dello stato o connettività condivisa, e includere i file necessari nel task. Aggiungere un test di ingresso offline senza profilo salvato, con skeleton fermo e ripresa alla riconnessione.

4. **Importante — Alcuni skeleton descritti non riproducono ancora la struttura dimensionale effettiva.**

   **Riferimenti:** [piano, riga 138](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:138), [riga 174](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:174) e [riga 231](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:231).

   Il segnaposto di «Proponimene altri» è uno `span` con altezza 44 px, ma `.skeleton-block` non definisce `display`: con le proprietà elencate resta inline e non riserva quell’altezza. La classe `.more` aggiunge soltanto larghezza e margine superiore ([meals.module.css, riga 30](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/meals/meals.module.css:30)).

   Per il Ricettario sono citate solo le classi globali: la scheda reale usa anche `styles.content` e `styles.metaRow`, che cambiano padding e margini ([RecipeCard.module.css, riga 1](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/components/RecipeCard.module.css:1)).

   **Perché conta:** il salto può rimanere anche nel caso comune scelto dalla spec, indipendentemente dalla variabilità dei dati.

   **Correzione proposta:** rendere esplicito il modello di layout dei blocchi e condividere anche gli stili strutturali dei moduli CSS. Per i suggerimenti mantenere la stessa struttura della descrizione e del voto. La verifica visiva deve confrontare coordinate e dimensioni con una fixture del caso comune, distinguendo gli scostamenti ammessi per contenuti diversi.

5. **Importante — Il contratto CSS dell’animazione è incoerente con quello della riduzione del movimento.**

   **Riferimenti:** [piano, riga 138](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:138) e [riga 156](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:156).

   Il piano elenca `.skeleton`, `.skeleton-card`, `.skeleton-line` e `.skeleton-block`, concludendo «tutte con la pulsazione». I test prescrivono invece `animation: none` soltanto su card e block. Un’animazione sul contenitore continuerebbe quindi a muovere visivamente i figli anche con movimento ridotto o pausa offline.

   C’è anche una differenza temporale: la [spec, riga 42](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:42) descrive andata e ritorno in 1,6 s; `1.6s infinite alternate` nel piano descrive un ciclo completo di 3,2 s.

   **Correzione proposta:** indicare esattamente quali elementi animano, evitando animazioni annidate, e uniformare la durata. Verificare nel browser l’assenza di animazioni su tutto il sottoalbero per entrambe le condizioni; la presenza di una regola nel CSS, da sola, non basta.

6. **Importante — I test previsti non coprono integralmente il contratto, e il test di avvio usa il punto di attesa sbagliato.**

   **Riferimenti:** [piano, riga 249](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:249), [Task 3](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:211), [Task 5](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:269) e [Task 7](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:291).

   Il test dell’avvio propone di ritardare `whoami`, ma lo stato iniziale viene risolto da `backend.check()` ([AuthProvider.tsx, riga 59](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/auth/AuthProvider.tsx:59)). Esiste già `holdCheck()` nello stub. Ritardare una lettura applicativa non prova il ramo iniziale di `SessionScope`.

   Mancano inoltre casi espliciti per:
   - dati in cache nella Ricetta, nel pasto libero e nella prima ricerca;
   - errore dei suggerimenti con spazio conservato e annuncio di caricamento terminato;
   - esito vuoto/errore delle proposte del pasto libero;
   - reset della soglia fra due caricamenti e pulizia del timer allo smontaggio.

   **Correzione proposta:** usare `holdCheck()` per l’avvio e una promessa distinta per il profilo; completare la matrice caricamento → contenuto/errori/vuoto/cache. Precisare che la verifica finale avviene **dopo il Task 8**, includendo il Menu nella prova visiva e nella verifica dell’accessibilità. Il rinvio dell’implementazione del Menu a dopo W21 è corretto.

7. **Minore — Il censimento è sostanzialmente corretto, ma non completo e con una misura errata.**

   **Riferimento:** [piano, riga 60](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:60).

   Manca `/password`: durante la verifica del link mostra un messaggio con `aria-busy`, oppure nulla offline ([ChoosePasswordPage.tsx, riga 164](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/password/ChoosePasswordPage.tsx:164)). Può restare fuori dalla copertura, ma va censita.

   Le righe di Cerca non sono alte circa 61 px: comprendono pulsante di almeno 44 px, voto di almeno 32 px e padding verticale di 16 px, quindi almeno circa 92 px prima di eventuali bordi e ritorni a capo ([meals.module.css, riga 33](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/features/meals/meals.module.css:33), [RatingStars.module.css, riga 15](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/components/RatingStars.module.css:15)).

   **Correzione proposta:** aggiungere la pagina password tra gli stati invariati, correggere la misura e distinguere le misure ricavate dal CSS da quelle verificate nel browser. «Pagine rare invariate» è più preciso di «restano con `Loading`», perché alcune mostrano già nulla o messaggi specifici.

8. **Minore — Il piano richiede un comando di verifica inesistente.**

   **Riferimenti:** [piano, riga 117](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:117) e [riga 293](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:293).

   `npm run lint` non è definito negli script di [web/package.json, riga 5](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/package.json:5), né nel package della radice.

   **Correzione proposta:** rimuovere il comando dalla checklist o indicare un controllo già disponibile. Non introdurre una dipendenza per soddisfare una voce errata del piano.

9. **Minore — Spec e piano collocano la rimozione delle varianti del prototipo in momenti diversi.**

   **Riferimenti:** [spec, riga 95](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/specs/2026-10-18-skeleton.md:95), [piano, riga 113](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:113) e [riga 276](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/progetto/superpowers/plans/2026-10-18-skeleton.md:276).

   La spec conserva le varianti fino al merge; il piano le elimina nel Task 6, da eseguire subito e prima della PR.

   **Correzione proposta:** uniformare la sequenza, separando eventualmente l’aggiornamento della guida visiva dalla pulizia del prototipo dopo il merge.

**Punti da decidere dal coordinatore o dall’utente**

- **Ripristino locale:** confermare se lo skeleton è ammesso mentre si ripristinano cache e coda, pur esistendo dati salvati. L’eventuale eccezione va riportata anche nelle «Decisioni da riportare».
- **Offline senza copia:** lo skeleton fermo a tempo indefinito è esplicitamente una scelta del worker nella spec. Il coordinatore deve confermarla e includerla nelle decisioni da consolidare.
- **Menu dopo W21:** completare il comportamento dell’avvio senza parametro `day`, quando famiglia e risposta di `getOpening` non sono ancora disponibili. Nel codice attuale `weekStart` può essere indefinito ([MenuPage.tsx, riga 80](/Users/fedfol/Projects/meal_planner_2/.worktrees/skeleton/web/src/routes/MenuPage.tsx:80)); la promessa di giorni “veri” fin dall’avvio richiede una regola esplicita. La dipendenza da W21 va mantenuta.

La variante B e le pagine approvate non richiedono una nuova scelta.

**Verifiche e limiti**

Confrontati spec, piano, brief, scelta dell’utente, specifica principale nelle parti pertinenti, piano generale del checkout principale e codice web corrente. `gh issue view 49` non è riuscito a collegarsi a GitHub: usato il brief come previsto. Consultata Context7 per il ripristino TanStack Query.

Non eseguiti test, build o prove visive: questa è una revisione dei documenti e della fattibilità del piano, non dell’implementazione. Nessun file modificato; worktree pulito al termine.
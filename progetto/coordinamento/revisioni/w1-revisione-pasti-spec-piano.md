# Revisione avversariale — W1, Revisione dei pasti

**Verdetto: DA RIFARE**

L’impostazione generale è coerente con lo stack e con la separazione server/web, ma spec e piano non sono ancora eseguibili con le garanzie dichiarate. I problemi principali riguardano recuperabilità dell’annullamento via MCP, atomicità degli scambi, idempotenza e compatibilità con i trigger delle bozze importate.

Revisione in sola lettura sul commit `1f81ac1`, confrontato con `main` locale `ba6ea94` e con il piano generale del checkout principale. Nessun file modificato, nessun commit, nessuna scrittura sul database.

Riferimenti abbreviati:

- **S**: `progetto/superpowers/specs/2026-10-11-revisione-pasti.md`.
- **P**: `progetto/superpowers/plans/2026-10-11-revisione-pasti.md`.
- **Principale**: `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`.

## Rilievi

### 1. Bloccante — L’annullamento non è utilizzabile da una conversazione MCP nuova

**Riferimenti:** S:92–95, 132–141, 150–160; P:975–991; `contract/src/menu/views.ts:21–22`.

`meals.undo` richiede i `changeIds` restituiti dalla precedente scrittura. Nessuna lettura prevista li restituisce: `menu.getWeek` espone soltanto nome e momento dell’ultima modifica. Non esiste una lettura del registro o dell’azione annullabile.

Un agente in una conversazione nuova può leggere e modificare il pasto, ma non può soddisfare «annulla la mia ultima modifica», anche quando il server la considera ancora annullabile. Lo stesso problema riguarda l’annullamento di un annullamento.

**Correzione proposta:** aggiungere una lettura MCP, oppure estendere una vista esistente, che restituisca l’identità dell’azione, tutti gli slot coinvolti e le informazioni necessarie per richiederne l’annullamento. Non serve esporre lo storico completo nell’interfaccia web. Prevedere un test che riparta senza conservare la risposta della scrittura.

### 2. Bloccante — «Scambio tutto o niente» dipende dalla buona condotta del client

**Riferimenti:** S:239–255; P:983–989, 1013–1036; `supabase/migrations/20261011100400_meals.sql:54–65`; `design/percorsi.md:352–353`.

Il server accetta uno o due identificativi, ma il registro non conserva il collegamento fra le due righe di uno scambio.

Dopo uno scambio che restituisce `[a, b]`, il client può inviare `undo({changeIds: [a], ...})`: tutti i controlli descritti passano e viene ripristinato soltanto un pasto. Inoltre, due modifiche indipendenti della stessa settimana possono essere presentate come una coppia.

La transazione rende atomico l’elenco ricevuto; non garantisce che quell’elenco rappresenti l’intera azione originale.

**Correzione proposta:** conservare l’appartenenza delle modifiche a un’azione e ricavare/verificare sul server l’insieme completo. La garanzia deve valere anche annullando l’annullamento dello scambio. Testare richieste incomplete, coppie mescolate e ordine invertito degli identificativi.

### 3. Bloccante — I trigger esistenti impediscono alcuni scambi e annullamenti delle bozze importate

**Riferimenti:** S:234–237, 293–297; P:679–690, 792–801, 857–860; `supabase/migrations/20261011100400_meals.sql:127–158, 190–195`.

Il piano aggiorna i due slot con istruzioni successive. Il trigger consente di collegare una bozza soltanto se **un altro slot della famiglia la cita ancora**.

Caso riproducibile dal codice:

1. A contiene l’unica citazione della bozza D; B contiene una ricetta pubblicata.
2. Lo scambio aggiorna prima A, sostituendo D.
3. L’aggiornamento di B verso D fallisce: nessun altro slot cita più D.

Il test proposto usa l’ordine favorevole — prima lo slot con la ricetta archiviata, poi quello con la bozza — e non copre il caso opposto. Due bozze distinte aggravano il problema.

Anche `setFree` o `setRecipe` sull’ultima citazione di una bozza rende impossibile il successivo annullamento: il ripristino della bozza viene rifiutato dal trigger.

**Correzione proposta:** riprogettare l’autorizzazione dello spostamento/ripristino di una citazione legittima, preservando RLS e divieto di collegare bozze arbitrarie. Dichiarare una nuova migrazione con pgTAP; non ampliare genericamente i privilegi né usare `app_job` per aggirare il controllo. Coprire entrambi gli ordini, due bozze, rimozione dell’ultima citazione e tentativi fra famiglie diverse.

La conclusione «nessuna migrazione» non è sostenuta dal comportamento richiesto.

### 4. Importante — Le richieste senza effetti non restano idempotenti

**Riferimenti:** S:201–212, 424; P:675–681; Principale:614–618.

Le richieste senza effetti non lasciano alcuna traccia del proprio identificativo.

Esempio:

1. Il pasto ha 4 porzioni; Anna invia `setServings(id=X, servings=4)`.
2. Risposta: nessuna modifica, nessuna riga.
3. Bruno imposta 6 porzioni.
4. Un ritentativo della richiesta X imposta nuovamente 4 porzioni.

La stessa richiesta inizialmente conclusa senza effetti diventa successivamente una modifica e sovrascrive il lavoro altrui. Analogamente, uno scambio inizialmente senza effetti può diventare effettivo al ritentativo.

**Correzione proposta:** definire come ricordare l’esito delle richieste senza alterare l’ultima modifica visibile. L’eventuale registrazione tecnica va concordata con il vincolo sulle ricevute del piano generale. Testare il ritentativo dopo una modifica intermedia.

### 5. Importante — Il riconoscimento dei ritentativi accetta richieste parzialmente già usate e può rifiutare ripetizioni valide

**Riferimenti:** P:655–666, 720–724; S:203–210.

`replayed` restituisce successo appena trova almeno un identificativo, senza richiedere che l’intera azione corrisponda alla richiesta precedente.

Per esempio, uno scambio con `id` già usato per una nota sul primo slot e `otherId` nuovo viene trattato come ripetizione: restituisce la vecchia modifica senza eseguire lo scambio. Non viene verificato neppure il tipo dell’operazione originale.

Separatamente, `setRecipe` controlla che la ricetta sia ancora pubblicata **prima** del controllo di idempotenza. Se la prima richiesta riesce e poi la ricetta viene archiviata, il ritentativo identico risponde `not_found`, contrariamente alla regola dichiarata.

**Correzione proposta:** identificare la richiesta completa, rifiutare riusi parziali o incompatibili e riconoscere una ripetizione già completata prima dei controlli sul nuovo contenuto. Mantenere prima del riconoscimento autenticazione, appartenenza e verifica degli slot. Aggiungere test per entrambi i casi.

### 6. Importante — L’ordine del registro non corrisponde necessariamente all’ordine dei salvataggi

**Riferimenti:** P:685, 689–690, 1032–1045; `supabase/migrations/20261011100400_meals.sql:62`.

`created_at` usa il valore predefinito `now()`, mentre l’annullamento identifica l’ultima modifica ordinando per `created_at`, poi UUID.

In PostgreSQL `now()` rappresenta l’inizio della transazione. Una richiesta iniziata prima può acquisire il blocco e salvare dopo una richiesta iniziata successivamente. La modifica effettivamente più recente può quindi avere un timestamp inferiore: il suo annullamento viene rifiutato con `changed_since`. Anche `updated_at` può retrocedere. Il comportamento temporale è confermato dalla [documentazione PostgreSQL consultata tramite Context7](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

**Correzione proposta:** definire un ordinamento del registro coerente con le scritture serializzate sullo slot, usando un riferimento all’ultima modifica o una sequenza adeguata. Registrare il momento effettivo del salvataggio dopo il blocco. Testare esplicitamente transazioni iniziate in ordine diverso dall’acquisizione dei blocchi.

### 7. Importante — Il riuso del pianificatore perde due proprietà dei suggerimenti

**Riferimenti:** S:271–282; P:190–202, 163–165; `domain/src/planner/constraints.ts:48–71`; `server/src/menu/generation.ts:19–22`; Principale:1013–1019.

Sono presenti due problemi concreti:

- **Ripiego sui voti bassi:** il piatto corrente viene tolto dopo `candidatesFor`. Se è l’unico candidato con voto superiore a 2, `candidatesFor` elimina le alternative poco votate; il filtro successivo elimina il piatto corrente e restituisce zero suggerimenti. Le alternative avrebbero dovuto essere ammesse in assenza di altri sostituti.
- **Pasti fissati con ricette archiviate:** `loadPlannerInput` carica solo ricette pubblicate e `rankSuggestions` scarta gli altri pasti assenti da quel catalogo. Una ricetta archiviata già prevista nella settimana non contribuisce quindi ai massimi degli ingredienti. Con salmone già presente in un pasto archiviato e massimo settimanale 1, il piano può suggerire altro salmone.

Entrambi i casi sono stati riprodotti in memoria con l’algoritmo del piano e le funzioni reali del dominio.

**Correzione proposta:** escludere il piatto corrente prima della scelta fra candidati graditi e ripiego; distinguere le ricette proponibili dai dati dei pasti fissati, includendo questi ultimi nei conteggi e nel punteggio. Conservare un’unica logica di pianificazione e definire la versione da usare per i pasti storici.

### 8. Importante — La versione dei suggerimenti non copre i voti globali che influenzano la classifica

**Riferimenti:** S:106, 261–263; P:1168–1177, 1201; `server/src/menu/generation.ts:27–29, 45–46`; `domain/src/planner/score.ts:38`; `supabase/migrations/20261011100700_versions.sql:134–158`.

I suggerimenti dipendono da `globalScores`, usati quando manca il voto della famiglia. La lettura dichiara soltanto i contatori `family` e `catalogue`.

Un voto di un utente appartenente a un’altra famiglia aggiorna il punteggio globale, ma il trigger incrementa soltanto i contatori delle famiglie di quell’utente. Non cresce il contatore del ricettario. La famiglia che consulta i suggerimenti può ricevere `unchanged: true` nonostante la classifica sia cambiata.

**Correzione proposta:** includere nella versione una dipendenza che cambi con i voti globali, oppure scegliere una diversa strategia di versionamento esplicita. Aggiungere un test con due famiglie disgiunte. Non eliminare implicitamente il punteggio globale dal riuso del pianificatore.

### 9. Importante — Le invalidazioni web coprono le esclusioni, ma non le altre dipendenze dei suggerimenti

**Riferimenti:** S:311–325; P:1680–1695; `web/src/api/mutations.ts:33–39`; `web/src/api/ratings.ts:28–38`.

Il piano invalida i suggerimenti dopo modifiche ai pasti ed esclusioni. Mancano le modifiche a:

- tempi e regole dei pasti;
- obiettivi e intervalli;
- libri posseduti;
- restrizioni degli ingredienti;
- voti.

Il contatore server non fa ripartire autonomamente una query già montata. Inoltre una risposta dei suggerimenti già in volo può arrivare dopo la conferma della modifica e mostrare dati superati.

**Correzione proposta:** completare la matrice delle dipendenze, includendo `applyRating`; cancellare le letture interessate prima di invalidarle secondo il modello già esistente. Testare suggerimenti già caricati e risposte ritardate, mantenendo l’isolamento per famiglia e lingua.

### 10. Importante — L’integrazione proposta nasconde le azioni per pasti liberi e vuoti

**Riferimenti:** S:336–340; P:2021–2025; `web/src/components/RecipeCard.tsx:96–126`; `design/percorsi.md:339–340`.

Il piano dice di inserire `{actions}` nel footer «senza cambiare altro». Nel componente attuale, però, l’intero footer è dentro `kind === 'recipe' && recipe`.

Seguendo il passo scritto, pasti liberi e vuoti non montano `MealActions`: mancano matita, nota, scambio e «Scegli una ricetta». Anche il pannello viene reso dentro il footer, invece che sotto, e il suo stato resta indipendente dai pannelli di voto e ingredienti.

**Correzione proposta:** descrivere esplicitamente la ristrutturazione di footer e pannelli per tutti i tipi di pasto, coerente con il prototipo. Aggiungere test per ricetta, libero, vuoto e passaggio da un tipo all’altro.

### 11. Importante — Il salvataggio differito delle porzioni può perdere modifiche o inviare scritture duplicate

**Riferimenti:** P:1947–1961, 1978–1979; S:339–341; `web/src/main.tsx:29–31`; `web/src/components/ServingsStepper.tsx:4–13`.

`flush` esegue `servings.mutate` dentro una funzione di aggiornamento dello stato React. È un effetto collaterale dentro un aggiornamento che deve essere puro; in Strict Mode può essere rieseguito, generando UUID diversi.

Inoltre:

- lo smontaggio cancella soltanto il timer, perdendo il valore ancora da salvare, nonostante il commento prometta il salvataggio;
- il valore in attesa viene azzerato prima della risposta e il controllo torna temporaneamente al valore precedente;
- il selettore non viene disabilitato durante l’invio né quando il pannello già aperto diventa offline.

**Correzione proposta:** separare valore locale ed effetto di salvataggio; inviare fuori dagli aggiornamenti di stato; definire il comportamento alla navigazione e mostrare lo stato in corso fino alla risposta. Testare numero e contenuto delle richieste, Strict Mode, chiusura anticipata, navigazione e perdita della rete.

### 12. Importante — La ricerca del sostituto non rispetta il percorso approvato

**Riferimenti:** P:2146–2149, 2184–2188; `prototype/src/lib/components/RecipePicker.svelte:35–47, 52–60`; Principale:1149–1151, 1166–1175.

La query è abilitata soltanto quando `query.text` è valorizzato. Cambiare un filtro senza digitare testo non avvia la ricerca.

I risultati mostrano poi soltanto il nome: mancano media familiare, numero di voti e voto personale, richiesti anche nei risultati di ricerca e già presenti nel prototipo.

**Correzione proposta:** attivare la ricerca anche quando vengono cambiati i filtri e rendere i voti previsti. Coprire il percorso con soli filtri e la visualizzazione nelle due lingue.

### 13. Importante — Il piano contiene errori verificabili che impediscono i passaggi verdi dichiarati

**Riferimenti:** P:423–424, 454–456, 478, 536–542, 741; `server/tsconfig.json:6`.

`mealOf` accetta una struttura che descrive i pasti soltanto come `{slotId: string}`. Il suo risultato conserva quel tipo, ma i test accedono a `servings`, `lastChange`, `note` e `recipe`.

Il compilatore TypeScript, eseguito in memoria sul frammento, restituisce `TS2339` per `servings` e `lastChange`. I test sono inclusi nel typecheck del server: la prima PR non passa come scritta.

Anche il percorso web lascia adattamenti essenziali a note generiche: per esempio `RecipeFilters` viene chiamato con `value`, mentre il componente reale richiede `query` (`web/src/components/RecipeFilters.tsx:10`).

**Correzione proposta:** usare tipi reali, per esempio `WeekView` e `MealView`, e correggere gli esempi contro le firme presenti prima dell’approvazione. Ogni confine di task dichiarato verde deve avere file e fixture sufficienti.

La separazione delle PR, invece, è plausibile: `SERVER_AREAS` seleziona esplicitamente le aree e `rpcServer` implementa un sottoinsieme esplicito del contratto. Non è necessario spostare tutta l’area web nella prima PR; occorre correggere i suoi effettivi errori.

### 14. Importante — I test proposti non dimostrano diverse garanzie dichiarate

**Riferimenti:** P:536–542, 1298–1310, 1881–1892, 2056–2068, 2460–2497; S:380–401.

Alcuni test verificano condizioni più deboli del requisito:

- **R1:** il test usa una settimana che può essere futura e confronta due risposte ottenute dallo stesso caricatore; non crea versioni differenti né verifica quale venga scelta.
- **MCP:** la spec richiede un errore `not_allowed`, ma il test usa un identificativo inesistente e verifica `not_found`.
- **Porzioni:** il test non conta le scritture e non annulla la regolazione; non dimostra «una sola modifica».
- **Proponimene altri:** il controllo sul titolo confronta due letture dello stesso elemento dopo il gesto; non dimostra che il pasto sia rimasto invariato.
- **Lingua:** il caso dichiarato «Annulla dopo cambio di lingua» non ha un test corrispondente nel Task 13.
- **Isolamento:** mancano i tentativi di annullamento con identificativi di un’altra famiglia e la verifica di assenza di effetti dopo il rifiuto.

**Correzione proposta:** rendere deterministici tempo, versioni e dati; verificare effetti persistiti, numero delle richieste e assenza di scritture nei rifiuti. Inserire questi casi nella fase rossa dei task pertinenti, insieme alle riproduzioni dei rilievi precedenti.

## Verifiche svolte e limiti

Sono stati confrontati spec, piano, specifica principale, piano generale autorevole, percorsi approvati, guida visuale e sorgenti del prototipo con contratto, server, dominio, schema e web presenti.

Sono state eseguite esclusivamente verifiche in memoria:

- riproduzione del suggerimento vuoto quando l’unico sostituto ha voto basso;
- riproduzione del mancato conteggio di un pasto archiviato;
- verifica TypeScript della perdita di tipo in `mealOf`.

Non sono state eseguite suite che scrivono sul database, build o prove browser. Questa è una revisione di spec e piano, non una certificazione dell’implementazione futura. I grant sulle colonne di contenuto e le policy familiari esistono; il problema rilevato riguarda la loro compatibilità con scambio e ripristino delle bozze, non una necessità di concedere privilegi generici.

## Punti da decidere dal coordinatore o dall’utente

1. **Interfaccia di lettura dell’annullamento.** Scegliere fra estensione della vista del pasto e lettura dedicata. Deve funzionare in una conversazione nuova e identificare un’azione completa.
2. **Identità persistente delle azioni.** Concordare raggruppamento degli scambi, riconoscimento dei ritentativi e trattamento delle richieste senza effetti. Aggiornare la dichiarazione sulle migrazioni e le interfacce decise.
3. **Bozze importate dopo la rimozione dell’ultima citazione.** Definire come conservarne la possibilità di ripristino, anche rispetto all’eventuale chiusura della bozza da parte di un curatore, senza aprire accessi fra famiglie.
4. **Testi liberi.** La sezione 15 della specifica principale lascia aperta la gestione linguistica di note e testi dei pasti liberi. La spec di dettaglio usa stringhe singole: confermare esplicitamente se restano come scritte dall’utente, mantenendo bilingui tutti i testi dell’interfaccia.
5. **Consolidamento.** Riportare le decisioni corrette nelle sezioni pertinenti della specifica principale e nel piano generale prima dell’avvio dell’implementazione.
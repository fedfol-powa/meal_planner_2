**Verdetto: APPROVABILE CON CORREZIONI**

Revisione di spec e piano W23 sul branch `evolutive/bottone-oggi`, commit `f33c04e`. Il confronto comprende brief, scelte dell’utente, modifica alla guida visiva, specifica principale, piano generale del checkout principale e codice web attuale. Il prototipo è stato considerato solo come riferimento.

La forma scelta, la posizione del pulsante, i testi bilingui e il riuso della navigazione esistente sono coerenti. Occorre correggere la condizione di visibilità e rendere verificabili aggiornamento della data, caricamento differito e gestione del focus prima dell’implementazione.

**1. Importante — Il giorno di apertura non dimostra che oggi abbia pasti**

**Riferimenti:** [spec W23:30](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:30), [spec W23:56](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:56), [piano W23:98](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:98).

La condizione `openingDay?.date === today && selected !== today` non realizza la scelta «nessun pulsante quando oggi non ha pasti».

- **Online:** `getOpening` può restituire oggi anche con soli slot vuoti. La specifica principale lo prevede a riga 2117; il server lo implementa in `server/src/menu/opening.ts:18–28`. Esiste già un esempio esplicito in `web/src/api/fake/fakeApi.test.ts:56–57`: svuotando tutti i pasti, l’apertura resta oggi.
- **Con copia salvata:** `savedOpening` restituisce oggi se trova la sua settimana in cache, senza controllarne i pasti (`web/src/routes/MenuPage.tsx:51–54`). Questo ripiego opera anche mentre la lettura online è in corso, non soltanto offline.
- La spec, righe 56–59, accetta esplicitamente il pulsante su oggi vuoto offline. Contraddice la scelta dell’utente, la propria regola iniziale e `design/design.md:226–230`. L’eccezione non compare nemmeno nelle «Decisioni da riportare».

Il test previsto a righe 82–85 del piano forza un’apertura diversa da oggi: verifica il predicato scelto, ma non intercetta questi controesempi.

**Correzione proposta:** definire la visibilità sulla presenza effettiva di contenuto oggi, distinguendo assenza accertata e dati ancora sconosciuti. Precisare come ottenerne conferma quando la settimana corrente non è caricata, mantenendo invariati server e contratto; il vincolo aggiunto «nessuna lettura nuova» potrebbe dover essere rimosso. Eliminare l’eccezione offline e aggiungere test con soli slot vuoti, giornata senza slot, copia salvata e apertura ancora in attesa. Non modificare la regola generale di apertura del Menu per adattarla al pulsante.

**2. Importante — Il ritorno in primo piano non garantisce il ricalcolo di oggi**

**Riferimenti:** [spec W23:50](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:50), [spec W23:79](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:79), [piano W23:89](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:89).

Il ricalcolo a ogni render e la rilettura della data al tocco sono descritti chiaramente, ma non bastano a garantire il comportamento promesso al ritorno in primo piano.

Nel codice attuale `today` viene calcolato durante il render (`MenuPage.tsx:83`). Il refetch usa invece la data già catturata da `openingQuery` (`web/src/api/queries.ts:116–118`). Con dati già caricati, risposte invariate e nessuna proprietà osservata che cambi, il refetch non garantisce un nuovo render: è il comportamento documentato di [TanStack Query, verificato tramite Context7](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/render-optimizations.md).

Anche «uno scorrimento» non implica necessariamente un render: il trascinamento W21 aggiorna direttamente il DOM, come precisato nella specifica principale a riga 4187.

Il caso scoperto è soprattutto **pulsante assente prima di mezzanotte perché si sta guardando oggi**: dopo il cambio di giorno può restare assente, quindi la protezione dentro `goToday` non può intervenire. Il test pianificato copre soltanto un pulsante già presente.

**Correzione proposta:** prevedere un aggiornamento esplicito della data al ritorno in primo piano, indipendente dall’esito delle letture. Si può conservare la scelta senza timer, chiarendo che durante la permanenza continua in primo piano l’aggiornamento attende un evento definito. Aggiungere test con cache già popolata e risposte invariate, pulsante inizialmente assente, nuovo giorno senza pasti e cambio di giorno nel fuso della famiglia.

**3. Importante — Il caso con settimana non caricata e il relativo focus non sono verificati in modo deterministico**

**Riferimenti:** [piano W23:79](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:79), [piano W23:100](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:100).

Il test parte dalla settimana del 12 ottobre e torna a quella del 5. Sono settimane adiacenti: W21 precarica quella del 5 (`web/src/routes/MenuPage.tsx:113–130`), e il test usa normalmente API finte senza latenza (`web/src/test/renderApp.tsx:20`). Non viene quindi imposto né verificato il passaggio attraverso lo skeleton.

Inoltre, l’effetto proposto trasferisce il focus appena esiste **un qualsiasi** pulsante del mese, senza verificare che sia stata raggiunta la destinazione richiesta. Durante l’attesa, lo skeleton consente di scegliere un altro giorno (`web/src/routes/menu/MenuSkeleton.tsx:34–35`): il flag può restare pendente e spostare il focus sul mese dopo una navigazione successiva, ormai diversa dall’intento iniziale.

**Correzione proposta:** introdurre un test con risposta di `getWeek` controllata da una promessa, settimana di destinazione sicuramente non disponibile e attesa esplicitamente osservata. Verificare assenza del pulsante durante lo skeleton e focus sul mese soltanto dopo l’arrivo corretto. Legare l’intento di focus alla destinazione e annullarlo quando l’utente sceglie un’altra navigazione; coprire anche questa interruzione. Mantenere un caso separato per il ritorno con settimana già in cache.

**4. Minore — La verifica della barra non misura tutta la stabilità richiesta**

**Riferimenti:** [spec W23:43](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:43), [piano W23:125](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:125).

Il controllo browser misura altezza e overflow. Queste condizioni possono essere soddisfatte anche se mese, calendario o borsa cambiano posizione quando compare il pulsante. Il brief richiede invece che la barra non si sposti.

**Correzione proposta:** confrontare posizione e dimensioni di mese, calendario, borsa e fila dei giorni prima e dopo la comparsa, nella stessa settimana, a 375 px e nelle due lingue. Controllare anche l’area effettiva del pulsante e il focus visibile da tastiera. Nessun requisito aggiuntivo a 320 px, coerentemente con la scelta dell’utente.

**Punti da decidere dal coordinatore o dall’utente**

- **Coordinatore:** scegliere come accertare la presenza di pasti oggi quando la settimana non è disponibile. Il contratto attuale di `getOpening` non fornisce questa informazione; l’architettura del piano va aggiornata di conseguenza.
- **Coordinatore:** consolidare gli eventi che aggiornano la data senza timer e riportarli nelle decisioni tecniche. Se si vuole invece l’aggiornamento automatico esatto a mezzanotte anche senza interazioni, serve una scelta esplicita ulteriore.
- Non occorre riaprire variante C, esclusione dei 320 px o assenza del pulsante quando oggi non ha pasti: sono già decisioni dell’utente.

**Aspetti coerenti e limiti della revisione**

Nome accessibile contenente l’etichetta, icona decorativa nascosta, altezza di 44 px e localizzazione italiano/inglese britannico sono definiti correttamente. Il riuso di `select` corrisponde al codice attuale: scorrimento fluido e sostituzione della cronologia nella stessa settimana, navigazione ordinaria fra settimane. La distinzione dall’animazione gestuale W21 è chiara; resta invariato il secondo tocco su Menu.

Revisione svolta in sola lettura. Nessun file modificato, nessuna operazione in produzione. Non sono stati eseguiti test o build: l’oggetto della revisione è la specifica con il piano, non un’implementazione web già presente.
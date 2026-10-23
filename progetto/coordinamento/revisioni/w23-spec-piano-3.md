**Verdetto: APPROVABILE CON CORREZIONI**

Terzo giro di revisione di spec e piano W23, branch `evolutive/bottone-oggi`, commit `3c43099`. Confrontati i due rapporti precedenti, le decisioni del coordinatore, il brief, la specifica principale, il piano generale del checkout principale, la guida visiva e il codice web attuale.

**Verifica dei rilievi del secondo giro**

| Rilievo | Esito |
|---|---|
| 1. Focus consumato sull’apertura provvisoria | **Corretto per l’attesa online e la richiesta in pausa.** L’intento distingue giorno esplicito e apertura per una data precisa; sono previste due promesse controllate e interruzioni tramite scelta di un giorno. Restano i due punti descritti sotto. |
| 2. Promessa di una sola lettura | **Risolto.** Spec, piano e decisioni da riportare descrivono il normale ciclo della query, comprese le riletture. Le opzioni corrispondono alla query della settimana già usata dal Menu. |

Restano chiusi i punti già risolti: accertamento dei pasti di oggi, ricalcolo al ritorno in primo piano e verifiche della stabilità della barra. Non si riaprono variante C, esclusione dei 320 px e assenza del pulsante quando oggi non ha pasti.

**1. Importante — L’attesa del focus non si annulla quando si apre il calendario**

**Riferimenti:** [piano W23:191](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:191), [spec W23:70](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:70).

La spec richiede di annullare l’intento anche quando l’utente passa al calendario. La regola operativa del piano controlla soltanto `requested` e, per l’apertura, la data della famiglia.

Nel codice attuale aprire il calendario cambia `pickerOpen`, senza modificare `requested` ([MenuPage.tsx:100](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:100)); sfogliare i mesi cambia soltanto lo stato interno del calendario ([DatePicker.tsx:78](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/components/DatePicker.tsx:78)).

Controesempio nella nuova attesa dopo mezzanotte:

1. Il tocco su «Oggi» lascia visibile l’apertura provvisoria mentre `getOpening` è trattenuto.
2. L’utente apre il calendario e ne usa i controlli.
3. Arriva prima la settimana di oggi, poi la risposta di `getOpening`.
4. `requested` è ancora assente e la data coincide con quella dell’intento: l’effetto previsto sposta il focus sul mese della barra, sottraendolo al calendario.

I test aggiunti annullano l’intento scegliendo un giorno; non coprono l’apertura del calendario senza selezione.

**Perché conta:** la nuova attesa evita il focus anticipato, ma può trasferirlo successivamente durante un’altra interazione, contrariamente alla spec.

**Correzione proposta:** annullare esplicitamente l’intento quando si apre il calendario, nel percorso condiviso da mese e icona. Aggiungere un test con apertura trattenuta, calendario aperto e focus su un suo controllo; rilasciare settimana e apertura e verificare che il focus non venga trasferito al mese della barra.

**2. Minore — Il ripiego promesso dopo un fallimento non corrisponde al comportamento attuale**

**Riferimenti:** [spec W23:66](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:66), [decisioni tecniche:146](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:146), [piano W23:195](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:195).

La nuova spec considera risolta l’apertura anche quando la richiesta «fallisce», affermando che allora resta il giorno della copia salvata. Il piano traduce questa promessa nella condizione `opening.data && (... || opening.isError)`.

Questo non vale per la prima lettura della nuova data: `savedOpening` è fornito come `placeholderData`, non come dato della nuova query ([MenuPage.tsx:84](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:84)). Quando la lettura termina in errore, il placeholder scompare e `opening.data` diventa `undefined`. Il Menu mostra quindi `QueryError` ([MenuPage.tsx:186](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:186)). Inoltre gli errori diversi da `network` sono bloccanti anche con dati disponibili ([errors.ts:63](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/api/errors.ts:63)).

Verificato con Context7 e con una prova isolata su TanStack Query **5.104.1** installato: una query nuova con placeholder passa da `success / fetching / isPlaceholderData=true` a `error / idle / data=undefined` dopo il rifiuto della richiesta. Il caso in pausa previsto dal test offline resta valido.

**Perché conta:** la documentazione promette un esito non ottenibile con la regola proposta e con il vincolo di lasciare invariata l’apertura.

**Correzione proposta:** distinguere richiesta in pausa con copia visibile ed errore che porta alla schermata di errore. In quest’ultimo caso annullare l’intento senza trasferire il focus; allineare spec e decisioni tecniche e aggiungere un test con rifiuto definitivo di `getOpening`, oltre al test della pausa.

**Punti da decidere dal coordinatore o dall’utente**

Nessuna nuova scelta di prodotto necessaria. Le correzioni proposte mantengono la regola di apertura e le scelte già approvate.

**Limiti della verifica**

Revisione svolta in sola lettura; nessun file modificato e nessuna operazione in produzione. Eseguita soltanto la prova isolata sul comportamento di `placeholderData`; non eseguiti suite dell’app, build o prove browser, perché l’oggetto è spec e piano e l’implementazione W23 non è ancora presente.
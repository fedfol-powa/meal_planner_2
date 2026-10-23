**Verdetto: APPROVABILE CON CORREZIONI**

Secondo giro di revisione di spec e piano W23 sul branch `evolutive/bottone-oggi`, commit `293d028`. Confrontati i rilievi precedenti, le decisioni del coordinatore, il brief, la specifica principale, il piano generale del checkout principale, la guida visiva e il codice web attuale.

Le correzioni recepiscono le decisioni richieste. Resta incompleta la gestione del focus durante l’apertura dopo mezzanotte; inoltre, la spec promette un limite alle letture che la query prevista non garantisce.

**Verifica dei rilievi del primo giro**

| Rilievo precedente | Esito |
|---|---|
| 1. L’apertura non dimostra che oggi abbia pasti | **Risolto nella condizione di visibilità.** Il piano controlla i pasti della settimana di oggi, distingue dati mancanti e slot vuoti, elimina l’eccezione offline e prevede i controesempi richiesti. Resta la discrepanza sulle riletture descritta sotto. |
| 2. Ricalcolo al ritorno in primo piano | **Risolto.** Sono previsti stato esplicito, `visibilitychange`, `pageshow`, rilettura al tocco e test con pulsante inizialmente assente, dati invariati e fuso della famiglia. La scelta senza timer è riportata nelle decisioni tecniche. |
| 3. Attesa deterministica e focus sulla destinazione | **Parzialmente risolto.** Sono presenti promessa controllata per `getWeek`, verifica dello skeleton e annullamento dopo un’altra scelta. La destinazione rappresentata da `undefined` lascia però il caso scoperto descritto nel rilievo 1 seguente. |
| 4. Stabilità della barra | **Risolto nel piano di verifica.** Sono richiesti confronti di posizione e dimensioni per mese, calendario, borsa e fila dei giorni, nelle due lingue a 375 px, oltre ad area di tocco e focus visibile. |

**1. Importante — Il focus può essere consumato sull’apertura provvisoria, prima della destinazione effettiva**

**Riferimenti:** [piano W23:183](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:183), [test pianificati:192](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:192), [spec W23:51](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:51).

Quando la data cambia prima del tocco, il piano registra `{ day: undefined }` e naviga senza `?day`. L’effetto considera sufficiente che anche `requested` sia `undefined`, esistano `week.data`, un giorno selezionato e il pulsante del mese.

Queste condizioni non provano che sia arrivata l’apertura del nuovo giorno. Il codice attuale usa `savedOpening` come `placeholderData`; se manca la settimana di oggi, può restituire l’ultima apertura salvata della famiglia e della lingua ([MenuPage.tsx:51](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:51), [MenuPage.tsx:84](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:84)).

Controesempio concreto:

1. Domenica 11 ottobre sono salvate l’apertura e la settimana del 5; quella del 12 non è ancora disponibile.
2. Dopo mezzanotte si tocca «Oggi»: il piano naviga a `/menu`.
3. Mentre `getOpening` del lunedì è in attesa, `savedOpening` restituisce la domenica. La sua settimana e il pulsante del mese esistono già: l’effetto sposta il focus e cancella l’intento.
4. La risposta dell’apertura indica lunedì 12; compare lo skeleton della settimana ancora trattenuta. All’arrivo dei dati l’intento non esiste più e il focus non viene ripristinato sul mese.

Il nuovo test trattiene soltanto `getWeek`: non controlla questa attesa preliminare di `getOpening`, quindi non garantisce di intercettare il problema.

**Correzione proposta:** distinguere nell’intento il giorno esplicito dall’apertura richiesta per una precisa data della famiglia. Per quest’ultima, definire quando la destinazione è effettivamente risolta, senza consumare l’intento su un’apertura provvisoria mentre la richiesta è in corso. Esplicitare anche il completamento tramite ripiego offline, mantenendo invariata la regola di apertura. Aggiungere un test con **due promesse controllate**, per `getOpening` del nuovo giorno e `getWeek`: nessun focus anticipato sulla settimana precedente, focus dopo l’arrivo effettivo e annullamento se interviene un’altra navigazione.

**2. Minore — La promessa di una sola lettura non corrisponde alla query osservata prevista**

**Riferimenti:** [spec W23:37](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:37), [decisioni tecniche:119](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/specs/2026-10-23-bottone-oggi.md:119), [piano W23:159](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/progetto/superpowers/plans/2026-10-23-bottone-oggi.md:159).

La spec dice «dalla cache se c’è, altrimenti letti ora, una volta», «la lettura non si ripete» e «una lettura in più al massimo». Il piano introduce invece un normale `useQuery`, modificando soltanto `retry`.

Il client attuale imposta `staleTime: 0`, `refetchOnWindowFocus: true` e `refetchOnReconnect: true` ([persister.ts:326](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/api/persister.ts:326)). La stessa chiave condivide dati e richieste in corso, ma non impedisce successive verifiche della versione: anche il montaggio di un osservatore con dati già scaduti può avviare una lettura. Comportamento verificato tramite Context7 nella [documentazione TanStack Query sulla cache](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/caching.md).

In particolare, una settimana accanto prima soltanto precaricata diventa osservata se contiene oggi e può essere riletta al ritorno in primo piano. Non vale più per quella settimana il comportamento del precaricamento W21 descritto in [MenuPage.tsx:121](/Users/fedfol/Projects/meal_planner_2/.worktrees/bottone-oggi/web/src/routes/MenuPage.tsx:121).

**Perché conta:** spec, piano e decisioni da consolidare descrivono costi e aggiornamento dei dati diversi.

**Correzione proposta:** allineare la spec al normale ciclo della query esistente, chiarendo riuso della cache, condivisione delle richieste e successive verifiche della versione. Se il limite di una sola lettura è invece intenzionale, occorre definirne l’ambito e pianificare opzioni e test coerenti.

**Punti da decidere dal coordinatore o dall’utente**

- **Coordinatore:** chiarire il limite delle letture del rilievo 2. Il normale ciclo della query è coerente con la decisione di usare la stessa query del Menu; la promessa aggiuntiva di una lettura unica va corretta o resa esplicita.
- Non occorre riaprire le scelte dell’utente: variante C, nessun adattamento a 320 px e nessun pulsante quando oggi non ha pasti restano rispettate.

**Limiti della verifica**

Revisione di documenti e riscontri sul codice, svolta in sola lettura. Nessun file modificato e nessuna operazione in produzione. Non eseguiti test, build o prove browser: l’implementazione web prevista dal piano non è ancora presente; le verifiche visive e sull’iPhone restano da eseguire durante l’implementazione.
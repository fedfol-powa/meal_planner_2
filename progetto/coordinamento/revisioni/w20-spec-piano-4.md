**Verdetto: APPROVABILE**

Quarta revisione ristretta di spec e piano W20 sul branch `evolutive/skeleton`, commit `d3671fc`. Controllati esclusivamente gli interventi richiesti in `w20-04-revisione-spec-piano-3.md` e le loro conseguenze, confrontandoli con il codice corrente e con `origin/main` (`cbe5869`, comprendente W21).

**Rilievi**

Nessun rilievo nel perimetro richiesto. Le correzioni della terza revisione risultano recepite sul piano progettuale:

| Punto | Esito e riferimenti |
|---|---|
| Semplificazione dei curatori | **Recepita.** Spec, righe 111–116 e 173–175: niente skeleton né spazio riservato, spostamento ammesso. Piano, righe 318–358: sezioni montate stabilmente e prove della loro permanenza durante le attese dei risultati. Eliminati `useCuratorState`, il `LoadingArea` delle Bozze e la garanzia dell’unico spostamento. Coerente con `CatalogueDraftsSection.tsx` e `ArchivedRecipesSection.tsx`, che già non riservano spazio durante l’attesa. |
| Pausa e movimento ridotto | **Recepiti.** Piano, righe 183–188: il selettore della pausa copre sia l’elemento `.skeleton` stesso sia i discendenti; il movimento ridotto copre tutte le card e tutti i blocchi. Le prove alle righe 216–222 e 486–493 verificano visibilità e animazioni effettive, includendo gli elementi radice. |
| Corpi di Ricetta e Spesa | **Corretti.** Piano, righe 388–389 e 411–412: involucro `Skeleton` esplicito dentro `BusyArea`, collegato allo stesso scope dell’intestazione. |
| Ripristino lento | **Corretto.** Piano, righe 137–139 e 363–369: trattenuta selettivamente la transazione con prefissi `[key, marksPrefix(userId)]`, corrispondente a `restoreClient()` in `web/src/api/persister.ts:246`. Previste prove online e offline, oltre 200 ms, con risposte remote ferme e rilascio dei dati persistiti. |
| Menu dopo W21 | **Allineato.** Piano, righe 451–471: aggiornamento del branch prima del task, rilettura dei componenti, stessa struttura e altezza della fila trascinabile, nessuna interferenza con i gesti. Confrontato con `DaySelector.tsx`, `MenuPage.tsx` e CSS su `origin/main`: struttura `day-links` → `day-strip` → `day-week`, settimane adiacenti e distinzione fra settimana nota e apertura ancora sconosciuta coerenti con il piano. |

Non risultano contraddizioni introdotte da queste modifiche nel perimetro esaminato.

**Punti da decidere**

Nessuno. Restano da completare durante il Task 7 i dettagli esecutivi del Menu, come già previsto dal piano dopo l’aggiornamento del branch.

**Verifiche e limiti**

Revisione documentale e confronto statico con il codice; non ripetuta la revisione completa. Non eseguiti test, build o prove visive: l’approvazione riguarda spec e piano, non l’implementazione. Nessun file modificato; worktree pulito al termine.
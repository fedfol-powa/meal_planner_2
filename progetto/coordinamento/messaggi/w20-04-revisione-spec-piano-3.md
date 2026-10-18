# W20, terza revisione di spec e piano: semplificazione e correzioni

Rapporto: `progetto/coordinamento/revisioni/w20-spec-piano-3.md` (quattro rilievi importanti).

**Decisione del coordinatore, per semplificare (rilievi 1 e 3):** le sezioni dei curatori
nel Ricettario (Bozze, Archiviate) **non hanno skeleton né spazio riservato**: compaiono
quando ruolo e riepilogo sono disponibili, e lo spostamento che ne deriva è ammesso (riguarda
solo i curatori). Togli `useCuratorState`, il `LoadingArea` delle Bozze e la garanzia di «un
solo spostamento»; resta che i risultati e i filtri del Ricettario sono stabili e che le
sezioni non spariscono e ricompaiono. Aggiorna spec, piano e test di conseguenza.

**Da correggere:**
2. CSS della pausa e del movimento ridotto valido sia per l'elemento `.skeleton` stesso sia
   per i discendenti (titolo della Ricetta, riepilogo della Spesa); involucro `Skeleton`
   esplicito nei corpi di Ricetta e Spesa; prove su blocchi animati alla radice e annidati,
   con visibilità e animazioni effettive; il controllo finale include anche gli elementi che
   sono `.skeleton`.
4. La prova del ripristino lento trattiene la transazione di ripristino
   (`store.transact([key, marksPrefix(userId)], …)` in `web/src/api/persister.ts`), non
   `store.get`; online e offline.

**W21 è unito** (PR #74, merge `341bdb1`): per il task del Menu aggiorna il branch su
`origin/main` quando ci arrivi; la fila dei giorni ora è in `DaySelector.tsx` con
trascinamento e settimane accanto, tienine conto nel piano del Menu.

Poi commit e `STATO: SPEC_E_PIANO_PRONTI`. Se l'ultima revisione sarà pulita passi
all'implementazione senza aspettare altro.

# W12: revisione della PR #54, DA CORREGGERE

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w12-pr54.md`.
La CI è verde. Non servono decisioni di prodotto. Correggi sul branch, un commit per
rilievo con test che falliscono prima della correzione, poi aggiorna la descrizione della
PR.

1. **Importante, logout:** `respondPhoto` in `web/src/pwa/sw-core.ts` deve leggere
   l'epoca all'ingresso, prima del primo `await`, e mantenere il controllo prima della
   scrittura. Aggiungi prove con `open()` e `match()` trattenuti finché il logout non è
   completato.
2. **`Images.info()`:** distingui gli errori di decodifica dagli errori del servizio
   anche nella prima chiamata, per esempio `9516`, che deve dare `photo_images_failed`
   con il log. Aggiungi il test del guasto in questa fase.
3. **Cache Storage:** se la cache non si apre o non scrive, si restituisce comunque la
   risposta di rete, mantenendo le protezioni del logout. Test per apertura e scrittura
   fallite.
4. **Prova di concorrenza:** coordina esplicitamente due richieste o transazioni,
   verifica che la seconda resti bloccata prima degli effetti e che il test fallisca
   togliendo `lockRecipe`.

Correggi anche i punti minori rinviati che il revisore conferma:

- elemento compatibile al posto del `div` dentro il pulsante, in `RecipePicker.tsx:110`;
- test del backup sulla struttura esportata e sull'assenza di letture dal bucket delle
  foto, invece della ricerca di `RIFF`/`UklGR`;
- log dell'esito oltre il limite di scaricamento in `download.ts`, senza l'URL completo;
- riga vuota in più a fine `web/src/pwa/sw-core.test.ts`.

Riesegui `npm test -w server` con `TEST_DATABASE_URL` sullo stack locale e pgTAP, e
riporta i numeri nella PR. Poi push e `STATO: PR_CORRETTA`.

# W1 — rilievi della review di spec e piano della Revisione dei pasti

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w1-revisione-pasti-spec-piano.md`
(commit `1f81ac1`, verdetto «da rifare»). Leggilo tutto. Tutti i 14 rilievi vanno risolti;
sotto le decisioni del coordinatore sui punti aperti.

## Decisioni del coordinatore

1. **Identità dell'azione (rilievi 1, 2, 5).** Ogni scrittura è un'**azione** con un id dal
   client (`actionId`); le righe di `meal_changes` di un'azione (due per lo scambio) portano
   lo stesso `action_id` (nuova colonna, migrazione con pgTAP). `meals.undo` riceve
   `{ actionId, undoId }`: è il server a ricavare l'insieme completo delle righe, quindi lo
   scambio torna sempre per intero, anche annullando un annullamento. Una ripetizione è
   riconosciuta solo se id, utente, tipo e slot coincidono con l'azione registrata; ogni
   riuso parziale o incompatibile è `invalid`. La ripetizione già completata si riconosce
   prima dei controlli sul contenuto (ricetta archiviata dopo la prima richiesta), dopo
   autenticazione, appartenenza e verifica degli slot.
2. **Lettura dell'annullamento (rilievo 1).** Estendi la vista del pasto (`MealView` di
   `menu.getWeek`): accanto a `lastChange` l'`actionId` dell'ultima azione e, solo per chi
   legge, se può annullarla e quali slot coinvolge. Così un agente in una conversazione
   nuova può fare «annulla la mia ultima modifica». Test che riparte senza la risposta
   della scrittura.
3. **Richieste senza effetti (rilievo 4).** Vanno ricordate, senza cambiare l'ultima
   modifica visibile. Usa una tabella dedicata all'area, sul modello di
   `app.recipe_draft_requests` di W3 (una riga per richiesta, scritta una volta, mai
   modificata), non una tabella generica delle ricevute. In alternativa una forma più
   piccola, se la motivi nella spec.
4. **Bozze importate (rilievo 3).** Nuova migrazione: il collegamento di uno slot a una bozza
   è ammesso anche quando la bozza era citata da uno slot della stessa famiglia nella
   stessa transazione (scambio, in entrambi gli ordini) oppure quando l'azione che si
   annulla la citava, purché la bozza sia ancora aperta. Se nel frattempo un curatore l'ha
   pubblicata o chiusa, l'annullamento risponde `not_allowed` con un motivo nuovo. Nessun
   privilegio generico in più, niente `app_job`. pgTAP sui casi del rapporto, comprese due
   bozze e i tentativi fra famiglie.
5. **Ordine del registro (rilievo 6).** Ordinamento coerente con le scritture serializzate
   sullo slot e momento effettivo preso dopo il lucchetto: scegli tu la forma e motivala.
6. **Testi liberi (punto 4 del rapporto).** Note e testi dei pasti liberi restano come li
   scrive l'utente, senza traduzione, come le voci libere della spesa; tutti i testi
   dell'interfaccia restano bilingui. Mettilo fra le decisioni da riportare (sezioni 12 e 15).

## Il resto

Rilievi 7–14: correggi come propone il revisore (un'unica logica del pianificatore anche
per il ripiego e per i pasti archiviati fissati; versione dei suggerimenti che cambia con i
voti globali; matrice completa delle invalidazioni; footer e pannelli per tutti i tipi di
pasto; porzioni senza effetti negli aggiornamenti di stato; ricerca anche con i soli filtri
e voti nei risultati; tipi reali negli esempi del piano; test che dimostrano davvero le
garanzie, nella fase rossa dei task).

Aggiorna spec e piano (con la dichiarazione delle migrazioni corretta) e chiudi con
`STATO: SPEC_PIANO_PRONTI` come ultima riga: segue una seconda review breve.

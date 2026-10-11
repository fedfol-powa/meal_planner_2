# Al worker W4: decisioni sulla review di spec e piano

Rapporto del revisore: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w4-spec-piano.md`.

1. **Spunte bilingui.** `quantity_at_check` conserva i testi bilingui del momento della
   spunta: `texts` diventa un elenco di `{ key: <chiave normalizzata italiana usata da
   exceeds>, text: { it-IT, en-GB } }`. Aggiungi il test: testo sostituito dopo la spunta,
   poi visualizzazione nelle due lingue (la quantità precedente resta nella lingua giusta).
   Già girato a W2.
2. **Equivalenze univoche.** Invariante: al massimo una equivalenza per (ingrediente,
   ambito, dimensione dell'unità di partenza). Il dominio rifiuta con un errore le
   configurazioni ambigue; W2 lo garantisce con un vincolo. Test con ordine invertito e
   con unità diverse della stessa dimensione (`g` e `kg`).
3. **Soglie.** Già fatto da te: promozione dopo l'arrotondamento. Aggiungi, se mancano,
   test sotto, sulla e sopra ogni soglia.
4. **Esportazione.** Una sola firma, quella del piano: `shoppingExport(list,
   manualItems?)`, con la lingua presa dalla lista; aggiorna la spec e precisa che per
   cambiare lingua si ripete `arrangeShoppingList`.

Punti 5 e 6 già applicati. Poi commit e `STATO: SPEC_E_PIANO_CORRETTI`.

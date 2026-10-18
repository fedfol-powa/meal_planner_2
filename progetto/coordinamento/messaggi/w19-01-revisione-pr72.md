# W19, rilievi della revisione della PR #72

Rapporto completo: `progetto/coordinamento/revisioni/w19-pr72.md` (APPROVABILE CON CORREZIONI).
Correggi tutti e cinque i rilievi nella stessa PR, con i test indicati nel rapporto, poi push e
di nuovo `STATO: PR_APERTA <url>`.

1. **Importante:** l'esistenza della settimana va verificata sulla settimana, non sul giorno
   di arrivo (`getDates` dà solo i giorni con pasti): basta una data qualsiasi della
   settimana di destinazione, anche nel mese accanto; il giorno selezionato resta lo stesso
   giorno della settimana. Se quel giorno non ha pasti, la pagina mostra il giorno vuoto come
   già fa per i giorni senza pasti. Test con giorno vuoto e settimana a cavallo del mese.
2. **Importante:** multi-touch escluso anche quando il secondo dito parte fuori dalla fila
   (controllo in `touchmove`, identificatore del dito iniziale); test del caso.
3. **Minore:** la soppressione del clic sintetico si azzera a un nuovo `touchstart` e non
   blocca tastiera e mouse; test separati.
4. **Minore:** animazioni conservate, cancellate prima della successiva e allo smontaggio;
   test.
5. **Minore:** nel piano descrivi il comportamento offline reale (navigazione e
   «Caricamento…», come dal calendario) e coprilo con un test; nessun cambio del
   comportamento condiviso con il calendario.

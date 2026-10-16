# W11: revisione della PR #52 (16/10)

Leggi `progetto/coordinamento/revisioni/w11-pr52.md` (DA CORREGGERE, quattro rilievi
importanti) e correggili tutti, con i test indicati dal revisore. Nessuna decisione di
prodotto nuova.

- **Rilievo 1:** nella prima transazione della cancellazione anonimizza l'email degli
  inviti all'app accettati da quell'account (prima che `accepted_by` diventi nullo per la
  cascata) e di quelli ancora aperti per la sua email, rispettando l'ordine dei
  lucchetti; la vista dell'amministrazione mostra una dicitura neutra («account
  cancellato»). Se serve toccare la funzione o la vista di A, con una nuova migrazione o
  nella tua, solo additivo. Aggiorna la spec.
- **Rilievi 2 e 3:** estendi `producedAt` alle conferme della spesa (coda, `applyConfirmedList`,
  messaggi fra schede) e registra `restoredAt` da ogni conferma del server successiva,
  anche se la scheda non conosce ancora la revoca. Test attraverso i percorsi reali.
- **Rilievo 4:** barriera rilasciata in `finally`, errori propagati, termine alle attese.

Il revisore non ha potuto raggiungere lo stack locale dal suo sandbox: nel riepilogo
riporta l'esito di pgTAP, dei test del server con il database e delle prove di
concorrenza, eseguiti da te. La CI è verde su 4c90de0.

Poi push e `STATO: PR_CORRETTA` con il riepilogo. Seguirà una seconda revisione.

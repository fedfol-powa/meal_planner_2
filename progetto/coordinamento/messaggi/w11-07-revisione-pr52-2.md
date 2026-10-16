# W11: seconda revisione della PR #52 (16/10)

Leggi `progetto/coordinamento/revisioni/w11-pr52-2.md`: rilievi 1, 2 e 4 chiusi, resta
il 3. Ogni conferma valida del server (profilo che contiene la famiglia, risposta di
`family.join`/`family.create`) scrive subito `restoredAt = max(restoredAt, startedAt)`
nel record persistito con `store.transact` e annuncia `restored`, anche se la scheda non
conosce ancora una revoca; niente conferme tenute solo in memoria. Restano i controlli
sulle risposte superate. Aggiungi la prova del revisore (revoca in ritardo, conferma in
B, persistenza, nuova sessione sullo stesso archivio prima della consegna → famiglia
visibile con le viste fresche) e aggiorna la spec (punto alla riga ~976).

Poi push e `STATO: PR_CORRETTA`. Questa volta verifico io il diff, senza un'altra
revisione Codex.

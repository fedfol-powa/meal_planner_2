# W10: rilievi della seconda revisione della PR #47

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w10-pr47-2.md`
(DA CORREGGERE, solo web; database, migrazione e test di concorrenza a posto, CI verde su
`62c2148`). Due casi riprodotti dal revisore, da chiudere con la soluzione più semplice:

1. **Lettura del profilo iniziata prima del `forbidden`.** `fetchQuery` riusa la richiesta
   già in corso: annulla la lettura pendente (`cancelQueries` sul profilo) prima di
   verificarla, oppure usa una generazione della verifica e scarta gli esiti più vecchi.
2. **Cambio di lingua dopo un diniego confermato.** L'esito della verifica (consentito o
   negato) va conservato nello stato di sessione, indipendente dalla lingua; dopo un
   `forbidden` la pagina decide solo da quell'esito, non dal profilo in cache di
   un'altra lingua, finché una nuova verifica riuscita non lo cambia. Anche `allowed()`
   lo rispetta.

Valuta se una sola regola chiude entrambi: «dopo un `forbidden`, l'accesso vale solo
dall'esito di una verifica avviata dopo quel `forbidden` e salvato nella sessione».

Test DOM per i due casi (letture successive sospese e fallite), che falliscono sul codice
attuale. Verifica, push, aggiorna la PR e scrivi `STATO: PR_CORRETTA`. Non ci sarà un
terzo giro di revisione Codex: controllo io il diff.

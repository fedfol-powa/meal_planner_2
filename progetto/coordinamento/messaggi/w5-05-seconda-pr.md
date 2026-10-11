# W5 web — seconda PR: client oRPC reale e agganci di sessione

La PR #6 è unita su `main`. Ora la seconda PR prevista dalla tua spec. È la base di
tutte le parti web dell'ondata 2 (W1, W2, W4, W6), quindi va consegnata presto.

Contenuto:
- client oRPC reale come da «Client web» nel piano generale (al posto di `fakeClients`
  quando ci sono le variabili d'ambiente; modalità finta conservata senza);
- gli **agganci di sessione per la coda della spesa** definiti da W4, sezione
  «Interfaccia richiesta a W5» di
  `/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md` (commit
  `7d1ebce` del branch `traguardo/spesa`), **definitiva**: rinnovo esplicito con esiti
  distinti, invio rifiutato su sessione chiusa, agganci asincroni alla chiusura e alla
  revoca, prefissi registrabili per `purgeOtherCopies` (registrati all'inizializzazione
  dell'app), messaggi fra schede per tipo;
- la deroga alla sola consultazione per la sola Spesa scritta nella tua spec
  (piano generale, «Spesa offline senza sessione verificabile»).

Fasi:
1. Nuovo branch da `main` aggiornato, per esempio `fondamenta/web-client`, nel tuo
   worktree.
2. Aggiorna spec e piano (sezione della seconda PR) con questi punti, commit,
   `STATO: SPEC_E_PIANO_PRONTI` e fermati: segue una review breve.
3. Dopo il via: TDD, PR, `STATO: PR_APERTA <url>`.

Se una firma di W4 non è implementabile sopra il tuo codice, non adattarla da solo:
`STATO: DOMANDA`.

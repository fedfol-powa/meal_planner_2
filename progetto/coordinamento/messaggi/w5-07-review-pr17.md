# W5 — review della PR #17

Rapporto: `/Users/fedfol/Projects/meal_planner_2/progetto/coordinamento/revisioni/w5-pr17.md`. Verdetto «approvabile con
correzioni»: due rilievi importanti sulla protezione dell'invio, da correggere come
propone il revisore.

1. **Richiesta inviata dopo la chiusura:** ogni chiamata RPC legata alla sessione e alla
   generazione che l'ha originata, verificate subito prima del trasporto (dopo
   `getAccessToken()`); le richieste ancora in preparazione si annullano alla chiusura,
   conservando il `signal` del chiamante e propagando l'esito di sessione chiusa.
   Regressione con `getAccessToken()` sospeso: dopo `close()` nessuna chiamata a
   `fetch`, e mai un token di B per una chiamata di A.
2. **Ripetizione dopo un rinnovo di un altro utente:** prima di incrementare l'epoca o
   ripetere, confrontare `result.userId` con `session.userId` e la generazione
   corrente; se è cambiata, `SessionClosedError` e chiusura della sola vecchia
   sessione, senza disconnettere B. Test integrato con `AuthProvider` e `SessionScope`
   reali, cambio d'identità durante il rinnovo, una sola esecuzione.

Porta anche il branch su `main` se è cambiato. Push, `STATO: PR_CORRETTA`; segue una
verifica breve.

# W17, rilievi della revisione della PR #68

Rapporto completo: `progetto/coordinamento/revisioni/w17-pr68.md` (APPROVABILE CON CORREZIONI).
Correggi entrambi i rilievi nella stessa PR, poi push e di nuovo `STATO: PR_APERTA <url>`.

1. **Importante, `SKILL.md` riga 24:** la regola «UUID nuovo per ogni scrittura con `id`» è
   sbagliata per le operazioni il cui `id` identifica un'entità esistente (`users_setRole`,
   `users_delete`, `appInvitations_revoke`, `familyInvitations_revoke` e ogni altra che trovi
   nel contratto): l'agente perderebbe il bersaglio. Distingui nella skill gli `id` da
   generare (creazioni, chiavi di idempotenza: controlla nel contratto quali sono) da quelli
   da riusare dalle letture. Ripeti sullo stack locale una prova di cambio ruolo o revoca di
   un invito (dopo il «sì» nel prompt) e riportala nella PR.
2. **Minore, `server/test/agent-skill.test.ts` riga 25:** il test scarta i riferimenti il cui
   gruppo non esiste più, quindi `rating_set` al posto di `ratings_set`, o un gruppo tolto,
   passano. Estrai i riferimenti senza filtrarli per gruppi correnti, escludi in modo esplicito
   gli identificatori che non sono strumenti (ruoli, codici d'errore) e aggiungi i due casi
   negativi.

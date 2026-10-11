**Verdetto: APPROVABILE CON CORREZIONI**

Revisione in sola lettura del commit `91dc3ee` (`origin/main..HEAD`), confrontato con il piano generale del checkout principale e l’interfaccia definitiva richiesta da W4.

1. **Importante — Un errore sincrono interrompe gli agganci di chiusura.**  
   [Piano W5, riga 6745](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/plans/2026-10-11-app-web-di-base.md:6745).  
   `Promise.allSettled([...closeHooks].map(hook => hook()))` non protegge dalle eccezioni sincrone: il `map` si interrompe prima di chiamare gli agganci successivi. Questo viola la garanzia richiesta da W4 e può saltare la cancellazione della coda della Spesa. Riprodotto: primo aggancio che lancia, secondo aggancio mai eseguito.  
   **Correzione:** trasformare ogni invocazione in una promessa protetta, per esempio `Promise.resolve().then(hook)`. Aggiungere un test con eccezione sincrona, oltre al rifiuto asincrono, verificando che tutti gli agganci terminino prima della risoluzione di `close()`.

2. **Importante — Il wrapper perde le opzioni delle chiamate oRPC.**  
   [Piano W5, riga 6828](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/plans/2026-10-11-app-web-di-base.md:6828).  
   L’`apply` proposto inoltra soltanto `input`, scartando il secondo argomento del client tipato, incluso `signal`. Una lettura chiamata attraverso il contesto React perde quindi la possibilità di annullare il trasporto, nonostante il comportamento previsto dalla spec. Riprodotto con oRPC installato: segnale annullato nella chiamata diretta, non annullato passando dall’inoltro proposto.  
   **Correzione:** inoltrare tutti gli argomenti, anche nella ripetizione dopo rinnovo; ricavare `familyId` dal primo. Provare l’annullamento attraverso `wrapApi`, oltre che direttamente sul link.

3. **Minore — La fixture del test RPC non rispetta il contratto.**  
   [Piano W5, riga 6784](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/plans/2026-10-11-app-web-di-base.md:6784).  
   Il test propone `session.whoami` che restituisce l’header ricevuto. Il [contratto, riga 10](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/contract/src/contract.ts:10) richiede invece `{userId, channel, clientId, locale}`. Riprodotto: il server restituisce `INTERNAL_SERVER_ERROR: Output validation failed`; il test non può verificare il percorso riuscito descritto.  
   **Correzione:** catturare gli header in uno spy e restituire un oggetto conforme al contratto.

Non emergono ulteriori incompatibilità concrete con «Client web», il passaggio `me` → `profile` affidato a W2 o l’inserimento delle aree W6, W1 e W4. La deroga offline resta circoscritta alla coda della Spesa, senza estendere le altre mutazioni.

**Punti da decidere:** nessuno; sono correzioni tecniche entro le decisioni già fissate.

Verifica limitata a spec e piano, con tre riproduzioni mirate in memoria e consultazione Context7. Nessun file modificato; suite completa e build non eseguite.
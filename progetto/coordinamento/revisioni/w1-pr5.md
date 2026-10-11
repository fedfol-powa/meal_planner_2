**Revisione PR #5 — «Piattaforma: Worker, contratto e percorso della richiesta»**

**Verdetto: APPROVABILE CON CORREZIONI**

Due rilievi minori. Non ho individuato difetti bloccanti nel perimetro verificabile senza database. La verifica completa di sessioni, revoca, RLS e transazioni resta da eseguire contro le migrazioni W2 nel task 11.

Revisione del commit `d9e5008e7193c3fa30b442ef7cf1c133dc561f86`, con `git diff origin/main...HEAD`, limitata ai task 2–9. Confrontati brief, specifica principale nelle sezioni pertinenti, spec e piano W1, piano generale del checkout principale, review precedente e `spike/REPORT.md`.

**Rilievi**

1. **[minore] RPC e REST rifiutano schemi Bearer validi con maiuscole diverse.**

   **Riferimenti:** [server/src/auth.ts:92](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr5/server/src/auth.ts:92), [server/test/auth.test.ts:158](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr5/server/test/auth.test.ts:158).

   `bearerToken()` richiede esattamente il prefisso `Bearer `. Di conseguenza, `Authorization: bearer <JWT>` e `Authorization: BEARER <JWT>` producono `401 unauthorized` senza verificare il token. Il nome dello schema di autenticazione HTTP è invece insensibile alle maiuscole. [RFC 9110, §11.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-11.1).

   **Prova:** con lo stesso JWT firmato correttamente, `Bearer` raggiunge il verificatore e poi il database deliberatamente irraggiungibile; `bearer` e `BEARER` restituiscono 401 con zero chiamate alla sorgente delle chiavi. L’SDK MCP installato accetta già queste varianti.

   **Perché conta:** un client conforme può autenticarsi su MCP e ricevere un rifiuto ingiustificato su RPC/REST. Il test attuale consolida il comportamento errato.

   **Correzione proposta:** confrontare lo schema senza distinzione fra maiuscole e minuscole, conservando i controlli sul token. Aggiornare test e assunzione corrispondente nel piano: `bearer x` deve fallire perché `x` non è un JWT valido.

2. **[minore] Il test del cambio di lingua può passare anche eliminando la lingua dalla versione.**

   **Riferimenti:** [server/test/pipeline.test.ts:194](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr5/server/test/pipeline.test.ts:194), [server/src/versions.ts:23](/Users/fedfol/Projects/meal_planner_2/.worktrees/review-pr5/server/src/versions.ts:23).

   Il test legge `viewA`, aggiunge alla famiglia l’utente inglese e poi verifica che la sua lettura non sia `unchanged`. Con le migrazioni reali W2, l’inserimento in `family_members` incrementa già il contatore della famiglia: [trigger W2:106](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/supabase/migrations/20261011100700_versions.sql:106).

   **Perché conta:** la differenza di contatore basta a far passare l’asserzione, anche se una regressione rimuovesse `locale` dalla versione. Il codice attuale include correttamente la lingua; il problema è nella protezione offerta dal test quando passerà dalla fixture a W2.

   **Correzione proposta:** creare entrambi gli utenti e le appartenenze prima della prima lettura; confrontare poi le due lingue senza scritture intermedie, mantenendo identici famiglia, contatori e versione del Worker.

**Esito dei controlli di sicurezza**

- **JWT e claim:** firma, issuer, audience, algoritmi ammessi e scadenza sono controllati; `sub` e `session_id` sono UUID obbligatori. Un `client_id` invalido viene rifiutato; il canale deriva dal claim verificato.
- **Sessione e revoca:** il codice verifica profilo e sessione prima di `web_only` e all’ingresso MCP, inclusi `initialize` e `tools/list`. Le relative prove con database non sono state eseguite.
- **Ruolo SQL:** ruoli fissi, claim parametrizzati e impostazioni locali alla transazione. Sono presenti test di ripristino dello stato dopo commit e rollback, rimasti saltati.
- **Errori e log:** passano i test che escludono password, bearer token e stringhe di connessione da risposte e log. Gli errori infrastrutturali provati diventano 500, senza essere confusi con token invalidi.
- **Cache:** le cache applicative esaminate conservano dati risolti; il test delle richieste concorrenti alla cache JWKS passa.
- **MCP:** strumenti generati dal contratto, esclusione di `mcp: false`, schemi e annotazioni coerenti. Una prova isolata aggiuntiva ha confermato `invalid`, percorso `familyId` e messaggi italiani/inglesi attraverso l’adattatore MCP, senza database.

I rilievi sostanziali della review precedente risultano recepiti nel codice esaminato. La verifica contro W2 resta distinta dalla verifica della fixture.

**Verifiche eseguite**

| Verifica | Esito |
|---|---|
| `npm run typecheck` | Passa |
| `npm test` — scripts | 12 passati |
| `npm test` — domain | 54 passati |
| `npm test` — contract | 16 passati |
| `npm test` — server | 42 passati, 21 saltati per assenza del database |
| Build web segnaposto | Passa, eseguita in directory temporanea |
| Wrangler `deploy --dry-run` | Passa; bundle 1.532,07 KiB, gzip 280,44 KiB |
| `git diff --check origin/main...HEAD` | Passa |

Build e configurazione temporanea sono state collocate in `/tmp`, senza pubblicazione. Consultata tramite Context7 la documentazione di jose, oRPC, SDK MCP e Wrangler, confrontandola con le dipendenze installate.

**Punti per il coordinatore e limiti**

Nessuna nuova decisione di prodotto richiesta. La CI rossa per assenza del database è una condizione intenzionale dichiarata per questa PR, non un rilievo aggiuntivo. Il task 11 dovrà verificare le migrazioni reali W2 senza suite saltate; produzione, Hyperdrive effettivo e revoca OAuth reale restano fuori da questa review.

Worktree invariato. Nessun commit, commento su GitHub o rapporto scritto su file.
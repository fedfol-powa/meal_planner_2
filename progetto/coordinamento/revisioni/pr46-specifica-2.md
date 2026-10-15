**Seconda revisione PR #46 — APPROVATA**

Esaminato esclusivamente `git diff d8ecf4d..HEAD`, con `HEAD 8ece549` sul branch `traguardo/specifica-w9`, e i passaggi collegati ai tre rilievi precedenti. Il nuovo diff modifica soltanto `progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`: 22 righe aggiunte e 12 rimosse.

**Verifica dei rilievi precedenti**

1. **Percorso autenticato obbligatorio per ogni operazione — risolto.**  
   Alle righe **760–771, 785–793 e 814–818**, diagramma, transazione `authenticated` e controllo della sessione sono ora riferiti esplicitamente alle operazioni autenticate. Il percorso `public` è distinto: limitatore per IP, nessuna verifica del token di autenticazione o della sessione, transazioni brevi `anon` aperte dal gestore. Coerente con il paragrafo «Operazioni senza utente» alle righe **836–847**, con la specifica W9 alle righe **157–169** e con `server/src/pipeline.ts:116–130`.

2. **Requisito generale MCP incompatibile con le operazioni pubbliche — risolto.**  
   Le tre formulazioni alle righe **49–53, 2601–2604 e 2733–2738** escludono ora le operazioni `public` dalla copertura MCP. Resta distinta la regola dell’eliminazione della famiglia, per cui MCP restituisce il collegamento all’app. Coerente con le righe **2799–2805**, con `contract/src/check.ts:61–65` e con `contract/src/app-invitations/index.ts:58–63`.

3. **Riconciliazione degli errori senza `weak_password` — risolto.**  
   Alle righe **1847–1854** è esplicitata l’eccezione: se Auth rifiuta la password come debole e l’account non esiste, la risposta è `invalid` sul campo `password`, codice `weak_password`; l’invito resta prenotato e consente un nuovo tentativo con un’altra password. La riconciliazione conserva la precedenza dell’account già creato e il divieto di riscriverne credenziali e metadati. Coerente con `server/src/accounts/index.ts:62–75`, `server/src/app-invitations/router.ts:59–71` e la specifica W9, riga **189**.

**Rilievi nuovi o residui**

Nessuno nel perimetro esaminato. La ricerca delle formulazioni generali collegate e il confronto con le interfacce W9 del piano generale nel checkout principale non hanno evidenziato ulteriori contraddizioni introdotte dalle correzioni.

**Verifiche eseguite**

- `git diff --check d8ecf4d..HEAD`: superata.
- Confronto statico con specifica W9, contratto, pipeline e gestione degli errori.
- Letto il test esistente per `weak_password` in `server/src/accounts/index.test.ts:63–65`, senza eseguirlo.
- Test, typecheck e build non rilanciati, come richiesto per questo cambiamento solo documentale.
- Revisione in sola lettura; worktree pulito, nessun file modificato e nessun commento pubblicato sulla PR.

**Decisioni da sottoporre al coordinatore o all’utente:** nessuna.

**Esito: APPROVATA.**
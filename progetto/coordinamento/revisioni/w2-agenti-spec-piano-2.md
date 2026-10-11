**Verdetto: APPROVABILE CON CORREZIONI**

Seconda revisione in sola lettura del worktree al commit `2e0a6a4`, confrontata con i dieci rilievi precedenti e le decisioni del coordinatore. Nessun file modificato, nessun commit.

Di seguito **Spec** indica `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md`; **Piano** indica l’omonimo file in `progetto/superpowers/plans/`.

**Rilievi nuovi o non risolti**

1. **Importante — L’invalidazione delle risposte obsolete arriva ancora troppo tardi al cambio account.** Residuo del rilievo 2.

   **Riferimenti:** Piano, righe 1830–1863, soprattutto 1847–1854.

   La generazione cambia nella pulizia di `useEffect`, dopo l’aggiornamento React. Se arriva un evento di cambio account e subito dopo si risolve la richiesta precedente, quest’ultima può ancora superare il controllo e navigare.

   **Verifica:** eseguito in memoria il componente estratto dal piano con React e jsdom. Cambiando l’identità da Anna a Bruno e risolvendo immediatamente la richiesta di Anna, viene ancora chiamato il callback `?code=anna`.

   **Correzione:** invalidare la richiesta sincronicamente alla chiusura/cambio dell’identità, collegandola alla sessione corrente, oltre alla pulizia per smontaggio e cambio richiesta. Coprire la stessa sequenza ravvicinata sia per `getAuthorization` sia per `decideAuthorization`.

2. **Importante — Con un profilo in cache e una rilettura fallita, «Consenti» resta attivo.** Residuo del rilievo 3.

   **Riferimenti:** Spec, righe 299–303; Piano, righe 1910–1915 e 1929–1961.

   Il componente calcola `blocked`, ma disabilita «Consenti» soltanto con `props.deciding || !profile`. Quando TanStack Query conserva un profilo precedente dopo un errore, la schermata mostra contemporaneamente «senza [profilo] non puoi consentire l’accesso» e il pulsante attivo. I ruoli mostrati possono essere superati.

   **Verifica:** rendering in memoria del frammento con profilo dell’identità corrente ed errore `internal`: messaggio di errore presente, pulsante senza `disabled`.

   **Correzione:** richiedere uno stato valido della lettura anche quando esistono dati in cache; verificare la condizione anche nel gestore della conferma. Aggiungere il caso «profilo già disponibile → rilettura fallita → riprova riuscito».

3. **Importante — Manca ancora la prova richiesta di `webOnly` con token OAuth reali sui tre trasporti.** Residuo del rilievo 6.

   **Riferimenti:** Spec, righe 441–445; Piano, righe 941–953; `server/test/channels.test.ts`, righe 110–123.

   Lo script verifica il claim e il canale prima e dopo il rinnovo, ma non esercita un’operazione `webOnly`. La spec rinvia ai test della piattaforma: quelli citati usano token sintetici e coprono MCP e RPC, senza REST. Non dimostrano quindi tutto il controllo richiesto dalla prima review.

   **Correzione:** aggiungere una fixture riservata ai test che eserciti la pipeline reale con un’operazione `webOnly`, usando i token OAuth ottenuti e rinnovati dallo stack locale. Verificare `web_only` e URL su MCP, RPC e REST, con una sessione web come controllo positivo. Non occorre aggiungere operazioni al contratto di produzione.

4. **Minore — Il comando mirato dei test del contratto produce un falso verde.**

   **Riferimenti:** Piano, righe 580 e 704; `vitest.config.ts`, righe 3–5.

   `npx vitest run contract/src/agents/agents-contract.test.ts`, lanciato dalla radice, usa una configurazione che include soltanto `scripts/**/*.test.ts` e consente zero test. Il rosso atteso non viene quindi verificato. La successiva suite del workspace copre il test finale, ma non corregge quel passo.

   **Correzione:** usare `npm test -w contract -- src/agents/agents-contract.test.ts` anche nel passo iniziale.

**Confini delle PR e CI**

Il piano prevede una sola PR completa, con contratto e gestori insieme: non emergono dipendenze da PR successive. Restano però le correzioni sopra prima di poter dichiarare tutti i controlli verdi.

La modifica CI conserva i controlli di `main` e aggiunge stack OAuth, build e Worker locale. Lo script shell supera `bash -n`; non ho eseguito avvio dello stack, migrazioni o flussi OAuth. L’eseguibilità completa e la durata restano da dimostrare durante l’implementazione.

**Punti da decidere**

Nessuna nuova decisione di prodotto necessaria. I rilievi richiedono correzioni tecniche nell’ambito già approvato.
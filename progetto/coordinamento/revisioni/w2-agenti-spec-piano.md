**Verdetto: DA RIFARE prima dell’esecuzione**

Il disegno basato sui grant di Supabase e su `app.session_is_active()` resta coerente con le decisioni approvate. I problemi riguardano soprattutto il consenso, la gestione delle risposte asincrone, la prova automatica della revoca e alcuni passi del piano.

Revisione in sola lettura del worktree `741d785`, confrontato con `main` fino a `48d368e`, con i brief, la specifica principale, il piano generale nel checkout principale, il sesto giro, il prototipo e il codice richiesto. Nessun file modificato, nessun commit, nessuna operazione sulla produzione.

Di seguito **Spec** indica `progetto/superpowers/specs/2026-10-11-collegamento-agenti.md`; **Piano** indica l’omonimo file in `progetto/superpowers/plans/`.

**Rilievi**

1. **Bloccante — Il consenso e la conferma di scollegamento promettono più di quanto venga revocato.**

   **Riferimenti:** Spec, righe 259–263, 316–319 e 366–375; Piano, righe 1127–1128, 1239–1243, 1260–1264 e 2011.

   La spec riconosce che l’agente può cambiare la password e mantenere un accesso web dopo lo scollegamento. L’interfaccia promette invece «Puoi bloccarlo quando vuoi» e «non potrà più usare l’app […] finché non lo autorizzi di nuovo». I test impongono perfino che non compaiano riferimenti a password o credenziali.

   Accettare temporaneamente questi poteri è una decisione già presa; nasconderne gli effetti dietro una promessa di blocco totale non la applica correttamente.

   **Correzione:** spiegare in entrambe le lingue i poteri rilevanti su Supabase Auth, compreso il cambio password. Descrivere «Scollega» come revoca dell’autorizzazione e delle sessioni OAuth di quel client, senza promettere la chiusura di eventuali accessi web ottenuti separatamente. Allineare anche le descrizioni delle operazioni MCP e sostituire i test che vietano queste informazioni. Non occorre introdurre ora una nuova architettura di autenticazione.

2. **Importante — Le risposte obsolete di `/authorize` possono ancora provocare navigazioni.**

   **Riferimenti:** Piano, righe 1312–1326 e 1328–1341.

   `load()` e `decide()` aggiornano lo stato e chiamano `leavePage.to()` dopo un’attesa senza verificare che pagina, richiesta e identità siano ancora quelle iniziali. L’effetto non restituisce una funzione di pulizia.

   Una risposta arrivata dopo l’uscita dalla pagina o il cambio account può quindi mandare il browser al callback della vecchia richiesta. Anche due caricamenti sovrapposti possono sovrascriversi.

   **Verifica:** ho eseguito in memoria il frammento del piano con dipendenze simulate: nessuna pulizia disponibile e navigazione ancora eseguita alla risoluzione della richiesta abbandonata.

   **Correzione:** legare caricamenti e decisioni a una generazione identificata da utente e `authorization_id`; invalidarla all’uscita, al cambio account e al cambio richiesta. Prima di qualsiasi aggiornamento o navigazione verificare che sia ancora corrente. Aggiungere test con risposte invertite, cambio account e smontaggio durante entrambe le chiamate.

3. **Importante — «Consenti» è disponibile senza aver acquisito tutte le informazioni da mostrare.**

   **Riferimenti:** Spec, righe 255–261 e 273–275; Piano, righe 1017–1019, 1378–1380 e 1393–1400.

   Il profilo in caricamento o in errore viene interpretato come assenza di ruoli: `globalRoles ?? []`. Un curatore o amministratore può autorizzare prima che compaiano i suoi poteri aggiuntivi. Inoltre il backend conserva soltanto nome e identificativo della richiesta, scartando gli scope restituiti da Supabase.

   La documentazione Supabase prevede che il consenso mostri anche le informazioni richieste tramite gli scope; questi non vanno presentati come restrizioni degli endpoint Auth. [Documentazione del consenso Supabase](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

   **Correzione:** attendere un profilo valido dell’identità corrente prima di abilitare «Consenti», gestendo errore e ricaricamento. Conservare e descrivere gli scope richiesti nelle due lingue. Per distinguere client omonimi registrati dinamicamente, rendere consultabili identificativo e destinazione di ritorno forniti da Supabase, mantenendo esplicito che il nome non è verificato. Testare profilo lento, errore, entrambi i ruoli e nomi ostili resi come semplice testo.

4. **Importante — «Cambia account» aggira la procedura comune di chiusura della sessione.**

   **Riferimenti:** Piano, riga 1363; `web/src/session/SessionScope.tsx`, righe 54–63; `web/src/auth/supabaseBackend.ts`, righe 60–71; `web/src/routes/profile/PreferencesPage.tsx`, riga 24.

   La pagina chiama direttamente `backend.signOut()`. Il resto dell’app usa `useSignOut()`, che chiude subito l’identità locale, cancella i dati e comunica l’uscita alle altre schede prima della chiamata remota.

   Con Auth lento o irraggiungibile il percorso proposto non garantisce la stessa chiusura locale. Il backend può rimuovere le credenziali dallo storage senza produrre l’evento necessario a far avanzare la pagina.

   **Correzione:** riusare la chiusura comune e conservare esplicitamente il ritorno alla richiesta OAuth. Verificare il comportamento con errore remoto, coda della spesa presente, altra scheda aperta e successivo accesso di un’altra persona.

5. **Importante — Qualunque HTTP 404 viene interpretato come revoca riuscita.**

   **Riferimenti:** Spec, righe 179–183; Piano, righe 302–305, 372 e 540–541.

   La spec ammette come successo il 404 specifico `oauth_consent_not_found`; l’implementazione accetta ogni 404 senza leggerne il contenuto. Anche una risposta di endpoint non disponibile o una pagina HTML di errore produce quindi «scollegato».

   Questo contraddice il requisito di non dichiarare una revoca non avvenuta.

   **Correzione:** accettare 204 oppure il preciso errore documentato di grant assente; normalizzare gli altri 404 come `internal`. Aggiungere test per 404 generico, HTML, JSON malformato e codice diverso. Il test d’integrazione deve verificare anche che l’accesso resti attivo quando la revoca fallisce.

6. **Importante — La CI non dimostra il percorso reale di scollegamento né i confini OAuth richiesti.**

   **Riferimenti:** Piano, righe 480–483, 553–571, 749–765, 793–807 e 2226–2229; `.github/workflows/ci.yml`, righe 23–28.

   Il test server simula il successo e cancella poi direttamente le sessioni. Lo script reale chiama direttamente il DELETE di Supabase, saltando `agents.disconnect`. La CI avvia il database ed esegue i test ordinari, ma il piano non aggiunge l’avvio di Auth e Worker né l’esecuzione dello script.

   Possono quindi passare tutti i controlli mentre lo scollegamento applicativo è rotto. Mancano inoltre prove negative del flusso PKCE e dei redirect, e la verifica della decisione sulle sessioni multiple dello stesso client.

   **Correzione:** aggiungere un percorso automatico obbligatorio in CI con stack locale OAuth attivo e Worker, senza credenziali di produzione. Deve:

   - ottenere token reali e revocare tramite `agents.disconnect`, anche chiamato dall’agente stesso;
   - riautorizzare lo stesso client e verificare che «Scollega» invalidi entrambi gli access token e i refresh token;
   - provare MCP, RPC e REST prima e dopo, mantenendo attivi altro client, sessione web e stesso client di un altro utente;
   - controllare il corpo delle risposte MCP, oltre allo stato HTTP;
   - rifiutare verifier errato, riuso del codice, redirect non registrato e scambio di client; verificare `state`, annullamento e richiesta scaduta;
   - dimostrare che i token reali conservano `client_id` anche dopo il rinnovo e rimangono soggetti ai controlli `webOnly` su ogni trasporto.

   Le responsabilità di PKCE e validazione dei redirect possono restare a Supabase: occorre provarne l’integrazione, non duplicarle nel Worker.

7. **Importante — L’ordine dei task rende impossibile un controllo dichiarato verde.**

   **Riferimenti:** Piano, righe 127, 416–417 e 638; `server/src/router.ts`, costruzione di `os.router`.

   Il Task 1 aggiunge `agents` al contratto. Il Task 3 richiede poi un typecheck server pulito, ma il router implementer riceve `agents` soltanto nel Task 4.

   **Verifica:** compilazione TypeScript in memoria con le sole aggiunte al contratto previste dal Task 1: errore effettivo `Property 'agents' is missing` nel router server.

   Inoltre il comando del Task 4 non imposta `TEST_DATABASE_URL`, mentre la suite proposta usa `describe.skipIf(!hasDatabase)`: eseguito letteralmente può saltare il test che dovrebbe diventare rosso.

   **Correzione:** riordinare o accorpare contratto e registrazione dei gestori, collocando i controlli nei punti in cui possono davvero passare. Rendere esplicito l’ambiente dei test database. Il piano termina attualmente con una sola PR: eventuali suddivisioni devono indicare confini che superino autonomamente tutti i controlli di `main`.

8. **Importante — I passi esterni non esplicitano prerequisiti indispensabili alla prova in produzione.**

   **Riferimenti:** Spec, righe 350–362 e 381–383; Piano, righe 391–396 e 2254; `server/src/auth.ts`, righe 80–84.

   L’elenco attiva OAuth, configura gli URL e raccoglie la chiave pubblica, ma non richiede di verificare la chiave di firma asimmetrica accettata dal Worker. Non include neppure un controllo operativo della migrazione e dei permessi della funzione sulle tabelle `auth`: questo resta soltanto un rischio annotato.

   Supabase richiede firma asimmetrica per gli ID token `openid`; il Worker rifiuta comunque algoritmi diversi da ES256 e RS256. [Prerequisiti OAuth Supabase](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

   **Correzione:** aggiungere prerequisiti verificabili, eventualmente richiamando i passi della piattaforma: firma e JWKS compatibili; migrazione applicata; lettura della funzione con il contesto applicativo; chiave pubblica effettiva al posto del segnaposto; SPA reale e `/authorize` pubblicati sulla Site URL scelta. Includere la verifica che lo schema `app` resti non esposto dalla Data API. Tutti i passi remoti restano in carico all’utente.

9. **Importante — La pagina genera un indirizzo MCP errato nell’ambiente locale previsto.**

   **Riferimenti:** Spec, righe 293 e 335–341; Piano, righe 1680, 1856 e 2233–2234; `web/vite.config.ts`, righe 25–32.

   La pagina usa sempre `${window.location.origin}/mcp`. Sul Vite previsto dal piano produce `http://127.0.0.1:5174/mcp`, mentre il servizio sta sulla porta 8787 e Vite inoltra soltanto `/api`.

   La prova manuale nasconde il difetto fornendo direttamente il comando corretto con 8787, senza usare quello copiato dalla pagina.

   **Correzione:** definire l’indirizzo MCP dello sviluppo oppure inoltrare coerentemente MCP e discovery. La prova finale deve usare proprio URL e comando copiati dalla pagina, verificando anche i metadati di scoperta.

10. **Importante — Il rinnovo del token non è una misura dell’ultimo uso con errore massimo di un’ora.**

    **Riferimenti:** Spec, righe 81–82, 113, 314–315 e 435–437; Piano, righe 2007–2008.

    `auth.sessions.updated_at` misura emissione/rinnovo. Un client può rinnovare automaticamente il token senza effettuare operazioni sull’app: la distanza dall’ultimo uso umano o applicativo può essere arbitraria, non circa un’ora. Nell’interfaccia manca inoltre la spiegazione della misura.

    Questo conta perché l’elenco viene usato per riconoscere accessi attivi o sospetti.

    **Correzione:** se si mantiene la soluzione senza registrazioni aggiuntive, chiamare il dato «Ultimo rinnovo dell’accesso» e spiegarlo nelle due lingue. Se si vuole conservare il requisito di «ultimo uso», registrare le richieste autenticate pertinenti. Non dichiarare chiusa quella voce della specifica senza distinguere le due semantiche.

**Punti da decidere dal coordinatore o dall’utente**

- Confermare se il requisito diventa **ultimo rinnovo** oppure resta **ultimo uso effettivo**. È la scelta di prodotto ancora necessaria.
- Concordare i testi bilingui che esplicitano i poteri Auth e l’effetto limitato dello scollegamento, applicando la decisione già presa di documentare il rischio.
- Stabilire gli eventuali confini delle PR e il responsabile della modifica alla CI; contratto e relativi gestori non possono essere separati lasciando il router incompleto.

Non occorre riaprire le decisioni su grant Supabase, revoca tramite sessioni, riautorizzazione o responsabilità dei passi remoti.

**Verifiche e limiti**

La lettura del codice conferma che il canale deriva dal claim firmato `client_id`, che RPC e REST passano dalla pipeline comune e che MCP verifica la sessione anche prima delle chiamate agli strumenti. Non emerge la necessità di aggiungere un controllo del grant a ogni richiesta.

Sono state consultate tramite Context7 la documentazione Supabase e quella della CLI, oltre al sorgente locale di `supabase-js`. Le due verifiche mirate — errore di typecheck intermedio e navigazione da risposta obsoleta — sono state eseguite interamente in memoria. Non ho eseguito reset, migrazioni, flussi OAuth reali o la suite completa: questa è una revisione di spec e piano, non dell’implementazione ancora da realizzare.
**Revisione W1 «Piattaforma» — spec e piano**

**Verdetto: APPROVABILE CON CORREZIONI**

L’impostazione architetturale è utilizzabile, ma il piano non è ancora eseguibile fedelmente contro W2. Prima dell’approvazione occorre correggere il disallineamento dello schema, la gestione dei segreti nei log e i controlli descritti sotto.

Revisione della versione `4531342aedff476cc5a15c855cf0464fcbec9cd7` di `fondamenta/piattaforma`, confrontata con la specifica principale, il piano generale nel checkout principale, il brief W1, `spike/REPORT.md`, `spike/server/` e la spec W2 disponibile. All’inizio il worktree era temporaneamente su `fondamenta/scheletro`: i documenti W1 sono stati letti direttamente dal commit, senza cambiare branch.

I rilievi riguardano **il codice proposto nel piano**, non un’implementazione già pubblicata.

**Rilievi**

1. **[bloccante] Il server e la fixture non rispettano l’interfaccia W2.**

   **Riferimenti:** [piano W1:1296](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1296), [piano W1:1834](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1834), [piano W1:1855](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1855), [spec W2:134](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:134), [spec W2:206](/Users/fedfol/Projects/meal_planner_2/.worktrees/schema/progetto/superpowers/specs/2026-10-11-schema-e-permessi.md:206).

   W1 usa `public.profiles(id)`, `public.family_members` con ruolo `admin`, `public.user_global_roles` con ruolo `curator`, e contatori in `public`. W2 prevede invece tabelle nello schema `app`, `profiles.user_id`, `user_roles`, `family_admin` e `recipe_curator`.

   Con le migrazioni reali fallisce già `session.whoami`; correggere soltanto il prefisso dello schema non basta. La fixture riproduce gli stessi nomi sbagliati e può quindi dare test verdi senza dimostrare compatibilità. Inoltre `setupDatabase()` cerca `public.profiles`: non riconoscerebbe lo schema reale di W2 e installerebbe la fixture anche in sua presenza.

   **Correzione proposta:** allineare ora spec, query, fixture e dati di prova all’interfaccia W2. Adeguare anche la creazione degli utenti al trigger che crea il profilo. La verifica conclusiva deve usare le migrazioni reali, senza fallback silenzioso alla fixture.

2. **[importante] Gli errori nascondono i segreti nella risposta, ma li registrano integralmente nei log.**

   **Riferimenti:** [piano W1:1117](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1117), [piano W1:1209](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1209), [piano W1:2614](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:2614).

   `normalizeError()` esegue `console.error('Unexpected error', error)` sull’oggetto originale. Il test passa deliberatamente un errore contenente una stringa di connessione con password, ma controlla soltanto il JSON restituito e che il logger sia stato chiamato. Con l’osservabilità attiva, quel segreto finirebbe nei log del Worker.

   **Correzione proposta:** registrare campi diagnostici selezionati e un identificativo di correlazione; non riversare automaticamente messaggio, cause, query e parametri dell’errore. Estendere il test per verificare l’assenza di password, bearer token e stringhe di connessione anche negli argomenti del logger.

3. **[importante] La verifica crittografica non valida completamente i claim usati come confine di sicurezza.**

   **Riferimenti:** [spec W1:104](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:104), [piano W1:996](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:996), [piano W1:1021](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1021).

   `jwtVerify()` controlla firma, issuer e audience, ma il piano non rende obbligatorio `exp`. Il cast `payload as Claims` non valida `session_id` e `client_id`; `channelOf()` usa la veridicità del valore anziché distinguere assenza e presenza valida.

   Ho eseguito il verificatore estratto dal piano con `jose 6.2.12`: accetta un token firmato senza `exp`, accetta `session_id: 'not-uuid'` e classifica come `web` sia `client_id: ''` sia `client_id: false`. La documentazione conferma che i claim aggiuntivi obbligatori vanno dichiarati tramite `requiredClaims`. [Documentazione jose](https://github.com/panva/jose/blob/main/docs/types/interfaces/JWTClaimVerificationOptions.md).

   Questo **non consente a un client di falsificare una firma**; dimostra che un token firmato ma malformato supera controlli che il server presume già avvenuti.

   **Correzione proposta:** rendere obbligatori scadenza e identificativi necessari; validare `sub` e `session_id` come UUID e `client_id`, quando presente, come stringa non vuota. Un `client_id` presente ma invalido deve produrre `unauthorized`, mai diventare canale web. Aggiungere casi negativi e verificare che non raggiungano il database o l’handler.

4. **[importante] Gli errori di validazione MCP sfuggono alla normalizzazione prevista.**

   **Riferimenti:** [spec W1:248](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:248), [piano W1:2304](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:2304).

   Il piano passa lo schema zod a `registerTool()` e cattura gli errori soltanto dentro il callback. L’SDK MCP valida però gli argomenti **prima** di invocarlo.

   Prova con l’SDK `2.3.1` dello spike: una chiamata con `familyId: 'bad'` restituisce `isError: true` e testo inglese `Input validation error…`; il callback viene eseguito zero volte. Mancano quindi `{ code: 'invalid', data: { issues }, message }` e la localizzazione promessa.

   **Correzione proposta:** prevedere un adattatore che normalizzi anche la validazione effettuata dall’SDK, mantenendo lo schema degli strumenti derivato dal contratto. Aggiungere una prova attraverso `/mcp` con input invalido, verificando codice, percorso del campo e messaggio per un utente italiano e uno inglese. Il test isolato di `normalizeError()` non copre questo percorso.

5. **[importante] I percorsi anticipati rendono non uniforme la revoca e impediscono la localizzazione di `web_only`.**

   **Riferimenti:** [spec W1:191](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:191), [piano W1:1978](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1978), [piano W1:2313](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:2313), [piano W1:2403](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:2403).

   `web_only` viene restituito prima di `loadSession()`: un token di una sessione cancellata riceve ancora il rimando, mentre un agente valido con profilo `en-GB` riceve il messaggio italiano di fallback. Inoltre l’ingresso MCP verifica soltanto il JWT: `tools/list` continua a funzionare dopo la revoca della sessione.

   Le normali operazioni che leggono dati passano comunque dal controllo della sessione: **non è dimostrata una lettura di dati familiari dopo la revoca**. Il difetto riguarda la promessa di controllo a ogni richiesta e la lingua degli errori anticipati.

   **Correzione proposta:** verificare sessione e profilo prima del rimando `web_only` e definire esplicitamente il controllo della revoca all’ingresso MCP, compresi `initialize` e `tools/list`. Aggiornare i test che oggi impongono il rimando senza database; includere un token revocato e un agente valido `en-GB`.

6. **[importante] Il piano consente di consegnare W1 senza una verifica obbligatoria in CI contro W2.**

   **Riferimenti:** [spec W1:423](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:423), [piano W1:1281](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:1281), [piano W1:2817](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:2817).

   La spec dice che i test con database saranno obbligatori in CI. Il task 11 permette invece di aprire la PR lasciandoli saltati e rende l’uso dello schema reale condizionato alla disponibilità di W2 su `main`. Proprio i controlli su identità, ruoli, revoca e contatori potrebbero quindi essere approvati contro una fixture incompatibile.

   **Correzione proposta:** distinguere la prima PR dello scheletro dalla consegna completa. Per quest’ultima, imporre un controllo con migrazioni W2 e nessuna suite di integrazione saltata; in CI l’assenza del database deve fallire. Aggiungere anche il riuso della connessione dopo rollback, oltre al caso di transazione conclusa normalmente già previsto.

7. **[minore] Il controllo delle convenzioni accetta identificativi facoltativi e versioni del tipo sbagliato.**

   **Riferimenti:** [piano W1:721](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:721), [piano W1:743](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/plans/2026-10-11-piattaforma.md:743).

   `acceptsOnlyUuid()` prova soltanto un UUID valido e una stringa invalida: accetta anche `z.uuid().optional()` e `z.uuid().nullable()`. Per `knownVersion` viene verificata soltanto l’accettazione di `undefined`, quindi passa anche `z.number().optional()`. Ho riprodotto tutti e tre i casi.

   Un’operazione può così superare il controllo pur consentendo l’assenza dell’identificativo richiesto per famiglia, creazione o coda offline.

   **Correzione proposta:** verificare obbligatorietà e non nullabilità degli identificativi, e forma stringa facoltativa di `knownVersion`. Aggiungere test negativi per questi schemi.

**Punti da decidere con il coordinatore**

- **Semantica dei contatori.** [W1:284](/Users/fedfol/Projects/meal_planner_2/.worktrees/piattaforma/progetto/superpowers/specs/2026-10-11-piattaforma.md:284) prescrive trigger per istruzione; W2, nella sezione «Contatori di versione», prescrive trigger per riga con incremento deduplicato per transazione. Il server può consumare entrambe le soluzioni, ma documenti e registro devono concordare. È sufficiente fissare il contratto osservabile del contatore, lasciando a W2 il meccanismo concordato.

- **Verifica dell’integrazione Supabase prima del merge W2.** Il piano generale la richiede prima del merge dello schema; il piano W1 la colloca nel task 10. Va anticipata o resa una dipendenza esplicita del merge W2, indipendente dall’avanzamento degli altri task W1.

- **Prerequisito della prova OAuth e responsabilità della revoca reale.** W1 esclude `/authorize`, ma il task 10 richiede un nuovo collegamento da Claude Code. Occorre specificare se la prova usa temporaneamente la pagina dello spike o attende l’ondata 2. Cambiare soltanto il Site URL verso il nuovo Worker non crea la pagina di consenso. La prova reale di revoca può restare nell’ondata 2, con un criterio esplicito: revocare un client, riusare il suo access token non scaduto su MCP/RPC/REST e verificare che gli altri client e la sessione web rimangano attivi. Supabase documenta l’invalidazione delle sessioni e dei refresh token del client, ma questa integrazione non è stata provata dallo spike. [Documentazione Supabase](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).

**Verifiche e limiti**

Sono state consultate tramite Context7 le documentazioni di Supabase, jose e oRPC e ispezionate le dipendenze installate dello spike. Le prove isolate, eseguite senza scrivere file, hanno confermato i comportamenti descritti nei rilievi 3, 4 e 7.

Il meccanismo proposto di transazione usa ruoli SQL fissi, claim parametrizzati e impostazioni locali alla transazione; non ricava il ruolo tecnico da un parametro del client. È coerente con il punto di partenza provato nello spike.

Non sono stati eseguiti test, typecheck e build di un’implementazione W1: questa è una revisione di spec e piano. Nessun file modificato, nessun commit, nessuna operazione su servizi remoti e nessun rapporto scritto su file.
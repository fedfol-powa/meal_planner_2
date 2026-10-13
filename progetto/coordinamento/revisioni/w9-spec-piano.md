**Rapporto di revisione — W9, attività A dell’ondata 3**

Branch `ondata3/inviti-app`, commit `18c5dab` e `8e25c44`.

Il perimetro funzionale recepisce brief e decisioni del coordinatore: flusso senza email, token nel frammento, nome nell’accettazione, ingresso automatico, wizard minimo, amministrazione limitata agli inviti e operazioni MCP previste. Restano però problemi di concorrenza e sicurezza dell’accettazione, oltre a blocchi negli snippet SQL e nell’integrazione del piano.

**Rilievi, per gravità**

1. **Bloccante — Un’accettazione concorrente può cambiare la password dopo la chiusura dell’invito.**

   Riferimenti: [spec, riga 193](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:193), [piano, riga 834](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:834), [piano, riga 1447](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1447).

   Due richieste possono prenotare lo stesso id mentre l’invito è `pending`. La prima crea l’account, chiude l’invito e ottiene i ruoli; la seconda, già autorizzata dalla prenotazione, può eseguire successivamente il `PUT` amministrativo e sostituire la password. La chiusura idempotente risponde comunque positivamente. È quindi falsa la garanzia della spec secondo cui, dopo la chiusura, non si arriva più all’aggiornamento delle credenziali. Con un invito `app_admin` il problema riguarda un account già privilegiato.

   **Correzione:** riprogettare la ripresa evitando che il ritentativo riscriva automaticamente le credenziali di un account esistente. Un semplice controllo dello stato prima del `PUT` lascia la stessa finestra di concorrenza. Aggiungere test deterministici con due password diverse, sospendendo la seconda richiesta fino a dopo la chiusura della prima; coprire anche la revoca nel frattempo. Il test attuale verifica soltanto il numero degli account.

2. **Bloccante — La migrazione contiene un `CHECK` non valido in PostgreSQL.**

   Riferimento: [piano, riga 323](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:323).

   `cardinality(array(select distinct unnest(roles)))` contiene una sottoquery dentro un vincolo `CHECK`: PostgreSQL la rifiuta. La migrazione si ferma alla creazione della tabella, prima delle funzioni. La funzione `app_invitation_roles_valid` definita successivamente non risolve il problema perché il vincolo non la usa. Il divieto è confermato dalla [documentazione PostgreSQL consultata con Context7](https://www.postgresql.org/docs/17/sql-createtable.html).

   **Correzione:** definire prima un helper immutabile, usarlo nel vincolo e mantenere gli ACL espliciti; oppure esprimere il controllo senza sottoquery. Il primo checkpoint deve applicare davvero la migrazione e poi eseguire pgTAP.

3. **Bloccante — Gli array dei ruoli non sono compatibili con la configurazione effettiva di Postgres.js.**

   Riferimenti: [piano, riga 1178](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1178), [piano, riga 1145](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1145), [piano, riga 1412](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1412).

   `withDb` usa `fetch_types: false`. In questa configurazione manca il parser di `text[]`: le letture restituiscono testo PostgreSQL, non `string[]`. I cast TypeScript del piano non convertono il valore e l’output viola il contratto zod. Anche il parametro `${input.roles}::text[]` non dispone della serializzazione automatica prevista dallo snippet.

   Il repository affronta già questo caso usando JSONB in [profile/views.ts, riga 10](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/server/src/profile/views.ts:10). L’ispezione locale del driver conferma l’assenza di parser e serializer dell’OID 1009.

   **Correzione:** seguire la convenzione esistente: proiettare i ruoli come JSONB nelle letture e definire una conversione esplicita e sicura del parametro in ingresso. Provare `[]`, un ruolo e due ruoli attraverso il vero `withDb`, senza cambiare globalmente il driver per questa attività.

4. **Importante — La transazione esterna inutilizzata può esaurire il pool Hyperdrive.**

   Riferimenti: [piano, riga 659](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:659), [piano, riga 1421](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1421), [spec, riga 213](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:213).

   La pipeline apre realmente `BEGIN` e `SET LOCAL ROLE anon`; la connessione resta impegnata mentre l’handler apre altre transazioni e aspetta Auth. L’affermazione della spec «fuori da ogni transazione» non corrisponde al piano. Con il limite di produzione di 10 connessioni, più richieste possono occupare il pool con transazioni esterne e attendere tutte una connessione interna. Il limitatore per IP non impedisce questo scenario.

   Hyperdrive restituisce la connessione al pool solo al termine della transazione, come conferma la [documentazione sul pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/).

   **Correzione:** separare il contesto pubblico dall’apertura automatica della transazione. La pipeline mantiene limitatore e assenza di autenticazione; `get` apre una transazione breve, `accept` apre soltanto prenotazione e chiusura. Nessuna connessione deve restare occupata durante Auth. Aggiungere una verifica dell’ordine apertura/chiusura rispetto al `fetch`.

5. **Importante — Due creazioni Auth simultanee non garantiscono la risposta `email_exists` prevista dal piano.**

   Riferimenti: [piano, riga 826](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:826), [piano, riga 1254](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1254), [piano, riga 1370](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1370).

   Il controllo dell’email duplicata in Auth precede l’inserimento. Due `POST` possono superarlo entrambi; il secondo può fallire sull’unicità dell’id durante l’inserimento, producendo un errore interno invece di `422 email_exists`. Questo percorso è visibile nel [sorgente Supabase Auth v2.197.0](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go). Il piano tratta ogni risposta diversa da 422 come errore definitivo della richiesta. Anche il fake presenta una sequenza controllo/inserimento non atomica.

   **Correzione:** insieme alla correzione del rilievo 1, definire la riconciliazione degli esiti ambigui, compreso il timeout dopo una creazione riuscita, mediante lettura dell’id prenotato e verifica dell’email. Non assumere che ogni concorrenza arrivi al ramo `email_exists`. Introdurre barriere nei test e una prova concorrente contro Auth reale.

6. **Importante — Le creazioni di invito e famiglia non sono serializzate.**

   Riferimenti: [piano, riga 367](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:367), [piano, riga 376](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:376), [piano, riga 494](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:494).

   `FOR UPDATE` non blocca una riga ancora inesistente. Due creazioni con lo stesso id possono entrambe non trovarla e tentare l’inserimento: una termina con `23505`, non gestito dal piano. Lo stesso accade con due inviti nuovi alla stessa email: il vincolo parziale impedisce il doppione, ma non realizza la sostituzione dichiarata. `create_family` ripete lo schema controllo/inserimento senza protezione.

   **Correzione:** serializzare le creazioni sulle chiavi pertinenti, oppure gestire atomicamente i conflitti e rileggere il risultato. Per gli inviti coprire sia id sia email, con ordine dei lock definito. Aggiungere test concorrenti, oltre alle ripetizioni sequenziali già previste.

7. **Importante — Un invito prenotato e scaduto resta utilizzabile, ma il web non permette più di revocarlo.**

   Riferimenti: [spec, riga 109](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:109), [piano, riga 1158](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1158), [piano, riga 2120](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2120).

   La prosecuzione dopo la scadenza è una decisione approvata. Tuttavia l’elenco mostra questi inviti come `expired` e offre «Revoca» soltanto per `pending`. Se l’account è già stato creato e manca la chiusura, anche «Nuovo link» fallisce per `account_exists`: dall’app non si può fermare un link ancora capace di assegnare ruoli.

   **Correzione:** rendere revocabili anche gli inviti scaduti ancora pendenti nel database; distinguere, se necessario, stato persistito e scadenza visualizzata. Testare il caso prenotazione → creazione account → scadenza → revoca dal web → chiusura rifiutata.

8. **Importante — Il test pgTAP interrompe la suite tentando una lettura vietata ad `anon`.**

   Riferimento: [piano, riga 203](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:203).

   Dopo `tests.become('anon')`, l’asserzione confronta il risultato di `claim` con una lettura diretta di `app.app_invitations`. Questa lettura deve fallire con `42501`, come il test stesso verifica poco prima. Non essendo dentro `throws_ok`, interrompe la transazione e impedisce di verificare scadenza, chiusura e assegnazione dei ruoli.

   **Correzione:** conservare l’id restituito dalla prima chiamata e confrontarlo con quello della seconda; oppure leggere il riferimento come owner prima di tornare ad `anon`. Non concedere privilegi ulteriori per far passare il test.

9. **Importante — Il piano usa `useAreaMutation` senza estenderne il contratto interno.**

   Riferimenti: [piano, riga 1972](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1972), [piano, riga 2120](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2120).

   `family.create`, `appInvitations.create` e `appInvitations.revoke` non appartengono a `MutationName`, ricavato da `INVALIDATIONS`. Il piano non prevede modifiche a questo registro. Le chiamate non compilano; aggirando il tipo, `runAreaMutation` fallirebbe leggendo `target` da una voce inesistente. Gli inviti richiedono inoltre un comportamento diverso dalle attuali mutazioni che restituiscono una vista da scrivere nella cache.

   **Correzione:** aggiungere un passo esplicito per [api/mutations.ts](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/web/src/api/mutations.ts:174): creazione famiglia con destinazione profilo; inviti con invalidazione appropriata e consegna del link soltanto alla sessione ancora valida. Coprire risposte tardive, uscita e cambio di lingua.

10. **Importante — Il collaudo dello stack non realizza quanto promesso e il comando previsto può escludere proprio i test da eseguire.**

    Riferimenti: [spec, riga 395](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:395), [piano, riga 1593](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1593), [piano, riga 1601](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1601), [piano, riga 1645](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1645).

    La spec promette nello script/CI il percorso completo fino al menu. I test proposti chiamano direttamente `createInvitedAccount`: non attraversano contratto, pipeline, prenotazione, chiusura, assegnazione dei ruoli e creazione della famiglia. Il percorso completo rimane nella prova interattiva del Task 13.

    Inoltre il Task 8 prescrive di escludere `*.stack.test.ts` dalla configurazione ordinaria, ma lo script usa quella stessa configurazione: il filtro passato da CLI non annulla l’esclusione. Se si spengono le iscrizioni nello stack comune, vanno aggiornati anche gli script `.sh` che forniscono le credenziali alle prove password/OAuth, non soltanto i relativi helper.

    **Correzione:** scegliere una configurazione dedicata oppure mantenere i test inclusi con condizioni esplicite; completare il passaggio della chiave locale negli script interessati. Aggiungere una prova automatizzata dell’intero percorso con Auth reale, iscrizioni spente, ruoli finali e menu della famiglia nuova; mantenere la verifica visiva a 390 px e le prove iPhone separate.

11. **Importante — La ripresa aggiorna i metadata Auth, ma non il nome e la lingua del profilo.**

    Riferimenti: [spec, riga 194](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:194), [piano, riga 834](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:834).

    Il comportamento «vale l’ultima scelta» non funziona per nome e lingua. Il trigger esistente [create_profile_after_insert](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/supabase/migrations/20261011100100_identity.sql:44) si attiva soltanto all’inserimento dell’utente. Un `PUT user_metadata` successivo lascia invariato `app.profiles`, che è ciò che l’app legge.

    **Correzione:** definire il comportamento della ripresa insieme al rilievo 1. Se deve prevalere il nuovo modulo, aggiornare esplicitamente il profilo nello strato applicativo autorizzato. Testare una ripresa con nome diverso e passaggio `it-IT` → `en-GB`, verificando `profile.get`, non soltanto il corpo del `PUT`.

12. **Minore — Il primo checkpoint di typecheck non considera l’estensione di `Role`.**

    Riferimenti: [piano, riga 89](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:89), [piano, riga 124](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:124).

    Aggiungendo `public`, lo `switch` di [permissions.ts, riga 15](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/server/src/permissions.ts:15) non garantisce più l’assegnazione di `rows`. Il piano prevede `npm run typecheck` verde, ma non include l’adeguamento di questa funzione.

    **Correzione:** prevedere subito il caso esplicito, con rifiuto se `public` raggiunge per errore il controllo dei ruoli autenticati, oppure restringere opportunamente il tipo accettato.

**Verifica delle API e dei confini**

- Context7 conferma `POST /admin/users`, id esplicito ed `email_confirm: true`; la creazione amministrativa non è bloccata da `DisableSignup`. È appropriato provarla anche sullo stack locale. [Supabase Auth](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go).
- L’uso della nuova chiave `sb_secret_…` nell’intestazione `apikey`, senza trattarla come JWT, è coerente con la documentazione. Isolamento nel modulo `accounts`, segreto facoltativo e procedura di configurazione sono descritti correttamente. [Migrazione alle nuove chiavi](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/getting-started/migrating-to-new-api-keys.mdx).
- `ratelimits`, `namespace_id` come stringa contenente un intero positivo, periodo 60 e contatori condivisi a parità di namespace sono corretti. È corretta anche la precisazione che i limiti sono locali alla sede Cloudflare e approssimati. [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
- La distinzione fra ruolo applicativo `public`, ruolo PostgreSQL `anon` e pseudo-ruolo SQL `PUBLIC` è rispettata nel disegno. Sono previsti revoca di `EXECUTE`, `search_path` vuoto, schema `app` non esposto, RLS e verifica database di id/email.
- Token nel frammento, operazioni pubbliche POST e log con campi selezionati sono scelte coerenti. Non emerge un percorso previsto che riveli l’email dell’invitato senza token valido.
- Le migrazioni previste sono additive; web, MCP e dizionari nelle due lingue sono nel perimetro. I problemi sopra impediscono però di considerare il piano eseguibile così com’è.

**Punti da decidere con il coordinatore**

- Comportamento del modulo dopo una creazione Auth riuscita ma una chiusura interrotta: conservazione delle credenziali iniziali oppure un diverso recupero, con garanzie esplicite contro richieste concorrenti e tardive.
- Spegnimento delle iscrizioni nello stack locale comune oppure stack separato: la scelta è già segnalata dal piano, ma va chiusa e tradotta in comandi completi.
- Prima del rilascio: conferma dei namespace `9101` e `9102` nell’account POWA e configurazione del segreto da parte dell’utente, come già previsto.

**Metodo e limiti della verifica**

Revisione statica dei due commit, confronto con brief, decisioni, piano generale del checkout principale e specifica principale aggiornata; consultazione Context7 e controllo del sorgente Auth per la concorrenza. Verificata localmente la configurazione dei parser Postgres.js senza connessione.

Le suite dell’attività non sono ancora implementate. Il tentativo di lettura del database locale è stato negato dal sandbox con `EPERM`; non attribuisco quindi a questa revisione un’esecuzione di pgTAP o del collaudo Auth. Nessun file modificato; worktree rimasto pulito.

**Verdetto: DA CORREGGERE.**
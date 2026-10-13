**Seconda revisione — W9, attività A dell’ondata 3**

Branch `ondata3/inviti-app`, commit `5ae0b86c759b175397435533c530924c0c00a8cb`.

Le correzioni risolvono il problema principale delle credenziali e recepiscono le decisioni del coordinatore. Restano difetti nella concorrenza del rinnovo, nella gestione delle risposte tardive sul web e nell’eseguibilità dei test. Spec e piano richiedono un altro intervento prima dell’implementazione.

**Rilievi, per gravità**

1. **Importante — La suite dello stack fallisce anche quando dovrebbe essere saltata.**

   Riferimento: [piano, riga 1866](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1866).

   Dentro `describe.skipIf(!url)` vengono eseguiti immediatamente `postgres(env.STACK_DB_URL!, …)` e `new URL(env.STACK_DB_URL!)`. Vitest esegue il corpo di `describe` durante la raccolta anche per una suite saltata; il `!` TypeScript non fornisce un valore a runtime.

   Senza variabili `STACK_*`, `new URL(undefined)` solleva `TypeError: Invalid URL`: il normale `npm test` fallisce invece di saltare questi test. **Riprodotto con Vitest 4.1.11 in un file temporaneo**, senza modificare il worktree.

   **Correzione:** spostare l’inizializzazione dipendente dallo stack in `beforeAll`, validare lì tutte le variabili richieste e rendere il cleanup condizionale. Verificare esplicitamente entrambi i comandi: suite ordinaria senza `STACK_*` e script dello stack con tutte le variabili.

2. **Importante — I lucchetti delle creazioni non proteggono il rinnovo da revoca e chiusura concorrenti.**

   Riferimenti: [piano, riga 405](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:405), [spec, riga 119](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:119).

   `create_app_invitation` prende i lucchetti consultivi su id ed email, ma legge la riga esistente **senza `FOR UPDATE`**. `revoke_app_invitation` e `complete_app_invitation` non prendono quei lucchetti consultivi.

   Interleaving possibile:

   - una ripetizione di `create` legge l’invito ancora `pending`;
   - un’altra transazione lo revoca e conferma;
   - `create` esegue `UPDATE … SET token_hash = … WHERE id = p_id`, senza ricontrollare lo stato.

   L’operazione restituisce successo e un link relativo a un invito già revocato. La stessa lettura superata può incontrare una chiusura concorrente. Non riapre l’invito, ma viola la precondizione dichiarata e consegna un link inutilizzabile.

   **Correzione:** mantenere i lucchetti consultivi per le righe assenti e bloccare anche la riga esistente prima di controllarla e aggiornarla, oppure usare una scrittura condizionata con gestione esplicita del mancato aggiornamento. Documentare l’ordine e aggiungere test deterministici rinnovo/revoca e rinnovo/chiusura.

3. **Importante — L’estensione delle mutazioni web resta incompleta e non compila.**

   Riferimento: [piano, riga 2118](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2118).

   Il piano aggiunge `appInvitations` a `MutationTarget` ed esclude correttamente questa destinazione da `TARGET_KEY`, ma lascia inalterati:

   - [targetKey, riga 70](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/web/src/api/mutations.ts:70);
   - [sameView, riga 104](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/web/src/api/mutations.ts:104).

   Entrambe accettano ancora l’intero `MutationTarget` e indicizzano `TARGET_KEY[target]`. Il ritorno anticipato dentro `applyMutation` non restringe i parametri delle altre funzioni. **Riprodotti due errori TS7053** applicando in una prova isolata la modifica prescritta.

   **Correzione:** restringere esplicitamente i parametri degli helper alle destinazioni che hanno una vista in cache, oppure gestire il nuovo caso anche lì. Inserire il ritorno anticipato dopo la lettura di `target` e prima della costruzione della chiave. Il rilievo 9 della prima revisione è quindi risolto solo parzialmente.

4. **Importante — Una risposta tardiva all’accettazione può avviare l’accesso dopo l’abbandono della pagina o il cambio d’account.**

   Riferimenti: [piano, riga 2282](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2282), [spec, riga 250](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:250).

   La sequenza prevista è sempre `accept → backend.signIn → navigate`. Non sono previsti controlli sull’abbandono della pagina, sul cambio di link o sull’identità cambiata nel frattempo. `trackBusy` impedisce l’aggiornamento della PWA durante l’operazione, ma non annulla questa continuazione.

   Se l’accettazione resta in attesa e la persona naviga altrove o accede con un altro account, la risposta precedente può ancora chiamare `signIn` con le vecchie credenziali e sostituire la sessione corrente.

   **Correzione:** definire nella spec e nel piano la validità del tentativo rispetto a pagina, link e identità; controllarla prima dell’accesso automatico e della navigazione. Il repository applica già una protezione equivalente in `AuthorizePage`. Aggiungere test con risposta differita dopo navigazione e cambio d’account, verificando che `backend.signIn` non venga chiamato.

5. **Importante — Due risposte di creazione possono mostrare un link già sostituito.**

   Riferimenti: [spec, riga 388](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:388), [piano, riga 2121](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2121), [piano, riga 2534](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:2534).

   Le mutazioni degli inviti restituiscono `applied: true` per ogni risposta finché la sessione rimane aperta. Il foglio usa un id stabile per il doppio tocco, ma ogni chiamata con quell’id sostituisce il token.

   Due creazioni A e B possono quindi essere confermate dal database in quest’ordine, mentre le risposte arrivano B e poi A. Il foglio può mostrare infine il link di A, che B ha già invalidato. Il test «two creations in a row are both applied» non distingue creazioni indipendenti da ripetizioni dello stesso invito.

   **Correzione:** prevedere un blocco sincrono dei doppi invii e associare gli effetti nel foglio al tentativo ancora corrente. Conservare l’invalidazione dell’elenco anche per risposte superate, separandola dalla possibilità di mostrare il link. Aggiungere un test con stesso id, risposte invertite e verifica della validità del link mostrato.

6. **Importante — La prova con Auth reale non dimostra che prevalgano le credenziali della prima creazione.**

   Riferimento: [piano, riga 1920](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1920).

   Il test verifica soltanto che esista un account e che funzioni esattamente una delle due password. **Passerebbe anche con il vecchio comportamento difettoso**, nel quale la seconda richiesta sostituisce la password della prima: rimarrebbero comunque un account e una sola password funzionante.

   I test con Auth finta migliorano sensibilmente la copertura, ma la prova dello stack non verifica la proprietà che dichiara. Inoltre non prova la conservazione di nome e lingua, né la ripresa specifica `timeout/5xx → GET 404 → creazione precedente visibile più tardi`.

   **Correzione:** aggiungere una prova controllata con Auth reale che renda osservabile la prima creazione prima di liberare il tentativo tardivo; verificare che la password iniziale continui a funzionare, la seconda fallisca e `profile.get` conservi nome e lingua iniziali. Coprire separatamente la ripresa dopo `internal` quando il primo tentativo diventa visibile in ritardo.

7. **Minore — Il test della pipeline può non vedere la transazione che dovrebbe rilevare.**

   Riferimento: [piano, riga 622](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:622).

   La lettura di `pg_stat_activity` avviene attraverso `anonDb`, quindi come `anon`. Le sessioni osservate appartengono ad `app_server`; `anon` non appartiene a quel ruolo. PostgreSQL nasconde molte colonne delle sessioni altrui, tra cui le informazioni necessarie al controllo con `xact_start`. Il conteggio può risultare zero anche in presenza della transazione esterna. [Documentazione PostgreSQL sulle statistiche](https://www.postgresql.org/docs/17/monitoring-stats.html).

   Il controllo del Task 6 usa invece `db.admin` e copre correttamente il caso dell’accettazione: questo limita l’impatto del difetto.

   **Correzione:** osservare le transazioni da una connessione amministrativa del test, senza concedere privilegi aggiuntivi ad `anon`. Verificare che il test fallisca introducendo deliberatamente una transazione esterna mantenuta aperta.

8. **Minore — Il checkpoint del Task 7 richiede verde prima dell’adeguamento della finta web.**

   Riferimento: [piano, riga 1773](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/plans/2026-10-13-inviti-app.md:1773).

   Il Task 7 aggiunge `family.create` al contratto e richiede il typecheck dell’intero repository. Il tipo `Api['family']` del web deriva già dal contratto; l’oggetto in [fake/family.ts, riga 106](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/web/src/api/fake/family.ts:106) non avrà quindi la nuova proprietà obbligatoria. L’adeguamento è previsto soltanto nel Task 9.

   **Correzione:** anticipare l’adeguamento minimo della finta al Task 7 oppure delimitare esplicitamente quel checkpoint e collocare il typecheck completo dopo il Task 9.

**Esito dei dodici rilievi precedenti**

| Rilievo precedente | Esito nella seconda revisione |
|---|---|
| 1 — Riscrittura concorrente della password | Risolto nel disegno: nessun `PUT`, account esistente conservato. |
| 2 — Sottoquery nel `CHECK` | Risolto: helper immutabile definito prima della tabella. |
| 3 — Array con `fetch_types: false` | Risolto: ingresso JSONB e proiezioni JSONB nelle letture utilizzate dal Worker. |
| 4 — Transazione esterna durante Auth | Risolto nell’architettura; osservazione sul test al rilievo 7 sopra. |
| 5 — Esiti ambigui di Auth | Riconciliazione introdotta correttamente; copertura da completare, rilievo 6. |
| 6 — Creazioni non serializzate | Serializzazione fra creazioni introdotta; nuova lacuna rispetto a revoca/chiusura, rilievo 2. |
| 7 — Revoca degli inviti scaduti | Risolto in spec, SQL, web e test previsti. |
| 8 — Lettura vietata nel test pgTAP | Risolto: confronto tramite valore conservato, senza lettura della tabella come `anon`. |
| 9 — Registro delle mutazioni | Parzialmente risolto; restano i rilievi 3 e 5. |
| 10 — Collaudo completo e iscrizioni locali | Percorso completo e script previsti; restano i rilievi 1 e 6. |
| 11 — Nome e lingua nella ripresa | Risolto dal mantenimento dei dati della prima creazione e dal controllo del profilo nei test finti. |
| 12 — Estensione di `Role` | Risolto: caso `public` anticipato nel Task 1. |

**Valutazione della scelta sull’esito ambiguo di Auth**

Restituire `internal` dopo un esito ambiguo seguito da `GET 404` è tecnicamente appropriato: non dimostra che l’email appartenga a un altro account e permette di riprovare conservando l’id prenotato. Non indebolisce la regola sulle credenziali.

Va corretta la frase della [spec, riga 228](/Users/fedfol/Projects/meal_planner_2/.worktrees/inviti/progetto/superpowers/specs/2026-10-13-inviti-app.md:228): il 404 significa **«account non ancora osservabile»**, non necessariamente «creazione non avvenuta». La richiesta originale potrebbe essere ancora in corso.

La scelta differisce dalla formulazione letterale di `w9-05`, che indicava `account_exists` quando la riconciliazione non trovava l’utente atteso. **Propongo al coordinatore di confermare questa precisazione**, accompagnata dal test di ripresa del rilievo 6.

**SQL, permessi e file condivisi**

Non emergono ulteriori impedimenti statici nelle firme dei lucchetti consultivi, nel nuovo `CHECK` o negli ACL espliciti. La conversione JSONB è compatibile con i parser incorporati di Postgres.js anche con `fetch_types: false`, verificati nel driver locale e tramite [documentazione Postgres.js](https://github.com/porsager/postgres/blob/master/README.md).

Le modifiche condivise per spegnere le iscrizioni locali sono dichiarate e autorizzate dal coordinatore, compreso il passaggio della chiave agli script password/OAuth. Le ulteriori modifiche web sono indicate nei task; conviene allineare anche l’elenco riepilogativo della spec ai file citati nei singoli passi.

**Metodo e limiti**

Revisione statica del commit e dei due documenti, confronto con la prima revisione, `w9-05`, codice esistente, specifica principale e piano generale del checkout principale. Consultati Context7 e i sorgenti locali pertinenti.

Eseguite soltanto prove isolate in `/private/tmp`: confermati il fallimento della suite saltata e i due errori TypeScript. Il tentativo di connessione in lettura al database locale è stato negato dal sandbox con `EPERM`; non sono stati eseguiti pgTAP né il collaudo Auth reale. I test dell’attività non sono ancora implementati.

Nessun file tracciato modificato; worktree pulito. Il rapporto non è stato scritto su file.

**Verdetto: DA CORREGGERE.**
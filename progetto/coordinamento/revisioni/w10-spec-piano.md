**Verdetto: DA CORREGGERE**

Revisione di qualità di spec e piano dell’attività B, issue #38, sul branch `ondata3/amministrazione-utenti`, commit `3d6d2c8` ed `e742d7d`.

Esame statico dei documenti, dei riferimenti indicati e del codice esistente necessario a verificarne l’eseguibilità. Consultata tramite Context7 la documentazione PostgreSQL e TanStack Query. Non sono stati modificati file; il worktree risulta pulito. Non sono stati eseguiti i test proposti: l’implementazione non è ancora presente e nel worktree mancano le dipendenze installate.

Nel seguito, **Spec** indica `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md`; **Piano** indica `progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md`.

**Rilievi, per gravità**

1. **Importante — Il test della rimozione incrociata pretende il codice d’errore sbagliato.**

   **Riferimenti:** [Spec:292](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md:292), [Piano:816](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:816), [Piano:280](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:280).

   A toglie `app_admin` a B e conferma. Quando B acquisisce il lucchetto, il controllo ripetuto del chiamante trova B già retrocesso e solleva **`42501`**, prima di raggiungere il controllo dell’ultimo amministratore. Il test pretende invece `P0A08`: l’implementazione proposta non può farlo passare.

   **Correzione:** attendere `42501` nella rimozione incrociata, mantenendo l’asserzione sull’amministratore superstite. Aggiungere il caso di **due amministratori che rinunciano ciascuno al proprio ruolo**: il secondo conserva l’autorizzazione a chiamare, ma deve ricevere `P0A08`. I due casi verificano garanzie diverse.

2. **Importante — La prova senza lucchetto può lasciare aperta la transazione invece di dimostrare l’esito finale.**

   **Riferimenti:** [Piano:818](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:818), [Piano:831](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:831), [Piano:847](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:847), [hold.ts:11](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/server/test/support/hold.ts:11).

   `held.release()` viene chiamato soltanto dopo l’asserzione `stillPending`. Senza lucchetto la seconda operazione può terminare, facendo fallire quell’asserzione: la prima transazione rimane sospesa su `await released`, con connessione e modifiche non confermate. Non si raggiunge quindi la dimostrazione promessa di «entrambe le rimozioni riescono, zero amministratori». Anche un fallimento anticipato ordinario lascia risorse aperte.

   Inoltre, 200 ms di attesa non identificano da soli il lucchetto: possono includere connessione e scheduling.

   **Correzione:** garantire rilascio e raccolta dell’esito della seconda richiesta con `try/finally`, prima del ripristino delle fixture. La prova negativa deve concludere entrambe le transazioni e verificare l’invariante finale. Preferire una sincronizzazione che accerti l’effettiva attesa sul lucchetto, oppure rendere l’attesa temporale un controllo accessorio.

3. **Importante — Una revoca ricevuta da un altro amministratore non aggiorna l’accesso nel web.**

   **Riferimenti:** [Piano:1599](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1599), [Piano:1680](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1680), [Piano:1724](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1724), [SessionScope.tsx:115](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/web/src/session/SessionScope.tsx:115).

   Dopo un `forbidden`, il test richiede esplicitamente che l’interruttore torni abilitato. Il profilo viene invalidato soltanto dopo una mutazione riuscita; la gestione globale degli errori interviene solo con `familyId`, assente nelle operazioni `users`.

   Di conseguenza, un amministratore retrocesso altrove continua a vedere il dettaglio memorizzato e i comandi utilizzabili, anche dopo che il server ha notificato la perdita del permesso. Anche una rilettura fallita può mostrare insieme errore e vecchio dettaglio.

   **Correzione:** alla revoca accertata rileggere il profilo, bloccare i comandi e nascondere le viste amministrative non più autorizzate. Aggiornare il test usando una revoca effettiva del ruolo simulato, verificando lo stato «Non hai accesso» e l’assenza dei dati precedenti. Dichiarare eventuali modifiche al gestore condiviso degli errori.

4. **Importante — Le ricerche asincrone di `account_exists` possono collegare l’utente sbagliato.**

   **Riferimento:** [Piano:1875](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1875).

   La ricerca verifica soltanto `alive.current`, cioè che il foglio sia ancora montato. Scenario riproducibile:

   - un tentativo per l’email A avvia una ricerca lenta;
   - nello stesso foglio si invia l’email B e la sua ricerca termina;
   - la risposta di A arriva per ultima e sostituisce `existingUser`.

   Il messaggio del tentativo B offre così un collegamento ad A. Azzerare `existingUser` all’inizio di `send()` non impedisce la successiva risposta fuori ordine.

   **Correzione:** associare ricerca e risposta a un identificatore del tentativo, verificandolo prima di aggiornare lo stato. Invalidare il collegamento quando cambia l’email. Aggiungere un test con due risposte risolte in ordine inverso.

5. **Importante — Gli interruttori vengono riabilitati prima che lo stato confermato sia riletto.**

   **Riferimenti:** [Piano:1053](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1053), [Piano:1732](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1732).

   Il registro scarta intenzionalmente la risposta della mutazione e avvia le riletture con `void invalidateQueries(...)`. La mutazione termina quindi prima della rilettura; `isPending` diventa falso mentre l’interruttore mostra ancora il vecchio valore.

   Con una lettura lenta, un secondo tocco usa `!on` calcolato sul valore precedente e ripete l’operazione appena riuscita, anziché invertirla. Se la rilettura fallisce, il controllo rimane utilizzabile con uno stato superato.

   **Correzione:** mantenere i controlli bloccati fino alla riconciliazione del dettaglio, gestendo esplicitamente l’errore della rilettura. Attendere la Promise pertinente è il comportamento documentato da [TanStack Query](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/invalidations-from-mutations.md). Aggiungere test con mutazione risolta e rilettura ancora sospesa, poi fallita. Conservare l’assenza di aggiornamenti ottimistici.

6. **Minore — Fixture e percorso di verifica della modalità finta non sono coerenti.**

   **Riferimenti:** [Piano:1110](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1110), [Piano:1165](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1165), [Piano:1945](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1945).

   Il test crea Federico con id `me`, ma il costruttore aggiunge anche il Federico del seed, id `user-federico`. La ricerca `FEDERICO` restituisce entrambi, contrariamente all’atteso `['me']`.

   La prova manuale presenta altre due precondizioni mancanti: il client demo ordinario rimane soltanto curatore, quindi non entra in `/admin`; inoltre `fakeAppInvitations.create` non consulta gli utenti e non produce `account_exists` per `ospite@example.com`.

   **Correzione:** usare un’identità coerente con il seed e predisporre esplicitamente il caso demo amministratore e l’errore dell’account esistente. Dichiarare i file necessari, incluso `fakeAppInvitations.ts` se modificato.

7. **Minore — Il dettaglio omette «Tu», richiesto dalle decisioni del brainstorming.**

   **Riferimenti:** [Spec:48](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md:48), [Piano:1720](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1720).

   Il dettaglio calcola `isSelf`, ma non lo rappresenta nell’intestazione o accanto all’email. «Tu» compare soltanto nell’elenco.

   **Correzione:** aggiungere l’indicazione nel dettaglio e verificarla nelle due lingue. Serve anche a rendere riconoscibile il contesto della rinuncia al proprio ruolo.

**Verifiche trasversali**

- **Perimetro:** coerente con brief e interfaccia di A; cancellazione correttamente rinviata a C, senza segnaposto. Ricerca limitata a 50 risultati, distinzione degli accenti, famiglie per nome e ruolo e conferme MCP rispettano le decisioni registrate.
- **Concorrenza:** la sequenza lucchetto → nuove istruzioni → ricontrollo del chiamante è corretta sotto `READ COMMITTED`. La funzione modificatrice è implicitamente `VOLATILE`; il comportamento delle fotografie dei dati è coerente con la [documentazione PostgreSQL](https://www.postgresql.org/docs/17/xfunc-volatility.html). La pipeline attuale usa l’isolamento predefinito: il piano dovrebbe verificarne esplicitamente il valore nel test.
- **Permessi:** le quattro funzioni proposte controllano `app_admin`, fissano `search_path = ''`, revocano `EXECUTE` a `PUBLIC` e lo concedono ad `authenticated`. Le famiglie restituiscono solo `name` e `role`. Non vengono aggiunte scritture in `auth` né chiavi segrete. Lo schema `app` rimane escluso dalla Data API nella configurazione versionata.
- **Migrazione e SQLSTATE:** migrazione nuova, nessuna modifica distruttiva o incompatibile; `P0A07` e `P0A08` non risultano già usati nel codice esistente. L’aggiornamento di `coverage_test.sql` copre ACL e `search_path`.
- **MCP:** i permessi vengono riletti dal database a ogni richiesta; la revoca non dipende dal rinnovo del JWT. Il test proposto riusa correttamente un token emesso prima della modifica.
- **Design e localizzazione:** struttura, componenti e CSS riprendono il sesto giro; testi previsti in `it-IT` ed `en-GB`. La verifica finale va estesa esplicitamente a entrambe le lingue e ai nomi lunghi, come richiede `design/design.md`.

**Punto da chiarire con il coordinatore**

La portata del lucchetto va formulata senza contraddizioni. La Spec parla di «ogni modifica di ruolo», ma alle righe 124–126 esclude `complete_app_invitation`; l’interfaccia per C prescrive invece ogni percorso che **toglie** `app_admin`.

Ho verificato `complete_app_invitation`: aggiunge ruoli con `ON CONFLICT DO NOTHING`, senza rimuoverli. Questa eccezione, da sola, **non compromette l’invariante dell’ultimo amministratore**, perché può solo aumentarne il numero. Non la classifico quindi come perdita dimostrata della protezione.

Il coordinatore deve però confermare quale garanzia si intende adottare: serializzare tutte le modifiche, includendo A, oppure documentare esplicitamente l’eccezione delle sole assegnazioni di A. Nel primo caso occorre dichiarare l’aggiornamento compatibile della funzione in una nuova migrazione, l’ordine dei lucchetti e il relativo test concorrente.

**Verdetto finale: DA CORREGGERE.** I rilievi richiedono correzioni circoscritte; non emerge la necessità di riprogettare l’attività.
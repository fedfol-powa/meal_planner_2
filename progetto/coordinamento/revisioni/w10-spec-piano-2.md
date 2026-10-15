**Seconda revisione di spec e piano W10 — attività B dell’ondata 3**

Revisione del commit `30389cb` sul branch `ondata3/amministrazione-utenti`, confrontato con la prima revisione e con le decisioni del coordinatore.

Restano **tre rilievi importanti e uno minore**. Le correzioni sono circoscritte; non serve riprogettare l’attività.

Nel seguito, **Spec** indica `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md`; **Piano** indica `progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md`.

**Rilievi, per gravità**

1. **Importante — La gestione di `forbidden` non garantisce che i dati amministrativi scompaiano.**

   **Riferimenti:** [Piano:1579](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1579), [Piano:1620](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1620), [Piano:1683](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1683), [Piano:2193](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:2193).

   `onAdminForbidden` rimuove le query e rilegge il profilo, ma `/admin` continua a mostrare le sezioni in base al profilo precedente. Se la rilettura fallisce, quel profilo conserva `app_admin`.

   Inoltre, `removeQueries` non basta a svuotare i dati già esposti dagli osservatori React. Ho riprodotto la sequenza con React **19.3.0** e TanStack Query **5.104.1**: dopo `forbidden` e il fallimento della rilettura del profilo, la query `users` risultava assente dalla cache, ma l’email precedente restava nel DOM. Anche con il profilo riletto e strutturalmente invariato, i dati precedenti rimanevano visibili. La documentazione consultata tramite Context7 conferma che `removeQueries` rimuove le query e che `refetchQueries`, senza `throwOnError`, assorbe gli errori delle letture.

   C’è anche un percorso non collegato al gestore: la ricerca `users.list` di `account_exists` scarta qualsiasi errore con `.catch(() => undefined)`, compreso `forbidden`, benché la Spec prescriva la gestione per ogni operazione `users`.

   **Correzione proposta:** rendere esplicito lo stato di verifica dell’accesso anche in `/admin`, nascondendo dati e comandi quando arriva `forbidden`. Se il profilo non si può verificare, mostrare un errore con riprova senza riutilizzare il precedente permesso. Se il ruolo è ancora presente, ricreare/rileggere esplicitamente le viste necessarie. Collegare allo stesso trattamento il `forbidden` della ricerca nel foglio degli inviti.

   **Test mancanti:** revoca seguita da rilettura del profilo sospesa e poi fallita; profilo ancora amministratore; `forbidden` durante la ricerca di `account_exists`. Verificare assenza di dati e comandi precedenti, oltre allo stato della cache.

2. **Importante — Una risposta di mutazione superata può sovrascrivere lo stato più recente degli interruttori.**

   **Riferimenti:** [Piano:1119](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1119), [Piano:1132](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1132), [Piano:1948](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1948), [Spec:230](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md:230).

   Il ramo `isListTarget` restituisce `true` per qualunque risposta arrivata a sessione aperta, senza consultare `options.isLatest()`. La pagina interpreta invece `outcome.applied` come autorizzazione a scrivere il dettaglio nella cache. Questo contraddice la condizione «risposta più recente» della Spec.

   Scenario: un’assegnazione riesce ma la risposta tarda; si lascia e si riapre il dettaglio, quindi si rimuove il ruolo. La seconda risposta arriva prima. Quando arriva la prima, anche il gestore della pagina precedente può ancora scrivere nella stessa cache, ripristinando visivamente il ruolo appena rimosso.

   Ho eseguito una prova isolata del registro esistente con il ramo proposto dal piano: completando due risposte in ordine inverso, **entrambe risultano `applied: true`** e l’ultima scrittura lascia il valore della risposta vecchia. La rilettura può correggerlo successivamente, ma se tarda o fallisce lo stato resta superato.

   **Correzione proposta:** distinguere l’invalidazione, necessaria anche per risposte superate, dall’autorizzazione a scriverne il contenuto. Per `users`, verificare la precedenza della risposta prima di restituire `applied: true`; valutare il tracciamento per utente, perché il dettaglio scritto è individuale. Preservare il comportamento degli inviti.

   **Test mancante:** due mutazioni sullo stesso utente, risposte in ordine inverso e rilettura sospesa o fallita. La risposta vecchia non deve sostituire quella nuova, anche dopo uscita e rientro nella pagina.

3. **Importante — Il test di concorrenza può ancora lasciare aperta la prima transazione quando fallisce l’avvio della seconda.**

   **Riferimenti:** [Piano:816](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:816), [Piano:848](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:848), [Piano:858](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:858), [hold.ts:11](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/server/test/support/hold.ts:11).

   La Promise `removal.pid` viene risolta soltanto dopo `select pg_backend_pid()`. Se la connessione, `BEGIN` o quella query falliscono, `outcome` termina con il codice d’errore, ma `pid` rimane pendente. `race()` resta quindi su `await removal.pid` e **non raggiunge il `finally`** che rilascia la prima transazione. Il limite di tre secondi non copre questa attesa: parte dentro `waitsOnAdvisoryLock`, chiamata solo dopo aver ottenuto il PID.

   Ho verificato il ramo con il codice di `removeAs` estratto dal piano e un errore di avvio iniettato (`08006`): la seconda connessione si chiude, mentre l’attesa del PID resta pendente e il rilascio della prima non viene eseguito.

   Restano inoltre due punti analoghi: `holdTransaction` attende `isReady` senza propagarvi un errore di `work`; se `held.release()` rigetta, la successiva raccolta di `removal.outcome` viene saltata.

   **Correzione proposta:** propagare l’errore anche alla promessa di disponibilità del PID e a quella di `holdTransaction`; includere l’avvio delle operazioni nella gestione delle risorse; garantire la raccolta di entrambi gli esiti anche se il rilascio fallisce. Dichiarare l’eventuale modifica al supporto condiviso.

   **Test mancanti:** errore prima dell’acquisizione del PID ed errore del lavoro iniziale, verificando conclusione senza attese pendenti e ripristino delle fixture.

4. **Minore — Restano prescrizioni documentali superate sul lucchetto e sull’attesa degli interruttori.**

   **Riferimenti:** [Piano:12](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:12), [Spec:364](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md:364), [Piano:1785](/Users/fedfol/Projects/meal_planner_2/.worktrees/amministrazione/progetto/superpowers/plans/2026-10-15-amministrazione-utenti.md:1785).

   L’architettura iniziale del Piano parla ancora di lucchetto «per ogni modifica di ruolo», mentre vincoli e SQL lo limitano correttamente alle rimozioni di `app_admin`.

   La sezione test della Spec richiede ancora interruttori bloccati con mutazione risolta e rilettura sospesa; il test del Piano li vuole invece abilitati appena mostrata la risposta confermata di `setRole`. Quest’ultimo comportamento segue l’alternativa preferita dal coordinatore.

   **Correzione proposta:** uniformare i testi: lucchetto sulle sole rimozioni di `app_admin`; interruttori bloccati fino alla disponibilità dello stato confermato, senza attendere necessariamente la rilettura successiva.

**Esito dei rilievi della prima revisione**

| Rilievo precedente | Esito |
|---|---|
| 1. Codice della rimozione incrociata | Risolto nel piano: `42501`; aggiunta la doppia rinuncia con `P0A08`. |
| 2. Concorrenza e rilascio delle risorse | Migliorato, ma incompleto: rilievo 3 sopra. |
| 3. Perdita dell’accesso nel web | Coperto il percorso con rilettura riuscita e ruolo assente; restano i casi del rilievo 1. |
| 4. Risposte fuori ordine di `account_exists` | Risolto nel codice proposto: contatore del tentativo, invalidazione al cambio email e test in ordine inverso. |
| 5. Stato confermato degli interruttori | Risolto il caso ordinario con risposta di `setRole`; resta il problema delle risposte superate, rilievo 2. |
| 6. Fixture e modalità finta | Correzioni coerenti e file dichiarati: identità del seed, amministratore solo nella demo, `account_exists` tramite callback. |
| 7. «Tu» nel dettaglio | Risolto con «Questo è il tuo account» e test nelle due lingue. |

**Verifiche trasversali e limiti**

La funzione SQL proposta rispetta la decisione del coordinatore: il lucchetto protegge le rimozioni di `app_admin`; `complete_app_invitation` di A resta invariata. I casi concorrenti, i codici attesi e l’osservazione di `pg_stat_activity` sono coerenti. Nel percorso senza errori di avvio, il test senza lucchetto arriva alle asserzioni dopo aver concluso entrambe le transazioni; la prova effettiva su PostgreSQL resta da eseguire.

Le modifiche previste ai file condivisi sono dichiarate e circoscritte. I ruoli predefiniti dei client finti restano invariati; l’opzione amministratore è applicata in `main.tsx`. Non emerge un’altra regressione certa dei test esistenti, ma la suite completa non è stata eseguita.

Questa è una revisione di **spec e piano**: l’implementazione e i nuovi test non sono ancora presenti. Sono state eseguite le prove isolate descritte sopra, senza modificare file del repository; non sono stati eseguiti migrazioni, test sul database, typecheck o build del lavoro futuro. Documentazione TanStack Query consultata tramite Context7. Worktree pulito al termine.

**Decisioni richieste al coordinatore o all’utente:** nessuna nuova decisione di prodotto; le correzioni richieste attuano quelle già confermate.

**Verdetto finale: DA CORREGGERE.**
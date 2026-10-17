# Revisione W15 — spec e piano delle email dell’app

**Verdetto: DA RIFARE**

La direzione di prodotto rispetta le decisioni del 17 ottobre, ma spec e piano non sono ancora pronti per l’implementazione. Vanno corretti soprattutto i permessi degli allarmi, la rappresentazione della password ancora da scegliere, il legame fra cambio password e sessione, e le garanzie di consegna.

Revisione del branch `ondata3/email`, commit `0d72f95`, in sola lettura. Confrontati brief, specifica principale, spec A/C/W7, piano generale del checkout principale e messaggio `w15-01-design-1.md`. Verificate le API con Context7 e, dove necessario, direttamente nel sorgente Supabase Auth v2.197.0. Nessun file modificato; test e build non eseguiti, trattandosi di revisione di spec e piano.

## Rilievi

### 1. Importante — Omettere la password non crea un account con hash vuoto

**Riferimenti:** [spec:75](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:75), [spec:230](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:230), [piano:151](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:151).

`adminUserCreate`, quando mancano password e password hash, genera una password casuale e ne salva l’hash. Pertanto `encrypted_password IS NULL OR encrypted_password = ''` sarà falso già alla creazione: l’etichetta non comparirà per gli account effettivamente creati dal percorso W15. I fixture pgTAP con hash vuoto non riproducono questo comportamento. [Sorgente Supabase, `admin.go`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go#L426-L437).

Anche `email_confirmed_at` non certifica che la persona abbia scelto la password: viene valorizzato alla verifica del link, prima del salvataggio.

**Correzione proposta:** distinguere esplicitamente “password non ancora scelta dalla persona” da “hash assente”; definire uno stato attendibile e il momento in cui termina. Aggiornare anche la deduzione `confirmed → not_needed`. Provare sullo stack un account creato attraverso l’API reale, includendo l’interruzione fra verifica e salvataggio.

**Precisazione sulle eccezioni:** non risulta invece dimostrato un blocco del salvataggio da `invite`: `verifyPost` emette una sessione `otp`, ammessa da `IsRecovery()`. La motivazione della spec va corretta e provata con “Require current password” acceso. [Verifica](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L268), [eccezione](https://github.com/supabase/auth/blob/v2.197.0/internal/models/factor.go#L63-L69).

### 2. Bloccante — RLS senza policy impedisce ad `app_job` di usare `ops_alerts`

**Riferimenti:** [spec:489](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:489), [piano:93](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:93).

Il piano prescrive RLS attiva senza policy e soli `GRANT` ad `app_job`. Il ruolo è creato senza `BYPASSRLS` e il server esegue realmente `SET LOCAL ROLE app_job`: i privilegi SQL non superano la RLS. Gli inserimenti saranno rifiutati e le letture non vedranno le righe.

Evidenza nel repository: [creazione del ruolo](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/supabase/migrations/20261011100000_foundation.sql:9), [cambio di ruolo](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/db.ts:24). Le tabelle del job esistenti hanno infatti policy dedicate.

**Correzione proposta:** aggiungere policy esplicite per `app_job`, oppure funzioni privilegiate strettamente circoscritte. Conservare il diniego agli utenti. I test devono eseguire CRUD sotto il ruolo reale, non come proprietario della tabella.

### 3. Bloccante — Revocare `SELECT` ad `app_backup` rompe tutta l’esportazione

**Riferimenti:** [spec:490](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:490), [spec:495](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:495), [piano:83](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:83).

La spec nega qualunque privilegio ad `app_backup`, ma subito dopo richiede che la tabella entri nel backup. L’esportatore scopre tutte le tabelle di `app` e le legge già durante la stima delle dimensioni: non salta quelle senza permessi. La nuova revoca farà fallire l’intera esportazione con `42501`, anche con `ops_alerts` vuota.

Evidenza: [scoperta e lettura delle tabelle](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/backup/read.ts:25), [privilegi predefiniti del backup](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/supabase/migrations/20261012110000_backup.sql:15).

**Correzione proposta:** mantenere `SELECT` per `app_backup`, vietando le scritture. Correggere i test che oggi pretendono il rifiuto della lettura; aggiungere esportazione e ripristino con un allarme presente.

### 4. Bloccante — Il salvataggio della password non è legato alla sessione verificata

**Riferimenti:** [spec:289](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:289), [piano:343](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:343).

`verifyEmailLink` restituisce soltanto l’email; `setPassword(password)` usa `updateUser` sul client condiviso. Se un’altra scheda cambia la sessione, il salvataggio può usare quella nuova. Il controllo iniziale “Esci e continua” e lo scarto degli esiti tardivi non vincolano la richiesta HTTP all’account mostrato.

È lo stesso problema già affrontato da W7: [decisione sulla sessione catturata](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-13-cambio-password.md:87), [implementazione esistente](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/web/src/auth/passwordChangeRequests.ts:99).

**Correzione proposta:** conservare identità, `session_id` e credenziale della sessione verificata; effettuare il cambio con quella credenziale, controllando prima eventuali sostituzioni. Prevedere test con altro account, nuova sessione dello stesso account e cambio d’identità durante l’attesa. L’opzione della password attuale non sostituisce questa protezione: anche la sessione subentrata può essere una sessione di recupero.

### 5. Importante — L’invio con `/invite` può ricreare un account appena cancellato

**Riferimenti:** [spec:154](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:154), [spec:170](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:170).

`sendPasswordEmail` riceve soltanto l’email e chiama un endpoint che crea un utente quando non lo trova. Sequenza possibile: chiusura dell’invito → cancellazione completa dell’account da parte dell’amministratore → chiamata `/invite` ancora in attesa. Quest’ultima crea un nuovo account con un nuovo ID, fuori dalla prenotazione originaria.

La protezione `account_id_deleted` riguarda l’ID prenotato e non ferma questa seconda creazione. Il comportamento di `/invite` è confermato dal [sorgente Supabase](https://github.com/supabase/auth/blob/v2.197.0/internal/api/invite.go#L39-L78).

**Correzione proposta:** l’operazione di spedizione deve essere priva dell’effetto di creazione. Valutare un percorso di recupero per l’account già creato, coordinandolo con il rilievo 1. Una lettura preliminare dell’utente non basta a eliminare la corsa. Aggiungere un test che sospenda l’invio, cancelli l’account e poi riprenda.

### 6. Importante — L’etichetta rimane obsoleta nella vista famiglia versionata

**Riferimenti:** [spec:237](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:237), [piano:231](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:231).

`family.get` dipende dalla versione della famiglia. Cambiare la password in Auth non incrementa quel contatore. Un amministratore che abbia già letto `passwordPending: true` continuerà quindi a ricevere `unchanged`, anche tornando online o riaprendo la pagina.

La seconda query proposta nel gestore non risolve: la pipeline risponde `unchanged` prima di eseguire il gestore. Evidenza: [contratto](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/contract/src/family/index.ts:42), [versione](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/versions.ts:11), [uscita anticipata](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/pipeline.ts:180).

**Correzione proposta:** includere lo stato nella versione prima del confronto, oppure leggerlo separatamente senza versionamento. Testare due letture con `knownVersion`, intervallate dalla scelta della password e senza altre modifiche alla famiglia.

### 7. Importante — La deduplicazione degli allarmi non copre la consegna

**Riferimenti:** [spec:465](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:465), [spec:509](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:509), [piano:265](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:265).

La chiave primaria impedisce due inserimenti, ma non impedisce a due `deliverPendingAlerts`, o a un invio immediato e un recupero pendenti, di spedire la stessa riga. Il test con due soli `raiseAlert` non copre questi casi.

Inoltre i ritentativi durano 48 ore, mentre Resend conserva l’idempotenza per 24: un invio accettato con risposta persa, ripreso dopo 25 ore, può produrre una seconda email. Il corpo deve anche restare identico: stessa chiave con corpo diverso dà `409`, quindi l’ora del messaggio non deve essere ricalcolata al tentativo. [Documentazione Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

**Correzione proposta:** definire acquisizione atomica della consegna, recupero delle acquisizioni interrotte, payload immutabile e trattamento degli esiti ambigui oltre le 24 ore. Aggiungere test concorrenti e di risposta persa, compreso il fallimento della scrittura di `sent_at`.

### 8. Importante — Un allarme può perdersi prima di entrare nella tabella

**Riferimenti:** [spec:517](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:517), [spec:525](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:525), [piano:305](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:305).

Agganciare `raiseAlert` accanto ai log lascia una finestra fra evento e registrazione. Per esempio, `markAbandoned` conferma lo stato e poi viene scritto il log: se il Worker termina o l’inserimento dell’allarme fallisce, quel job non sarà più selezionato fra quelli aperti. `deliverPendingAlerts` non può recuperare una riga mai inserita.

Evidenza: [selezione dei job aperti](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/menu/job.ts:39), [abbandono e log](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/menu/job.ts:53), [commit dell’abbandono](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/menu/job-status.ts:5). Anche il solo aggancio all’esecuzione delle 04:30 non rileva un’esecuzione mai arrivata al punto di segnalazione.

**Correzione proposta:** prevedere registrazione atomica dove compatibile, oppure riconciliazione periodica dagli stati persistiti e dalla presenza delle esportazioni. Testare l’interruzione fra evento e inserimento, non soltanto Resend che fallisce dopo l’inserimento.

### 9. Importante — La garanzia di non enumerazione non vale per i limiti per account

**Riferimenti:** [spec:263](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:263), [spec:548](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:548), [piano:372](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:372).

La frase “il limite […] non rivela se l’email ha un account” è falsa. Per un indirizzo inesistente `/recover` restituisce `200` prima dell’invio; per un account esistente una seconda richiesta entro `max_frequency` produce `429`. La UI prevista mostra messaggi diversi. [Recupero Supabase](https://github.com/supabase/auth/blob/v2.197.0/internal/api/recover.go#L48-L64), [controllo della frequenza](https://github.com/supabase/auth/blob/v2.197.0/internal/api/mail.go#L377-L382).

**Correzione proposta:** distinguere la risposta generica della UI dalle proprietà dell’endpoint pubblico Supabase. Definire un comportamento coerente per il limite per account e sottoporre al coordinatore l’eventuale accettazione del canale di enumerazione residuo. Aggiungere il confronto fra indirizzo esistente e inesistente su richieste ripetute.

### 10. Importante — “Rimanda l’email” perde il nome della famiglia

**Riferimenti:** [spec:196](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:196), [spec:421](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:421), [spec:426](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:426).

Il reinvio usa `recovery`, ma quel template non legge mai `family_name`. La prima email nomina la famiglia; quella rimandata, anche dopo un primo invio fallito, perde il contesto deciso dall’utente. Il test del reinvio verifica soltanto la chiamata al backend.

Aggiungere semplicemente il nome a ogni recupero non basta: il metadato resta anche dopo uscita, rimozione o cambio di famiglia e non descrive necessariamente l’appartenenza corrente.

**Correzione proposta:** definire un testo e una condizione attendibile per distinguere la prima scelta della password dal recupero ordinario. Verificare l’email realmente ricevuta dopo “Rimanda”, nelle due lingue, includendo il caso di appartenenza non più valida.

### 11. Importante — Il piano non definisce come ottenere `familyName` preservando le riprese di C

**Riferimenti:** [spec:136](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:136), [spec:161](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:161), [piano:183](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:183).

Il piano richiede il nome della famiglia nei metadati, ma `claim_family_invitation` restituisce solo `user_id`, `email`, `state`, `member`. Il contratto di accettazione non lo fornisce e non è prevista un’altra lettura.

La lettura pubblica esistente per token restituisce dati solo per un link ancora utilizzabile; invece C permette di completare una prenotazione anche dopo la scadenza. Usarla come nuova precondizione cambierebbe quel comportamento. Evidenza: [lettura pubblica](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/supabase/migrations/20261016100000_family_management.sql:258), [ripresa dopo scadenza](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/supabase/migrations/20261016100000_family_management.sql:321).

**Correzione proposta:** specificare una lettura autorizzata e la semantica del nome nelle riprese, senza modificare prenotazione e chiusura né bloccarle se il contesto non è più disponibile. Aggiungere il caso “prenotazione prima della scadenza, creazione dopo”.

### 12. Importante — Collaudo e runbook non coprono il passaggio reale fra versioni

**Riferimenti:** [spec:342](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:342), [spec:666](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:666), [piano:456](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:456), [piano:467](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:467).

Il passaggio con SPA vecchia è descritto, ma non testato. Non è garantito che duri pochi secondi: W8 rimanda il reload dopo interazione o durante attività in corso. Inoltre il percorso di recupero descritto presuppone che l’email arrivi; con `failed` o `rate_limited` il client vecchio ignora il nuovo stato e suggerisce una password inutilizzabile.

Mancano anche:

- prova dell’apertura di `/password#…` attraverso la shell precedente;
- protezione dall’aggiornamento automatico mentre il codice è soltanto in memoria;
- procedura di rollback: la versione precedente non contiene `/password`, ma i link già spediti continuano a puntarvi;
- prova obbligatoria con “Require current password” acceso: il piano consente di ometterla;
- collaudo operativo dell’email Resend e recupero delle righe che raggiungono cinque fallimenti o 48 ore;
- verifica delle condizioni del limite orario: lo stack attuale ha `enable_confirmations = false`, mentre il limitatore email nel sorgente Auth dipende anche da `Mailer.Autoconfirm`. [Sorgente del limitatore](https://github.com/supabase/auth/blob/v2.197.0/internal/api/mail.go#L735-L754).

**Correzione proposta:** aggiungere una matrice di transizione con invio riuscito/fallito, shell vecchia e ritorno indietro; definire il recupero esplicito degli account in attesa e degli allarmi esauriti. Il runbook deve indicare controlli osservabili, criteri di arresto e gestione dei link già emessi.

## Aspetti confermati

- L’aggiornamento dei metadati tramite API amministrativa è appropriato anche per MCP; `UpdateUserMetaData` unisce le chiavi senza cancellare quelle omesse. [Sorgente Supabase](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L210-L225).
- `/recover` può spedire a un utente non confermato e la verifica del recupero ne conferma l’email. [Sorgente della verifica](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L348-L375).
- I link con `token_hash` nel frammento e verifica tramite POST sono coerenti con il vincolo di non mettere il codice nell’URL inviato al server dell’app.
- I controlli previsti per le due funzioni dell’etichetta rispettano la separazione richiesta: membri della famiglia da una parte, `app_admin` dall’altra; risultato limitato a ID e booleano.
- Il mantenimento delle funzioni di prenotazione e chiusura di A/C è corretto come obiettivo. I rilievi 5 e 11 riguardano nuovi effetti e nuove dipendenze attorno a quelle funzioni.
- Nessuno strumento MCP nuovo, chiave Resend distinta dall’SMTP e destinatario operativo esplicito sono coerenti con brief e decisioni.

## Punti da decidere dal coordinatore o dall’utente

1. **Stato della prima password:** approvare la rappresentazione corretta dopo la verifica del comportamento reale di Auth; “email confermata”, “hash presente” e “password scelta dalla persona” sono stati diversi.
2. **Garanzia degli allarmi:** decidere come trattare un invio dall’esito incerto oltre la finestra di idempotenza di Resend e gli allarmi definitivamente sospesi. La promessa “una email per evento senza perdite” oggi supera quanto il protocollo descritto garantisce.
3. **Non enumerazione:** stabilire se il requisito riguarda la UI o anche l’endpoint pubblico Supabase, rendendo esplicito l’eventuale rischio residuo.
4. **Reinvio familiare:** confermare il testo quando l’account esiste ma l’ingresso nella famiglia non è più valido.
5. **Ritorno alla versione precedente:** scegliere fra un rollback compatibile con `/password` e una procedura di correzione in avanti che conservi utilizzabili i link già inviati.

Le correzioni tecniche e le decisioni risultanti devono aggiornare anche test, runbook e sezione “Decisioni da riportare”, prima della nuova revisione.
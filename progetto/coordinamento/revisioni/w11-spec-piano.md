# Revisione W11 — Spec e piano della gestione della famiglia

Revisione del branch `ondata3/gestione-famiglia`, commit `02bcbdc15a0db9cf945ff8fa318386f6d90cc0c7`.

Riferimenti abbreviati nel rapporto:

- **S**: `progetto/superpowers/specs/2026-10-16-gestione-famiglia.md`.
- **P**: `progetto/superpowers/plans/2026-10-16-gestione-famiglia.md`.

La struttura copre gran parte del brief: unica PR, funzioni SQL dedicate, transazione prima della chiamata ad Auth, ripresa oraria, percorsi web e MCP, localizzazione e test. Restano però difetti sostanziali nella gestione degli inviti e nelle garanzie della cancellazione.

## Rilievi bloccanti

### 1. Ripetere un’accettazione può far rientrare un membro rimosso e ricreare un account cancellato

**Riferimenti:** S:182–198, 361–365; P:89–100, 249–250.

`claim_family_invitation` restituisce la prenotazione esistente senza distinguere quella completata. `complete_family_invitation` reinserisce l’appartenenza e dichiara esplicitamente di non controllare le rimozioni.

Scenario: una persona crea l’account dal link, entra, viene rimossa e ripete `accept` con lo stesso link e la stessa email. Il modulo Auth riconcilia l’account esistente; `complete` reinserisce il membro. Il controllo di `family.join` non interviene. Non occorre conoscere la password per provocare questa scrittura tramite l’operazione pubblica.

Inoltre, dopo la cancellazione definitiva dell’account, la prenotazione conserva il vecchio UUID senza chiave esterna. Ripetendo `accept`, `createInvitedAccount` può creare nuovamente quell’UUID con nuove credenziali. La riga completata di `account_deletions` non impedisce questa ricreazione.

**Correzione:** definire uno stato terminale della prenotazione. Una ripetizione dopo il completamento non deve ricreare account, reinserire appartenenze o cambiare la famiglia mostrata. Per rientrare si deve passare dal percorso autenticato e dalle regole sulle rimozioni. Aggiungere test per accettazione → rimozione → ripetizione e accettazione → cancellazione account → ripetizione.

### 2. Un account in cancellazione può ricevere nuovi ruoli e far perdere l’ultimo amministratore dell’app

**Riferimenti:** S:265–290, 454–457, 640–645; P:144–177, 294–329. Riscontro: `supabase/migrations/20261015100000_user_admin.sql:103–108`.

Il piano nasconde gli interruttori nell’interfaccia, ma non impedisce a `users.setRole` di assegnare ruoli a un account in attesa. La funzione esistente controlla che il bersaglio esista in `auth.users`; durante l’attesa esiste ancora.

Scenario:

1. A viene cancellato nell’app; Auth fallisce e A resta in attesa.
2. B, amministratore rimasto, assegna nuovamente `app_admin` ad A tramite API o MCP.
3. B rinuncia al proprio ruolo: il controllo vede A come altro amministratore.
4. Il Cron cancella A in Auth; la cascata rimuove il ruolo senza `app_admin_roles`.

L’app rimane senza amministratori. La prima transazione corretta non basta se dopo il commit possono ricomparire ruoli.

**Correzione:** rendere lo stato di cancellazione incompatibile con nuove assegnazioni, con una protezione nel database coordinata con `begin_account_deletion`, anche per assegnazioni già in corso. Dichiarare nel piano questa integrazione con B e aggiungere il test completo con Auth temporaneamente indisponibile. Il solo blocco nel web non è sufficiente.

### 3. Il controllo MCP precede i lucchetti e può consentire una cancellazione indiretta della famiglia

**Riferimenti:** S:275–285, 410–425, 458–459; P:315–329.

Il gestore verifica se il piano contiene famiglie da eliminare **prima** di chiamare `begin_account_deletion`. Quest’ultima ricalcola il piano sotto i lucchetti, ma non riceve il vincolo del canale MCP.

Scenario: una richiesta MCP porta `deletedFamilies: [F]`; al controllo preliminare F ha anche un altro membro, quindi non scatta `web_only`. Quel membro esce prima dell’acquisizione del lucchetto. La funzione SQL trova ora F da eliminare, l’insieme coincide con l’input e procede.

`deletedFamilies` è input del chiamante: non può sostituire il controllo del canale sul piano effettivamente eseguito.

**Correzione:** verificare il divieto sul piano definitivo, sotto gli stessi lucchetti e prima delle scritture. Il vincolo deve derivare dal canale autenticato, non dall’input. Testare il cambio di composizione della famiglia fra controllo preliminare e cancellazione, per `account.delete` e `users.delete`.

## Rilievi importanti

### 4. Una prenotazione rende inefficace la revoca del link

**Riferimenti:** S:182–198, 569–570, 715–716; P:89–100.

La spec permette esplicitamente di riprendere una prenotazione anche dopo la revoca. La chiusura non controlla `revoked_at`. È quindi possibile prenotare, anche fermandosi su `weak_password`, e completare l’ingresso dopo che l’amministratore ha revocato il link o il suo autore ha perso il ruolo.

Questo contraddice la conferma «Chi lo ha ricevuto non potrà più usarlo» e la decisione del coordinatore sulla revoca dei link. Non è neppure la stessa regola di A: `complete_app_invitation` rifiuta esplicitamente gli inviti revocati (`supabase/migrations/20261013100000_app_invitations.sql:184–185`).

**Correzione:** distinguere scadenza e revoca; verificare quest’ultima anche nella chiusura, sotto sincronizzazione con chi revoca. Definire il trattamento dell’eventuale account già creato in Auth e aggiungere test di revoca fra prenotazione e completamento.

### 5. L’accettazione può lasciare definitivamente un account senza famiglia

**Riferimenti:** S:50, 97, 191–198, 240–243, 361–365; P:260–261.

La promessa «nessun account nasce senza famiglia» non è garantita dal flusso descritto.

Dopo la prenotazione, la famiglia può essere eliminata mentre il Worker sta creando l’account in Auth. La cascata elimina anche invito e prenotazione; Auth può comunque completare la creazione. `complete_family_invitation` fallisce e non esiste più la registrazione necessaria a riprendere il lavoro. Un’interruzione dopo la creazione, seguita dall’eliminazione della famiglia, produce lo stesso risultato.

Non è prevista una ripresa automatica o una compensazione per questo account.

**Correzione:** descrivere anche gli stati intermedi della creazione da invito, conservando un riferimento recuperabile indipendente dalla famiglia. Definire ripresa o compensazione quando l’ingresso diventa impossibile, senza cancellare account preesistenti. Testare eliminazione durante la chiamata ad Auth e interruzione dopo la creazione.

### 6. L’ordine dei lucchetti non comprende le scritture degli inviti e ammette stalli

**Riferimenti:** S:138–141, 162–172, 212–225, 866–873; P:77, 98–101, 137–139. Riscontro: `supabase/migrations/20261011100700_versions.sql:17–21`.

La regola generale ordina i lucchetti delle famiglie, ma `revoke_family_invitation` aggiorna prima l’invito. Il nuovo trigger di versione aggiorna poi la famiglia.

Si forma questo ciclo:

- una revoca manuale blocca l’invito e attende la famiglia nel trigger;
- una retrocessione o rimozione blocca prima la famiglia e attende lo stesso invito per revocarlo.

L’affermazione «Nessun ciclo di attesa possibile» non è quindi sostenuta dalle operazioni previste. Il problema deriva anche dai lucchetti impliciti dei trigger, non soltanto dai `FOR UPDATE` espliciti. È coerente con le [regole PostgreSQL sugli stalli](https://www.postgresql.org/docs/17/explicit-locking.html), consultate tramite Context7.

**Correzione:** specificare un ordine completo famiglia → inviti → prenotazioni per le operazioni interessate, ricontrollando l’autorizzazione dopo il lucchetto. Verificare anche i percorsi esistenti coinvolti nelle cancellazioni. Aggiungere un test revoca manuale contro retrocessione/rimozione che escluda `40P01`.

### 7. Manca la tracciabilità degli ingressi richiesta dal coordinatore

**Riferimenti:** S:93–102, 173–176, 205–208, 553–573; P:75–81, 427–434. Decisione: piano generale nel checkout principale, riga 278.

Il registro del 16 ottobre richiede che l’amministratore veda **chi è entrato, con quale link e quando**.

La spec offre soltanto autore, scadenza e numero di account creati. Le prenotazioni conservano informazioni sugli account nuovi, ma non vengono esposte come ingressi; `join_family` non registra il link usato dagli account esistenti. Anche la schermata prevista non mostra questa informazione.

**Correzione:** aggiungere registrazione, lettura autorizzata e presentazione degli ingressi per entrambe le modalità. Definire il trattamento di ripetizioni e rientri e aggiungere test SQL, server e web. Il conteggio degli account non soddisfa questa decisione.

### 8. La cancellazione lascia l’email nella nuova tabella delle prenotazioni

**Riferimenti:** S:93–105, 286–290, 613–616; P:160–172.

`family_invitation_accounts` conserva l’email in chiaro e un `user_id` senza chiave esterna. La cancellazione non pulisce questa tabella; la successiva cancellazione in Auth non la raggiunge per cascata.

Quando la famiglia continua a esistere, resta quindi un dato personale dell’account cancellato, nonostante il riepilogo prometta la cancellazione dell’email.

**Correzione:** prevedere esplicitamente la rimozione o anonimizzazione del dato. Conservare separatamente quanto serve al tetto e all’idempotenza: cancellare semplicemente la prenotazione libererebbe una quota e potrebbe consentire nuove creazioni. Aggiungere un test con famiglia superstite.

### 9. Il rientro autorizzato resta bloccato dalla revoca locale della sessione

**Riferimenti:** S:537, 660–667; P:381–385, 448–455. Riscontri: `web/src/session/session.ts:158–185,206`; `web/src/session/useFamily.ts:28`.

Il piano aggiunge correttamente `session.revoke` all’uscita e alla perdita dell’appartenenza, ma non prevede come annullare quella revoca dopo un nuovo ingresso autorizzato.

L’implementazione attuale conserva la famiglia in un `Set` senza un’operazione che la rimuova. `useFamily` restituisce quindi ancora `revoked` anche se `family.join` ha confermato l’ingresso e aggiornato il profilo. La cancellazione del segno persistito è anch’essa esclusa quando il `Set` contiene la famiglia.

**Correzione:** definire un ripristino dell’accesso dopo una conferma nuova del server, senza recuperare vecchi dati o vecchie operazioni della spesa e senza permettere a risposte tardive di annullare una revoca più recente. Testare uscita → rientro e rimozione → link nuovo → rientro nella stessa sessione, anche con più schede.

### 10. Il tetto di dieci account non ha una prova di concorrenza

**Riferimenti:** S:739–770; P:89–92, 246–257, 281–291.

Il piano verifica dieci prenotazioni e il rifiuto dell’undicesima, ma non prevede accettazioni simultanee. I cinque casi di `family-locks.test.ts` riguardano altre operazioni.

Il test sequenziale passerebbe anche togliendo il lucchetto dall’invito. Non soddisfa il criterio richiesto di una prova che fallisca senza la protezione.

**Correzione:** partire da nove prenotazioni e avviare due richieste per email diverse con interleaving controllato. Verificare una sola nuova prenotazione, l’altro rifiuto e il totale finale di dieci. Aggiungere il caso concorrente sulla stessa email e una prova senza protezione che fallisca sul risultato, non soltanto sull’assenza dell’attesa.

## Rilievi minori

### 11. Il test dell’uscita concorrente pretende un errore diverso da quello specificato

**Riferimenti:** S:227–232, 756–759; P:242–243, 281–291.

La funzione `leave_family` deve restituire `P0A13`, tradotto in `invalid`, quando l’ultimo amministratore non indica il successore. Il test concorrente pretende invece `last_admin`.

**Correzione:** allineare funzione, contratto, testo web e aspettativa del test. Nello scenario descritto il successore è diventato necessario durante l’attesa; il codice attualmente definito dalla spec è `P0A13`.

### 12. Il piano non richiama esplicitamente la guida visiva e il confronto con il riferimento

**Riferimenti:** P:23–47, 515–525; S:514–520.

Sono previsti componenti riusati e prove a due larghezze nelle due lingue, ma manca il richiamo operativo a `design/design.md`, `design/index.html` e al confronto con i riferimenti approvati, richiesto dalle istruzioni del repository.

**Correzione:** inserirli nei vincoli e nella verifica finale, precisando il riuso dei token e dei componenti del quarto e sesto giro. Non occorre riprogettare il linguaggio visivo.

## Punti da decidere con il coordinatore

- **Accettazione interrotta quando l’ingresso diventa impossibile:** concordare l’esito visibile e il trattamento dell’account eventualmente già creato. Il comportamento attuale non realizza la promessa di creazione e ingresso congiunti.
- **Prenotazioni fallite e tetto:** la scelta di contare le prenotazioni consuma una quota anche dopo `weak_password` o una creazione persa contro un altro invito. Va confermato che questo sia il significato voluto di «10 account per link»; il testo «account creati» deve distinguere i due conteggi.

La tracciabilità degli ingressi e la revoca dei link sono già decisioni confermate: non richiedono una nuova scelta per essere realizzate.

## Verifiche e limiti

Revisione documentale confrontata con brief, risposta del coordinatore, piano generale del checkout principale, specifiche A e B, specifica principale, riferimenti del prototipo e codice esistente pertinente.

Non emergono collisioni dei nuovi SQLSTATE `P0A09`–`P0A14` con le migrazioni presenti. Sono dichiarati migrazione additiva, `security definer`, `search_path` vuoto, concessioni `EXECUTE` ristrette, chiave segreta confinata a `server/src/accounts/`, assenza di scritture dirette in `auth`, localizzazione e assenza di aggiornamenti ottimistici. `afterCommit` è identificato come modifica condivisa e ha un compito dedicato.

Non sono stati eseguiti test, typecheck o build: l’oggetto della revisione è la proposta di spec e piano, non un’implementazione di C. Nessun file modificato; checkout pulito anche al termine.

**Verdetto: DA CORREGGERE.**
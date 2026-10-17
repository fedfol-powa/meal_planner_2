# Seconda revisione W15 — spec e piano delle email dell’app

**Verdetto: DA RIFARE**

Le correzioni risolvono diversi problemi della prima revisione, ma non rendono ancora il piano pronto per l’implementazione. Restano difetti nella gestione concorrente dei metadati, nella versione della vista famiglia, nella protezione della sessione e nella riconciliazione degli allarmi. Alcuni test previsti verificano soltanto il percorso favorevole e non dimostrano le garanzie dichiarate.

Revisione in sola lettura del branch `ondata3/email`, commit `f99b1b7e9fc42d4c656d5cd09f0c3f41652bade4`. Confrontati brief, prima revisione, decisioni del coordinatore, specifica principale, piano generale del checkout principale e codice interessato. Consultati Context7, Supabase Auth **v2.197.0** e `auth-js` **v2.117.3**, versione del lockfile. Nessun file modificato. Test e build non eseguiti: questa è una revisione dei documenti, non dell’implementazione ancora da realizzare.

## Verifica dei 12 rilievi precedenti

| # precedente | Esito | Verifica |
|---|---|---|
| 1 — Stato della prima password | **Parziale** | Corretta la descrizione della password casuale e introdotto l’indicatore esplicito. Password e indicatore possono cambiare nella stessa transazione Auth, ma altre scritture concorrenti possono ripristinare il vecchio indicatore: rilievo 2 sotto. |
| 2 — RLS di `ops_alerts` | **Risolto nel progetto** | Policy esplicita per `app_job`, privilegi CRUD e test sotto il ruolo reale: spec:531, piano:75. Coerente con `SET LOCAL ROLE app_job` del repository. |
| 3 — Lettura del backup | **Risolto nel progetto** | Conservato `SELECT` per `app_backup`, che ha `BYPASSRLS`; prevista esportazione e ripristino con un allarme presente: spec:533 e 707. Coerente con l’esportatore che scopre tutte le tabelle. |
| 4 — Sessione del cambio password | **Parziale** | La richiesta di cambio usa ora il token verificato, risolvendo il problema originario. La successiva adozione della sessione condivisa conserva una corsa: rilievo 5. |
| 5 — Ricreazione dell’account con `/invite` | **Risolto nel progetto** | `/invite` eliminato; `/recover` non crea utenti. Previsto il test con cancellazione fra chiusura e invio: spec:734. |
| 6 — Etichetta e `knownVersion` | **Non risolto completamente** | Il nuovo ambito viene letto prima del confronto, ma il conteggio non identifica lo stato dei singoli membri: rilievo 3. |
| 7 — Deduplicazione della consegna | **Sostanzialmente corretto, con residuo** | Acquisizione atomica, recupero dopo 15 minuti, testo salvato e scadenza entro 24 ore affrontano il problema. Il destinatario resta variabile fra i tentativi: rilievo 8. |
| 8 — Perdita prima dell’inserimento | **Parziale** | Aggiunte registrazione atomica e riconciliazione, ma quest’ultima può perdere eventi dopo il recupero del lavoro originario; inoltre l’atomicità contraddice l’isolamento degli errori promesso: rilievi 6 e 7. |
| 9 — Non enumerazione | **Recepito secondo la decisione** | Distinti limite per indirizzo e limite di progetto; rischio dell’endpoint pubblico esplicitato. La garanzia resta circoscritta al comportamento deciso per la UI. |
| 10 — Nome della famiglia nel reinvio | **Non risolto** | Recepito il testo generico deciso dal coordinatore, ma i metadati temporanei non garantiscono che il reinvio sia senza nome: rilievo 1. |
| 11 — Acquisizione di `familyName` nelle riprese | **Risolto nel progetto** | La nuova funzione usa prenotazione conclusa e appartenenza, senza richiedere che il link sia ancora utilizzabile: spec:194. Preserva la ripresa dopo scadenza prevista dal codice di C. |
| 12 — Transizione e runbook | **Parziale** | Matrice, correzione in avanti e prova obbligatoria dell’opzione Auth aggiunte. Restano la finestra durante la verifica, la gestione degli allarmi scaduti e l’integrazione delle prove nella CI: rilievi 4, 9 e 10. |

## Rilievi

### 1. Importante — `family_name` temporaneo non garantisce «solo nella prima email»

**Riferimenti:** [spec:176](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:176), [spec:241](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:241), [spec:674](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:674).

Il protocollo `PUT family_name → /recover → PUT null` modifica uno stato globale dell’utente per rappresentare il contesto di una singola spedizione. Non isola gli altri invii:

- una richiesta pubblica di recupero può arrivare fra il primo `PUT` e la cancellazione e ricevere il nome;
- il primo `PUT` può riuscire in Auth ma perdere la risposta: il piano lo considera fallito e prescrive **nessuna cancellazione finale**;
- un’interruzione del Worker o un errore del `PUT` finale lascia il nome persistente. Il recupero successivo lo riutilizza, anche dopo la rimozione dalla famiglia;
- due accettazioni già avviate possono entrambe arrivare all’invio: la pulizia di una può togliere il nome prima della lettura dell’altra.

Il fatto che `/recover` legga i metadati durante la richiesta non rende atomica la sequenza delle tre richieste. Il recupero carica l’utente e poi lo passa alla spedizione. [Sorgente Supabase Auth](https://github.com/supabase/auth/blob/v2.197.0/internal/api/recover.go#L45-L64).

**Perché conta:** contraddice direttamente la decisione del coordinatore «reinvio generico, mai il nome» e può mostrare un’appartenenza ormai cessata. La cancellazione al salvataggio della password arriva troppo tardi.

**Correzione proposta:** definire un contesto di spedizione isolato dalla proprietà globale dell’utente. Se il template standard non consente questa garanzia, sottoporre al coordinatore un’alternativa concreta per la prima email. Una sola clausola `finally` o una pulizia periodica non risolvono la concorrenza con `/recover` pubblico. Aggiungere test con risposta persa al primo `PUT`, interruzione prima della pulizia e recupero concorrente.

### 2. Importante — Il merge dei metadati può ripristinare `password_pending: true`

**Riferimenti:** [spec:118](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:118), [spec:183](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:183), [spec:251](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:251).

L’unione delle chiavi di Auth non è un aggiornamento SQL atomico delle sole chiavi inviate: `UpdateUserMetaData` modifica la mappa dell’utente già caricata e riscrive tutta `raw_user_meta_data`. Anche `adminUserUpdate` ottiene l’utente prima della transazione. [Modello utente](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L210-L225), [aggiornamento amministrativo](https://github.com/supabase/auth/blob/v2.197.0/internal/api/admin.go#L178-L228).

Sequenza ammessa:

1. la pulizia di `family_name` legge `password_pending: true`;
2. `/password` salva password e `password_pending: false`;
3. la pulizia scrive la propria vecchia mappa, senza `family_name` ma ancora con `password_pending: true`.

L’atomicità della singola richiesta password+data è reale, ma non impedisce questa successiva sovrascrittura. Anche l’allineamento della lingua introduce scritture concorrenti.

**Perché conta:** l’etichetta e il template possono tornare a indicare una prima password dopo che la persona l’ha scelta. Non è il rischio accettato della modifica volontaria da parte dell’utente.

**Correzione proposta:** definire una strategia che protegga lo stato dalle altre scritture applicative, oppure una rappresentazione che non dipenda da questo merge. Il piano deve includere una prova con lettura amministrativa precedente al cambio password e scrittura successiva, verificando anche la conservazione della lingua.

### 3. Importante — `p<n>` non identifica quali membri devono scegliere la password

**Riferimenti:** [spec:272](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:272), [piano:193](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:193).

Il conteggio funziona soltanto se lo stato di ogni membro può cambiare esclusivamente da vero a falso. La spec ammette invece che la persona modifichi il metadato; inoltre il rilievo 2 mostra un ritorno a vero prodotto dalle scritture applicative.

Esempio: una vista memorizzata contiene A=true e B=false, versione `p1`. A sceglie la password e B passa a true. Il conteggio resta uno, senza modifiche al contatore della famiglia. La pipeline risponde `unchanged` e mantiene entrambe le etichette sbagliate. Il confronto anticipato è in [pipeline.ts:182](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/pipeline.ts:182).

**Perché conta:** la frase «ogni cambio dell’etichetta cambia la versione» è falsa. Anche una modifica volontaria di un membro può lasciare obsoleta l’etichetta di un altro.

**Correzione proposta:** usare una rappresentazione deterministica dei valori per utente, per esempio un’impronta delle coppie ordinate `(user_id, password_pending)`, oppure leggere lo stato separatamente senza versionamento. Aggiungere il test dello scambio a conteggio invariato, oltre alla singola transizione già prevista.

### 4. Importante — La PWA può ricaricare mentre Auth ha già consumato il codice

**Riferimenti:** [spec:319](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:319), [spec:333](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:333), [piano:324](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:324).

`useBusyCheck(() => verified !== null && !saved)` lascia libera la pagina durante la richiesta di verifica. Il frammento ancora presente non basta: Auth può avere già confermato la transazione e consumato il codice, mentre il browser non ha ancora ricevuto la sessione. Un aggiornamento W8 in quella finestra perde la risposta; la nuova pagina ripete un codice già usato.

W8 può ricaricare una pagina visibile e non toccata all’avvio o a `controllerchange`: [update.ts:70](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/web/src/pwa/update.ts:70). Auth conclude la transazione prima di inviare la risposta: [verifica POST](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L216-L291).

Per lo stesso motivo non è garantita l’affermazione «rete → Riprova, il codice non è consumato».

**Correzione proposta:** rendere occupata la pagina **prima di iniziare la verifica**, mantenendo la protezione fino al termine del percorso critico, inclusa l’adozione della sessione. Il repository offre già [trackBusy](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/web/src/pwa/busy.ts:13). Testare un aggiornamento con risposta di verifica sospesa dopo il consumo server e descrivere l’esito ambiguo di rete con possibilità di chiedere un nuovo link.

### 5. Importante — `getSession` seguito da `setSession` può sostituire una sessione concorrente

**Riferimenti:** [spec:345](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:345), [piano:299](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:299), [piano:305](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:305).

Il controllo «nessuna sessione» e la successiva scrittura sono due operazioni separate. Un’altra scheda può accedere dopo il controllo e prima della scrittura; `setSession` salva comunque la sessione del link e notifica `SIGNED_IN`.

Questo comportamento è verificabile nella versione effettivamente usata: `getSession` restituisce la lettura corrente, mentre `setSession` non offre una condizione “scrivi solo se ancora vuoto”. Può inoltre effettuare una richiesta di rete prima di salvare. [Sorgente auth-js v2.117.3](https://github.com/supabase/supabase-js/blob/v2.117.3/packages/core/auth-js/src/GoTrueClient.ts#L3470-L3535).

**Perché conta:** il cambio password è ora legato correttamente al token verificato, ma resta falsa la promessa di non sostituire la sessione comparsa nel frattempo. Il test previsto copre soltanto una sessione già presente prima del controllo.

**Correzione proposta:** definire un protocollo di adozione coordinato con le altre scritture della sessione, oppure concordare un flusso che eviti l’adozione automatica. Testare l’accesso concorrente fra controllo e scrittura. Aggiungere anche l’esito di fallimento di `setSession`: la password già salvata deve restare un successo, con ripiego sull’accesso normale.

### 6. Importante — La riconciliazione degli stati correnti può perdere eventi precedenti

**Riferimenti:** [spec:560](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:560), [piano:251](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:251).

La riconciliazione gira **dopo** il job e la ripresa delle cancellazioni e seleziona soltanto job ancora aperti e cancellazioni non completate.

Controesempio:

1. una cancellazione registra il terzo fallimento;
2. il Worker si interrompe prima dell’inserimento dell’allarme;
3. all’ora successiva la ripresa riesce e valorizza `completed_at`;
4. la riconciliazione esclude la riga: l’allarme non sarà mai creato.

La separazione fra registrazione del tentativo e seguito è concreta in [delete.ts:25](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/account/delete.ts:25); il completamento conserva i tentativi ma cambia l’eleggibilità: [migrazione C:798](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/supabase/migrations/20261016100000_family_management.sql:798).

Lo stesso problema riguarda un job in ritardo che termina prima della riconciliazione. Per il backup, controllare soltanto il giorno corrente non recupera una notte mancata se la riconciliazione riparte il giorno seguente.

**Perché conta:** la presenza di una scansione periodica non dimostra la garanzia dichiarata contro le perdite prima dell’inserimento.

**Correzione proposta:** conservare una prova persistente del superamento della soglia, riconciliabile anche dopo il completamento, oppure registrare l’evento nella transazione che ne rende vera la condizione. Definire anche l’intervallo di recupero delle date dei backup. Aggiungere test “evento → interruzione → successo del lavoro originario → riconciliazione”.

### 7. Importante — L’atomicità dell’abbandono contraddice «il job non fallisce per un allarme»

**Riferimenti:** [spec:557](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:557), [spec:612](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:612), [spec:691](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:691), [piano:251](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:251).

La spec richiede contemporaneamente:

- rollback dello stato `abandoned` se fallisce l’inserimento dell’allarme;
- completamento del job anche quando la tabella degli allarmi fallisce.

Sono esiti incompatibili per la stessa transazione. Un `try/catch` esterno permette di continuare con altre famiglie, ma non conferma lo stato annullato. Nel codice attuale il successo dell’abbandono dipende proprio dal ritorno di `markAbandoned`: [job.ts:53](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/server/src/menu/job.ts:53).

**Perché conta:** il piano contiene criteri di accettazione contraddittori e introduce una dipendenza nuova del lavoro operativo dalla tabella delle notifiche.

**Correzione proposta:** scegliere una semantica unica. Per preservare il vincolo originario, confermare l’abbandono anche quando la registrazione dell’allarme fallisce e recuperarlo dalla riconciliazione persistente. In alternativa, far approvare esplicitamente il blocco della transizione e correggere la promessa e i test.

### 8. Minore — Il payload Resend non è interamente immutabile

**Riferimenti:** [spec:501](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:501), [spec:512](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:512), [piano:218](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:218).

La riga conserva oggetto e testo, ma `to` viene ricostruito da `OPS_ALERT_EMAIL` a ogni tentativo. Se il destinatario cambia dopo un invio accettato con risposta persa, il ritentativo presenta la stessa chiave con un corpo diverso. Resend rifiuta con `409 invalid_idempotent_request`; non basta che il testo sia identico. [Documentazione Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

**Correzione proposta:** definire come mantenere stabile l’intero payload durante i ritentativi, compatibilmente con il vincolo sui dati personali, oppure prescrivere una gestione esplicita dei pendenti quando cambia il destinatario. Aggiungere il caso al test di risposta persa.

### 9. Importante — Il runbook individua gli allarmi scaduti, ma non ne definisce la gestione

**Riferimenti:** [spec:607](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:607), [spec:811](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/specs/2026-10-17-email.md:811), [piano:257](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:257).

Dopo 24 ore una riga diventa definitivamente non spedibile. Correggere i segreti o ripristinare Resend non la riattiva; `ON CONFLICT DO NOTHING` impedisce alla riconciliazione di crearne un’altra. Il runbook offre soltanto una query di elenco.

La sospensione oltre la finestra di idempotenza è coerente con la decisione del coordinatore. Manca però il seguito operativo: come distinguere un evento preso in carico da uno ancora ignorato e come trattare un invio dall’esito incerto.

**Perché conta:** il rilievo precedente sul recupero degli allarmi esauriti rimane aperto. La promessa «perdita no» richiede almeno una presa in carico manuale definita, anche senza ritentativi automatici.

**Correzione proposta:** aggiungere una procedura per diagnosticare e prendere in carico le righe scadute, con esito osservabile. Se si prevede una rispedizione manuale, definirne identità, autorizzazione e rischio di doppione, senza azzerare semplicemente la scadenza dell’evento originario. Collaudare il percorso oltre le 24 ore.

### 10. Importante — Le prove obbligatorie non sono integrate nella CI esistente

**Riferimenti:** [piano:374](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:374), [piano:385](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/progetto/superpowers/plans/2026-10-17-email.md:385).

Il piano aggiunge una suite sotto `server/test/stack/`, dipendente da Mailpit e da `STACK_AUTH_REQUIRE_CURRENT_URL`, ma non prevede modifiche al workflow o al lanciatore esistente.

Nel repository:

- la [CI:24](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/.github/workflows/ci.yml:24) esclude espressamente `mailpit` dall’avvio;
- [invite-stack.sh:15](/Users/fedfol/Projects/meal_planner_2/.worktrees/email/scripts/invitations/invite-stack.sh:15) esegue l’intera directory `test/stack/`, senza avviare il secondo Auth né fornire la nuova variabile.

**Perché conta:** applicando il piano, la suite obbligatoria entra in un percorso di CI privo dei servizi richiesti. La prescrizione «fallisce se la variabile manca» rende il problema certo quando quel lanciatore esegue i nuovi test.

**Correzione proposta:** includere workflow e script nei file da modificare: avvio di Mailpit, avvio e verifica del secondo Auth, esportazione della variabile, pulizia del servizio e comando riproducibile per gli otto casi. Aggiornare anche i test stack esistenti che accettano inviti e poi accedono direttamente con la password del vecchio modulo.

## Aspetti confermati nel sorgente

La scelta di usare **`/recover` anche per la prima password è tecnicamente fondata**: l’endpoint non crea utenti e la verifica conferma anche un account non ancora confermato. Il template condizionale è supportato: oggetto e corpo vengono eseguiti con i dati del template. I difetti riguardano il contesto temporaneo inserito nei metadati, non la possibilità di usare questo percorso. [Recupero](https://github.com/supabase/auth/blob/v2.197.0/internal/api/recover.go), [conferma alla verifica](https://github.com/supabase/auth/blob/v2.197.0/internal/api/verify.go#L348-L375), [template](https://github.com/supabase/auth/blob/v2.197.0/internal/mailer/templatemailer/template.go#L126-L140).

È corretta anche la nuova motivazione sull’opzione della password attuale: la verifica POST emette una sessione `OTP`, inclusa fra quelle considerate di recupero; `UserUpdate` applica l’eccezione. Password e `data` vengono salvati nella stessa transazione. Resta necessaria la prova obbligatoria sullo stack, come previsto dal piano. [Metodo di autenticazione](https://github.com/supabase/auth/blob/v2.197.0/internal/models/factor.go#L63-L69), [aggiornamento password](https://github.com/supabase/auth/blob/v2.197.0/internal/api/user.go#L138-L220).

La matrice riconosce ora correttamente che una SPA vecchia può restare attiva a lungo e che un rollback perde la rotta `/password`. La correzione in avanti recepisce la decisione del coordinatore. Non considero dimostrato il passaggio reale fra due shell: è una prova pianificata, ancora da eseguire.

## Punti da decidere dal coordinatore o dall’utente

1. **Nome della famiglia nella prima email:** scegliere un meccanismo che soddisfi l’isolamento richiesto, oppure approvare una modifica esplicita del requisito. Il protocollo dei metadati temporanei non lo garantisce.
2. **Stato della prima password:** confermare la soluzione dopo aver affrontato le sovrascritture concorrenti di Auth. L’atomicità della singola richiesta non basta.
3. **Adozione della sessione:** mantenere l’ingresso automatico con un protocollo verificabile oppure concordare il ritorno all’accesso normale dopo il salvataggio.
4. **Allarmi:** chiarire la priorità fra registrazione atomica e indipendenza del job dagli errori delle notifiche; definire la presa in carico degli scaduti e l’orizzonte di recupero degli eventi storici.

Le decisioni risultanti devono aggiornare insieme spec, piano, test, runbook e sezione «Decisioni da riportare nella specifica».
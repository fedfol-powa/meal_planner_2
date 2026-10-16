# Seconda revisione W11 — Spec e piano della gestione della famiglia

Revisione del branch `ondata3/gestione-famiglia`, commit `62f8022211de5fa7e44ba8529f78d7124dcf3db9`.

Riferimenti abbreviati:

- **S**: [spec della gestione della famiglia](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md).
- **P**: [piano di implementazione](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/plans/2026-10-16-gestione-famiglia.md).

Le correzioni risolvono diversi rilievi precedenti, in particolare la protezione delle assegnazioni dei ruoli globali e il controllo del canale MCP nel database. Restano però percorsi che violano le garanzie dichiarate e prove che non dimostrano ancora il comportamento richiesto.

La numerazione seguente riguarda questa seconda revisione; la verifica dei precedenti rilievi 1–12 è riportata in fondo.

## Rilievi bloccanti

### 1. Lo stato terminale non protegge tutti i percorsi di ripetizione dell’accettazione

**Riferimenti:** S:257–287, 294–299, 469–475; P:281–296. Riscontro: `server/src/accounts/index.ts:55–75`.

Il caso ordinario «accettazione completata → rimozione → ripetizione» è corretto. Resta falsa, però, la premessa di S:286: un account con prenotazione ancora `reserved` può essere già entrato ed essere stato rimosso.

Scenario:

1. Auth crea l’account, ma `complete_family_invitation` non arriva.
2. La persona accede normalmente e usa `family.join`: entra con il proprio account, mentre la prenotazione resta `reserved`.
3. Un amministratore la rimuove.
4. Una ripetizione di `accept` trova ancora `reserved`; Auth riconcilia l’account esistente e `complete` reinserisce l’appartenenza senza controllare `family_removals`.

È quindi ancora possibile rientrare con un link precedente alla rimozione. Anche senza rimozione, il passaggio da `join` a `complete` può registrare due ingressi e cambiare nuovamente la famiglia mostrata.

Inoltre, lo stato terminale viene controllato soltanto da `claim`: due accettazioni possono aver già ottenuto entrambe `create`. Se una completa e l’account viene poi cancellato, una chiamata Auth dell’altra richiesta ancora in volo può ricreare il vecchio UUID. La riga terminale della prenotazione non impedisce quel `POST`, né il modulo Auth consulta `account_deletions`.

**Correzione proposta:** coordinare ingresso autenticato e prenotazioni; ricontrollare le rimozioni anche nel completamento e registrare un ingresso soltanto quando nasce davvero un’appartenenza. Definire inoltre la protezione dalla ricreazione di un UUID cancellato per richieste già avviate. Aggiungere entrambe le sequenze ai test, con Auth e completamento sospendibili separatamente.

### 2. Il piano di cancellazione non impedisce nuove famiglie dopo il ricalcolo

**Riferimenti:** S:366–387; P:196–199, 370–380. Riscontri: `supabase/migrations/20261013100000_app_invitations.sql:204–224`; `server/src/session.ts:10–15`.

`begin_account_deletion` blocca le famiglie trovate e ricalcola il piano, ma non blocca preventivamente l’aggiunta di nuove appartenenze dell’utente. Il profilo viene cancellato soltanto al passo 10; `family.create` non partecipa al lucchetto `app_admin_roles`.

Interleaving ammesso:

1. La cancellazione completa il passo 6.
2. Un’altra richiesta dello stesso account crea e conferma una nuova famiglia F.
3. La cancellazione prosegue: F non appartiene all’insieme `deleted` calcolato, ma il passo 10 cancella comunque tutte le appartenenze dell’utente.

F resta vuota invece di essere eliminata. Se nel frattempo vi entra un altro membro, resta con membri e senza amministratore. Il controllo iniziale di `loadSession` non serializza le due richieste.

**Correzione proposta:** introdurre una sincronizzazione per utente, condivisa dalla cancellazione e da tutti i percorsi che creano appartenenze, compresa `app.create_family` di A. Deve stabilizzare l’insieme delle famiglie prima di enumerarlo e bloccare nuovi ingressi quando parte la cancellazione. Integrare questa risorsa nell’ordine completo dei lucchetti e aggiungere il test con creazione successiva al ricalcolo, anche con un secondo membro.

## Rilievi importanti

### 3. Le prenotazioni di link scaduti sopravvivono alla perdita del ruolo dell’autore

**Riferimenti:** S:101–102, 240–243, 265, 281–287, 310–311, 367–378; P:97–108.

Una prenotazione `reserved` può proseguire dopo la scadenza. La retrocessione e la cancellazione dell’autore, però, revocano soltanto i link **usabili**, che escludono quelli scaduti.

Una persona può quindi prenotare, lasciare scadere il link, attendere la retrocessione dell’autore e completare comunque l’ingresso: `revoked_at` resta nullo. La pagina degli amministratori non mostra più quel link, quindi non permette neppure di revocarlo manualmente.

**Correzione proposta:** distinguere i link utilizzabili per nuovi ingressi da quelli che possono ancora completare prenotazioni. La perdita del ruolo deve revocare anche questi ultimi; gli amministratori devono poterli fermare. A già contempla la revoca degli inviti scaduti ma prenotati. Testare scadenza → retrocessione/rimozione/uscita/cancellazione dell’autore → ripresa.

### 4. La pulizia per `user_id` lascia email nelle prenotazioni perdenti

**Riferimenti:** S:109–119, 272–274, 368, 379–380, 901–903; P:190–192.

La spec ammette prenotazioni della stessa email su link diversi, con UUID differenti. Alla cancellazione anonimizza soltanto le prenotazioni aventi l’UUID dell’account.

Scenario: E viene prenotata su L1 con U1, poi su L2 con U2; la creazione riesce per U2. Cancellando U2, la prenotazione U1 conserva E in chiaro, anche se l’account non esiste più. Il test proposto, con una sola prenotazione, non rileva il problema.

**Correzione proposta:** definire la pulizia anche delle prenotazioni riferite alla stessa email normalizzata ma a UUID diversi, acquisendo i relativi lucchetti nell’ordine stabilito. Conservare le quote senza mantenere l’email. Aggiungere il caso con due link e creazione riuscita su uno solo.

### 5. La prova negativa del tetto lascia attiva la protezione principale

**Riferimenti:** S:266–272, 972–978; P:297–299.

Il piano chiede di togliere soltanto il `FOR UPDATE` sull’invito e ottenere undici prenotazioni. Rimane però il precedente `FOR UPDATE` sulla **famiglia**, comune alle due richieste: queste continuano a essere serializzate e il tetto resta rispettato.

La prova richiesta non può quindi dimostrare la perdita della protezione. Inoltre, per la stessa email l’indice univoco impedisce comunque due righe: senza sincronizzazione l’esito errato può essere un errore di unicità, anziché due UUID restituiti.

**Correzione proposta:** nella variante locale rimuovere tutte le serializzazioni che proteggono il conteggio, mantenendo i vincoli dello schema. Garantire che entrambe le richieste leggano nove prenotazioni prima degli inserimenti; verificare il totale undici. Per la stessa email verificare soprattutto che entrambe le richieste ottengano lo stesso UUID senza errori. La variante negativa deve terminare e fallire sulle asserzioni finali.

### 6. Il ripristino fra schede usa tempi di revoca non confrontabili

**Riferimenti:** S:813–824; P:509–523. Riscontri: `web/src/session/channel.ts:5–8`, `web/src/session/SessionScope.tsx:122–128`, `web/src/session/session.ts:158–165`.

Il messaggio nuovo `restored` trasporta `startedAt`, mentre quello esistente `revoked` non trasporta l’istante originale. La scheda ricevente registra la revoca con il proprio momento di ricezione.

Scenario:

1. A revoca F a t1 e avvia il rientro a t2.
2. B, temporaneamente occupata, riceve `revoked` soltanto a t3, con t3 > t2.
3. B riceve `restored(startedAt=t2)` e lo rifiuta perché confronta t2 con t3.

Il rientro autorizzato resta bloccato in B; quest’ultima può anche riscrivere sul dispositivo un segno di revoca successivo al ripristino.

**Correzione proposta:** propagare l’identità o il tempo originale della revoca, senza rigenerarlo alla ricezione, e coordinare il confronto con il segno persistito. Aggiungere il test con consegna ritardata di entrambi i messaggi, oltre a quello con una revoca realmente successiva al rientro.

### 7. La prova dello stallo pretende un esito non garantito; il ritentativo richiede verifiche sui confini

**Riferimenti:** S:428–431, 541–548, 965–968; P:237–244, 330–335, 381–385.

Il test «eliminazione contro modifica ordinaria» pretende che la modifica riceva un errore. PostgreSQL può invece interrompere la cancellazione: la modifica completa, poi la cancellazione ripetuta elimina la famiglia. Entrambi gli esiti sono compatibili con il protocollo. PostgreSQL raccomanda esplicitamente di non dipendere dalla scelta della vittima dello stallo. [Documentazione PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-DEADLOCKS).

La scelta di ripetere l’intera transazione nel pipeline è corretta. Il solo test con un `40P01` simulato, però, non verifica l’interazione con `afterCommit` e le cancellazioni.

**Correzione proposta:** accettare entrambi gli ordini validi nel test reale e aggiungere prove esplicite che:

- il primo tentativo venga annullato integralmente e il secondo ricontrolli sessione, autorizzazioni e piano;
- si usino soltanto risultato e continuazione del tentativo confermato;
- Auth venga chiamato una sola volta, dopo il commit riuscito;
- un errore della continuazione, anche con codice `40P01`, non ripeta la transazione già confermata;
- il secondo stallo termini con `internal` e le operazioni fuori da `RETRY_ON_DEADLOCK` non siano ripetute.

## Rilievi minori

### 8. Le nuove letture versionate possono restituire dati ormai superati

**Riferimenti:** S:172–181, 240–243, 456–459; P:83–86. Riscontri: `server/src/pipeline.ts:147–152`, `server/src/versions.ts:13–17`.

`familyInvitations.list` dipende dalla versione della famiglia, ma il numero `registrations` cambia inserendo una prenotazione, senza alcun trigger di versione previsto su quella tabella.

Esempio: l’amministratore legge zero registrazioni; una persona prenota e riceve `weak_password`; la rilettura con la versione precedente risponde «invariato», lasciando zero.

Anche la scadenza cambia l’elenco dei link usabili senza aggiornare la versione.

**Correzione proposta:** coprire nel meccanismo di versione sia il conteggio sia le scadenze, oppure rendere questa lettura non versionata. Testare entrambe le variazioni senza altre scritture sulla famiglia.

### 9. La transizione a `closed` viene annullata dall’eccezione nello stesso passo

**Riferimenti:** S:262–264, 869; P:108.

Per una prenotazione revocata senza account, `claim` deve prima scrivere `closed` e poi sollevare `P0A01`. L’eccezione annulla la transazione, quindi la prenotazione resta `reserved`.

Non permette da sola un ingresso, perché il link resta revocato, ma contraddice lo stato terminale dichiarato.

**Correzione proposta:** restituire un esito che consenta il commit e tradurlo successivamente in `invitation_unavailable`, oppure dichiarare esplicitamente che questo caso resta `reserved`. Verificare lo stato con una transazione successiva alla risposta d’errore.

### 10. Restano istruzioni superate nella spec

**Riferimenti:** S:110–111, 331–334, 915–916, 1161–1167, 1212.

La descrizione di `delete_family` dice ancora che la cascata elimina le prenotazioni, mentre le nuove chiavi esterne prevedono `SET NULL` e la decisione del coordinatore ne richiede la conservazione. Anche «nessuna riga residua in tutte le tabelle della famiglia» va precisato.

Nelle «Decisioni da riportare» restano «account creati» invece del conteggio delle prenotazioni e l’elenco SQLSTATE termina a `P0A14`, omettendo `P0A15`.

**Correzione proposta:** allineare questi passaggi al nuovo schema e alle decisioni già confermate, evitando di trasferire istruzioni contraddittorie nella specifica principale.

## Verifica dei rilievi della prima revisione

| Rilievo precedente | Esito | Verifica |
|---|---|---|
| **1 — Ripetizioni e stato terminale** | **Parzialmente chiuso** | `joined`/`closed` proteggono le ripetizioni successive al completamento; restano i percorsi del rilievo 1 e la transizione non persistente del rilievo 9. |
| **2 — Ruoli assegnati durante la cancellazione** | **Chiuso nella progettazione** | Trigger `BEFORE INSERT`, `FOR KEY SHARE` sul profilo e cancellazione del profilo prima dei ruoli; previste prove di assegnazione in corso e Auth indisponibile. S:137–141, 382–386, 993–1002; P:189–199, 377–380. |
| **3 — Controllo MCP prima dei lucchetti** | **Chiuso nella progettazione** | Controllo nel database sul piano ricalcolato, usando il `client_id` autenticato e prima delle scritture. S:369–375; P:192–194, 374–383. |
| **4 — Revoca ignorata dalle prenotazioni** | **Parzialmente chiuso** | `complete` controlla la revoca, ma i link scaduti con prenotazioni restano fuori dalle revoche automatiche: rilievo 3. |
| **5 — Account creato mentre sparisce la famiglia** | **Chiuso nel modello funzionale** | Prenotazione indipendente dalla famiglia, account conservato, risposta `joined: false` e accesso normale; entrambi i casi richiesti sono pianificati. S:104–119, 862–875; P:284–287. Restano i testi contraddittori del rilievo 10. |
| **6 — Ordine incompleto dei lucchetti** | **Parzialmente chiuso** | Corretto famiglia → invito → prenotazione per i nuovi percorsi; restano la stabilizzazione delle appartenenze e le prove sui ritentativi, rilievi 2 e 7. |
| **7 — Tracciabilità degli ingressi** | **Chiuso nella progettazione** | `family_joins`, entrambe le modalità, vista autorizzata, pagina e test presenti. S:123–135, 244–247, 709–713; P:287–288, 489–491. |
| **8 — Email conservata dopo la cancellazione** | **Parzialmente chiuso** | Anonimizzazione e rimozione delle tracce previste, ma non per prenotazioni della stessa email con UUID diversi: rilievo 4. |
| **9 — Revoca locale irreversibile** | **Parzialmente chiuso** | Ripristino e controllo delle risposte tardive definiti; protocollo fra schede incompleto: rilievo 6. |
| **10 — Tetto senza prova concorrente** | **Non chiuso** | Test concorrente aggiunto, ma la variante negativa mantiene la serializzazione sulla famiglia: rilievo 5. |
| **11 — Errore del successore incoerente** | **Chiuso** | SQL, contratto, web e test concordano su `P0A13` → `invalid` sul successore. S:318–323, 493, 722–725, 946–950. |
| **12 — Guida visiva non richiamata** | **Chiuso** | Guida, HTML, riferimenti approvati, riuso dei componenti e confronto finale espliciti. S:637–643; P:43–46, 587–592. |

“Chiuso nella progettazione” indica coerenza di spec e piano, non verifica di un’implementazione ancora da realizzare.

## Punti per il coordinatore

Le due decisioni di prodotto della prima revisione sono state recepite: conservazione dell’account quando l’ingresso diventa impossibile e tetto sulle prenotazioni. Non occorre richiederle nuovamente.

La sincronizzazione della cancellazione con nuove appartenenze coinvolge anche `app.create_family` di A: la soluzione deve essere registrata nelle interfacce condivise, insieme ai confini di `RETRY_ON_DEADLOCK` e `afterCommit`.

## Verifiche e limiti

Revisione documentale completa di S e P, confrontata con prima revisione, decisioni del coordinatore, brief W11, piano generale del checkout principale, interfacce di A e B, specifica principale e codice esistente pertinente. Consultata tramite Context7 la documentazione PostgreSQL su lucchetti, stalli ed eccezioni.

Non sono stati eseguiti test, typecheck o build: questa revisione riguarda spec e piano, non l’implementazione di C. Nessun file modificato; checkout pulito anche al termine, `git diff --check` senza segnalazioni.

**Verdetto: DA CORREGGERE.**
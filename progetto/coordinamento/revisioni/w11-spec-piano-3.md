# Terza revisione W11 — Spec e piano della gestione della famiglia

Branch `ondata3/gestione-famiglia`, commit `b0a0f2d9b9e28c56373abbba64828ca88dc6a599`.

Riferimenti abbreviati:

- **S**: [spec della gestione della famiglia](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/specs/2026-10-16-gestione-famiglia.md).
- **P**: [piano di implementazione](/Users/fedfol/Projects/meal_planner_2/.worktrees/famiglia/progetto/superpowers/plans/2026-10-16-gestione-famiglia.md).

Le correzioni chiudono buona parte dei rilievi precedenti. Restano quattro problemi importanti: pulizia delle prenotazioni concorrenti, idempotenza alla decima quota, protocollo persistito del ripristino e perdita di parti del contratto nella spec.

## Rilievi importanti

### 1. La pulizia per email può ancora perdere una prenotazione concorrente

**Riferimenti:** S:300–309, 411–429; P:203–208, 213–216.

Il lucchetto dell’utente stabilizza le appartenenze dell’UUID cancellato, ma non le prenotazioni della stessa email con UUID differenti. Il ramo che crea una prenotazione prende soltanto famiglia e invito; la cancellazione individua le famiglie delle prenotazioni già visibili.

Interleaving ammesso, usando link di **due famiglie diverse**:

1. `claim` su L1 inserisce una prenotazione per E con UUID U1, ma la transazione resta aperta.
2. `claim` su L2 conferma una prenotazione per E con UUID U2; Auth crea U2.
3. La cancellazione di U2 enumera famiglie e prenotazioni. Non vede la riga non confermata di U1, quindi non blocca la famiglia di L1.
4. Il passo 8 anonimizza le prenotazioni visibili.
5. La transazione di L1 conferma; poi conferma la cancellazione di U2.

Al termine della prima transazione di cancellazione resta una prenotazione con E in chiaro. La successiva cancellazione in Auth non la raggiunge, perché `user_id` non ha chiave esterna.

Non basta aggiungere il lucchetto di U1 al nuovo `claim`: la cancellazione tiene quello di U2. Il test attuale prepara entrambe le prenotazioni prima della cancellazione e non rileva questa finestra. Il comportamento delle letture è quello previsto da PostgreSQL in [Read Committed](https://www.postgresql.org/docs/17/transaction-iso.html).

**Correzione proposta:** coordinare creazione delle prenotazioni e cancellazione sulla stessa email normalizzata, con una risorsa condivisa o una soluzione equivalente che renda stabile l’insieme da anonimizzare. Inserire questa sincronizzazione nell’ordine completo dei lucchetti e nell’interfaccia condivisa. Aggiungere il test sopra, sospendendo L1 dopo l’inserimento e prima del commit.

### 2. Alla decima quota due richieste della stessa email non ricevono entrambe la prenotazione

**Riferimenti:** S:289–309, 1041–1051; P:309–321.

Nel ramo «nessuna prenotazione», dopo l’attesa sulla famiglia e sull’invito si ricontrollano validità, esistenza dell’account e tetto. La prenotazione viene riletta soltanto dopo `INSERT … ON CONFLICT`.

Con nove prenotazioni iniziali:

1. Due richieste della stessa email non trovano ancora una prenotazione e imboccano entrambe il ramo 2.
2. La prima occupa la decima quota e conferma.
3. La seconda ottiene il lucchetto e conta dieci righe.
4. Restituisce `unavailable` **prima** di arrivare a `ON CONFLICT` e alla rilettura.

Se nel frattempo Auth ha creato l’account, può invece fermarsi prima con `P0A03`. In entrambi i casi manca l’esito idempotente promesso. La regola generale sulle riletture non risolve l’ambiguità dei passi specifici, che collocano il recupero della riga dopo i rifiuti.

**Correzione proposta:** dopo l’attesa verificare nuovamente l’esistenza della prenotazione **prima** dei controlli riservati a una nuova registrazione. Se è comparsa, passare al trattamento della prenotazione esistente rispettando utente → famiglia → link → prenotazione; non acquisire il lucchetto dell’utente dopo quello della famiglia. Esplicitare l’eventuale riavvio del tentativo.

Il test deve forzare entrambe le letture iniziali prima del primo commit e verificare lo stesso UUID restituito senza errori. La nuova prova negativa del tetto, invece, rimuove correttamente tutte le serializzazioni del conteggio.

### 3. Il ripristino ordina i messaggi, ma non garantisce pulizia e persistenza fra schede

**Riferimenti:** S:832–855, 1130–1138; P:535–557. Riscontri: `web/src/session/session.ts:158–174`; `web/src/api/persister.ts:60–78,193–195`.

Trasportare l’istante originale di `revoked` corregge il problema della seconda revisione. Restano due passaggi non definiti.

**Pulizia della scheda che riceve i messaggi in ordine inverso.** B conserva query della famiglia in memoria. A revoca a t1, poi rientra con una richiesta iniziata a t2. B riceve prima `restored(t2)` e poi `revoked(t1)`: secondo la regola scritta, quest’ultimo non revoca più nulla. Non è però previsto un passaggio che elimini le query precedenti alla revoca in B. Oggi quella pulizia avviene dentro `session.revoke`; tolto il segno condiviso, le query vecchie possono anche essere ripersistite. Verificare soltanto che la famiglia sia visibile non dimostra «senza dati vecchi».

**Persistenza del ripristino.** Si conserva soltanto `revokedAt`, cancellando il segno al ripristino; `restoredAt` resta in memoria. Una scheda che non ha ancora ricevuto `restored` può riscrivere un vecchio segno dopo che A lo ha cancellato. Una sessione riavviata legge quel segno, ma non dispone dell’informazione necessaria per riconoscerlo come precedente al ripristino. Il test «segno persistito anteriore al ripristino → nessuna revoca» non è quindi realizzabile con il solo stato persistito descritto.

**Correzione proposta:** definire un protocollo persistito che conservi anche l’informazione del ripristino e la confronti atomicamente con le revoche. Separare lo stato dell’accesso dalla pulizia dovuta a una revoca non ancora elaborata: ignorarne l’effetto sullo stato non deve saltare la rimozione dei dati precedenti.

Estendere i test con query già presenti in B, consegna inversa, scrittura ritardata del vecchio segno e riavvio di una terza sessione. Verificare anche cache e coda della spesa, oltre alla visibilità della famiglia.

### 4. Le correzioni hanno eliminato i contratti delle aree `family` e `account`

**Riferimenti:** S:532–571, 585–586; P:282–284, 339–340, 382–384.

Il diff di `b0a0f2d` elimina integralmente dalla sezione 2:

- la tabella delle operazioni `family.join`, `setMemberRole`, `removeMember`, `leave`, `getDeletion`, `delete`;
- le definizioni di `deletionFamilySchema`, `deletionPlanSchema`, `deletionInputSchema`;
- la tabella di `account.getDeletionPlan` e `account.delete`;
- le indicazioni specifiche sul rimando MCP e sulle descrizioni degli strumenti.

Questi contenuti non sono stati spostati altrove. La tabella di `users` usa ancora gli schemi eliminati; il piano rimanda esplicitamente alla tabella dell’area `family` ora assente.

Non è una perdita soltanto editoriale: mancano metodi e percorsi, forme degli input/output, errori dichiarati e parte delle regole MCP necessarie a realizzare il contratto unico. Per esempio, il campo `connectedAgents` dell’output personale non è più definito.

**Correzione proposta:** ripristinare le due sezioni dal commit precedente, integrandole con le correzioni attuali. Verificare che ogni riferimento del piano a schemi e tabelle della spec abbia una definizione presente.

## Verifica dei rilievi 1–10 della seconda revisione

| Rilievo precedente | Esito | Verifica |
|---|---|---|
| **1 — Ripetizioni, rimozioni e UUID cancellati** | **Chiuso nei percorsi richiesti** | `join` chiude la prenotazione; `complete` ricontrolla rimozioni e appartenenza senza doppio ingresso. `beforeCreate` e il trigger sul profilo proteggono l’UUID cancellato, compresa la finestra fra controllo e POST. S:313–343, 532–551; test S:1079–1087. Resta il distinto problema dell’accettazione concorrente del rilievo 2 di questo rapporto. |
| **2 — Nuove famiglie dopo il ricalcolo** | **Chiuso nella progettazione** | Lucchetto per utente prima delle famiglie, ricontrollo del profilo e di `account_deletions`, adeguamento esplicito di `app.create_family` di A. S:194–218, 411–423; P:85–88. La garanzia non si estende alle prenotazioni di UUID diversi: rilievo 1 sopra. |
| **3 — Link scaduti con prenotazioni** | **Chiuso** | Distinzione fra link usabili e aperti; revoca automatica e manuale anche degli scaduti, elenco e prove dedicati. S:229–237, 264–274, 951–954. |
| **4 — Pulizia per email normalizzata** | **Parzialmente chiuso** | Corretto il caso delle prenotazioni già confermate su più link. Manca la sincronizzazione con quelle in corso: rilievo 1 sopra. |
| **5 — Prova negativa del tetto** | **Chiuso per la prova negativa** | Rimossi tutti i lucchetti che serializzano il conteggio, barriera dopo la lettura di nove righe, fallimento finale su undici. S:1041–1051; P:318–322. Il caso positivo della stessa email resta incoerente: rilievo 2 sopra. |
| **6 — Ripristino fra schede** | **Parzialmente chiuso** | Corretto l’istante originale della revoca; restano pulizia e persistenza del ripristino: rilievo 3 sopra. |
| **7 — Stalli, ritentativi e `afterCommit`** | **Chiuso nella progettazione** | Accettati entrambi gli esiti dello stallo; definiti rollback completo, nuove verifiche, sola continuazione confermata, nessun retry dopo commit, secondo stallo e operazioni fuori elenco. S:552–562, 1026–1031, 1088–1094; P:354–362. |
| **8 — Letture versionate obsolete** | **Chiuso** | Elenco e registro non versionati, con prove su prenotazioni e scadenze. S:177–185, 508–511, 1095–1098. |
| **9 — `closed` annullato dall’eccezione** | **Chiuso** | Esito `unavailable` restituito senza eccezione, traduzione dopo il commit e verifica dello stato in una transazione successiva. S:283–296, 530–531, 958–960. |
| **10 — Istruzioni superate** | **Chiuso nei punti sostanziali segnalati** | Prenotazioni conservate dopo l’eliminazione della famiglia, conteggio sulle prenotazioni e SQLSTATE fino a `P0A15`. S:375–381, 971–977, 1294–1295, 1329. È però intervenuta la nuova perdita dei contratti descritta nel rilievo 4. |

“Chiuso nella progettazione” non equivale a verifica dell’implementazione.

## Punti per il coordinatore

Non occorrono nuove decisioni di prodotto. La sincronizzazione per email del rilievo 1 va definita insieme all’ordine completo dei lucchetti e riportata nelle interfacce condivise. Restano valide le decisioni già prese su conservazione dell’account e conteggio delle prenotazioni.

## Verifiche e limiti

Revisione documentale di spec, piano e diff del commit, confrontata con entrambe le revisioni precedenti, indicazioni del coordinatore, brief W11, piano generale del checkout principale, interfacce di A e B, sezioni pertinenti della specifica principale e codice esistente. Consultata tramite Context7 la documentazione PostgreSQL sulla visibilità delle transazioni e sui conflitti.

Non eseguiti test, typecheck o build: l’oggetto è la progettazione di C, ancora da implementare. Nessun file modificato; checkout pulito e `git diff --check` senza segnalazioni.

**Verdetto: DA CORREGGERE.**
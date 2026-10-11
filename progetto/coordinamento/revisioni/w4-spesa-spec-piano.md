# Revisione W4 — Spec e piano Spesa

**Verdetto: DA RIFARE.**

Il perimetro e il riuso del dominio sono coerenti con le decisioni approvate. Devono però essere riprogettati alcuni passaggi della coda e reso concreto il contratto con W5: il piano attuale può perdere modifiche dalla vista, compattare operazioni già applicate sul server e non garantisce la cancellazione della coda al cambio d’utente.

## Perimetro e verifiche

Revisione in sola lettura di:

- branch `traguardo/spesa`, commit `3c7c11ea82cf0b0150a52bd7ab316967af288efd`;
- specifica principale, brief W4, brief comune, mandato del revisore e piano generale **nel checkout principale**;
- spec e piano Spesa, dominio `shopping`/`units`, schema e policy, piattaforma server;
- spec e codice W5 nel worktree `web`, HEAD `5c60ca587ddf3e38f9feac6241f23cd8255a2da5`, **comprese le modifiche locali presenti durante la lettura**;
- firma R1 nella spec corrente di W1 e schema del documento ricetta di W3.

Non sono stati modificati file né eseguiti commit. Non ho eseguito suite, build o test sul database: questa è una revisione di spec e piano. Ho verificato il problema di compilazione del rilievo 11 tramite TypeScript con una modifica esclusivamente in memoria, senza emissione di file.

Nei riferimenti seguenti:

- **Spec Spesa**: `progetto/superpowers/specs/2026-10-11-spesa.md`;
- **Piano Spesa**: `progetto/superpowers/plans/2026-10-11-spesa.md`;
- **W5**: file nel worktree `/Users/fedfol/Projects/meal_planner_2/.worktrees/web`.

## Rilievi

### 1. Bloccante — L’interfaccia di sessione richiesta a W5 non è ancora implementabile come descritta

**Riferimenti:** [Spec Spesa:209](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:209), [Piano Spesa:647](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:647), [W5 session.ts:21](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:21), [W5 persister.ts:205](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/persister.ts:205).

Il piano demanda a un eventuale intervento minimo su `session.ts` agganci che coinvolgono anche autenticazione, persistenza, composizione dei provider e messaggi fra schede.

In particolare:

- `Session` non espone un rinnovo preventivo che restituisca l’identità verificata;
- `refresh()` restituisce solo un booleano, confondendo rinnovo rifiutato e impossibile per rete;
- `close()` attende soltanto le scritture del persister delle query, senza agganci per la coda;
- `purgeOtherCopies()` elimina solo chiavi `query-cache:` e `revoked:`, lasciando `shopping-queue:`;
- manca un messaggio per gli aggiornamenti della coda;
- `session.call()` esegue inizialmente `run()` senza impedire una chiamata su sessione già chiusa: il chiamante deve proteggere esplicitamente l’invio.

**Perché conta:** con l’integrazione descritta, la coda può sopravvivere a logout/cambio utente; verificare l’utente una volta all’inizio di `flush()` non protegge dalle variazioni d’identità durante attese, acquisizione del lock e rinnovi.

**Correzione proposta:** definire e assegnare a W5 un contratto concreto prima del task 10: rinnovo unico con esiti distinti, identità e generazione verificate, agganci asincroni alla chiusura, invalidazione delle scritture pendenti, notifiche fra schede. Inserire test con i componenti reali W5, non soltanto con `verifiedUser` simulato. Il confronto completo a–f è riportato sotto.

### 2. Importante — Una modifica confermata scompare dalla vista se la successiva fallisce

**Riferimenti:** [Spec Spesa:195](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:195), [Piano Spesa:681](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:681).

Il piano rimuove ogni operazione riuscita dalla coda, ma applica la risposta alla cache solo quando non restano operazioni della stessa lista.

Controesempio:

1. in cache A e B sono da spuntare;
2. la coda contiene le spunte di A e B;
3. A riesce ed esce dalla coda; la sua risposta non entra nella cache;
4. B fallisce per rete.

La vista torna a mostrare A non spuntata: né la cache né lo strato pendente contengono più la conferma di A. Se B viene poi scartata per `invalid`, può mancare anche una risposta finale da applicare.

**Correzione proposta:** applicare ogni risposta confermata come nuova base, mantenendo sopra le operazioni ancora pendenti, con protezioni contro risposte superate. In alternativa serve una base confermata esplicita e persistibile; non basta attendere l’ultima risposta. Aggiornare il test che oggi pretende una sola chiamata ad `applyView`.

### 3. Bloccante — La compattazione non distingue operazioni mai inviate, in volo e con esito incerto

**Riferimenti:** [Spec Spesa:184](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:184), [Piano Spesa:616](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:616), [Piano Spesa:625](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:625), [Piano Spesa:700](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:700).

`QueuedOp` non registra se l’operazione è già stata tentata. Eppure il piano elimina `addFreeItem` e `removeFreeItem` quando l’aggiunta è ancora in coda.

Controesempio: l’aggiunta viene applicata dal server, la risposta si perde e l’aggiunta resta in coda. L’utente elimina la voce: la compattazione cancella entrambe le operazioni. La voce rimane sul server e ricompare alla rilettura.

Lo stesso problema esiste durante un invio pendente. Il controllo dell’`id` prima di togliere la testa protegge una nuova operazione dalla rimozione, ma non rende annullabile una richiesta già inviata.

Inoltre, nella sequenza `addFreeItem → setFreeItemChecked → removeFreeItem`, va esplicitato lo scarto delle operazioni dipendenti: il testo prescrive soltanto di togliere aggiunta e rimozione.

**Correzione proposta:** persistere lo stato di invio prima della richiesta. Compattare liberamente soltanto operazioni sicuramente mai inviate; conservare la rimozione quando l’aggiunta potrebbe essere stata applicata. Definire il trattamento delle operazioni dipendenti e provarlo con risposta persa, riapertura e modifica durante l’invio.

### 4. Importante — Senza Web Locks manca un protocollo di esclusione fra schede

**Riferimenti:** [Spec Spesa:195](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:195), [Spec Spesa:226](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:226), [Piano Spesa:676](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:676).

«Se manca [il lock], la scheda che ha avviato l’invio fino alla fine» non definisce come le altre schede riconoscano quella scheda e rinuncino all’invio.

`store.transact()` protegge le scritture IndexedDB, ma non l’intervallo fra lettura della testa, richiesta HTTP e conferma. Due schede possono inviare la stessa testa; una richiesta ritardata può arrivare dopo operazioni successive.

Anche con Web Locks, manca il comportamento delle altre schede dopo l’ack: rileggere soltanto la coda fa sparire lo strato pendente senza aggiornare necessariamente la loro cache della lista.

**Correzione proposta:** specificare nome e ambito del lock, rilettura della coda dopo acquisizione, controllo della sessione prima di ogni invio e aggiornamento delle viste nelle altre schede. Per l’assenza di Web Locks scegliere esplicitamente un protocollo alternativo o una limitazione supportata. Aggiungere prove con due schede, chiusura del titolare, sospensione/ripresa e API assente.

Web Locks garantisce esclusione fra contesti della stessa origine per la durata della callback asincrona; questa garanzia non è sostituita da una variabile locale. [Documentazione MDN consultata tramite Context7](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

### 5. Importante — Lo strato pendente ignora l’aumento della quantità

**Riferimenti:** [Piano Spesa:632](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:632), [domain/arrange.ts:67](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/domain/src/shopping/arrange.ts:67), [domain/combined.ts:49](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/domain/src/units/combined.ts:49).

Il test prescritto per `applyPending` imposta sempre `checked: true` e `previousQuantity: null`.

Se una spunta pendente riguarda 200 g e una nuova lettura mostra 400 g, lo strato continua a indicare tutto acquistato. Anche Condividi, che esporta la vista con lo strato, esclude erroneamente la voce.

**Correzione proposta:** confrontare il `combined` corrente con il `quantityAtCheck` pendente usando `exceeds` del dominio. In caso di crescita mostrare la voce da spuntare con la quantità precedente, conservando il segno di sincronizzazione. Provare aumento, diminuzione, quantità testuali, cambio lingua e sistema di misura.

### 6. Importante — L’idempotenza promessa non copre i casi di ripetizione descritti

**Riferimenti:** [Spec Spesa:72](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:72), [Spec Spesa:84](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:84), [Piano Spesa:412](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:412).

Lo stato assoluto evita l’effetto di un doppio toggle, ma non garantisce da solo che una ripetizione non venga applicata nuovamente:

- `setItemChecked` senza quantità salva 200 g; la risposta si perde; le porzioni aumentano; la stessa richiesta salva ora 400 g e considera acquistato l’aumento;
- un’aggiunta riuscita viene eliminata da un altro membro; ripetere l’aggiunta con lo stesso UUID la ricrea, perché la riga che garantiva l’unicità non esiste più.

I test «due chiamate consecutive» non intercettano questi casi. Per le spunte l’`id` è dichiaratamente solo una correlazione, non una deduplicazione.

**Correzione proposta:** rendere stabile il contenuto effettivo della richiesta ripetuta, in particolare la quantità. Definire con il coordinatore la garanzia voluta dopo mutazioni interposte e cancellazioni, rispettando la decisione generale di non introdurre implicitamente una tabella generica delle ricevute. Aggiungere test con commit riuscito, risposta persa e modifica interposta.

### 7. Importante — Bring! può esportare una lista diversa da quella mostrata

**Riferimenti:** [Spec Spesa:172](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:172), [Piano Spesa:495](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:495), [Piano Spesa:773](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:773).

Tutte le modifiche passano dalla coda, anche online. Bring! è però disabilitato soltanto offline e il server esporta lo stato già salvato.

Una spunta o una voce libera ancora pendente viene rispettivamente ignorata o omessa dall’esportazione, pur essendo visibile nella schermata.

**Correzione proposta:** prima dell’esportazione attendere la sincronizzazione della lista e verificare che non restino operazioni pendenti o scartate da risolvere; in alternativa disabilitare Bring! finché quella lista non è sincronizzata, spiegandolo. Testare anche errore durante lo svuotamento e nuove modifiche mentre l’esportazione è in preparazione.

### 8. Importante — L’apertura di Bring! dopo la risposta HTTP non è verificata sui browser destinatari

**Riferimento:** [Piano Spesa:778](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:778).

Il piano prescrive `createBringLink` seguito da `window.open(url)`. Con latenza sufficiente, la chiamata può non conservare l’attivazione dell’utente richiesta dal browser; il popup può essere bloccato. Un mock che controlla la chiamata a `window.open` non prova l’apertura effettiva.

**Correzione proposta:** scegliere un flusso compatibile con l’attivazione dell’utente: navigazione nella stessa scheda, collegamento da aprire quando pronto, oppure finestra aperta durante il gesto e poi navigata. Gestire esplicitamente il fallimento e verificare su Safari iOS. [Documentazione MDN su `window.open`, consultata tramite Context7](https://developer.mozilla.org/en-US/docs/Web/API/Window/open).

### 9. Importante — Il piano non esplicita il vincolo di lista nella cancellazione delle voci libere

**Riferimenti:** [Piano Spesa:451](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:451), [shopping.sql:100](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/supabase/migrations/20261011100500_shopping.sql:100).

Per `setFreeItemChecked` viene richiesto `where id and shopping_list_id`; per `removeFreeItem` il piano dice soltanto «delete senza controllo». I test coprono l’ID inesistente e il membro estraneo alla famiglia, ma non l’ID di un’altra lista accessibile allo stesso utente.

RLS protegge l’appartenenza familiare, non la corrispondenza fra la lista richiesta e quella dell’`itemId`: un membro di due famiglie può accedere a entrambe.

**Correzione proposta:** prescrivere anche per la cancellazione `WHERE id = itemId AND shopping_list_id = resolvedListId`, mantenendo il comportamento senza errore se non trova righe. Testare altra settimana della stessa famiglia e altra famiglia di cui l’utente è membro. Questo è un difetto di specificazione e copertura, non una vulnerabilità già osservata in un gestore implementato.

### 10. Importante — I pasti senza versione pubblicata scompaiono anche dall’avviso

**Riferimenti:** [Piano Spesa:369](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:369), [Spec Spesa:168](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:168), [domain/consolidate.ts:116](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/domain/src/shopping/consolidate.ts:116), [specifica principale:1022](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-09-29-app-famiglia-design.md:1022).

Il piano converte sia i pasti liberi sia gli slot con ricetta mai pubblicata in `recipe: null`. Il dominio ignora questi elementi senza inserirli in `skipped`.

Escludere gli ingredienti è corretto; perdere la segnalazione del pasto incompleto contraddice la schermata promessa e la sezione 6. Il controllo stretto del documento pubblicato non recupera questo caso.

**Correzione proposta:** conservare separatamente gli slot con ricetta ma versione nulla e aggiungerli alla segnalazione usando soltanto nome e descrizione accessibili, senza leggere le bozze. Testare che un pasto libero non produca avvisi e una ricetta importata mai pubblicata sì.

### 11. Importante — I punti verdi del piano TDD non sono eseguibili nell’ordine indicato

**Riferimenti:** [Piano Spesa:213](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:213), [Piano Spesa:218](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:218), [Piano Spesa:381](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:381), [server/router.ts:6](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/server/src/router.ts:6).

Il task 1 registra tutte le operazioni nel contratto globale e richiede subito `npm run typecheck → PASS`. Il router implementato, però, non contiene ancora `shopping`. Il task 3 aggiunge poi soltanto `getWeekList`, lasciando comunque incompleta l’area.

Ho verificato il primo problema introducendo un’area nel contratto tramite il file host in memoria di TypeScript: `os.router(...)` produce **TS2345, proprietà `shopping` mancante**.

**Correzione proposta:** sviluppare e testare inizialmente il contratto d’area senza registrarlo nel contratto globale, rinviando la registrazione fino al router completo, oppure procedere per incrementi verticali coerenti. Non rendere verdi i passaggi tramite cast che eliminino il controllo di completezza.

La copertura va inoltre estesa ai controesempi dei rilievi precedenti: l’attuale impostazione TDD include test che fisserebbero proprio i comportamenti errati dei rilievi 2 e 5.

### 12. Minore — Documenti non allineati su storage, escaping e metodi della pagina pubblica

**Riferimenti:** [Spec Spesa:136](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:136), [Spec Spesa:144](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:144), [Spec Spesa:182](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/specs/2026-10-11-spesa.md:182), [Piano Spesa:529](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/progetto/superpowers/plans/2026-10-11-spesa.md:529).

- La spec descrive lo storage con soli `get/set/delete/keys`; il piano richiede correttamente anche `transact`, già presente in W5.
- La spec dice «sostituendo `<` con `<`», che non rende sicuro il JSON-LD. Il codice proposto nel piano usa invece correttamente l’escape letterale `\u003c`.
- La spec ammette solo GET; il piano ammette anche HEAD, senza definirne e provarne la risposta senza corpo.

**Correzione proposta:** allineare i documenti alle scelte effettive. L’errore di escaping è nella prosa della spec: non attribuisco al codice proposto un’iniezione che quell’escaping impedisce.

## Confronto dell’interfaccia a–f con W5 reale

| Punto | Cosa esiste | Cosa manca o contraddice |
|---|---|---|
| **a — Identità, stato, generazione** | `AuthState` distingue caricamento, uscita e sessione con `verified`; `Session.userId` e `isClosed()` sono pubblici. L’istanza `Session` rappresenta la generazione. [AuthProvider:6](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/auth/AuthProvider.tsx:6), [SessionScope:60](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:60). | `Session` da sola non espone lo stato verificato. Il suo `revision()` notifica cambiamenti, non è il numero di generazione dell’autenticazione. Va definito come la coda acquisisce un’identità verificata ancora valida al momento dell’invio. |
| **b — Rinnovo riuscito per utente X** | `session.call()` rinnova dopo `unauthorized`, con una promessa condivisa per quella sessione. [session.ts:75](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:75). | Il rinnovo è privato e reattivo. `backend.refresh()` restituisce `boolean`, non X né una distinzione rete/rifiuto. La verifica alla riconnessione usa `backend.check()`, implementato con `getSession()`: non costituisce il contratto di rinnovo preventivo richiesto da W4. [supabaseBackend:41](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/auth/supabaseBackend.ts:41), [supabaseBackend:73](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/auth/supabaseBackend.ts:73). |
| **c — Chiusura e cancellazione** | Chiusura condivisa, cancellazione delle query, attesa delle scritture del persister, pulizia delle copie al cambio identità. [session.ts:95](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:95), [SessionScope:84](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:84). | Nessun aggancio atteso per la coda. Né `close()` né `purgeOtherCopies()` conoscono `shopping-queue:`. Va coperto anche l’avvio con utente B quando sul disco resta una coda di A, senza una vecchia istanza viva da chiudere. |
| **d — Famiglia revocata** | `revoke`, `isRevoked`, `subscribe`, segni persistiti e ricezione dei messaggi di revoca. [session.ts:107](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:107), [SessionScope:96](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:96). | Non viene cancellata la coda. I segni persistiti filtrano il persister delle query, non la coda ripristinata. Chiamare soltanto `session.revoke(A)` non riproduce inoltre la rilettura di `me` fatta dal gestore degli errori W5. |
| **e — Comunicazione fra schede** | `BroadcastChannel` con `signedOut` e `revoked`. [channel.ts:2](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/channel.ts:2). | Nessun messaggio di aggiornamento della coda e nessun coordinatore Web Locks. Il ricevitore corrente tratta ogni messaggio diverso da `revoked` come uscita: aggiungere un tipo richiede modificare anche quel ramo. [SessionScope:109](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/SessionScope.tsx:109). |
| **f — Deroga alla sola consultazione** | W5 conserva e mostra la sessione non verificabile. | La spec W5 prescrive ancora la sola consultazione. La deroga W4 è autorizzata dal piano generale, ma deve entrare nei comportamenti e nei testi W5, senza abilitare le altre mutazioni. [Spec W5:429](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/progetto/superpowers/specs/2026-10-11-app-web-di-base.md:429). |

**Client API:** nel codice esaminato W5 usa ancora `fakeClients`, anche con autenticazione Supabase; `Api` e `wrapApi` espongono soltanto `me`, `menu`, `recipes`, `ratings`. Il client oRPC reale rimane una dipendenza da consegnare, come già riconosciuto dal piano W4. [main.tsx:16](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/main.tsx:16), [types.ts:52](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/api/types.ts:52), [session.ts:190](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/session/session.ts:190).

## Aspetti coerenti e sicurezza verificata nel testo/codice

- **Deroga offline autorizzata:** il piano generale, riga 146, consente espressamente la modifica della sola Spesa con sessione non verificabile, coda per utente e strato separato. Non serve riaprire questa decisione di prodotto.
- **Esportazioni:** Condividi e Bring! nel traguardo A, PDF nell’ondata 3, sono coerenti con il piano generale, riga 152.
- **Dominio:** consolidamento, equivalenze `shopping`, reparti, varietà, quantità canoniche e formattazione riusano correttamente `domain/src/shopping` e `domain/src/units`. La risposta conserva `combined` senza ricavarlo dal testo arrotondato.
- **Aggiornamenti ottimistici:** la separazione fra cache confermata e strato pendente rispetta la decisione generale; applicare ogni risposta confermata, come proposto nel rilievo 2, la rispetta ugualmente.
- **R1:** la firma W4 con `version: number | null` è compatibile con la spec corrente di W1, che restituisce anche `isPast`. Il piano generale usa invece il nome `versionId`: va riallineato nel coordinamento. Il task 8 prevede correttamente di eliminare la query provvisoria e importare l’implementazione unica. [Spec W1:158](/Users/fedfol/Projects/meal_planner_2/.worktrees/menu/progetto/superpowers/specs/2026-10-11-menu-pianificatore.md:158).
- **Permessi:** tutte le operazioni dichiarano `familyMember`; il percorso comune verifica sessione e appartenenza e opera nel ruolo `authenticated`. Le policy della spesa proteggono le famiglie e il vincolo composto impedisce di collegare una lista alla settimana di un’altra famiglia.
- **Pagina Bring!:** il token è casuale di 24 byte, rappresentato con 48 caratteri esadecimali. `anon` può eseguire soltanto il resolver dedicato, che restituisce `items` per un token non scaduto; non ha lettura diretta della tabella. Il piano usa parametri SQL, `no-store`, `noindex` ed escaping del JSON-LD, senza nome della famiglia o giorni. [shopping.sql:48](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/supabase/migrations/20261011100500_shopping.sql:48), [shopping.sql:76](/Users/fedfol/Projects/meal_planner_2/.worktrees/spesa/supabase/migrations/20261011100500_shopping.sql:76).
- **Service worker:** W5 esclude già `/shopping-lists` dalla shell e dalla cache degli asset. Non emerge un aggiramento della scadenza attraverso quel percorso. [sw-rules.ts:4](/Users/fedfol/Projects/meal_planner_2/.worktrees/web/web/src/pwa/sw-rules.ts:4).
- **Safari iOS:** il piano generale esclude Background Sync; invio alla riconnessione e al ritorno in primo piano è coerente. Restano da definire e provare i casi di sospensione e apertura Bring! indicati nei rilievi.

Queste sono verifiche statiche delle scelte e delle primitive esistenti, non una certificazione dell’implementazione W4 o dell’integrazione reale con Bring!.

## Decisioni da assegnare al coordinatore o all’utente

1. **Proprietà e consegna degli agganci W5.** Assegnare esplicitamente rinnovo preventivo, chiusura della coda, revoche persistite e messaggi fra schede; concordare le firme prima del task 10.
2. **Garanzia di idempotenza.** Chiarire il comportamento richiesto dopo risposta persa e mutazioni interposte, soprattutto quantità omessa e voce libera eliminata. Eventuali nuove colonne, tombstone o ricevute specifiche richiedono coordinamento con W2; non sono autorizzate dal vincolo attuale «nessuna migrazione».
3. **Browser senza Web Locks.** Decidere il supporto e il comportamento alternativo, senza lasciare al worker una falsa garanzia di esclusione.
4. **Bring! con modifiche pendenti.** Scegliere attesa della sincronizzazione o indisponibilità temporanea dell’azione, e il flusso di apertura compatibile con Safari iOS.
5. **Consolidamento documentale.** Riportare la deroga nella spec W5 e riallineare `version`/`versionId` nel piano generale. Le decisioni già approvate su PDF, Condividi offline e implementazione unica R1 non richiedono una nuova approvazione.
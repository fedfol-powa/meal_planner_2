# Aggiornamento della PWA installata dopo un rilascio (W8, issue #42)

Spec di dettaglio dell'attività W8. Estende la specifica principale
(`2026-09-29-app-famiglia-design.md`, sezioni 1, 6, 15 e 16) e non la sostituisce. Brief:
`progetto/coordinamento/brief/w8-aggiornamento-pwa.md`. Design concordato con il
coordinatore il 13 ottobre 2026; corretto dopo la prima revisione
(`progetto/coordinamento/revisioni/w8-spec-piano.md`) con la decisione del coordinatore di
semplificare l'architettura (`progetto/coordinamento/messaggi/w8-01-review-spec.md`).

## Problema

Il 13 ottobre 2026 il rilascio del cambio della password non è arrivato alla PWA installata
sull'iPhone. Il service worker attuale (`web/src/pwa/sw-core.ts`) installa la versione nuova in
background ma la lascia **in attesa** finché tutte le finestre non si chiudono (niente
`skipWaiting`); su iOS la PWA resta sospesa e il passaggio può non avvenire mai. La pagina,
inoltre, non chiede mai al browser di controllare se c'è una versione nuova.

C'è poi un secondo problema, emerso nel brainstorming: la copia delle letture sul dispositivo
usa come `buster` la versione della build (`SessionScope.tsx`), quindi la prima apertura di una
versione nuova scarta tutta la copia. Se l'app si aggiorna sul Menu, la lista della spesa
salvata sparisce dal dispositivo e al supermercato, offline, non c'è più. Con un passaggio
automatico succederebbe a ogni rilascio.

## Obiettivo

Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata; offline
resta la shell installata. Nessuna scrittura persa o interrotta, nessuna uscita dalla sessione,
nessuna perdita della lista della spesa offline. Il meccanismo più semplice che renda
impossibile l'errore, senza librerie (service worker scritto a mano).

## Principio: pagina e file sempre della stessa versione

Le navigazioni restano servite **dalla shell installata** del worker attivo, come oggi: shell e
asset vengono sempre dalla stessa cache completa, quindi una pagina bianca o una pagina di una
versione con i file di un'altra sono impossibili per costruzione. Il ritardo di oggi si toglie
dal lato del worker e della pagina:

- il worker nuovo prende il controllo appena il suo precache è completo (`skipWaiting`);
- la pagina chiede al browser di controllare `sw.js` all'avvio e a ogni ritorno in primo piano;
- la pagina si ricarica quando il worker attivo ha una versione **diversa** dalla propria, solo
  se è libera, visibile e non toccata. Dopo il ricaricamento la shell viene dal worker attivo,
  quindi le versioni coincidono: il ciclo è impossibile, anche dopo un rollback.

Questo cambia la specifica principale (sezione 1, «navigazioni dalla rete con ripiego sulla
shell»): vedi «Decisioni da riportare».

## Comportamento per la famiglia

- **Dopo un rilascio, alla prima apertura con la rete** l'app può mostrare la versione
  precedente per qualche secondo, mentre la nuova si scarica; poi passa da sola, se la pagina è
  libera e non è stata toccata. Altrimenti passa al ritorno in primo piano successivo.
- **Ritorno in primo piano con una versione nuova già scaricata:** l'app si ricarica subito,
  senza banner, prima che si tocchi lo schermo; la pagina resta quella in cui si era (stesso
  indirizzo), la copia e la coda della spesa restano, la sessione pure.
- **Mai a metà di qualcosa:** il passaggio aspetta se c'è una scrittura in volo (anche il
  cambio della password, della lingua o un'uscita in corso), un «Annulla» aperto, una modifica
  della spesa in coda o in salvataggio, un foglio aperto o il cursore in un campo di testo; e
  se l'utente ha toccato lo schermo dall'ultimo ritorno in primo piano, aspetta il prossimo.
- **Offline:** l'app si apre con la shell installata, come oggi; il passaggio avviene solo con
  la rete, perché solo con la rete si installa una versione nuova.
- **Rollback del server:** il worker della versione precedente si reinstalla e l'app vi passa
  con le stesse regole (versione diversa, non solo più nuova).

### Il primo rilascio di questa correzione

La versione oggi in produzione (chiamata qui A₀) non sa ricaricarsi: il suo worker non chiama
`skipWaiting` e la sua pagina non chiede aggiornamenti. La correzione (B) non può cambiare il
comportamento di A₀, solo quello che succede da B in poi. Procedura operativa da verificare nel
collaudo (non un limite di tempo garantito):

1. **Prima apertura a freddo con la rete dopo il rilascio:** si vede ancora A₀. La navigazione
   fa controllare `sw.js` al browser: il worker B si scarica, si installa e prende subito il
   controllo con `skipWaiting`. La pagina A₀ aperta non se ne accorge e continua a funzionare
   (la cache di A₀ è conservata). Se l'app resta solo sospesa e non viene chiusa, A₀ non chiede
   aggiornamenti: il controllo avviene alla prima apertura a freddo (oppure, per regola del
   browser, dopo 24 ore dall'ultimo controllo, alla prima richiesta della pagina).
2. **Seconda apertura a freddo** (chiudendo l'app dal multitasking dopo che la prima è rimasta
   aperta con la rete per 15–20 secondi): il worker B serve la sua shell, compare B. La copia
   delle letture salvata da A₀ è conservata (vedi «Copia sul dispositivo»).
3. **Da lì in poi** ogni rilascio arriva da solo, alla prima apertura o al ritorno in primo
   piano, senza chiudere l'app.

Il coordinatore comunica la procedura alla famiglia insieme al rilascio.

Alternativa scartata: far ricaricare al worker B le pagine A₀ con `WindowClient.navigate()`.
Accorcerebbe il primo passaggio, ma le pagine A₀ non sanno dire se sono a metà di una scrittura.

## Design

### Service worker (`sw-rules.ts`, `sw-core.ts`, `sw.ts`)

**Navigazioni invariate:** shell installata della versione attiva (`SHELL_URL`), rete solo se
manca dalla cache; rotte del server mai intercettate (`SERVER_PREFIXES`).

**Presa di controllo subito.** `install` chiama `skipWaiting()` (in `WorkerDeps`) solo dopo un
precache completo; se il precache fallisce la versione nuova non si installa, la cache parziale
si cancella e resta la precedente, come oggi. Le pagine già controllate passano sotto il worker
nuovo e ricevono `controllerchange`. Niente `clients.claim()`: la prima visita resta non
controllata fino all'apertura successiva, come oggi, e la prima apertura offline resta
garantita dalla seconda visita.

**Conservazione delle cache: le ultime tre versioni.** `activate` tiene la cache corrente e le
due più recenti fra le altre del prefisso `cosasimangia-` (i nomi `cosasimangia-<ISO>` si
ordinano come testo per data di build), e cancella il resto. Una pagina rimasta aperta, per
esempio occupata mentre arrivano due rilasci, o una pagina più nuova durante un rollback, trova
ancora i propri font e le immagini con hash con `caches.match` su tutte le cache. È un limite
semplice, senza tracciare le pagine aperte: una pagina che salta più di due versioni può perdere
font o immagini non ancora caricate (non il bundle, unico e già caricato) e si sistema al
ricaricamento.

**Rollback e cache già presente.** Se la versione che si installa ha già una cache (un rollback
a una versione conservata), un'installazione fallita non la cancella: si cancella solo una cache
creata da quell'installazione. Le risposte si scrivono solo dopo averle scaricate tutte, come
oggi.

**Versione del worker.** Il worker risponde a `{ type: 'version' }` con
`{ type: 'version', version: __BUILD_VERSION__ }` sulla porta del messaggio
(`MessageChannel`); senza porta, o con un messaggio di forma diversa, non risponde.

### Pagina (`update-rules.ts`, `update.ts`, `busy.ts`)

`update.ts` sostituisce `register.ts` e resta solo in produzione e dove c'è
`navigator.serviceWorker`, come oggi.

**Collegamenti** (API del browser iniettabili per i test):

- gli ascoltatori si collegano subito, all'avvio del modulo: `pointerdown` e `keydown` in
  cattura alzano il segno di interazione; `visibilitychange` e `controllerchange` avviano un
  controllo;
- al `load` si registra `/sw.js` con `updateViaCache: 'none'`, si chiama
  `registration.update()` e si fa un controllo;
- a ogni `visibilitychange` verso `visible` si azzera il segno di interazione, si fa un
  controllo e si chiama `registration.update()`; un worker nuovo installato dà
  `controllerchange` e un nuovo controllo;
- `update()` che fallisce (offline) si ignora.

**Il controllo:**

1. ogni `visibilitychange` e ogni `controllerchange` incrementano una generazione; un
   controllo ricorda la generazione con cui è partito;
2. se la pagina non è libera (sotto) si ferma;
3. chiede la versione al worker che controlla la pagina, con un timeout di 1 secondo; senza
   worker o senza risposta si ferma;
4. dopo la risposta, si ferma se la generazione è cambiata (controllo superato), se la versione
   del worker è uguale a quella della pagina, o se la pagina non è più libera: **i controlli si
   ripetono subito prima di ricaricare**;
5. **limite difensivo:** in `sessionStorage` si annota la coppia (versione della pagina,
   versione del worker); se c'è già, o se `sessionStorage` non è disponibile, non si ricarica.
   Al massimo un ricaricamento automatico per coppia;
6. `location.reload()`.

**Pagina libera** = visibile, nessuna interazione dall'ultimo ritorno in primo piano (o dal
caricamento), e non occupata. L'interazione blocca ogni controllo, anche quello all'avvio e al
ritorno in primo piano che arriva dopo la risposta del worker.

**Pagina occupata** (`busy.ts`):

- un contatore di operazioni in corso, `trackBusy(promise)`, che conta l'operazione dal momento
  della chiamata fino al suo esito, usato nei punti di scrittura fuori da TanStack Query:
  - cambio della password (`PasswordPage`, invio a `backend.changePassword`);
  - cambio della lingua (`chooseLocale` in `SessionScope`, `runAreaMutation`);
  - uscita (`signOut` in `AuthProvider`, da prima di `signedOut` fino alla fine della pulizia e
    di `backend.signOut()`);
  - coda della spesa (`add` e ogni scrittura del record in `queue.ts`, dall'inizio della
    transazione IndexedDB);
- un registro di controlli, `registerBusyCheck` (hook `useBusyCheck`), per lo stato che dura:
  - `SessionScope`: `session.queryClient.isMutating() > 0`;
  - `UndoProvider`: un «Annulla» offerto;
  - `ShoppingQueueProvider`: coda non ancora letta dal dispositivo, oppure con operazioni (in
    attesa o inviate), per una persona collegata; senza persona la coda non conta, altrimenti
    la pagina di login non si aggiornerebbe mai (l'uscita in corso è coperta da `trackBusy`);
- due controlli sul DOM: un `dialog[open]` (i fogli) e il focus in un campo di testo (`input`
  non pulsante, `textarea`, `select`, `contenteditable`).

Un controllo che lancia un errore conta come «occupata».

**Cosa sopravvive al ricaricamento:** la sessione di Supabase (`localStorage`), la coda della
spesa (IndexedDB, con gli stessi identificativi delle operazioni) e la copia delle letture
(`CACHE_SCHEMA`, sotto). La conservazione della sessione Supabase vera si prova solo nel
collaudo sull'iPhone: nei test e nel browser l'app gira con il backend finto, che restituisce
sempre l'utente dimostrativo e non la dimostra.

### Copia sul dispositivo (`persister.ts`, `SessionScope.tsx`)

Il `buster` della copia persistita diventa la costante `CACHE_SCHEMA = '1'` in `persister.ts`,
al posto della versione della build. Si cambia **solo** quando la forma dei dati salvati o le
chiavi delle query cambiano in modo incompatibile (un campo tolto o rinominato, un tipo
cambiato, una chiave diversa per la stessa lettura), cioè proprio quando si rompe la regola
delle modifiche solo additive. Quando `CACHE_SCHEMA` cambia la copia si **scarta**: niente
migrazione. È l'unica eccezione alla conservazione offline della lista; per questo un cambio
incompatibile resta da evitare, e il periodo di compatibilità delle API richiesto dalla
specifica principale vale comunque (la costante protegge la copia del dispositivo, non le
richieste in coda né gli agenti). Un commento accanto alla costante lo dice.

Perché basta: le modifiche sono solo additive, quindi un dato salvato da una versione
precedente resta valido per la nuova; la freschezza non dipende dal `buster`, perché con la rete
ogni query si rilegge e la versione restituita dal server contiene anche quella del Worker.
Restano le regole di oggi: copia per utente, cancellata a ogni chiusura della sessione,
`maxAge` di 7 giorni, segni di revoca.

**Copie scritte prima di questa correzione.** Hanno come `buster` la data ISO della build di A₀:
`restoreClient` le tratta **sempre** come schema `'1'` (non come lo schema corrente): oggi si
ripristinano; quando `CACHE_SCHEMA` diventerà `'2'` saranno scartate come le altre copie dello
schema `'1'`.

## Test

### Unità e integrazione (Vitest)

- **`sw-rules`:** `staleCaches` tiene la corrente e le due più recenti fra le altre; cancella le
  più vecchie; un rollback (corrente più vecchia di altre) tiene le più recenti; ignora altri
  prefissi.
- **`sw-core`:** `skipWaiting` chiamato solo dopo un precache completo; risposta alla versione
  sulla porta e nessuna risposta a messaggi malformati o senza porta; navigazione sempre dalla
  shell anche dopo un nuovo deploy (test esistente); **primo passaggio da A₀** (cache di A₀,
  install e activate di B: A₀ resta, la navigazione viene dalla shell B, offline compresa);
  **tre versioni con una pagina occupata** (A aperta, arrivano B e C: gli asset di A si servono
  ancora sotto C); **rollback** C → B: la cache di C resta, e un'installazione di B fallita
  durante il rollback non cancella la cache B già presente.
- **`update-rules`:** versione diversa o uguale, nessuna risposta; limite della coppia in
  `sessionStorage`, anche con `sessionStorage` che lancia.
- **`update`** (`navigator.serviceWorker`, documento, `sessionStorage` e `reload` finti, risposte
  del worker trattenute a mano):
  - ritorno in primo piano con worker diverso e pagina libera: ricarica una volta;
  - pagina occupata: non ricarica; libera al ritorno successivo: ricarica;
  - **tocco durante l'attesa della risposta:** non ricarica, per ogni trigger;
  - **pagina nascosta durante l'attesa:** non ricarica;
  - **pagina diventata occupata durante l'attesa:** non ricarica;
  - **controllo superato** da un `controllerchange` o da una nuova transizione di visibilità:
    scartato; il controllo nuovo decide;
  - stesso worker, nessuna risposta, nessun worker: non ricarica;
  - coppia già usata: non ricarica (limite difensivo);
  - `update()` chiamato all'avvio e a ogni ritorno visibile; un `update()` che fallisce non lascia
    errori non gestiti;
  - un tocco prima della registrazione (prima del `load`) conta.
- **`busy`:** registro, `trackBusy` (conta fino all'esito, anche se rifiutata), `dialog[open]`,
  focus nei campi di testo, controllo che lancia.
- **Con i provider veri** (`renderApp`): la pagina è occupata con una mutazione dei pasti
  trattenuta, con «Annulla» offerto, con il cambio della password trattenuto, con il cambio
  della lingua trattenuto, con l'uscita trattenuta (pulizia o `backend.signOut()`), con
  l'accodamento della spesa mentre la transazione del dispositivo è trattenuta, con operazioni
  in coda; libera senza nulla di questo; la pagina di login senza coda non è occupata. Ogni test
  fallisce se si toglie il relativo collegamento (verificato a mano durante l'implementazione).
- **Copia e sessione:**
  - persister: una copia con `buster` `'1'` si ripristina; una con data ISO (A₀) si ripristina
    con lo schema `'1'`; una con data ISO **non** si ripristina se lo schema richiesto è `'2'`;
    una con un altro schema si scarta;
  - app intera: una lista riconoscibile salvata con una build, poi l'app riaperta sul Menu con
    un'altra build (versione cambiata in `env.buildVersion`), poi riaperta offline sulla Spesa:
    la lista è visibile e il server non riceve nuove letture; il test fallisce se il `buster`
    torna alla versione della build;
  - coda: operazioni accodate offline, app riaperta con un'altra build: stesse operazioni con
    gli stessi identificativi prima e dopo, inviate con quegli identificativi al ritorno della
    rete.

### Prova nel browser vero (agent-browser)

Senza dipendenze nuove, sulle build di produzione in modalità finta (senza le variabili di
Supabase), servite da `vite preview --outDir <cartella>` su una cartella di cui si cambia il
contenuto. La versione si riconosce dal bundle `/assets/main-<hash>.js` nel DOM e dalla
risposta del worker al messaggio `version`.

- **A₀** = il `main` attuale (commit `3e043f6`), costruito prima di ogni modifica;
- **B**, **C**, **D** = questo branch, costruito tre volte (versioni diverse).

Passi:

1. A₀: apertura, worker attivo, Spesa aperta (la lista entra nella copia);
2. B: ricaricamento a freddo, si vede A₀; il worker B diventa attivo (la pagina A₀ continua a
   funzionare); nuovo ricaricamento: si vede B, la lista è nella copia;
3. C: ritorno in primo piano simulato (`visibilitychange`): la pagina passa a C da sola;
4. **rollback C → B:** si torna a servire B; ritorno in primo piano: il worker B si reinstalla e
   la pagina passa a B, una volta sola, senza cicli;
5. **pagina occupata che salta una versione:** con «Annulla» aperto si serve C e poi D, con
   ritorni simulati: nessun passaggio; i font e le icone restano; chiuso l'«Annulla», al
   ritorno successivo la pagina passa a D;
6. **coda non vuota:** offline si spunta una voce della spesa; tornati online con una versione
   nuova servita, la pagina non passa finché la coda non è inviata; dopo il passaggio la voce
   resta spuntata;
7. rete spenta e riapertura: shell dalla cache, lista della spesa visibile.

La procedura è ripetibile a mano; gli esiti vanno nella descrizione della PR. Gli eventi
sintetici di `visibilitychange` non riproducono sospensione e ripresa di iOS.

### Da provare a mano sull'iPhone (lo fa l'utente dopo il rilascio)

1. Primo rilascio: aprire con la rete, aspettare 15–20 secondi, chiudere dal multitasking,
   riaprire: compare la versione nuova (vedi «Il primo rilascio di questa correzione»).
2. Rilascio successivo con l'app sospesa nel multitasking: riportarla in primo piano con la
   rete; entro pochi secondi compare la versione nuova senza chiudere l'app (se si è toccato lo
   schermo, al ritorno successivo).
3. Lo stesso con un «Annulla» aperto o con la spesa in coda: niente passaggio finché la pagina
   non è libera.
4. Modalità aereo dopo un aggiornamento: la lista della spesa è ancora lì.
5. Dopo il passaggio si resta dentro con lo stesso account (sessione Supabase vera).

## File toccati

- `web/src/pwa/`: `sw-rules.ts`, `sw-core.ts`, `sw.ts`, nuovi `update-rules.ts`, `update.ts`,
  `busy.ts` con i test; `register.ts` tolto.
- `web/src/main.tsx`: chiamata a `update.ts` al posto di `register.ts`.
- `web/src/api/persister.ts`, `web/src/session/SessionScope.tsx`: `CACHE_SCHEMA` e copie di A₀;
  mutazioni in volo e cambio della lingua come «occupata».
- `web/src/features/meals/UndoProvider.tsx`,
  `web/src/features/shopping/ShoppingQueueProvider.tsx`,
  `web/src/features/shopping/queue/queue.ts`, `web/src/routes/profile/PasswordPage.tsx`,
  `web/src/auth/AuthProvider.tsx`: registrazione di «occupata».

Nessuna libreria nuova, nessuna modifica al server, nessuna risorsa esterna.

## Decisioni da riportare nella specifica

### Prodotto

- Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata: il
  passaggio è un ricaricamento silenzioso, senza banner, solo con la pagina libera (nessuna
  scrittura in volo, compresi password, lingua e uscita; nessun «Annulla»; coda della spesa
  vuota e non in salvataggio; nessun foglio aperto; cursore fuori dai campi di testo), visibile
  e non toccata dall'ultimo ritorno in primo piano; altrimenti al ritorno successivo. Dopo un
  rilascio, alla prima apertura con la rete, l'app può mostrare la versione precedente per
  qualche secondo. Scartati il banner «Aggiorna» (si può ignorare per sempre) e il passaggio
  solo all'apertura a freddo (su iOS l'app sospesa resta vecchia). → Sezione 1 (copia e
  sessione sul dispositivo).
- Il primo rilascio di questa correzione richiede due aperture a freddo; poi il passaggio è
  automatico. → Sezione 10 o registro del rilascio.

### Tecniche

- **Navigazioni dalla shell installata, non dalla rete** (cambia la sezione 1: oggi dice
  «navigazioni dalla rete con ripiego sulla shell»). Motivo: shell e asset dalla stessa cache
  completa rendono impossibili per costruzione la pagina bianca e le versioni mescolate
  (pagina di una versione con i file di un'altra), senza timeout, guardie né stati volatili; il
  ritardo si toglie con `skipWaiting()` dopo un precache completo, `updateViaCache: 'none'`,
  `registration.update()` all'avvio e al ritorno visibile, e il ricaricamento della pagina
  quando la versione del worker attivo è diversa dalla sua (al massimo una volta per coppia di
  versioni). Niente `clients.claim()`. → Sezione 1 (paragrafo del service worker).
- Conservazione delle ultime tre versioni in Cache Storage, come limite semplice per le pagine
  rimaste aperte. → Sezione 1.
- Pagina occupata: contatore di operazioni in corso (`trackBusy`) per le scritture fuori da
  TanStack Query, l'uscita e la coda della spesa, più mutazioni TanStack, «Annulla», fogli e
  campi di testo. → Sezione 1.
- `buster` della copia persistita: costante `CACHE_SCHEMA` al posto della versione della build;
  le copie con `buster` in forma di data ISO valgono come schema `'1'`. **Accanto alla regola
  delle modifiche solo additive:** chi cambia in modo incompatibile la forma dei dati salvati o
  le chiavi delle query cambia `CACHE_SCHEMA`, e la copia sul dispositivo si scarta senza
  migrazione: è l'unica eccezione alla conservazione offline, e il periodo di compatibilità
  delle API resta richiesto. → Sezione 1 («Copia e sessione sul dispositivo» e «Modifiche solo
  additive»).
- La lista della spesa offline sopravvive agli aggiornamenti dell'app. → Sezione 6 (Offline).
- Prova del passaggio fra versioni nel browser vero con agent-browser (compresi rollback e
  pagina occupata) e prova a mano sull'iPhone dopo il rilascio, unica prova della sessione
  Supabase vera. → Sezione 9.
- Registro delle revisioni con la data della decisione. → Sezione 16.

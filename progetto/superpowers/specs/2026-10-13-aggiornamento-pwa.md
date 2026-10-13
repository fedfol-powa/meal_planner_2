# Aggiornamento della PWA installata dopo un rilascio (W8, issue #42)

Spec di dettaglio dell'attività W8. Estende la specifica principale
(`2026-09-29-app-famiglia-design.md`, sezioni 1, 6, 15 e 16) e non la sostituisce. Brief:
`progetto/coordinamento/brief/w8-aggiornamento-pwa.md`. Design concordato con il
coordinatore il 13 ottobre 2026 (brainstorming in tre domande e tre sezioni).

## Problema

Il 13 ottobre 2026 il rilascio del cambio della password non è arrivato alla PWA installata
sull'iPhone. Il service worker attuale (`web/src/pwa/sw-core.ts`):

- serve le navigazioni **dalla cache** (`/index.html` della versione installata), con la rete
  solo come ripiego, il contrario di quanto chiede la specifica (sezione 1);
- installa la versione nuova in background ma la lascia **in attesa** finché tutte le finestre
  non si chiudono (niente `skipWaiting`); su iOS la PWA resta sospesa e il passaggio può non
  avvenire mai.

C'è poi un secondo problema, emerso nel brainstorming: la copia delle letture sul dispositivo
usa come `buster` la versione della build (`SessionScope.tsx`), quindi la prima apertura di una
versione nuova scarta tutta la copia. Se l'app si aggiorna sul Menu, la lista della spesa
salvata sparisce dal dispositivo e al supermercato, offline, non c'è più. Con un passaggio
automatico succederebbe a ogni rilascio.

## Obiettivo

Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata; offline
resta la shell installata. Nessuna scrittura persa o interrotta, nessuna uscita dalla sessione,
nessuna perdita della lista della spesa offline. Il più semplice che renda impossibile restare
indietro, senza librerie (service worker scritto a mano).

## Comportamento per la famiglia

- **Apertura a freddo con la rete:** compare la versione pubblicata, senza passaggi intermedi.
- **Ritorno in primo piano dopo un rilascio:** l'app si ricarica da sola, senza banner, prima
  che si tocchi lo schermo; la pagina resta quella in cui si era (stesso indirizzo), si resta
  dentro con lo stesso account, la copia e la coda della spesa restano.
- **Mai a metà di qualcosa:** il passaggio aspetta se c'è una scrittura in volo, un «Annulla» in
  corso, una modifica della spesa in coda, un foglio aperto o il cursore in un campo di testo;
  se nel frattempo si è iniziato a usare l'app, aspetta il ritorno in primo piano successivo.
- **Offline o rete inutilizzabile:** l'app si apre con la shell installata entro 3 secondi.
- **Pagina bianca impossibile da recuperare:** se il bundle della versione nuova non arriva,
  l'app riparte da sola sulla versione installata; se nemmeno questo è possibile mostra un
  messaggio con «Riprova».

### Il primo rilascio di questa correzione

La versione oggi in produzione (chiamata qui A₀) non sa ricaricarsi: il suo worker serve le
navigazioni dalla cache, non chiama `skipWaiting` e la sua pagina non chiede aggiornamenti. La
correzione (B) non può cambiare il comportamento di A₀, solo quello che succede da B in poi.
Al primo rilascio la famiglia vede:

1. **Prima apertura a freddo con la rete dopo il rilascio:** ancora la versione vecchia (A₀ la
   serve dalla cache). La navigazione fa controllare `sw.js` al browser: il worker B si scarica
   e si installa in background (pochi secondi), poi prende subito il controllo con
   `skipWaiting`. La pagina A₀ aperta non se ne accorge e continua a funzionare (la cache di A₀
   è conservata come precedente). Se l'app resta solo sospesa e non viene chiusa, A₀ non chiede
   aggiornamenti: il controllo avviene alla prima apertura a freddo (oppure, per regola del
   browser, dopo 24 ore dall'ultimo controllo, alla prima richiesta della pagina).
2. **Seconda apertura a freddo** (chiudendo l'app dal multitasking dopo che la prima è rimasta
   aperta con la rete per 15–20 secondi): il worker B serve la pagina dalla rete, compare la
   versione nuova. La copia delle letture salvata da A₀ è conservata (vedi «Copia sul
   dispositivo»), la sessione pure.
3. **Da lì in poi** ogni rilascio arriva al ritorno in primo piano, senza chiudere l'app.

Quindi per questo rilascio servono **due aperture a freddo**, la stessa procedura del rimedio
provvisorio della issue: aprire l'app con la rete, aspettare 15–20 secondi, chiuderla dal
multitasking e riaprirla. Il coordinatore la comunica alla famiglia insieme al rilascio.

Alternativa scartata: far ricaricare al worker B le pagine A₀ con `WindowClient.navigate()`
appena attivato. Accorcerebbe il primo passaggio a una sola apertura, ma le pagine A₀ non
possono dire se sono a metà di una scrittura: il ricaricamento potrebbe interrompere un invio o
un «Annulla», contro l'obiettivo.

## Design

### Service worker (`sw-rules.ts`, `sw-core.ts`, `sw.ts`)

**Navigazioni dalla rete, con la shell dopo 3 secondi.** Per la strategia `shell` `respond`
chiede la navigazione alla rete con un `AbortController`:

- risposta `ok` entro il timeout: servita, ripulita dal redirect come oggi
  (`withoutRedirect`), **senza scriverla in cache**: la shell cambia solo con un'installazione
  completa, quindi resta atomica (seconda review, C6);
- errore, stato non `ok`, rete assente o timeout: la richiesta si interrompe e si serve la
  shell installata della versione attiva; senza shell in cache (worker non installato) si
  restituisce l'esito della rete o il suo errore, come oggi.

Il timeout (`navigationTimeoutMs`, 3000 in produzione) sta in `WorkerDeps`, così i test non
aspettano. **Perché 3 secondi:** `index.html` pesa pochi kB e Cloudflare risponde dal nodo più
vicino; su 4G servono circa 100–300 ms, su una rete scarsa ma funzionante (DNS, TLS e richiesta
con andata e ritorno di 500 ms) meno di 2 secondi. Oltre i 3 secondi la rete è in pratica
inutilizzabile, come al supermercato con una tacca, e la shell installata è meglio di una
pagina bianca. Il ritorno in primo piano successivo, con la rete, porta la versione nuova.

**Presa di controllo subito.** `install` chiama `skipWaiting()` (in `WorkerDeps`) solo dopo un
precache completo; se il precache fallisce la versione nuova non si installa, la cache parziale
si cancella e resta la precedente, come oggi. Una pagina già aperta passa sotto il worker nuovo
e riceve `controllerchange`. Niente `clients.claim()`: la prima visita resta non controllata
fino all'apertura successiva, come oggi, e la prima apertura offline resta garantita dalla
seconda visita.

**Convivenza.** `activate` cancella le cache del prefisso `cosasimangia-` tranne la corrente e
**la precedente** (i nomi `cosasimangia-<ISO>` si ordinano come testo: la precedente è la più
recente fra quelle più vecchie della corrente; nomi successivi alla corrente, possibili solo
dopo un rollback, si cancellano). Una pagina della versione precedente ancora aperta sotto il
worker nuovo trova i propri asset con `caches.match` su tutte le cache: il bundle è unico e già
caricato, le servono solo font, foto e immagini con hash che un file tolto dal server farebbe
sparire. La cache precedente va via al rilascio successivo. Le rotte del server restano escluse
(`SERVER_PREFIXES`).

**Messaggi dalla pagina** (`message` in `sw.ts`, logica in `sw-core.ts`):

- `{ type: 'version' }` con una porta (`MessageChannel`): il worker risponde
  `{ type: 'version', version: __BUILD_VERSION__ }` sulla porta; senza porta, o con un messaggio
  di forma diversa, non risponde;
- `{ type: 'use-shell' }`: il worker segna `preferShellUntil = now + 10 s` in memoria; la
  navigazione successiva entro quel tempo riceve direttamente la shell installata, senza rete,
  e consuma il segno. Se il worker viene fermato il segno si perde: la guardia lo sa (sotto).

Lo stato del worker che non sta in Cache Storage (il segno) vive in un oggetto creato una volta
in `sw.ts` e passato a `respond`, così i test lo controllano.

**Rollback.** Dopo un rollback il worker attivo è *più vecchio* della pagina aperta e la pagina
non si ricarica (sotto): ricaricare anche verso una versione più vecchia creerebbe un ciclo
quando la pagina B è servita dalla rete sotto il worker A ancora attivo. Con le modifiche
additive la pagina più nuova funziona; la prossima apertura a freddo porta la versione del
server.

### Pagina (`update-rules.ts`, `update.ts`, `busy.ts`)

`update.ts` sostituisce `register.ts` e resta solo in produzione e dove c'è
`navigator.serviceWorker`, come oggi.

**Regole pure** (`update-rules.ts`): `shouldReload({ pageVersion, workerVersion, busy,
interacted, trigger })`, con `trigger` fra `start`, `visible` e `controllerchange`. Ricarica solo
se `workerVersion > pageVersion` (timestamp ISO confrontati come testo), la pagina non è
occupata e, per `controllerchange`, l'utente non ha toccato lo schermo dall'ultimo ritorno in
primo piano.

**Collegamenti** (`update.ts`, con le API del browser iniettabili per i test):

- registra `/sw.js` con `updateViaCache: 'none'`;
- **all'avvio e a ogni `visibilitychange` verso `visible`** azzera il segno di interazione,
  chiede la versione al worker che controlla la pagina e, se `shouldReload`, ricarica;
  altrimenti chiama `registration.update()` (errori ignorati: offline non succede nulla);
- **a ogni `controllerchange`**, se la pagina è visibile, chiede la versione e applica
  `shouldReload` con `trigger: 'controllerchange'`; se non ricarica, il controllo si ripete al
  ritorno in primo piano successivo;
- il segno di interazione si alza con `pointerdown` e `keydown` (in cattura);
- la domanda della versione ha un timeout di 1 secondo; senza risposta non si fa nulla;
- il ricaricamento è `location.reload()`. Sopravvivono la sessione di Supabase
  (`localStorage`), la coda della spesa (IndexedDB) e la copia delle letture (`CACHE_SCHEMA`,
  sotto). Avviene solo con la rete, perché il worker nuovo si installa solo online.

**Pagina occupata** (`busy.ts`): un registro `registerBusyCheck(check): () => void` più due
controlli sul DOM sempre attivi: un `dialog[open]` (i fogli) e il focus in un campo di testo
(`input` non pulsante, `textarea`, `select`, `contenteditable`). Si registrano dove gli oggetti
già vivono, senza toccare i singoli componenti:

- `SessionScope`: `session.queryClient.isMutating() > 0` (scritture in volo);
- `UndoProvider`: un «Annulla» offerto (`slot.get() !== null`);
- `ShoppingQueueProvider`: coda non ancora letta dal dispositivo, oppure con operazioni (in
  attesa o inviate).

Un controllo che lancia un errore conta come «occupata».

### Guardia contro la pagina bianca (`shell-guard.ts`)

Il caso: la navigazione porta dalla rete l'`index.html` della versione nuova mentre il worker
attivo è ancora il vecchio, poi la rete cade e il bundle nuovo non arriva; nessuna cache lo ha.

`installShellGuard(win)` è una funzione TypeScript pura, senza import, che Vite inserisce in
linea in `index.html`, prima del bundle, con `transformIndexHtml`
(`(${installShellGuard.toString()})(window)`): il codice in linea è lo stesso testato. Fa:

- ascolta in cattura gli `error` di `<script>` e `<link rel="stylesheet">` con URL sotto
  `/assets/` della stessa origine; ignora il resto (immagini, altre origini);
- al primo errore, se c'è un worker che controlla la pagina e in `sessionStorage` non c'è un
  tentativo negli ultimi **30 secondi**, salva l'istante del tentativo, manda
  `{ type: 'use-shell' }` al worker e ricarica: la pagina riparte sulla shell installata, con
  tutti i suoi file in cache, e passerà alla versione nuova al ritorno della rete;
- altrimenti (tentativo recente, nessun worker, `sessionStorage` non disponibile) non ricarica
  e mostra nel `body` un messaggio minimo con un pulsante «Riprova» che ricarica, in italiano o
  inglese britannico secondo `navigator.language` (i cataloghi dell'app sono nel bundle che non
  è arrivato); il limite dei 30 secondi impedisce i cicli di ricaricamento anche se il worker è
  stato fermato e ha perso il segno.

Testi: «Non riesco a caricare l'app. Controlla la connessione e riprova.» / «Riprova»;
«The app couldn't load. Check your connection and try again.» / «Try again».

### Copia sul dispositivo (`persister.ts`, `SessionScope.tsx`)

Il `buster` della copia persistita diventa la costante `CACHE_SCHEMA = '1'` in `persister.ts`,
al posto della versione della build. Si cambia **solo** quando la forma dei dati salvati cambia
in modo incompatibile (un campo tolto o rinominato, un tipo cambiato), cioè proprio quando si
rompe la regola delle modifiche solo additive: un commento accanto alla costante lo dice, e la
regola va scritta accanto a quella delle modifiche additive nella specifica principale.

Perché basta: le modifiche sono solo additive, quindi un dato salvato da una versione
precedente resta valido per la nuova; la freschezza non dipende dal `buster`, perché con la rete
ogni query si rilegge e la versione restituita dal server contiene anche quella del Worker, così
dopo un rilascio la risposta non è mai «invariato». Restano le regole di oggi: copia per utente,
cancellata a ogni chiusura della sessione, `maxAge` di 7 giorni, segni di revoca.

**Copie scritte prima di questa correzione.** Hanno come `buster` la data ISO della build di A₀:
`restoreClient` tratta un `buster` in forma di data ISO come `CACHE_SCHEMA` `'1'` (la forma dei
dati è la stessa), così il primo passaggio non scarta la lista della spesa salvata.

## Test

### Unità

- **`sw-rules`:** `staleCaches` tiene la corrente e la precedente; cancella le più vecchie e
  quelle successive alla corrente; ignora le cache di altri prefissi.
- **`sw-core`** (cache in memoria e rete simulata dei test esistenti, timeout iniettato):
  - navigazione con la rete: `index.html` del server, non scritto in cache;
  - errore, stato non `ok`, rete assente, timeout superato: shell installata, richiesta
    interrotta (segnale `aborted`);
  - `skipWaiting` chiamato solo dopo un precache completo, mai se l'installazione fallisce;
  - `activate` conserva la cache precedente e cancella le altre;
  - messaggio `version` con risposta sulla porta; nessuna risposta senza porta o con un
    messaggio malformato;
  - `use-shell`: shell senza rete alla navigazione successiva, una volta sola, entro 10 secondi;
  - **navigazione dalla rete sotto il worker vecchio:** sotto A arriva dalla rete l'`index` di
    B, la rete cade, l'asset di B fallisce, la guardia manda `use-shell`, la navigazione
    successiva riceve la shell A e gli asset di A si servono offline;
  - convivenza: una pagina A sotto il worker B trova i propri asset nella cache precedente;
  - **primo passaggio da A₀:** cache di A₀ installata dal codice di oggi (cache-first), poi
    install e activate di B: la cache di A₀ resta come precedente, la navigazione successiva
    sotto B viene dalla rete, offline dalla shell B.
- **`update-rules`:** tabella di casi su versione più nuova o più vecchia (rollback) o uguale,
  pagina occupata, interazione, `start`/`visible`/`controllerchange`.
- **`update`** (`navigator.serviceWorker`, documento e `reload` finti in jsdom): in primo piano
  con worker più nuovo e pagina libera ricarica; occupata non ricarica e ricarica al ritorno
  successivo quando è libera; `controllerchange` dopo un tocco aspetta; worker più vecchio mai;
  nessuna risposta dal worker niente; `registration.update()` chiamato quando non ricarica.
- **`busy`:** registro, `dialog[open]`, focus nei campi di testo, controllo che lancia.
- **`shell-guard`:** primo errore di uno script o di un foglio di stile sotto `/assets/` manda
  `use-shell` e ricarica; secondo errore entro 30 secondi niente ricaricamento e messaggio con
  «Riprova»; dopo 30 secondi un nuovo tentativo; senza worker messaggio subito; immagini e
  risorse fuori da `/assets/` o di altre origini ignorate; lingua del messaggio; il pulsante
  ricarica. Più un test che la build inserisce la guardia in `index.html` prima del bundle.
- **Copia e sessione:** una copia salvata con il `buster` `'1'` si ripristina anche se la build
  è cambiata, compresa la lista della spesa; un `buster` diverso da `'1'` e non in forma di data
  la scarta; una copia con `buster` in forma di data ISO (A₀) si ripristina.
- **Registrazioni di «occupata»:** `SessionScope` con una mutazione in volo, `UndoProvider` con
  un «Annulla» offerto, `ShoppingQueueProvider` prima della lettura e con operazioni in coda.

### Prova nel browser vero (agent-browser)

Senza dipendenze nuove, sulle build di produzione in modalità finta (senza le variabili di
Supabase), servite da `vite preview --outDir <cartella>` su una cartella di cui si cambia il
contenuto. La versione si riconosce dall'hash del bundle nel DOM.

- **A₀** = il `main` attuale (commit `3e043f6`), costruito prima di ogni modifica;
- **B** = questo branch; **C** = questo branch ricostruito (versione diversa).

Passi:

1. servire A₀, aprire l'app e aspettare il worker attivo;
2. sostituire con B e ricaricare (apertura a freddo): si vede ancora A₀; aspettare che B sia
   attivo (la pagina A₀ continua a funzionare); ricaricare: si vede B, la copia e la sessione
   finta restano;
3. sostituire con C e simulare un ritorno in primo piano (`visibilitychange`): la pagina passa
   a C da sola;
4. sostituire con una build successiva, aprire un «Annulla» (modifica di un pasto) e simulare
   il ritorno: nessun passaggio; chiuso l'«Annulla», al ritorno successivo il passaggio avviene;
5. rete spenta (`offline`) e riapertura: shell servita dalla cache, lista della spesa visibile;
6. una pagina della versione precedente lasciata aperta in un'altra scheda mentre la nuova si
   attiva continua a funzionare (navigazione interna, font).

La procedura è ripetibile a mano; gli esiti vanno nella descrizione della PR.

### Da provare a mano sull'iPhone (lo fa l'utente dopo il rilascio)

1. Primo rilascio: aprire con la rete, aspettare 15–20 secondi, chiudere dal multitasking,
   riaprire: compare la versione nuova (vedi «Il primo rilascio di questa correzione»).
2. Rilascio successivo con l'app sospesa nel multitasking: riportarla in primo piano con la
   rete, compare la versione nuova senza chiudere l'app.
3. Lo stesso con un «Annulla» aperto o con la spesa in coda: niente passaggio finché la pagina
   non è libera.
4. Modalità aereo dopo un aggiornamento: la lista della spesa è ancora lì.
5. Dopo il passaggio si resta dentro con lo stesso account.
6. Su rete debole l'app si apre comunque entro pochi secondi.

## File toccati

- `web/src/pwa/`: `sw-rules.ts`, `sw-core.ts`, `sw.ts`, nuovi `update-rules.ts`, `update.ts`,
  `busy.ts`, `shell-guard.ts` con i test; `register.ts` tolto.
- `web/vite.config.ts`: inserimento della guardia in `index.html`.
- `web/src/main.tsx`: chiamata a `update.ts` al posto di `register.ts`.
- `web/src/api/persister.ts`, `web/src/session/SessionScope.tsx`: `CACHE_SCHEMA` e copie di A₀;
  registrazione di «occupata».
- `web/src/features/meals/UndoProvider.tsx`,
  `web/src/features/shopping/ShoppingQueueProvider.tsx`: registrazione di «occupata».

Nessuna libreria nuova, nessuna modifica al server, nessuna risorsa esterna.

## Decisioni da riportare nella specifica

### Prodotto

- Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata: il
  passaggio è un ricaricamento silenzioso, senza banner, all'apertura o al ritorno in primo
  piano, solo con la pagina libera (nessuna scrittura in volo, nessun «Annulla», coda della
  spesa vuota, nessun foglio aperto, cursore fuori dai campi di testo) e prima che si tocchi lo
  schermo; altrimenti al ritorno successivo. Scartati il banner «Aggiorna» (si può ignorare per
  sempre) e il passaggio solo all'apertura a freddo (su iOS l'app sospesa resta vecchia).
  → Sezione 1 (copia e sessione sul dispositivo), Parte 1 se si descrive l'app installata.
- Il primo rilascio di questa correzione richiede due aperture a freddo; poi basta il ritorno in
  primo piano. → Sezione 10 o registro del rilascio.

### Tecniche

- Navigazioni dalla rete con timeout di 3 secondi e ripiego sulla shell installata, senza
  scrivere in cache la risposta della rete; `skipWaiting` dopo un precache completo, niente
  `clients.claim()`; conservazione della cache della versione precedente fino al rilascio
  successivo; versione del worker chiesta dalla pagina con un messaggio; ricaricamento solo
  verso un worker più nuovo (dopo un rollback la pagina più nuova resta fino all'apertura a
  freddo). → Sezione 1 (paragrafo del service worker).
- Guardia in linea in `index.html` contro la pagina bianca: un tentativo sulla shell installata
  ogni 30 secondi, poi un messaggio con «Riprova». → Sezione 1.
- `buster` della copia persistita: costante `CACHE_SCHEMA` al posto della versione della build;
  le copie con `buster` in forma di data ISO valgono come forma `1`. **Accanto alla regola delle
  modifiche solo additive:** chi cambia in modo incompatibile la forma dei dati salvati sul
  dispositivo cambia `CACHE_SCHEMA`, e la copia salvata si scarta una volta. → Sezione 1
  («Copia e sessione sul dispositivo» e «Modifiche solo additive»).
- La lista della spesa offline sopravvive agli aggiornamenti dell'app. → Sezione 6 (Offline).
- Prova del passaggio fra versioni nel browser vero con agent-browser e prova a mano
  sull'iPhone dopo il rilascio. → Sezione 9.
- Registro delle revisioni con la data della decisione. → Sezione 16.

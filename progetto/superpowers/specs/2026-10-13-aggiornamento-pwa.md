# Aggiornamento della PWA installata dopo un rilascio (W8, issue #42)

Spec di dettaglio dell'attività W8. Estende la specifica principale
(`2026-09-29-app-famiglia-design.md`, sezioni 1, 6, 15 e 16) e non la sostituisce. Brief:
`progetto/coordinamento/brief/w8-aggiornamento-pwa.md`. Design concordato con il
coordinatore il 13 ottobre 2026; corretto dopo due revisioni
(`progetto/coordinamento/revisioni/w8-spec-piano.md`, `w8-spec-piano-2.md`) con le decisioni
del coordinatore (`progetto/coordinamento/messaggi/w8-01-review-spec.md`,
`w8-02-review-spec-2.md`).

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

Le navigazioni restano servite **dalla shell installata** del worker attivo, come oggi. La cache
di una versione contiene **solo** file di quella versione, verificati all'installazione (sotto),
quindi una pagina bianca o una pagina di una versione con i file di un'altra sono impossibili per
costruzione. Il ritardo di oggi si toglie dal lato del worker e della pagina:

- il worker nuovo prende il controllo appena il suo precache è completo e verificato
  (`skipWaiting`);
- la pagina chiede al browser di controllare `sw.js` all'avvio e a ogni ritorno in primo piano;
- la pagina si ricarica quando il worker attivo ha una versione **diversa** dalla propria, solo
  se è libera, visibile e non toccata. Dopo il ricaricamento la shell viene dal worker attivo,
  quindi le versioni coincidono e il tentativo converge, anche dopo un rollback.

Questo cambia la specifica principale (sezione 1, «navigazioni dalla rete con ripiego sulla
shell») e le «Interfacce decise» del piano generale: vedi «Decisioni da riportare».

## Comportamento per la famiglia

- **Dopo un rilascio, alla prima apertura con la rete** l'app può mostrare la versione
  precedente per qualche secondo, mentre la nuova si scarica; poi passa da sola, se la pagina è
  libera e non è stata toccata. Altrimenti passa al ritorno in primo piano successivo.
- **Ritorno in primo piano con una versione nuova già scaricata:** l'app si ricarica subito,
  senza banner, prima che si tocchi lo schermo; la pagina resta quella in cui si era (stesso
  indirizzo), la copia e la coda della spesa restano, la sessione pure.
- **Mai a metà di qualcosa:** il passaggio aspetta se c'è una scrittura in volo (anche il
  cambio della password, della lingua o un'uscita in corso, pulizia compresa), un «Annulla»
  aperto, una modifica della spesa in coda o in salvataggio, un foglio aperto o il cursore in
  un campo di testo; e se l'utente ha toccato lo schermo dall'ultimo ritorno in primo piano,
  aspetta il prossimo.
- **Offline:** l'app si apre con la shell installata, come oggi; il passaggio avviene solo con
  la rete, perché solo con la rete si installa una versione nuova.
- **Rollback del server fra versioni con questo meccanismo:** il worker della versione
  precedente si reinstalla (o riusa la sua cache completa) e l'app vi passa con le stesse regole;
  una ripubblicazione successiva funziona di nuovo.

### Il primo rilascio di questa correzione

La versione oggi in produzione (chiamata qui A₀) non sa ricaricarsi: il suo worker non chiama
`skipWaiting`, non risponde alla domanda della versione e la sua pagina non chiede
aggiornamenti. La correzione (B) non può cambiare il comportamento di A₀, solo quello che
succede da B in poi. Procedura operativa da verificare nel collaudo (non un limite di tempo
garantito):

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

### Tornare ad A₀ (procedura distinta)

Il rollback automatico vale solo fra versioni con questo meccanismo. Ripubblicare A₀ dopo B
installa un worker che non chiama `skipWaiting` e non risponde alla domanda della versione:
resta in attesa e le pagine B non si ricaricano (nessuna risposta, nessun ricaricamento). Si
passa ad A₀ solo quando tutte le finestre dell'app sono chiuse: sull'iPhone, chiudere l'app dal
multitasking e riaprirla, due volte se la prima apertura avviene mentre A₀ si sta ancora
installando. Da preferire sempre una correzione in avanti o un rollback a una versione
successiva a B; se serve davvero A₀, il coordinatore comunica questa procedura alla famiglia.

## Design

### Build (`web/vite.config.ts`, `web/src/pwa/precache.ts`)

- **`sw.js` porta la propria versione e il proprio elenco.** La versione è `__BUILD_VERSION__`
  come oggi; l'elenco dei file da mettere in cache (`precacheList`: `/index.html`, script e stili
  con hash, font) si inserisce nel codice di `sw.js` alla fine della build, al posto di un
  segnaposto, con una funzione pura `injectPrecache(code, list)` che fallisce la build se il
  segnaposto non c'è o compare più di una volta. `/precache.json` non si emette più: senza
  lettura a runtime non serve a nulla (via anche da `SERVER_PREFIXES` e da `PRECACHE_URL`).
- **`index.html` porta la versione:** `<meta name="app-version" content="<versione>">`,
  inserito dalla build con `transformIndexHtml`.
- Gli asset con hash sono immutabili per nome: il nome basta a garantirne il contenuto. I font
  in `/assets/fonts/` non hanno hash: si accetta il limite, e chi cambia il contenuto di un font
  ne cambia anche il nome.

### Service worker (`sw-rules.ts`, `sw-core.ts`, `sw.ts`)

**Navigazioni invariate:** shell installata della versione attiva (`SHELL_URL`), rete solo se
manca dalla cache; rotte del server mai intercettate (`SERVER_PREFIXES`).

**Installazione verificata e atomica** (`install`, con `precache` e `version` in `WorkerDeps`):

1. se la cache `cosasimangia-<versione>` esiste e contiene il **segno di completezza**
   (`COMPLETE_URL`, una voce scritta per ultima), si **riusa senza riscriverla** e si passa al
   punto 5;
2. se esiste senza segno (un tentativo interrotto), si cancella;
3. si scaricano tutti i file dell'elenco con `cache: 'reload'`; ogni risposta deve essere `ok` e,
   per i file diversi da `index.html`, non una pagina HTML (in produzione l'hosting risponde a un
   file che non ha con `index.html` e 200, per la regola «single-page-application»; la stessa
   regola vale per gli asset messi in cache durante l'uso);
   l'`index.html` si legge per intero e la sua `app-version` deve coincidere con la versione del
   worker, altrimenti l'installazione fallisce (rilascio cambiato fra `sw.js` e HTML). L'HTML si
   salva come risposta nuova (testo e intestazioni), quindi mai come risposta reindirizzata;
4. solo dopo aver scaricato e verificato tutto si scrive in cache, poi per ultimo il segno; se
   una scrittura fallisce si cancella la cache appena creata (che non era completa) e
   l'installazione fallisce;
5. `skipWaiting()`.

Se l'installazione fallisce resta il worker precedente; il browser riprova al controllo
successivo (avvio o ritorno in primo piano), quando `sw.js` sarà quello del rilascio corrente.
Una cache completa non viene mai toccata da un tentativo fallito: o si riusa, o non esiste.

**Presa di controllo:** le pagine già controllate passano sotto il worker nuovo e ricevono
`controllerchange`. Niente `clients.claim()`: la prima visita resta non controllata fino
all'apertura successiva, come oggi, e la prima apertura offline resta garantita dalla seconda
visita.

**Conservazione delle cache: le ultime tre versioni.** `activate` tiene la cache corrente e le
due più recenti fra le altre del prefisso `cosasimangia-` (i nomi `cosasimangia-<ISO>` si
ordinano come testo per data di build), e cancella il resto. Una pagina rimasta aperta, per
esempio occupata mentre arrivano due rilasci, o una pagina più nuova durante un rollback, trova
ancora i propri font e le immagini con hash con `caches.match` su tutte le cache. È un limite
semplice, senza tracciare le pagine aperte: una pagina che salta più di due versioni può perdere
font o immagini non ancora caricate (non il bundle, unico e già caricato) e si sistema al
ricaricamento.

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
- al `load` si **assicura la registrazione**: `register('/sw.js', { updateViaCache: 'none' })`;
  se fallisce, `getRegistration()`; se manca ancora, si riprova al ritorno visibile successivo.
  Poi `registration.update()` e un controllo;
- a ogni `visibilitychange` verso `visible` si azzera il segno di interazione, si fa un
  controllo, si assicura la registrazione (se manca) e si chiama `registration.update()`; un
  worker nuovo installato dà `controllerchange` e un nuovo controllo;
- `register`, `getRegistration` e `update()` che falliscono (offline) si ignorano.

**Il controllo:**

1. ogni `visibilitychange` e ogni `controllerchange` incrementano una generazione; un
   controllo ricorda la generazione con cui è partito;
2. chiede la versione al worker che controlla la pagina, con un timeout di 1 secondo; senza
   worker o senza risposta si ferma;
3. se la generazione è cambiata (controllo superato) si ferma;
4. **se la versione del worker coincide con quella della pagina, la pagina è allineata:** si
   cancella il segno dei tentativi (sotto) e ci si ferma;
5. se la pagina non è libera (sotto) si ferma: **i controlli di libertà si fanno dopo la
   risposta, subito prima di ricaricare**;
6. **limite contro i tentativi senza convergenza:** in `sessionStorage` c'è al più un segno, la
   coppia (versione della pagina, versione del worker) dell'ultimo ricaricamento automatico. Se
   il segno è la stessa coppia di adesso, l'ultimo ricaricamento non ha portato progressi: non
   si ricarica. Altrimenti si scrive la coppia e si ricarica (`location.reload()`). Il segno si
   cancella al punto 4, quando pagina e worker risultano allineati. Senza `sessionStorage`
   funzionante non si ricarica. Così B → C → B → C funziona sempre, e un ricaricamento che non
   converge (per esempio una shell in cache di un'altra versione) non si ripete.

**Pagina libera** = visibile, nessuna interazione dall'ultimo ritorno in primo piano (o dal
caricamento), e non occupata. L'interazione blocca ogni controllo, anche quello all'avvio e al
ritorno in primo piano che arriva dopo la risposta del worker.

**Pagina occupata** (`busy.ts`), per finestre distinte, ciascuna con la propria protezione:

- un contatore di operazioni in corso, `trackBusy(promise)`, che conta l'operazione dal momento
  della chiamata fino al suo esito:
  - cambio della password (`PasswordPage`, invio a `backend.changePassword`);
  - cambio della lingua (`chooseLocale` in `SessionScope`, `runAreaMutation`);
  - uscita (`signOut` in `AuthProvider`, da prima di `signedOut` fino alla fine della pulizia e
    di `backend.signOut()`);
  - scrittura del record della coda della spesa (`mutate` in `queue.ts`, dall'inizio della
    transazione IndexedDB alla sua fine). `add` si chiama solo dopo che la coda è stata letta,
    quindi la sua attesa iniziale è già risolta e non apre finestre. Fa eccezione la presa della
    testa della coda prima dell'invio (`takeHead`): la coda la esegue a ogni ritorno in primo
    piano, quasi sempre su una coda vuota, e contarla faceva perdere il passaggio quando la
    risposta del worker arrivava durante quella breve transazione (trovato nella prova nel
    browser). Una coda con operazioni è già occupata tramite il controllo del provider, e una
    presa interrotta lascia l'operazione in coda, inviata di nuovo con lo stesso identificativo;
  - accesso (`LoginPage`, da `backend.signIn` alla gestione dell'esito);
  - richiesta di un agente (`AuthorizePage`): la lettura `backend.getAuthorization`, perché con
    un consenso già dato Supabase approva lì la richiesta e il ritorno all'agente arriva solo in
    quella risposta, e la decisione `backend.decideAuthorization`, ciascuna fino alla gestione
    dell'esito, ritorno all'agente compreso; la pagina di consenso in attesa di una scelta è
    libera;
  - salvataggio delle porzioni avviato dall'uscita dal Menu (`useServingsDraft`, il
    `runMealMutation` del cleanup, che non è una mutazione TanStack), fino all'esito;
  - segno di una famiglia revocata sul dispositivo (`markRevoked` in `session.ts`), che tiene
    fuori dalla copia i dati della famiglia;
- un registro di controlli, `registerBusyCheck` (hook `useBusyCheck`), per lo stato che dura:
  - `SessionScope`: `session.queryClient.isMutating() > 0`;
  - `UndoProvider`: un «Annulla» offerto ancora utilizzabile: della famiglia mostrata ed entro i suoi
    6 secondi misurati con l'orologio (il timer può scattare in ritardo dopo la ripresa su iOS, e
    un'offerta di un'altra famiglia non ha un avviso che la chiuda);
  - `ShoppingQueueProvider`: coda non ancora letta dal dispositivo, oppure con operazioni (in
    attesa o inviate), per una persona collegata; senza persona la coda non conta, altrimenti
    la pagina di login non si aggiornerebbe mai (l'uscita in corso è coperta da `trackBusy`);
  - `useServingsDraft`: porzioni cambiate in attesa del salvataggio differito (800 ms), che
    esistono solo in memoria;
  - `FreeItems`: voce della spesa scritta e non ancora aggiunta, anche con la tastiera chiusa;
  - `PasswordPage`: modulo del cambio della password con almeno un campo pieno, anche senza
    focus; libero quando è vuoto, dopo il cambio riuscito (il modulo si svuota) o uscendo dalla
    pagina. Le password restano solo in memoria;
- due controlli sul DOM: un `dialog[open]` (i fogli) e il focus in un campo di testo (`input`
  non pulsante, `textarea`, `select`, `contenteditable`).

Un controllo che lancia un errore conta come «occupata».

**Ricognizione di `web/src`** (revisione della PR #43): ogni scrittura od operazione asincrona
che non passa da una mutazione TanStack, e le bozze tenute solo in memoria.

| Operazione | Dove | Esito | Perché |
|---|---|---|---|
| Mutazioni TanStack (`useMealMutation`, `useAreaMutation`, `useRateRecipe`, scollegamento agenti, ripristino ricette archiviate) | `features/meals`, `routes/profile`, `api/ratings.ts`, `features/agents/AgentsPage.tsx`, `features/catalogue/queries.ts` | già coperta | `isMutating()` in `SessionScope` fino all'esito, `onSuccess` asincroni compresi |
| Porzioni in attesa del timer di 800 ms | `useServingsDraft.ts` | protetta | `useBusyCheck` su `pending` |
| Porzioni salvate all'uscita dal Menu (`runMealMutation` nel cleanup) | `useServingsDraft.ts` | protetta | `trackBusy` fino all'esito e all'avviso di rifiuto |
| Cambio della lingua (`runAreaMutation` diretto) | `SessionScope.tsx` | già coperta | `trackBusy` |
| Cambio della password (`backend.changePassword`, `fetch` diretti di `passwordChangeRequests.ts`) | `PasswordPage.tsx` | già coperta | `trackBusy` |
| Modulo del cambio della password compilato e non inviato | `PasswordPage.tsx` | protetta | `useBusyCheck` su un campo pieno, senza salvare le password: è una credenziale nuova in preparazione, non un accesso riempito dal portachiavi |
| Uscita (pulizia, `persister.close`, `backend.signOut`) | `AuthProvider.tsx` | già coperta | `trackBusy` |
| Accesso (`backend.signIn`) | `LoginPage.tsx` | protetta | `trackBusy` fino alla gestione dell'esito |
| Consenso a un agente (`backend.decideAuthorization`, `leavePage.to`) | `AuthorizePage.tsx` | protetta | `trackBusy` fino alla gestione dell'esito |
| Lettura della richiesta di un agente (`backend.getAuthorization`, `leavePage.to`) | `AuthorizePage.tsx` | protetta | non è una lettura innocua: con un consenso già dato Supabase Auth v2.197.0 approva la richiesta e restituisce una volta sola il ritorno all'agente; `trackBusy` fino alla gestione dell'esito |
| Coda della spesa: scrittura del record, invii, `renew` dopo un rifiuto | `queue.ts`, `ShoppingQueueProvider.tsx` | già coperta | `trackBusy` sulle scritture e controllo della coda con operazioni |
| Coda della spesa: presa della testa su coda vuota | `queue.ts` | innocua | niente da interrompere; vedi sopra |
| Voce della spesa scritta e non aggiunta | `FreeItems.tsx` | protetta | `useBusyCheck` sul testo |
| Segno della famiglia revocata (`markRevoked`) | `session.ts` | protetta | `trackBusy`: senza segno la copia sul dispositivo potrebbe tornare con i dati della famiglia revocata |
| «Annulla» offerto | `UndoProvider.tsx`, `UndoToast.tsx` | già coperta | controllo registrato |
| Fogli: nota, pasto libero, ricetta, scambio, «Chi mangia quando», regole | `NoteForm`, `FreeMealForm`, `RecipePicker`, `SwapPicker`, `DinersGrid`, `MealRules` | già coperta | stanno in un `dialog` aperto (`BottomSheet`) |
| Nome della famiglia, nome della persona | `SettingsPage.tsx`, `PreferencesPage.tsx` | già coperta | il testo esiste solo con il focus nel campo; all'uscita dal campo parte la mutazione |
| Campi di accesso scritti e non inviati | `LoginPage.tsx` | innocua | nessun dato della famiglia; il portachiavi li riempie di nuovo, e contarli terrebbe ferma per sempre una pagina di accesso riempita in automatico |
| Ricerca ricette, ricerca ingredienti, filtri | `RecipeFilters.tsx`, `IngredientRestrictions.tsx` | innocua | ricerche, non scritture; il testo delle ricette sta già nell'indirizzo |
| Link per Bring! (`createBringLink`) | `ShareMenu.tsx` | innocua | esportazione temporanea della lista, nessun dato della famiglia scritto; un altro tocco la ricrea |
| Condividi, copia negli appunti | `ShareMenu.tsx`, `CopyField.tsx` | innocua | foglio di sistema e appunti, nulla di salvato dall'app |
| Verifica della sessione (`backend.check`) | `AuthProvider.tsx` | innocua | lettura, ripetuta al caricamento |
| Rinnovo della sessione (`backend.refresh`) | `session.ts` | innocua | durante una scrittura è già coperto dalla scrittura; durante una lettura il ricaricamento riparte con il refresh token salvato, che Supabase accetta ancora nell'intervallo di riuso, come per un'app chiusa da iOS a metà rinnovo |
| Copia delle letture (`persistClient`, `clearRevoked`) | `persister.ts`, `session.ts` | innocua | transazioni IndexedDB atomiche: un ricaricamento lascia la copia precedente, che si rilegge con la rete; un segno di revoca non tolto rinuncia solo alla copia di quella famiglia |
| `fetch` delle letture RPC | `api/rpc.ts`, `api/queries.ts` | innocua | letture, ripetute dopo il ricaricamento |
| Timer dell'orologio dei pasti e dello scorrimento | `useMealClock.ts`, `MenuPage.tsx` | innocua | solo interfaccia |
| Richiamata `onSuccess` di `mutate` dopo l'esito (per esempio l'offerta di «Annulla») | componenti dei pasti | innocua | la scrittura è conclusa; la finestra fra la fine della mutazione e la richiamata è di un giro di eventi, dopo un tocco che rende comunque la pagina non libera fino al ritorno successivo |

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

- **`precache`:** `precacheList` invariato; `injectPrecache` sostituisce il segnaposto con
  l'elenco, fallisce senza segnaposto o con due segnaposti.
- **`sw-rules`:** `staleCaches` tiene la corrente e le due più recenti fra le altre; cancella le
  più vecchie; un rollback (corrente più vecchia di altre) tiene le più recenti; ignora altri
  prefissi.
- **`sw-core`:**
  - `skipWaiting` solo dopo un precache completo e verificato;
  - **cambio di rilascio fra script e HTML:** worker B, la rete serve l'HTML di C →
    installazione fallita, nessuna cache B, nessun `skipWaiting`;
  - **cambio di rilascio fra HTML e asset:** worker B, HTML B, asset di B non più sul server
    (404) → installazione fallita, nessuna cache B;
  - HTML reindirizzato salvato come risposta semplice (test esistente, adattato);
  - **cache completa già presente:** reinstallazione della stessa versione (rollback) → nessuna
    richiesta di rete per i file, cache identica, `skipWaiting`;
  - **fallimento durante la scrittura con una cache completa già presente** di un'altra
    versione: quella cache resta identica; la cache della versione che si installava non resta;
  - cache senza segno di completezza (tentativo interrotto) → cancellata e ricostruita;
  - risposta alla versione sulla porta e nessuna risposta a messaggi malformati o senza porta;
  - navigazione sempre dalla shell anche dopo un nuovo deploy (test esistente);
  - **primo passaggio da A₀** (cache di A₀ scritta come oggi, senza segno; install e activate di
    B: A₀ resta, la navigazione viene dalla shell B, offline compresa, gli asset di A₀ si
    trovano);
  - **tre versioni con una pagina occupata** (A aperta, arrivano B e C: gli asset di A si servono
    ancora sotto C); **rollback** C → B con la cache B completa riusata e la cache C conservata.
- **`update-rules`:** versione diversa o uguale, nessuna risposta; segno dei tentativi: primo
  tentativo consentito, stesso tentativo senza progresso negato, cancellato all'allineamento,
  `sessionStorage` che lancia.
- **`update`** (`navigator.serviceWorker`, documento, `sessionStorage` e `reload` finti, risposte
  del worker trattenute a mano):
  - ritorno in primo piano con worker diverso e pagina libera: ricarica una volta;
  - pagina occupata: non ricarica; libera al ritorno successivo: ricarica;
  - tocco durante l'attesa della risposta, pagina nascosta durante l'attesa, pagina diventata
    occupata durante l'attesa: non ricarica;
  - controllo superato da un `controllerchange` o da una nuova transizione di visibilità:
    scartato; il controllo nuovo decide;
  - stesso worker, nessuna risposta, nessun worker: non ricarica;
  - **B → C → B → C** con lo stesso `sessionStorage` fra documenti: ogni passaggio avviene;
  - **ricaricamento senza progresso:** dopo un ricaricamento la pagina è ancora diversa dal
    worker con la stessa coppia → nessun secondo ricaricamento;
  - **registrazione fallita → rete disponibile → ritorno visibile → `update()` chiamato** e
    passaggio alla versione nuova; `getRegistration()` usato se `register` fallisce;
  - `update()` all'avvio e a ogni ritorno visibile; errori di rete che non lasciano errori non
    gestiti;
  - un tocco prima del `load` conta.
- **`busy`:** registro, `trackBusy` (conta fino all'esito, anche se rifiutata), `dialog[open]`,
  focus nei campi di testo, controllo che lancia.
- **Con i provider veri** (`renderApp`), per finestre distinte: mutazione dei pasti trattenuta;
  «Annulla» offerto (dopo la risposta, nessuna mutazione in volo); cambio della password
  trattenuto; cambio della lingua trattenuto; uscita con la **pulizia trattenuta** e poi con
  `backend.signOut()` trattenuto; scrittura del record della coda trattenuta (operazioni ancora
  vuote: protegge solo `trackBusy` di `mutate`); coda con operazioni e nessuna transazione in
  corso (protegge solo il controllo del provider); la lettura della coda vuota al ritorno in
  primo piano non conta; libera senza nulla di questo; pagina di login libera. Prove di rottura: togliere la protezione di una finestra fa fallire il test di quella
  finestra.
- **Attraverso `startUpdates` vero** (provider veri, worker di un'altra versione che risponde
  su `MessageChannel`, ritorno in primo piano): una pagina libera ricarica; non ricaricano le
  porzioni in attesa del timer (e il salvataggio parte dopo), il salvataggio delle porzioni
  avviato dall'uscita dal Menu con risposta trattenuta (poi accettata o rifiutata: al ritorno
  successivo ricarica), l'accesso con risposta trattenuta (poi, gestito l'esito, la pagina di
  login ricarica), il consenso a un agente con risposta trattenuta, la lettura di una richiesta
  approvata subito dal server con risposta trattenuta (poi il ritorno all'agente), il modulo
  della password compilato senza focus (vuotato, ricarica), la voce della spesa scritta senza
  focus (vuotata, ricarica), il segno di una famiglia revocata trattenuto sul dispositivo; la
  pagina di consenso in attesa di una scelta ricarica. Prova di rottura per ciascuna protezione.
- **Copia e sessione:**
  - persister: una copia con `buster` `'1'` si ripristina; una con data ISO (A₀) si ripristina
    con lo schema `'1'`; una con data ISO **non** si ripristina se lo schema richiesto è `'2'`;
    una con un altro schema si scarta;
  - app intera: una lista riconoscibile salvata con una build, poi l'app riaperta sul Menu con
    un'altra build, poi riaperta offline sulla Spesa: la lista è visibile e il server non riceve
    nuove letture; il test fallisce se il `buster` torna alla versione della build;
  - coda: operazioni accodate offline, app riaperta con un'altra build: stesse operazioni con
    gli stessi identificativi prima e dopo, inviate con quegli identificativi al ritorno della
    rete.

### Prova nel browser vero (agent-browser)

Senza dipendenze nuove, sulle build di produzione in modalità finta (senza le variabili di
Supabase), servite da `vite preview --outDir <cartella>` su una cartella di cui si cambia il
contenuto. La versione si riconosce da `<meta name="app-version">` (da B in poi), dal bundle
`/assets/main-<hash>.js` nel DOM e dalla risposta del worker al messaggio `version`.

- **A₀** = il `main` attuale (commit `3e043f6`), costruito prima di ogni modifica;
- **B**, **C**, **D**, **E** = questo branch, costruito più volte (versioni diverse).

Passi:

1. A₀: apertura, worker attivo, Spesa aperta (la lista entra nella copia);
2. B: ricaricamento a freddo, si vede A₀; il worker B diventa attivo (la pagina A₀ continua a
   funzionare); nuovo ricaricamento: si vede B, la lista è nella copia;
3. C: ritorno in primo piano simulato (`visibilitychange`): la pagina passa a C da sola;
4. **rollback C → B e ripubblicazione di C:** si serve B, ritorno simulato: la pagina passa a B
   una volta sola; si serve di nuovo C, ritorno simulato: la pagina passa a C;
5. **pagina occupata che salta una versione:** con «Annulla» aperto si serve D e poi E, con
   ritorni simulati: nessun passaggio; i font e le icone restano; chiuso l'«Annulla», al
   ritorno successivo la pagina passa a E;
6. **coda non vuota:** offline si spunta una voce della spesa; tornati online con una versione
   nuova servita, la pagina non passa finché la coda non è inviata; dopo il passaggio la voce
   resta spuntata;
7. **rilascio cambiato durante l'installazione:** si serve `sw.js` di una build con l'HTML di
   un'altra (cartella mescolata a mano): il worker non si installa, la pagina resta com'è e
   funziona; servita la build intera, al ritorno successivo passa;
8. rete spenta e riapertura: shell dalla cache, lista della spesa visibile.

La procedura è ripetibile a mano; gli esiti vanno nella descrizione della PR. Le build della
prova si fanno con `vite build --mode <altro>`, perché `web/.env.production` è nel repository e
`npm run build` produrrebbe build in modalità vera. Il backend finto tiene i dati nella memoria
della pagina: dopo un ricaricamento la lista riparte dai dati dimostrativi, quindi al passo 6 si
verifica che la voce sia spuntata e la coda vuota sul dispositivo prima del passaggio, non dopo;
la conservazione degli identificativi fra versioni la prova il test `survives-update`. Gli eventi
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

- `web/src/pwa/`: `precache.ts`, `sw-rules.ts`, `sw-core.ts`, `sw.ts`, nuovi `update-rules.ts`,
  `update.ts`, `busy.ts` con i test; `register.ts` tolto.
- `web/vite.config.ts`: elenco inserito in `sw.js` al posto di `/precache.json`, `app-version`
  in `index.html`.
- `web/src/main.tsx`: chiamata a `update.ts` al posto di `register.ts`.
- `web/src/api/persister.ts`, `web/src/session/SessionScope.tsx`: `CACHE_SCHEMA` e copie di A₀;
  mutazioni in volo e cambio della lingua come «occupata».
- `web/src/features/meals/UndoProvider.tsx`,
  `web/src/features/shopping/ShoppingQueueProvider.tsx`,
  `web/src/features/shopping/queue/queue.ts`, `web/src/routes/profile/PasswordPage.tsx`,
  `web/src/auth/AuthProvider.tsx`: registrazione di «occupata».
- Dopo la revisione della PR #43: `web/src/features/meals/useServingsDraft.ts`,
  `web/src/auth/LoginPage.tsx`, `web/src/features/agents/AuthorizePage.tsx`,
  `web/src/features/shopping/FreeItems.tsx`, `web/src/session/session.ts`,
  `web/src/routes/profile/PasswordPage.tsx`.

Nessuna libreria nuova, nessuna modifica al server, nessuna risorsa esterna.

## Decisioni da riportare nella specifica

Da riportare nella specifica principale **e** nelle «Interfacce decise» del piano generale
(`progetto/superpowers/plans/2026-10-11-piano-generale.md`), che oggi dicono «navigazioni dalla
rete con ripiego su `index.html`» (PWA, W5) e «`buster` sulla versione della build» (cache
persistita, W5).

### Prodotto

- Con la rete, aprire o riportare in primo piano l'app porta alla versione pubblicata: il
  passaggio è un ricaricamento silenzioso, senza banner, solo con la pagina libera (nessuna
  scrittura in volo, compresi password, lingua, uscita, accesso e consenso agli agenti; nessun
  «Annulla»; nessuna porzione, voce della spesa o nuova password ancora da inviare; coda della spesa vuota e
  non in salvataggio; nessun foglio aperto; cursore fuori dai campi di testo), visibile
  e non toccata dall'ultimo ritorno in primo piano; altrimenti al ritorno successivo. Dopo un
  rilascio, alla prima apertura con la rete, l'app può mostrare la versione precedente per
  qualche secondo. Scartati il banner «Aggiorna» (si può ignorare per sempre) e il passaggio
  solo all'apertura a freddo (su iOS l'app sospesa resta vecchia). → Sezione 1 (copia e
  sessione sul dispositivo).
- Il primo rilascio di questa correzione richiede due aperture a freddo; poi il passaggio è
  automatico. Il rollback automatico vale solo fra versioni con questo meccanismo; tornare ad A₀
  richiede di chiudere tutte le finestre dell'app. → Sezione 10 o registro del rilascio.

### Tecniche

- **Navigazioni dalla shell installata, non dalla rete** (cambia la sezione 1, oggi «navigazioni
  dalla rete con ripiego sulla shell», e l'interfaccia PWA del piano generale). Motivo: shell e
  asset dalla stessa cache completa e verificata rendono impossibili per costruzione la pagina
  bianca e le versioni mescolate, senza timeout, guardie né stati volatili; il ritardo si toglie
  con `skipWaiting()` dopo un precache completo, `updateViaCache: 'none'`,
  `registration.update()` all'avvio e al ritorno visibile (con la registrazione recuperata se il
  primo tentativo fallisce), e il ricaricamento della pagina quando la versione del worker
  attivo è diversa dalla sua, con un limite contro i tentativi senza convergenza. Niente
  `clients.claim()`. → Sezione 1 (paragrafo del service worker).
- **Precache legato alla build:** elenco dei file dentro `sw.js`, versione in
  `<meta name="app-version">` di `index.html` verificata all'installazione, scrittura in cache
  solo dopo aver scaricato e verificato tutto, segno di completezza scritto per ultimo, cache
  completa della stessa versione riusata senza riscriverla; `/precache.json` tolto. Font senza
  hash: chi ne cambia il contenuto ne cambia il nome. → Sezione 1.
- Conservazione delle ultime tre versioni in Cache Storage, come limite semplice per le pagine
  rimaste aperte. → Sezione 1.
- Pagina occupata: contatore di operazioni in corso (`trackBusy`) per le scritture fuori da
  TanStack Query (password, lingua, accesso, consenso agli agenti, porzioni salvate all'uscita
  dal Menu, lettura e decisione delle richieste degli agenti, segno di famiglia revocata), l'uscita e la scrittura della coda della spesa, più
  mutazioni TanStack, «Annulla», porzioni in attesa del salvataggio, voce della spesa non
  ancora aggiunta, modulo della password compilato, coda non vuota, fogli e campi di testo. Chi aggiunge una scrittura fuori da
  TanStack Query o una bozza solo in memoria fuori da un foglio la registra come «occupata».
  → Sezione 1.
- `buster` della copia persistita: costante `CACHE_SCHEMA` al posto della versione della build
  (cambia anche l'interfaccia «Cache persistita» del piano generale); le copie con `buster` in
  forma di data ISO valgono come schema `'1'`. **Accanto alla regola delle modifiche solo
  additive:** chi cambia in modo incompatibile la forma dei dati salvati o le chiavi delle query
  cambia `CACHE_SCHEMA`, e la copia sul dispositivo si scarta senza migrazione: è l'unica
  eccezione alla conservazione offline, e il periodo di compatibilità delle API resta richiesto.
  → Sezione 1 («Copia e sessione sul dispositivo» e «Modifiche solo additive»).
- La lista della spesa offline sopravvive agli aggiornamenti dell'app. → Sezione 6 (Offline).
- Prova del passaggio fra versioni nel browser vero con agent-browser (compresi rollback,
  ripubblicazione, rilascio cambiato durante l'installazione e pagina occupata) e prova a mano
  sull'iPhone dopo il rilascio, unica prova della sessione Supabase vera. → Sezione 9.
- Registro delle revisioni con la data della decisione. → Sezione 16.

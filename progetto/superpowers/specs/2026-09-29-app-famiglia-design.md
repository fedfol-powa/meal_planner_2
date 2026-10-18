# Cosa si mangia? Requisiti e design

Creato: 29 settembre 2026
Ultimo aggiornamento: 18 ottobre 2026 (skeleton nei caricamenti, W20, PR #75, unita e
in attesa di rilascio; fila dei giorni che segue il dito, W21, PR #74, e swipe fra le
settimane, W19, PR #72, rilasciati; rilascio e collaudo della skill per Claude in
«Collega un agente», W17, PR #68; rilascio e collaudo delle email dell'app, attività D)
Stato: base approvata il 29 settembre; requisiti integrati dalle decisioni del 3 ottobre;
linguaggio visivo definitivo approvato il 4 ottobre e conservato in `design/`.
Prototipo completo approvato per giri entro il 7 ottobre (`prototype/`, percorsi in
`design/percorsi.md`) e architettura verificata l'8 ottobre: il prototipo resta il
riferimento dei percorsi approvati.
Stato attuale: traguardo A in produzione dal 12–13 ottobre 2026 su
`https://cosasimangia.qunidi.workers.dev` e dal 17 ottobre 2026 su
`https://cosasimangia.app` (sezione 1), con il collaudo completo ancora in corso
(sezione 10); dal 15 ottobre 2026 in produzione anche gli inviti all'app e la creazione
delle famiglie (attività A dell'ondata 3), dal 16 ottobre l'amministrazione di utenti e
ruoli (attività B) e la gestione della famiglia (attività C: inviti alla famiglia,
membri e ruoli, uscita, eliminazione della famiglia, cancellazione dell'account e degli
utenti), con collaudo e prove sull'iPhone riusciti il 16 ottobre 2026
(sezione 10), e le foto delle ricette (attività E, issue #39). Dal 17 ottobre i passi
esterni dell'attività D (DNS, dominio in Resend, SMTP di Supabase Auth) sono fatti e la
parte software, le email dell'app (PR #64), è unita e rilasciata lo stesso giorno alle
17:54 UTC e collaudata dall'utente: l'attività D è chiusa. Il 18 ottobre la
skill per Claude (W17, PR #68) è unita, rilasciata alle 09:22 UTC e collaudata
dall'utente. Lo stesso giorno sono rilasciati lo swipe fra le settimane nel Menu (W19,
PR #72, alle 12:09 UTC) e la sua correzione, la fila dei giorni che segue il dito (W21,
PR #74, alle 13:49 UTC), ed è unito lo skeleton nei caricamenti (W20, PR #75), con il
rilascio in preparazione.
Esito storico della review avversariale indipendente del 3 ottobre 2026: adatto a un
prototipo esplorativo, non ancora pronto per l'implementazione a quella data; rilievi
e decisioni conseguenti nella sezione 17.
Repository: `fedfol-powa/meal_planner_2` (privato)
Progetto di origine: `fedfol-powa/meal_planner` (resta attivo, vedi "Convivenza")

## Come usare e aggiornare questo documento

Questo è il **documento unico di riferimento per i requisiti e il design completo**,
versionato in Git. Ogni scelta concordata durante brainstorming, prototipazione, design
di dettaglio o implementazione aggiorna le sezioni interessate di questo documento.
Le decisioni superate si ritrovano nella cronologia Git, non in requisiti contraddittori
lasciati attivi nel testo.

`AGENTS.md` contiene le regole comuni a tutti gli agenti e i ruoli; il metodo del
coordinatore è nella skill `.claude/skills/coordinamento/`, quello dei worker in
`progetto/coordinamento/protocollo-worker.md`. Tutti rimandano qui per il prodotto. Piani,
prototipo e documenti di approfondimento devono essere coerenti con questa specifica e non
possono diventare fonti alternative delle decisioni. Ogni piano indica quali sezioni
realizza; la revisione verifica sia il risultato sia l'allineamento della specifica.

La Parte 1 descrive l'app per chi la usa; la Parte 2 descrive dati, comportamenti e
architettura. Il linguaggio visivo approvato è definito nella sezione 14 e reso operativo
in `design/design.md`. Le decisioni sui flussi prese nella review del prototipo sono
già consolidate qui (sezione 14 e registro della sezione 16). Gli aspetti ancora da concordare sono elencati nella
sezione 15 e non vanno trattati come decisioni approvate.

**Decisioni confermate il 3 ottobre 2026:**

- unità della famiglia: metrico oppure imperiale britannico, con conversioni;
- lingua dell'utente: italiano oppure inglese britannico, dalla prima versione;
- ricette pubblicabili solo con i testi richiesti disponibili in entrambe le lingue;
  se manca una traduzione la ricetta resta in bozza;
- ingredienti verificati, quantità e unità quando applicabili e porzioni di riferimento
  obbligatori per pubblicare, anche per le ricette importate; ammesse indicazioni
  esplicite come "q.b.", senza usarle per sostituire dati mancanti;
- operazioni dell'app disponibili anche tramite MCP, con due eccezioni: le operazioni
  `public` senza utente (lettura e accettazione degli inviti all'app e alla famiglia e,
  dall'attività D, reinvio dell'email per la password), mai esposte, e
  l'eliminazione di una famiglia: esecuzione solo nell'app web e risposta MCP con URL alla pagina
  dedicata. Browser previsto anche per collegare l'account e riautenticarsi;
- client MCP obiettivo della prima versione: Codex CLI, Claude Code, ChatGPT e Claude
  Desktop, con istruzioni dedicate e compatibilità da verificare nel design tecnico;
- ruolo di curatore del ricettario, con aggiunta guidata tramite il proprio agente MCP
  e pubblicazione della ricetta solo quando le informazioni richieste sono complete;
- bozze persistenti, riprendibili e visibili anche in una sezione dell'app, separate
  dal catalogo pubblicato, condivise e modificabili da tutti i curatori;
- percorso manuale web per creare, modificare e pubblicare ricette, comprese quelle in
  bozza, con gli stessi controlli di MCP e senza funzionalità AI. Priorità bassa: da
  implementare dopo le altre funzionalità; caricamento da file escluso per ora (quinto
  giro del prototipo);
- ogni curatore può modificare l'intero ricettario, comprese le ricette degli altri
  curatori; occorre gestire backup e ripristino per recuperare errori imprevisti;
- ripristino di una singola ricetta accessibile ai curatori; ripristino dell'intero
  catalogo da backup riservato agli amministratori dell'app;
- database come fonte di verità del ricettario; YAML per importazione ed esportazione;
- pagina web di istruzioni MCP, con comandi o configurazioni copiabili;
- amministratore dell'app, inizialmente Federico, con possibilità di aggiungerne altri
  e pagina per gestire ruoli, inviti e cancellazione degli utenti;
- ruoli globali di curatore e amministratore separati e cumulabili; l'amministratore
  può assegnarli entrambi, senza ottenere accesso ai contenuti delle altre famiglie;
- l'amministratore di una famiglia può eliminare la famiglia che amministra solo
  dall'app web; questa operazione non cancella gli account dei membri;
- l'ultimo amministratore dell'app non può essere cancellato o retrocesso senza un
  successore. Prima di cancellare l'ultimo amministratore di una famiglia con altri
  membri occorre nominarne un altro; cancellando l'unico membro si elimina la famiglia;
- tutto il codice in inglese; conversazione e documentazione di progetto in italiano;
- prima prototipo nel repository e review con l'utente, poi verifica e adeguamento delle
  scelte funzionali e architetturali, quindi piani e implementazione dell'app.

L'approvazione dei requisiti non equivale all'approvazione di un piano di implementazione.

**Decisione confermata il 4 ottobre 2026:** il linguaggio visivo del riferimento
`design/index.html`, derivato dallo studio di HelloFresh e rivisto dall'utente su
iPhone, è quello definitivo da utilizzare nella progettazione e nello sviluppo del
prototipo. La guida `design/design.md` applica la decisione della sezione 14.

**Decisioni confermate l'8 ottobre 2026, verifica dell'architettura dopo il prototipo:**

- interfaccia in React invece di Svelte: SPA con Vite, TanStack Router e TanStack Query;
  il prototipo Svelte resta il riferimento eseguibile dei percorsi approvati;
- backend scritto come un unico strato di operazioni applicative con un contratto
  esplicito, servito da un server su Cloudflare Workers, da cui derivano l'API dell'app
  web, l'API documentata OpenAPI e gli strumenti MCP; il contratto è scritto con oRPC,
  senza Hono (deciso l'11 ottobre 2026 dopo la prova tecnica, vedi sotto);
- MCP nella stessa applicazione, autenticato con il server OAuth 2.1 di Supabase Auth;
- niente Edge Function né Deno: un solo runtime server (Workers) per app, MCP e job;
- ricetta come documento con un unico schema per bozze, versioni, YAML e MCP;
- ripristino dell'intero ricettario calcolato dallo storico delle versioni, senza
  copie periodiche del catalogo;
- generazione pigra della settimana come rete di sicurezza del job del mercoledì;
- fasi di rilascio da ripensare con la nuova architettura; sostituite l'11 ottobre 2026
  dal piano generale a ondate (sezione 10).

**Decisioni confermate l'8 ottobre 2026, hosting e costi:**

- account Cloudflare di POWA (`federico.folloni@powa.space`, deciso l'11 ottobre 2026):
  vi stanno Worker, Hyperdrive e la zona DNS di `qunidi.it`, e dal 17 ottobre 2026 la
  zona di `cosasimangia.app`;
- server in un Worker di Cloudflare (oRPC senza Hono), che serve anche la SPA come file statici, al
  posto della funzione su Netlify; collegamento a Supabase tramite Hyperdrive; piano a
  pagamento di Workers da 5 $ al mese, accettato dall'utente l'8 ottobre 2026 dopo la
  misura del pianificatore (circa 20-25 ms di CPU per settimana, oltre i 10 ms del piano
  gratuito);
- Supabase sul piano gratuito: i backup della piattaforma mancano e li sostituisce
  un'esportazione notturna del database; la pausa per inattività si evita con il job
  orario;
- email di Supabase Auth e del server con Resend, piano gratuito, inviate da
  `cosasimangia.qunidi.it`; dal 13 ottobre 2026 arrivano solo dopo la verifica del
  dominio di invio (attività D dell'ondata 3, sotto). Dal 17 ottobre 2026 il dominio di
  invio è `cosasimangia.app`, verificato in Resend lo stesso giorno, e Supabase Auth
  spedisce con l'SMTP di Resend (sezione 1); le email dell'app arrivano con la parte
  software dell'attività D (PR #64, unita e rilasciata il 17 ottobre 2026; sotto);
- app servita su `cosasimangia.qunidi.it`, sottodominio di `qunidi.it`, dominio
  dell'utente (deciso l'8 ottobre 2026); lo stesso sottodominio è il dominio di invio
  verificato in Resend. **Superata il 13 ottobre 2026 per l'app**: l'app resta su
  `https://cosasimangia.qunidi.workers.dev` e il sottodominio serve solo come dominio
  di invio; un trasferimento dell'app richiederà una decisione distinta (sotto).
  **Superata il 17 ottobre 2026** (decisione dell'utente): app ed email su
  `cosasimangia.app`, dominio comprato dall'utente su Cloudflare (registrazione e DNS
  nello stesso account). Il Worker risponde solo sul dominio personalizzato:
  `workers.dev` spento, senza reindirizzamenti né endpoint lasciati sul vecchio indirizzo;
  `www.cosasimangia.app` rimanda al dominio con un 301 (regola della zona). Mittente
  `noreply@cosasimangia.app`; DMARC `p=none`. Lo stesso giorno l'utente ha pubblicato i
  record di Resend (DKIM `resend._domainkey`, MX e SPF su `send.`) e il dominio è stato
  verificato. Il cambio
  costringe a reinstallare la PWA, a ricollegare gli agenti MCP con
  `https://cosasimangia.app/mcp` e a rigenerare i link per Bring non ancora aperti;
  *Site URL* e *Redirect URLs* passano al nuovo dominio;
- DNS di `qunidi.it` spostato da Aruba a Cloudflare (piano gratuito), perché il dominio
  personalizzato di un Worker richiede una zona attiva su Cloudflare; la registrazione
  del dominio resta su Aruba. Su `qunidi.it` non c'è posta collegata (verificato con
  l'utente l'8 ottobre 2026), quindi la migrazione non rischia di interrompere caselle
  esistenti; si confrontano comunque i record su Aruba con quelli importati da
  Cloudflare prima di cambiare i nameserver. Il record dell'app lo crea Cloudflare,
  quelli di verifica di Resend si aggiungono a mano. Dal 13 ottobre 2026 il DNS per ora
  non si può modificare (sotto); dal 17 ottobre 2026 `qunidi.it` non serve più né
  all'app né alle email (sopra);
- letture dalla copia salvata sul dispositivo, verificata con contatori di versione:
  il server trasferisce una vista solo quando è cambiata.

**Decisioni dell'11 ottobre 2026, fine dell'ondata 1 dell'implementazione:**

- fasi di rilascio nel piano generale `progetto/superpowers/plans/2026-10-11-piano-generale.md`,
  a tre ondate, con il traguardo A (l'app usata ogni settimana dalla famiglia di
  Federico) come obiettivo dell'ondata 2 (sezione 10);
- testi nelle due lingue in campi `{it-IT, en-GB}`, colonne jsonb nel database, al posto
  delle tabelle `*_translations` (sezioni 2 e 12);
- attributi del pianificatore obbligatori per pubblicare, tranne stagioni e ingrediente
  principale (sezione 8);
- risposta «invariato» espressa nel contratto delle operazioni, non con HTTP 304
  (sezione 1);
- job settimanale con un Cron Trigger del Worker al posto di `pg_cron` con `pg_net`
  (sezione 4);
- un pasto passato senza versione in vigore usa la prima versione pubblicata; una
  ricetta mai pubblicata mostra solo nome e descrizione e non entra nella spesa
  (sezione 5);
- lista della spesa modificabile offline anche quando la sessione non si può verificare
  (sezione 6);
- nel traguardo A accesso con email e password, utenti e famiglie creati a mano
  (sezione 7).

**Decisioni dell'11 ottobre 2026, attività dell'ondata 2 unite** (profilo e famiglia,
ricettario e voti, menu e pianificatore, spesa, gestione del ricettario tramite MCP):

- una sola regola di generazione all'apertura del menu: la settimana in corso, se manca,
  dai pasti non ancora passati; la successiva dopo mercoledì alle 20:00 (sezione 4);
- una settimana generata tiene conto anche delle settimane successive già pianificate,
  senza mai sovrascriverle (sezione 3);
- conferma del curatore prima della pubblicazione affidata alle istruzioni servite
  all'agente, con la scheda completa e le traduzioni (sezioni 8 e 12);
- ricerca del ricettario nella lingua dell'utente, anche sui sinonimi degli ingredienti
  (sezione 12);
- famiglia mostrata ricordata sul server (sezione 7);
- nel traguardo A la spesa si esporta con Condividi e Bring!, il PDF arriva nell'ondata 3
  (sezione 6);
- nel traguardo A le bozze si consultano nell'app in sola lettura; archiviazione,
  versioni e ripristino si fanno via MCP (sezione 8).

**Decisioni dell'11 e 12 ottobre 2026, revisione dei pasti (server) ed esportazione
notturna unite:**

- si annulla la propria ultima modifica di un pasto, anche passato, senza limiti di
  tempo lato server, finché nessuno ha cambiato di nuovo quei pasti; nell'app «Annulla»
  resta per 6 secondi, da un agente si annulla anche in una conversazione nuova
  (sezioni 5 e 13);
- una richiesta che non cambia nulla è ricordata senza cambiare l'ultima modifica
  mostrata (sezioni 1 e 5);
- nei pasti si sceglie solo una ricetta pubblicata; una bozza importata già citata si
  sposta con lo scambio e torna con l'annullamento (sezione 5);
- note e testi dei pasti liberi restano come li scrive l'utente, senza traduzione
  (sezione 12);
- esportazione notturna cifrata in R2 di dati delle famiglie, catalogo e account, con
  le ultime 7 copie e un ripristino provato in CI; dopo un ripristino tutti rifanno
  l'accesso e ricollegano gli agenti (sezione 8).

**Decisioni del 12 ottobre 2026, collegamento degli agenti e revisione dei pasti nel web
unite:**

- consenso vero nel browser e pagina «Collega un agente» con gli agenti collegati;
  elenco e scollegamento sono operazioni anche MCP (`agents.list`,
  `agents.disconnect`); scollegare revoca l'autorizzazione e le sessioni di
  quell'agente con effetto immediato, provato in CI a ogni PR (sezioni 1 e 13);
- finché un agente è collegato, autorizzarlo di nuovo non chiede un altro consenso e
  aggiunge un accesso; «Scollega» li revoca tutti (sezione 13);
- i poteri di un token d'agente su Supabase Auth (cambiare la password, chiudere le
  sessioni, revocare altri agenti) per ora sono solo documentati, con testi veritieri
  nel consenso, nella pagina e nella conferma di «Scollega» (sezioni 13, 15 e 17);
- negli agenti collegati si mostra l'«ultimo rinnovo dell'accesso», non l'ultimo uso
  (sezione 13);
- revisione dei pasti nel web: matita e porzioni da 1 a 20 per ogni pasto, con
  ricetta, libero o vuoto; «Annulla» per 6 secondi nell'app, senza limiti lato server;
  comandi disattivati senza rete anche nel foglio già aperto (sezione 5).

**Decisioni dell'11–13 ottobre 2026, messa in produzione** (particolari in
`progetto/superpowers/specs/2026-10-11-messa-in-produzione.md`):

- iscrizioni libere spente in produzione: nel traguardo A gli account si creano solo
  dalla dashboard di Supabase (decisione dell'utente del 12 ottobre 2026; sezioni 1, 7 e
  13); restano spente anche nell'ondata 3, dove l'account lo crea l'invito (sotto);
- pubblicazione a mano con `npm run release` in due tempi, anteprima con impronta e
  applicazione dello stesso commit, migrazioni comprese, dopo il «vai» dell'utente; GitHub
  Actions si rivaluta quando i rilasci diventano frequenti (sezioni 1, 10 e 15);
- operazioni sulla produzione lanciate dal coordinatore con anteprima e impronta, SQL
  solo da una lista chiusa di script versionati, nessuna password negli argomenti dei
  processi, TLS verificato (sezione 1);
- import nel database in una transazione con anteprima, che porta anche il menu in corso
  e le impostazioni della famiglia; le preferenze condizionali dell'origine non
  diventano esclusioni (sezioni 2, 8 e 11);
- avvio a fasi e a finestra, con azzeramento prima dell'uso legato all'impronta di avvio
  al posto della rimozione della famiglia; ripiego sul PDF del progetto di origine
  (sezioni 8, 10 e 11);
- esito: primo rilascio il 12 ottobre, famiglia avviata e agenti collegati il 13
  ottobre; rotazione delle password rimandata dall'utente (sezione 10).

**Decisioni dell'utente del 13 ottobre 2026, accesso e inviti**
(sezione 7):

- **accesso principale con email e password**, dal traguardo A in poi e non come
  soluzione provvisoria: sull'iPhone la PWA installata sulla schermata Home non
  condivide cookie e archivio con Safari, quindi un link che apre Safari lascia lì la
  sessione. Niente link via email per entrare;
- l'invito crea l'account (iscrizioni libere spente): il link nell'email serve solo a
  scegliere la password, apre Safari una volta e poi si entra nell'app con email e
  password; lo stesso vale per la «password dimenticata», con recupero via email (raro,
  accettabile). Entrambi richiedono l'invio di email (Resend); con la decisione
  successiva dello stesso giorno (sotto) valgono solo dopo la verifica del dominio di
  invio;
- Google è una comodità facoltativa, da aggiungere solo dopo una prova sull'iPhone con
  l'app installata (sezione 15);
- il cambio della password dal Profilo (issue #37) torna ad alta priorità nel
  traguardo A, perché la password è la strada permanente.

**Decisioni del 13 ottobre 2026, cambio della password e aggiornamento della PWA
rilasciati** (particolari in `progetto/superpowers/specs/2026-10-13-cambio-password.md` e
`2026-10-13-aggiornamento-pwa.md`):

- cambio della password dal Profilo, senza email: password attuale, nuova di almeno 8
  caratteri e conferma; le altre sessioni si chiudono, agenti compresi. In produzione
  «Secure password change» spento (precondizione) e «Require current password when
  updating» acceso (sezioni 1, 7 e 13);
- le navigazioni restano servite dalla shell installata, non dalla rete; l'app passa da
  sola alla versione pubblicata ricaricandosi solo quando la pagina è libera, visibile e
  non toccata (sezione 1);
- la copia sul dispositivo usa `CACHE_SCHEMA` al posto della versione della build e
  sopravvive agli aggiornamenti dell'app (sezioni 1 e 6).

**Decisione dell'utente del 13 ottobre 2026, inviti senza email finché manca il dominio**
(sezione 7): il DNS di `qunidi.it` per ora non si può modificare, quindi Resend non può
verificare il dominio di invio e l'app non spedisce email (`workers.dev` non è un dominio
nostro). Fino ad allora l'invito all'app si accetta scegliendo la password direttamente
sulla pagina dell'invito, con il link mandato a mano dall'amministratore: è il flusso
dell'attività A dell'ondata 3, in produzione dal 15 ottobre 2026 (sotto). Inviti via email, «password dimenticata»
e allarmi via email di job ed esportazione aspettano il dominio (attività D). L'app
resta su `https://cosasimangia.qunidi.workers.dev`, con *Site URL* e *Redirect URLs*
sulla stessa origine: il dominio `cosasimangia.qunidi.it` serve solo a spedire, e
spostare l'app costringerebbe a reinstallare la PWA. Il trasferimento dell'app esce
dall'ondata 3 e richiederà una decisione distinta. **Superata il 17 ottobre 2026**
(sotto): app ed email su `cosasimangia.app`.

**Decisioni del 13–15 ottobre 2026, inviti all'app e famiglie nuove rilasciati**
(attività A dell'ondata 3, PR #45, rilasciata il 15 ottobre; particolari in
`progetto/superpowers/specs/2026-10-13-inviti-app.md`):

- la pagina dell'invito all'app chiede email, nome e password in un solo modulo: per chi
  entra da invito è il primo accesso, senza una schermata separata (Parte 1 e sezione 7);
- link con il token nel frammento, `/invite/app#<token>`, che non arriva mai al server;
  nel database solo l'impronta del token, quindi il link si vede solo alla creazione e
  nell'elenco c'è «Nuovo link» al posto di «Copia il link» del sesto giro (sezioni 7 e
  14);
- un solo messaggio per invito scaduto, revocato, usato o inesistente (sezione 7);
- l'account lo crea il Worker con l'API di amministrazione di Supabase Auth e una chiave
  segreta dedicata, letta da un solo modulo; un'accettazione ripresa non riscrive mai
  password, nome e lingua del primo tentativo riuscito (sezioni 1 e 7);
- operazioni senza utente con il ruolo `public` del contratto, solo web e con limiti di
  frequenza per IP (sezioni 1, 7 e 13);
- famiglia nuova con il wizard `/family/new` e `family.create`, anche via MCP; il menu
  nasce alla prima apertura; scheda di benvenuto con il solo «Sistema le impostazioni» e,
  su iOS in Safari, la nota per la schermata Home (sezioni 2, 4 e 7);
- iscrizioni libere spente anche nello stack locale (sezioni 1, 7 e 9).

**Decisioni del 15–16 ottobre 2026, amministrazione di utenti e ruoli rilasciata**
(attività B dell'ondata 3, issue #38, PR #47 unita il 15 ottobre e rilasciata il 16;
particolari in `progetto/superpowers/specs/2026-10-15-amministrazione-utenti.md`):

- sezione Utenti di `/admin` sopra «Inviti all'app», con ricerca per nome o email che
  ignora le maiuscole ma non gli accenti e al più 50 risultati, poi l'invito a
  restringere la ricerca; dettaglio con i due ruoli, le famiglie per solo nome e ruolo e
  «Questo è il tuo account» per il proprio, senza il numero di agenti collegati del
  prototipo (Parte 1 e sezioni 7 e 14);
- dal rilascio i ruoli di chi ha già un account si cambiano dall'app e via MCP, e
  valgono dalla richiesta successiva, anche per gli agenti già collegati (sezioni 1, 7 e
  13);
- dopo la rinuncia al proprio ruolo di amministratore si torna al Profilo senza avviso a
  comparsa, scostamento dal prototipo (sezioni 7 e 14);
- via MCP la conferma per nominare un amministratore o rinunciare al proprio ruolo sta
  nelle istruzioni dell'agente, come per la pubblicazione delle ricette (sezione 13);
- l'ultimo amministratore dell'app è protetto da un lucchetto consultivo che ogni
  percorso che toglie `app_admin` deve prendere nella stessa transazione, compresa la
  cancellazione di un account, ricontrollando sotto il lucchetto l'autorizzazione di chi
  chiama per l'operazione richiesta (sezioni 1, 2 e 7);
- **decisione dell'utente del 15 ottobre 2026**: la cancellazione degli utenti
  dall'amministrazione passa dall'attività B all'attività C, insieme alla cancellazione
  dell'account (Parte 1 e sezione 7).

**Decisioni del 16 ottobre 2026, gestione della famiglia unita** (attività C dell'ondata
3, PR #52 unita e rilasciata il 16 ottobre; particolari in
`progetto/superpowers/specs/2026-10-16-gestione-famiglia.md`):

- **decisione dell'utente del 16 ottobre 2026**: un link d'invito alla famiglia fa
  creare l'account a chi non ce l'ha, **al più a 10 persone per link**; oltre il tetto
  il link risponde, per la creazione, come un link non valido. Account e ingresso nella
  famiglia sono un solo passaggio con conferma esplicita; l'email scritta non è
  verificata fino al rilascio dell'attività D, che chiude il rischio (sotto), e fino ad
  allora un'email presa da altri si rimedia cancellando quell'account
  dall'amministrazione (Parte 1 e sezione 7);
- decisioni del coordinatore: il tetto conta le persone registrate con quel link;
  i link creati da una persona si revocano per tutti quando esce, viene rimossa, perde
  il ruolo o cancella l'account; registro degli ingressi per gli amministratori della
  famiglia; un ingresso diventato impossibile lascia l'account senza famiglia (sezioni
  2 e 7);
- link `/invite#<token>` visibile solo alla creazione, scostamento dal prototipo
  (sezioni 7 e 14);
- membri e ruoli, uscita con successore ed eliminazione della famiglia nelle forme del
  quarto giro, con l'ultimo amministratore della famiglia protetto nel database
  (sezioni 2 e 7);
- cancellazione dell'account e degli utenti in tre passi (prima transazione atomica,
  cancellazione in Supabase Auth dopo il commit, chiusura) con ripresa dal Cron Trigger
  orario; via MCP solo il collegamento quando eliminerebbe una famiglia (sezioni 1, 4,
  7 e 13);
- ordine unico dei lucchetti, ripetizione su `40P01` e `afterCommit` (sezioni 1 e 2).

**Decisioni del 16 ottobre 2026, foto delle ricette rilasciate** (W12, attività E
dell'ondata 3, issue #39, PR #54 unita e rilasciata il 16 ottobre; particolari in
`progetto/superpowers/specs/2026-10-16-foto-ricette.md`):

- **decisioni dell'utente**: la foto si aggiunge, si sostituisce e si toglie solo dalla
  scheda ricetta aperta, dai curatori («Aggiungi foto», pulsante «Foto» con il foglio
  «Sostituisci la foto» / «Togli la foto»), mai dalle schede compatte; nessuna
  provenienza della foto, né salvata né mostrata; l'agente può impostare una foto da
  qualunque indirizzo, di norma dalla pagina della fonte, dopo averla mostrata al
  curatore e ricevuto un sì esplicito (Parte 1 e sezioni 8, 13 e 14);
- una foto corrente per ricetta in `app.recipe_photos`, fuori dal documento e dalle
  versioni, con lo storico di chi l'ha caricata e da quale canale (sezione 2);
- bucket R2 privato `cosasimangia-photos`, chiavi casuali da 128 bit e rotta
  `/photos/<chiave>` senza autenticazione che serve solo le foto correnti; WebP da
  1600 px prodotto una volta al caricamento con il binding Images (sezione 1);
- caricamento dall'app solo web, impostazione da un indirizzo e rimozione anche via MCP
  (sezioni 1 e 13);
- cache delle foto solo nel service worker, cancellata all'uscita; esportazione con i
  soli riferimenti e oggetti mai cancellati in automatico (sezioni 1 e 8);
- foto popolate via MCP il 16 ottobre 2026: 46 ricette con la foto, 4 ancora senza
  (sezione 10).

**Decisioni dell'utente del 17 ottobre 2026, dominio `cosasimangia.app`** (PR #56 rilasciata il
17 ottobre, PR #57 unita senza nuovo rilascio; sezione 1):

- app ed email su `cosasimangia.app` al posto di `cosasimangia.qunidi.it`, con il DNS su
  Cloudflare nella zona dell'account di POWA; `www` rimanda al dominio con un 301;
  `workers.dev` spento;
- dominio verificato in Resend; *Site URL* e *Redirect URLs* di Supabase Auth solo sul
  nuovo dominio; SMTP personalizzato di Supabase Auth su Resend, mittente
  `Cosa si mangia <noreply@cosasimangia.app>` (sezioni 1 e 7);
- l'attività D non è più bloccata: i passi esterni sono fatti; la parte software è unita
  lo stesso giorno (sotto; sezioni 7 e 10).

**Decisioni del 17 ottobre 2026, email dell'app rilasciate** (W15, parte software
dell'attività D dell'ondata 3, PR #64 unita e rilasciata il 17 ottobre;
particolari in `progetto/superpowers/specs/2026-10-17-email.md`):

- **decisioni dell'utente**: chi accetta un invito, all'app o alla famiglia, senza avere
  un account scrive sulla pagina solo email e nome; il server crea l'account con l'email
  da confermare e gli spedisce l'email «Scegli la password», con il nome della famiglia
  solo nella prima; la password si sceglie su `/password`, poi si entra con email e
  password. Un solo meccanismo per i due inviti, con prenotazione e chiusura invariate:
  finisce il rischio accettato delle email non verificate. Il link d'invito si condivide
  a mano come prima e quello all'app non si spedisce per email; gli account creati prima
  di D restano come sono, e chi ha già un account entra con la sua password (Parte 1 e
  sezione 7);
- la persona compare subito tra i membri, o ha i ruoli dell'invito all'app, con
  l'etichetta «Non ha ancora confermato l'email», anche in `/admin`, finché non apre il
  link dell'email (la conferma avviene alla verifica del link, prima del salvataggio
  della password); la pagina dell'invito mostra «Controlla la posta» con «Rimanda l'email»
  (testo generico) e, per la famiglia, «Email sbagliata? Ricomincia»; chi conferma
  l'email senza salvare la password usa «Password dimenticata» (Parte 1 e sezione 7);
- **«Password dimenticata»** dalla pagina di accesso, con la stessa risposta che
  l'account esista o no, link di 24 ore verso `/password`, regole della password del
  Profilo, altre sessioni chiuse e, dopo il salvataggio, «Accedi» senza ingresso
  automatico; rischio noto accettato dell'endpoint pubblico di Supabase (sezione 7);
- le email sono nella lingua della persona: quella della pagina dell'invito per «Scegli
  la password», quella delle Preferenze per il recupero (sezione 12);
- **email operative** al referente per menu in ritardo o abbandonato, esportazione
  notturna mancante e cancellazione di un account bloccata: un'email per evento, meglio
  un doppione raro che un allarme perso, righe scadute o ambigue gestite a mano (sezioni
  4 e 8);
- ritorno indietro con una correzione in avanti; dopo un rollback i link spediti non
  valgono e si usa «Password dimenticata» (sezioni 1 e 7).

**Decisioni del 18 ottobre 2026, skill per Claude unita** (W17, PR #68 unita il 18
ottobre, rilasciata lo stesso giorno alle 09:22 UTC e collaudata; piano in
`progetto/superpowers/plans/2026-10-18-skill-claude.md`):

- **decisioni dell'utente**: una sola skill `cosa-si-mangia` per tutti i ruoli, in un
  solo `SKILL.md` in inglese; copre menu, famiglia, ricettario e amministrazione, non la
  spesa; si scarica come zip dalla sezione «Skill per Claude» di «Collega un agente»,
  visibile a tutti, con i passaggi per caricarla su claude.ai; niente prototipo (Parte 1
  e sezioni 13 e 14);
- le regole del ricettario restano solo in `catalogue_getGuide`: la skill vi rimanda
  senza copiarle; conferma esplicita prima delle azioni difficili da annullare
  (sezione 13);
- sorgente in `agent-skill/`, zip generato da `sync-assets` in `web/public/downloads/`,
  non versionato e servito come file statico; `/downloads/` fuori dalla cache del
  service worker; versione della pagina letta dalla skill; test che legano i nomi degli
  strumenti al contratto (sezioni 1 e 13).

---

## Parte 1: cosa fa l'app (per tutti)

### In una frase

Un'app sul telefono che ogni settimana prepara da sola il menu di pranzi e cene della
famiglia, lo lascia rivedere a tutti per qualche giorno e, quando serve, trasforma i pasti
scelti in una lista della spesa.

### Il nome

L'app si chiama **Cosa si mangia**: la domanda che ogni famiglia si fa, a cui l'app
risponde con il menu della settimana. Nel marchio (pagine di ingresso, titolo, icona) si
scrive con il punto di domanda, «Cosa si mangia?»; nel testo corrente e nei nomi da
digitare, come quello del connettore MCP, si scrive senza. Il nome resta uguale anche
nell'interfaccia in inglese britannico. I nomi tecnici del repository, di file e codice
non cambiano.

### Il problema che risolve

Decidere ogni settimana cosa mangiare è faticoso: bisogna ricordarsi cosa è piaciuto, non
ripetere sempre gli stessi piatti, mangiare in modo vario ed equilibrato, rispettare le
serate in cui c'è poco tempo o qualcuno non c'è, e poi ricavare la spesa. Oggi lo facciamo
parlando con un assistente AI una volta a settimana. L'app toglie questo passaggio: il menu
arriva già pronto, e la famiglia lo aggiusta insieme.

### Chi la usa

- **La Famiglia.** È il gruppo di persone che mangia insieme e condivide il menu. Chi crea
  la Famiglia la amministra e invia agli altri un link d'invito (anche su WhatsApp). Una
  persona può far parte di più Famiglie, per esempio dei nonni o di genitori separati.
  Chi apre il link entra come membro dopo una conferma esplicita; chi è stato rimosso
  da una famiglia può tornare solo con un link nuovo, creato dopo la rimozione. Un link
  vale 7 giorni, si può usare più volte e si vede solo quando lo si crea: se lo si
  perde se ne crea un altro. Chi non ha ancora un account lo crea dal link stesso ed
  entra subito nella famiglia; con lo stesso link si registrano al massimo 10 persone
  nuove (decisione dell'utente del 16 ottobre 2026). Come si sceglie la password è
  scritto sotto, «Si entra su invito».
  Ognuno può uscire da una famiglia quando vuole; se è l'ultimo amministratore e ci
  sono altri membri, sceglie chi lo diventa al suo posto.
- **L'amministratore della famiglia** gestisce membri, inviti e impostazioni di quella
  famiglia e può eliminarla dall'app web. Nomina altri amministratori, rimuove un membro
  (i suoi voti non contano più nella media e le sue modifiche restano come «ex
  membro»), revoca i link e vede chi è entrato con quale link e quando. I link creati da
  una persona smettono di valere quando esce, viene rimossa o non è più amministratore.
  Eliminare una famiglia rimuove i suoi dati per tutti i membri, ma conserva gli account
  delle persone e le altre famiglie a cui appartengono.
- **Si entra su invito.** L'iscrizione libera è spenta: l'account nasce quando una
  persona accetta un invito, a una famiglia o all'app, e sceglie la sua password; da lì
  entra nell'app con email e password (ondata 3, decisioni dell'utente del 13 ottobre
  2026). Chi invita manda a mano il link (per esempio su WhatsApp): l'app non spedisce
  il link d'invito. Con le email dell'app (attività D, unite e rilasciate il 17
  ottobre 2026) la persona scrive sulla pagina dell'invito solo la sua email e il suo
  nome (per un invito all'app l'email deve essere quella dell'invito); la pagina dice
  «Controlla la posta» e arriva l'email «Scegli la password», che per un invito alla
  famiglia nomina la famiglia. Il link apre Safari una volta: aprirlo dimostra che
  l'email è sua, e sulla pagina la persona sceglie la password; poi entra con email e
  password, anche nell'app installata. Se l'email non arriva la pagina dell'invito la
  rimanda, e per un invito alla famiglia «Email sbagliata? Ricomincia» riporta al modulo.
  Nel frattempo la persona compare già tra i membri, o ha già i ruoli dell'invito
  all'app, con la scritta «Non ha ancora confermato l'email», che sparisce quando apre il
  link dell'email; se poi non salva la password, usa «Password dimenticata». Chi ha già un account
  accede con la sua password e conferma l'ingresso. Chi ha dimenticato la password la
  recupera da solo con «Password dimenticata?» nella pagina di accesso: riceve un link
  valido 24 ore per sceglierne una nuova, dopo di che gli altri dispositivi e gli agenti
  collegati devono accedere di nuovo.
  Dal 15 ottobre
  2026 ci sono gli inviti all'app; dal 16 ottobre anche quelli alla
  famiglia. Chi ha un account crea la
  propria Famiglia, o un'altra dal Profilo, scegliendo nome e unità di misura, e trova
  il primo menu già pronto. Ognuno cambia la
  propria password dal Profilo, senza email, dando anche quella attuale; gli altri
  dispositivi e gli agenti collegati dovranno accedere di nuovo. Ognuno può anche
  cancellare il proprio account dalle Preferenze: si cancellano nome, email, voti e
  accessi, agenti compresi, mentre ricette pubblicate e modifiche ai menu restano;
  prima si sceglie un successore nelle famiglie che amministra da solo, e le famiglie di
  cui è l'unico membro vengono eliminate.
- **Il curatore del ricettario** è un ruolo assegnabile a un utente. Può collegare il
  proprio agente tramite MCP e aggiungere ricette con un percorso guidato. Essere membro
  o amministratore di una famiglia, da solo, non abilita questa funzione.
- **L'amministratore dell'app** gestisce utenti, ruoli e inviti a livello dell'intera
  applicazione. Inizialmente è Federico; il sistema deve permettere di aggiungerne altri.
  È distinto dall'amministratore di una singola famiglia.

### Quando apri l'app

L'app si apre sui **pasti di oggi**, perché è l'uso più comune: sapere cosa si mangia a
pranzo e a cena. Se oggi non c'è niente di pianificato, mostra i prossimi pasti in
programma.

Per ogni pasto si vedono:

- il nome del piatto e la sua descrizione breve;
- le porzioni;
- il voto;
- gli ingredienti, già calcolati per quelle porzioni.

Se la ricetta ha una fonte esterna (una pagina web o un video YouTube), da lì si apre la
ricetta completa, come oggi dal sito e dal QR del PDF. Per le ricette da libro si vedono
titolo del libro e pagine. I pasti liberi mostrano il loro testo ("pizza", "cena fuori").

Da qui si passa al resto della settimana, alla bozza della prossima e alla lista della
spesa.

### Una settimana tipo

**Mercoledì sera** l'app prepara il menu della settimana che comincia il lunedì
dopo: dodici pasti circa, con i pasti liberi già segnati (per esempio "sabato sera fuori",
"domenica pizza"). Se manca il menu della settimana in corso, per esempio per una
famiglia appena creata, l'app lo prepara quando lo si apre, con i soli pasti ancora da
fare.

Da quel momento tutti i membri della Famiglia possono rivederlo e cambiarlo. Non ci sono
finestre o vincoli per settimana: si può intervenire allo stesso modo sulla settimana
appena preparata, su quella in corso e su quelle passate, per esempio per correggere
cosa si è mangiato o rifare la spesa di un menu vecchio. Su qualsiasi pasto si può:

- cambiare il numero di porzioni;
- cambiare un piatto scegliendo tra cinque suggerimenti, chiedendone altri cinque con
  "proponimene altri", o cercando nel ricettario;
- segnarlo come pasto libero;
- scambiarlo con un altro pasto della stessa settimana;
- scrivere una nota;
- dire "non proporre più" per un piatto che non si vuole rivedere, e scegliere subito
  con cosa sostituirlo.

Ogni piatto mostra chi l'ha cambiato per ultimo e quando ("cambiato da Anna, venerdì
21:30"), così si sa sempre a chi chiedere. Subito dopo una modifica la si può annullare;
attraverso il proprio agente anche più tardi, finché nessuno ha cambiato di nuovo quel
pasto.

Un pasto passato conta sempre come mangiato. Se in realtà si è mangiato altro, si
corregge il pasto come qualsiasi altro: si cambia il piatto o lo si segna come libero.
Il mercoledì successivo l'app prepara la
settimana dopo e il ciclo ricomincia.

### Come sceglie i piatti

A comporre il menu sono regole chiare e le preferenze della Famiglia, non l'intelligenza
artificiale. In via sperimentale, e solo se si dimostra utile, un modello AI può fare da
**giudice**: l'app prepara alcune settimane diverse, tutte già valide, e il giudice indica
la più riuscita nel complesso. Il giudice non sceglie i singoli piatti e non può infrangere
le regole.

- **Equilibrio.** Punta a una settimana varia e sana secondo le linee guida italiane per
  una sana alimentazione (CREA): pesce un paio di volte, legumi circa tre volte, carne rossa
  al massimo una, verdure a ogni pasto, pochi fritti.
- **Niente cose troppo simili troppo vicine.** Non solo lo stesso piatto: evita anche due
  pasti di fila con lo stesso ingrediente principale (salmone, ceci, pollo) o lo stesso tipo
  di piatto (due wok, due torte salate), anche a cavallo tra una settimana e l'altra.
- **Gusti.** Preferisce i piatti con più stelline in Famiglia e alterna piatti già
  conosciuti (circa 60%) a piatti nuovi da provare (circa 40%).
- **Regole di casa.** Rispetta gli ingredienti da evitare o da limitare, i piatti "da non
  proporre più", i pasti liberi, i tempi massimi di certe serate e le regole della Famiglia
  (per esempio "venerdì pesce", "niente pasta a cena").

Quando un membro cambia un piatto a mano l'app non blocca e non segnala niente: le regole
servono a comporre il menu e i suggerimenti, non a giudicare le scelte della Famiglia
(deciso il 6 ottobre 2026).

### Le stelline

Il voto è legato al piatto, non a un pasto: ogni membro può dare da una a cinque stelle a
qualsiasi piatto in qualsiasi momento, dalla scheda del piatto o da un pasto del menu, e
può cambiare idea quando vuole. Il voto della Famiglia su un piatto è la media dei voti dei
suoi membri. È quello che l'app usa per scegliere.

Il voto si vede sempre, ovunque compaia un piatto: nel menu, nei suggerimenti, nella ricerca
e nella scheda del piatto. Si vedono la media della Famiglia e il proprio voto. Dal menu e
dalla scheda si vota, o si cambia il proprio voto, direttamente; nei suggerimenti il voto
si legge soltanto.

### La lista della spesa

Gli ingredienti di ogni pasto sono sempre visibili, già calcolati per le porzioni di quel
pasto. Ogni settimana ha **la sua lista della spesa**, che si apre dalla borsa in alto
nel Menu mentre si guarda quella settimana:

1. la lista contiene tutti i pasti della settimana e li segue: se un pasto cambia, le
   voci si aggiornano da sole; somma gli ingredienti uguali, li divide per reparto e
   mette da parte olio, sale, spezie e gli ingredienti che la famiglia evita;
2. le quantità sono quelle che si comprano: pezzi interi (½ peperone → 1), il succo di
   limone in limoni;
3. si spunta ciò che si ha già in casa o che si è comprato, anche in negozio senza rete:
   tutta la famiglia vede le spunte; si possono aggiungere voci libere (detersivo…);
4. si può esportare: condivisione (WhatsApp, Note…), anche senza rete, oppure invio a
   Bring!, che richiede la rete; il PDF arriverà in una fase successiva (sezione 10).

Non ci sono altre liste né un archivio: le settimane passate tengono la loro lista,
consultabile dal Menu.

### Il ricettario

È unico per tutta l'app. Contiene le ricette da siti web, video YouTube e libri, con
ingredienti verificati sulla fonte. Le ricette di un libro vengono proposte solo alle
famiglie che dichiarano di avere quel libro. Non ci sono ricette private di una famiglia:
un piatto o è nel ricettario, e lo vedono tutti, o non c'è.

Il catalogo aggiornato vive nel database. Un curatore può chiedere al proprio agente di
aggiungere una ricetta: l'agente raccoglie le informazioni e fa le domande necessarie.
Prima di pubblicare mostra al curatore la scheda completa, con le traduzioni, e
pubblica solo dopo un sì esplicito. La ricetta entra nel catalogo solo quando il
servizio verifica che tutti i dati richiesti
sono presenti e validi, compresi i testi in italiano e inglese britannico. Gli ingredienti
non vengono mai dedotti dal nome del piatto. Elenco verificato degli ingredienti,
quantità e unità quando applicabili e porzioni di riferimento sono necessari anche per
pubblicare una ricetta importata dal vecchio progetto. Le indicazioni esplicite come
"q.b." restano ammesse.

Il lavoro incompleto può essere **salvato come bozza** e ripreso in seguito. Le bozze
sono visibili anche in una sezione dell'app dedicata alla gestione del ricettario e non
vengono proposte nei menu né usate per la spesa finché non sono pubblicate. Sono
condivise e modificabili da tutti i curatori, mostrando autore e ultima modifica. Se due
curatori salvano la stessa bozza, chi arriva secondo viene avvisato e sceglie quale
versione tenere: nessuno sovrascrive il lavoro dell'altro senza saperlo.

Ogni ingrediente di una ricetta è un prodotto del catalogo (Pomodori, Uva) e può avere
una **varietà** scritta liberamente, solo quando cambia cosa si compra («Roma», «gialla
senza semi»); non serve un elenco di varietà preparato in anticipo. La lista della
spesa tiene separate le varietà diverse.

È previsto anche un **percorso manuale nell'app**, da realizzare per ultimo: un curatore
può compilare una ricetta, salvare o modificare una bozza e pubblicarla; se mancano
dati, la pubblicazione non avviene e il modulo mostra cosa correggere. Questo percorso
non usa AI: il sistema controlla i dati inseriti. Il percorso consigliato resta quello
con il proprio agente via MCP. Il caricamento da file non è previsto per ora. La
consultazione delle bozze nell'app resta prevista già nel percorso iniziale di gestione
del ricettario tramite MCP.

Ogni curatore può modificare **tutto il ricettario**, anche le ricette inserite da altri.
Una modifica nasce come bozza collegata alla ricetta: le famiglie continuano a vedere la
versione pubblicata finché la modifica non è completa e pubblicata. Ogni pubblicazione
crea una nuova **versione**; i pasti già mangiati restano come erano, mentre oggi, i
pasti futuri e la lista della spesa usano subito la versione nuova. Una ricetta che non
serve più si **archivia**: esce dal ricettario e dai suggerimenti, resta leggibile nei
pasti e si può riportare nel ricettario.

Il sistema deve consentire il recupero dagli errori tramite backup e ripristino; il
curatore può aprire una versione precedente di una ricetta e ripristinarla, mentre il
recupero dell'intero catalogo è riservato agli amministratori dell'app (sezione 8).

Dal 16 ottobre 2026 una ricetta può avere **una foto**, che si vede in cima alle schede
del menu, del ricettario e dei suggerimenti e nella scheda ricetta; senza foto le schede
restano come prima. La foto si aggiunge, si sostituisce e si toglie **solo dalla scheda
ricetta aperta**, e solo dai curatori: «Aggiungi foto» quando manca (sul telefono si
può scattarla o sceglierla dalla libreria), il pulsante «Foto» sulla foto per
sostituirla o toglierla. Le schede compatte non hanno comandi per la foto. Non si
indica da dove viene la foto (decisione dell'utente del 16 ottobre 2026). Cambiare la
foto non crea una nuova versione della ricetta: i pasti passati mostrano la foto
attuale.

### Lingua e unità di misura

Ogni persona sceglie la propria lingua: **italiano o inglese britannico**. La scelta
riguarda l'esperienza dell'app, comprese le informazioni del ricettario e della spesa.
Ciò che scrive la famiglia (note, pasti liberi, voci libere della spesa) resta come è
stato scritto, senza traduzione (sezione 12). La ricerca
nel ricettario usa la lingua di chi cerca, compresi i sinonimi degli ingredienti.

Ogni famiglia sceglie il **sistema metrico o quello imperiale britannico**. Le quantità
devono essere convertite di conseguenza nei pasti, nella spesa e nelle esportazioni.
La lingua e le unità sono indipendenti: si può usare l'inglese con misure metriche.

### Usare l'app attraverso il proprio agente

Un utente può collegare un agente compatibile tramite MCP e usare le operazioni
dell'app attraverso di esso: consultazione, modifiche, voti, spesa, impostazioni e
gestione della famiglia. Curatori e amministratori dell'app accedono anche alle
operazioni previste per i loro ruoli. I permessi sono gli stessi dell'accesso web.

**Eccezione confermata:** eliminare una famiglia richiede l'app web. Se lo chiede
all'agente, MCP non esegue l'eliminazione e restituisce un URL per aprire la pagina
appropriata e confermare esplicitamente l'operazione. Aprire il link non cancella nulla.
La stessa regola vale quando cancellare un account comporterebbe l'eliminazione di
una famiglia di cui la persona è l'unico membro.

Con un link d'invito alla famiglia, chi ha già un account può entrare anche
dall'agente, che chiede prima conferma; un account nuovo invece si crea solo sulla
pagina dell'invito (gestione della famiglia, dal 16 ottobre 2026).

Un curatore può chiedere al proprio agente di mettere la foto a una ricetta: l'agente
la cerca di norma sulla pagina della fonte, ma può prenderla da qualunque sito; prima di
impostarla la mostra al curatore e procede solo dopo un sì esplicito, come per la
pubblicazione (decisione dell'utente del 16 ottobre 2026). L'agente può anche
sostituirla o toglierla; caricare un file dal telefono si fa invece dall'app.

Dal 18 ottobre 2026 (PR #68) «Collega un agente»
offre anche una **skill per Claude** da scaricare: un file da caricare una volta su
claude.ai, che insegna a Claude a usare l'app secondo i ruoli della persona (menu,
famiglia, ricettario e amministrazione, non la spesa) e a chiedere un sì prima delle
azioni difficili da annullare. Dopo il caricamento c'è anche nell'app Claude sul
telefono, con il connettore già collegato. Quando la versione mostrata nella pagina
cambia, la si scarica e la si carica di nuovo.

Il browser può servire per collegare l'account o autenticarsi nuovamente; l'uso quotidiano
deve poter avvenire tramite l'agente. Una pagina dell'app, «Collega un agente» nel
Profilo, dà l'indirizzo del servizio e i passaggi per ciascun client supportato, con
comandi o configurazioni da copiare, ed elenca gli agenti collegati, che si possono
scollegare. Quando un agente chiede l'accesso, il browser mostra chi si collega, con
quale account e cosa potrà fare; l'utente consente o annulla (sesto giro del prototipo).

I testi dicono la verità sui poteri dell'agente (12 ottobre 2026): agisce con l'account
della persona, come se fosse lei, e può anche cambiare la password e chiudere le sue
sessioni, nel browser e degli altri agenti; eliminare una famiglia resta possibile solo
nell'app. «Scollega» revoca l'autorizzazione e le sessioni di quell'agente, non gli
accessi ottenuti in altro modo: se l'agente ha cambiato la password, la si cambia. Per
questo si consente solo agli agenti di cui ci si fida.

### Amministrare l'app

Una pagina riservata agli amministratori dell'app permette di gestire **gli utenti e
gli inviti di tutta l'applicazione**: invitare persone, cambiare ruoli e cancellare
utenti. Deve comprendere l'assegnazione del ruolo di curatore e la possibilità di
nominare altri amministratori dell'app. Le stesse operazioni sono disponibili via MCP,
salvo le cancellazioni di account che eliminerebbero anche una famiglia: in quel caso
MCP rimanda alla pagina dell'app, senza eseguire la cancellazione.

Gli amministratori dell'app possono inoltre riportare l'intero ricettario com'era in
un momento passato. Questo recupero riguarda il catalogo, senza ripristinare i dati
privati delle famiglie: le ricette tornano com'erano come nuova versione, quelle nate
dopo quel momento vengono archiviate, e prima di confermare si vede un'anteprima.

Gli inviti all'app e quelli a una famiglia hanno scopi distinti. Un invito all'app
chiama una persona precisa e può darle il ruolo di curatore o di amministratore quando
accetta, ma non la fa entrare in una famiglia. Regole decise nel sesto giro del
prototipo, sezione 7. Dal 15 ottobre 2026 la pagina c'è con la sezione degli inviti
all'app: il link si vede solo quando si crea l'invito, e se lo si perde se ne crea uno
nuovo. Il link si manda a mano: l'app non lo spedisce per email, nemmeno dopo
l'attività D (decisione dell'utente del 17 ottobre 2026).

Dal 16 ottobre 2026 sopra gli inviti c'è la sezione **Utenti**: si cerca una persona
per nome o per email (maiuscole e minuscole non contano, gli accenti sì) e, se i
risultati sono più di 50, l'app chiede di restringere la ricerca. Toccando una persona
se ne apre la scheda, con l'email, i due ruoli da accendere o spegnere (curatore del
ricettario e amministratore dell'app) e le famiglie di cui fa parte, solo per nome e
ruolo, senza i loro contenuti. Con le email dell'app (attività D) chi ha un account nato
da un invito e non ha ancora confermato l'email (la conferma avviene aprendo il link
dell'email, prima del salvataggio della password) compare con «Non ha ancora confermato
l'email», nell'elenco e nella scheda. Nominare un amministratore e rinunciare al proprio ruolo
chiedono una conferma; chi rinuncia torna al Profilo e non vede più la pagina. L'ultimo
amministratore non può perdere il ruolo: prima se ne nomina un altro. Un ruolo
cambiato vale subito, anche per gli agenti già collegati. Se si prova a invitare
un'email che ha già un account, l'app offre di aprire quella persona. Le stesse
operazioni si fanno dal proprio agente. Il ripristino del ricettario arriva dopo,
nell'ondata 3 (sezione 7).

La cancellazione degli utenti è arrivata con la gestione della famiglia e la
cancellazione dell'account (decisione dell'utente del 15 ottobre 2026; unita e rilasciata il 16 ottobre). Dalla scheda di una persona,
«Cancella l'utente» apre
la stessa pagina della cancellazione dell'account, detta in terza persona: le sue
famiglie una per una, con la scelta del successore dove serve, cosa si cancella e cosa
resta. Il proprio account si cancella solo dalle proprie Preferenze. Se la
cancellazione non si completa subito, la persona compare con «Cancellazione in corso» e
l'amministratore può completarla. Dopo la cancellazione gli inviti all'app di quella
persona restano nell'elenco senza email, con «account cancellato».

### Cosa l'app non fa (per ora)

- Non inventa ingredienti o ricette. Nella generazione automatica del menu l'AI, se
  attiva, fa solo da giudice tra settimane già valide. Questo vincolo non impedisce
  all'agente dell'utente di aiutarlo nelle modifiche manuali o nella cura del ricettario.
- Non permette di aggiungere ricette senza il ruolo di curatore.
- Non carica ricette da file: si aggiungono tramite l'agente o dal modulo dei curatori.
- Non espone uno storico completo delle modifiche ai pasti (si mostra solo l'ultima).
- Non manda notifiche sui menu; restano le email per scegliere o recuperare la password
  e le segnalazioni all'operatore del servizio (menu in ritardo o abbandonato,
  esportazione notturna mancante, cancellazione di un account bloccata).

---

## Parte 2: design tecnico

### 1. Architettura

Verificata dopo il prototipo e decisa l'8 ottobre 2026. Il prototipo ha spostato il
baricentro dal client al server: bozze con conflitti, versioni, ripristini,
amministrazione, cancellazioni vincolate, parità MCP e spesa offline richiedono uno
strato applicativo vero, non un client che scrive direttamente nel database protetto
da RLS con poche funzioni di contorno, come previsto nella base del 29 settembre.

**Struttura:**

```
meal_planner_2/
├── prototype/                    prototipo Svelte, riferimento dei percorsi approvati
├── contract/                     contratto delle operazioni: schemi, errori, metadati
├── domain/                       TypeScript puro: pianificatore, unità, spesa,
│                                 validazione, schema del documento ricetta, versioni
├── server/                       Worker: implementazione delle operazioni, MCP, job
├── web/                          React (Vite, TanStack Router e Query), PWA mobile-first
├── supabase/migrations/          schema SQL, funzioni transazionali e policy RLS
├── scripts/                      importazione, esportazione, ripristino dei backup,
│                                 report del pianificatore
└── progetto/                     spec, piani, regole di progetto
```

`domain/`, `contract/`, `server/` e `web/` sono workspace npm (`@app/...`) che esportano
i sorgenti TypeScript, senza build intermedie; `scripts/` resta nella radice. Vitest è
configurato per workspace.

**Componenti:**

- **Interfaccia: React come SPA** costruita con Vite, con TanStack Router per le rotte e
  TanStack Query per dati, cache e mutazioni. Installabile come PWA; il service worker
  serve la consultazione offline e la coda della spesa (sezione 6). Non serve il
  rendering lato server: l'app è dietro accesso e le poche pagine pubbliche (inviti)
  leggono operazioni pubbliche. Token e componenti seguono `design/`; il codice del
  prototipo Svelte si riscrive, mentre la logica di dominio TypeScript e i suoi test si
  riusano. Rotte di TanStack Router definite nel codice, senza plugin delle rotte da
  file; stili in CSS puro con token e moduli CSS. Le attese dei dati usano il componente
  condiviso `web/src/components/Skeleton.tsx` (W20, PR #75; sezione 14), senza
  dipendenze nuove.
- **Server in un Worker di Cloudflare** (runtime Workers con l'opzione
  `nodejs_compat`), che serve anche la SPA come file statici dallo stesso dominio
  (deciso l'8 ottobre 2026 al posto di Netlify). **Contratto con oRPC, senza Hono**
  (deciso l'11 ottobre 2026: poche dipendenze e architettura semplice per pochi
  utenti): oRPC serve da solo RPC e OpenAPI, lo smistamento delle poche rotte è una
  funzione `fetch` del Worker e gli strumenti MCP si generano percorrendo il contratto
  con l'SDK ufficiale di MCP. Dipendenze del server: oRPC, zod, Postgres.js, `jose` e
  l'SDK di MCP; niente ORM. Esito della prova in `spike/REPORT.md` (branch
  `prove-tecniche`). Espone tutte le rotte server:

  | Rotta | Consumatore | Contenuto |
  |---|---|---|
  | `/api/rpc/*` | App web | Operazioni con tipi condivisi end-to-end |
  | `/api/*` e `/api/openapi.json` | Test, documentazione, eventuali client futuri | Stesse operazioni in forma REST documentata, generata dal contratto |
  | `/mcp` | Agenti | Strumenti MCP generati dal contratto (sezione 13) |
  | `/shopping-lists/<token>` | Bring! | Pagina HTML con JSON-LD resa dal server (sezione 6) |
  | `/photos/<chiave>` | App web, agenti, curatori | Foto corrente di una ricetta, senza autenticazione, dal bucket delle foto (dal 16 ottobre 2026, sotto) |
  | `/downloads/cosa-si-mangia.zip` | Chi collega Claude | Zip della skill per Claude: file statico degli asset, non una rotta del Worker (PR #68, rilasciata il 18 ottobre 2026; sotto) |

  La SPA arriva dagli asset statici di Workers con ripiego su `index.html`; il Worker
  si esegue per primo solo sulle rotte del server (`/api/*`, `/mcp`, `/.well-known/*`,
  `/photos/*`). Lo zip della skill è un file degli asset: viene servito come file anche a
  una navigazione, senza il ripiego su `index.html` (`server/test/asset-routing.test.ts`).
  Il job settimanale non ha una rotta: è l'evento `scheduled` di un Cron Trigger del
  Worker (sezione 4); lo stesso evento, con un'espressione cron sua, avvia
  l'esportazione notturna (sezione 8).

- **Supabase sul piano gratuito**: Postgres, Auth (email e password; Google
  facoltativo dopo una prova sull'iPhone; server OAuth 2.1 per MCP; sezione 7), RLS e `pg_cron` (solo per
  pulire le liste temporanee di Bring!).
  Il piano gratuito non comprende i backup della piattaforma: li sostituisce
  un'esportazione notturna cifrata, scritta dal Worker in un bucket R2 privato
  nell'UE (sezione 8). Server OAuth configurato con il percorso di autorizzazione
  `/authorize` (la pagina di consenso della SPA), la registrazione dinamica dei client
  attiva e la Site URL sull'origine dell'app; in locale in `supabase/config.toml`. Il
  Worker conosce la chiave pubblica del progetto (`SUPABASE_PUBLISHABLE_KEY`, valore
  pubblico in `wrangler.jsonc`), che il gateway di Supabase chiede per lo scollegamento
  degli agenti (sezione 13). Il repository è collegato all'organizzazione
  Supabase tramite l'integrazione GitHub, con «Deploy to production» disattivato
  (verificato con l'utente l'11 ottobre 2026): il merge su `main` non applica le
  migrazioni al progetto remoto. **In produzione** (progetto `lronuqvtjdhfyychnscr`)
  le iscrizioni libere sono spente (`disable_signup`, sezione 7) e OAuth server,
  registrazione dinamica, *Site URL* e *Redirect URLs* sull'indirizzo dell'app si
  attivano **prima del primo rilascio**, che ne controlla i metadati: il Worker serve
  quelli di `/mcp` leggendoli da Supabase. Con le iscrizioni spente l'OAuth server
  funziona comunque, perché gli agenti accedono con utenti già esistenti (documentazione
  di Supabase Auth, verificato in produzione il 13 ottobre 2026 collegando Claude
  Code). Restano spente anche nell'ondata 3: l'account lo crea il server
  all'accettazione di un invito (sezione 7), con l'API di amministrazione di Supabase
  Auth e una **chiave segreta dedicata**, `SUPABASE_SECRET_KEY` (segreto del Worker,
  chiave `worker-invitations` creata dall'utente e revocabile da sola, 15 ottobre 2026),
  letta solo dal modulo `server/src/accounts/`. Senza il segreto il resto dell'app
  funziona e l'accettazione risponde `internal`. Con le email dell'app (PR #64) lo
  stesso modulo crea l'account senza password e con l'email da confermare, ottiene il
  link per scegliere la password con `POST /auth/v1/admin/generate_link` di tipo
  `recovery` (non spedisce nulla e, per un'email senza account, risponde 404 senza
  creare utenti) e allinea `user_metadata.locale` quando cambia la lingua del profilo;
  nei metadati di Auth restano solo nome e `locale`, mai uno stato dell'app, perché due
  scritture concorrenti dei metadati possono perdere una chiave. *Site URL* e *Redirect URLs* stanno
  sull'origine effettiva dell'app, `https://cosasimangia.app` dal 17 ottobre 2026, solo
  sul nuovo dominio (prima `https://cosasimangia.qunidi.workers.dev`, con il dominio
  `cosasimangia.qunidi.it` previsto solo per spedire; decisione dell'utente del 13
  ottobre 2026, superata il 17). Dal 17 ottobre 2026 Supabase Auth spedisce con un
  **SMTP personalizzato su Resend** (`smtp.resend.com:465`, utente `resend`, una chiave
  API dedicata di solo invio limitata al dominio), mittente
  `Cosa si mangia <noreply@cosasimangia.app>`, impostato dall'utente; una prova con un
  magic link è arrivata correttamente.
  Per il cambio della password dal Profilo (sezione 7) «Secure password change» è
  **spento** in produzione, come precondizione: senza email non c'è riautenticazione.
  «Require current password when updating» l'ha acceso l'utente il 13 ottobre 2026; il
  minimo di lunghezza della password in produzione non è verificato, la SPA impone 8.
  L'opzione non blocca la pagina `/password` delle email dell'app, perché Supabase non
  la applica alle sessioni di recupero (provato sullo stack locale, sezione 9). Con la
  PR #64 la durata del codice delle email (`mailer_otp_exp`) è di 86400 secondi, cioè
  24 ore, e restano i limiti di Auth del progetto (30 email all'ora, un recupero al
  minuto per indirizzo); il template `recovery` di Supabase Auth, in italiano e inglese
  britannico, serve solo alla «Password dimenticata» e porta a
  `/password#token_hash=…&type=recovery` (passi esterni nel runbook della spec di
  dettaglio `2026-10-17-email.md`, sezione 9).
  Dal 15 ottobre 2026 (PR #45) anche lo stack locale ha le iscrizioni spente, come la
  produzione: `[auth] enable_signup = false`, mentre `[auth.email] enable_signup` resta
  acceso, perché nella CLI spegnerebbe l'intero provider email e con esso l'accesso con
  password. Le persone di prova si creano con l'API di amministrazione e la chiave
  segreta locale. `minimum_password_length = 8`; la CLI non esprime in `config.toml`
  l'opzione della password attuale, che nello stack resta spenta: la prova obbligatoria
  con l'opzione accesa usa un secondo servizio di Auth (sezione 9). Dalla PR #64 lo stack
  ha `enable_confirmations = true`, `otp_expiry = 86400`, `max_frequency = "60s"`, il
  template di recupero e Mailpit acceso anche in CI; le email del server vanno a Mailpit
  con `MAILPIT_API_URL`, che esiste solo in locale e in CI, mai in produzione.
- **Flusso Git**: PR verso `main`, che è la produzione; CI su GitHub Actions a ogni PR
  con typecheck, test e migrazioni reali.
- **Pubblicazione con `npm run release`** (decisa l'11–12 ottobre 2026 nella messa in
  produzione; supera l'automazione prima del traguardo A, per scelta dell'utente): il
  coordinatore la lancia a mano dopo il merge, in due tempi. `--preview` non scrive
  nulla: controlla repository (`main` pulito, uguale a `origin/main`, CI verde),
  coerenza del progetto Supabase fra configurazioni, configurazione del Worker e
  segreti richiesti, impostazioni di Auth (iscrizioni spente, metadati OAuth), costruisce
  SPA e Worker con i valori fissati, elenca le migrazioni pendenti e la versione
  pubblicata e stampa un'**impronta del rilascio** (commit, ambito, destinazione del
  database, account e Worker). Dopo il «vai» dell'utente, `--apply <impronta>` ripete i
  controlli, si ferma se l'impronta è cambiata, applica le migrazioni con la CLI di
  Supabase su una destinazione verificata (`db push`, sempre prima del deploy), pubblica
  il Worker con il tag del commit e verifica che risponda proprio la versione nuova. La
  prima volta le migrazioni vanno da sole (`--migrations-only`), perché i ruoli del
  server nascono dalle migrazioni. Variabili `CLOUDFLARE_*`, `WRANGLER_*`, `VITE_*` e
  file d'ambiente locali sono rifiutati o neutralizzati. `npm run deploy` resta il passo
  interno di `release`, non un comando da lanciare a mano in produzione. GitHub Actions
  si rivaluta quando i rilasci diventano frequenti (sezione 15). Ritorno indietro:
  `wrangler rollback` alla versione precedente se le migrazioni successive sono
  additive, altrimenti correzione in avanti; niente migrazioni «down».
- **Operazioni sulla produzione** (messa in produzione, 11–12 ottobre 2026): le lancia il
  coordinatore, sempre dopo un'anteprima che non scrive e stampa un'impronta di ciò che
  verrà applicato e dopo il «vai» dell'utente; l'applicazione si rifiuta, prima di
  collegarsi, se l'impronta è cambiata, ed esegue gli stessi byte mostrati
  nell'anteprima, dal commit corrente con checkout pulito. Le credenziali stanno in
  `.env.production.local`, scritto dall'utente e letto solo dagli strumenti
  (`--credentials`); il progetto di destinazione è in un solo file versionato
  (`scripts/production-target.json`), che si cambia solo con una PR; le connessioni si
  costruiscono dai campi validati della destinazione, con TLS verificato
  (`verify-full`). **Nessuna password negli argomenti dei processi**: solo nel file
  delle credenziali, in `PGPASSWORD` dei processi figli e nelle dashboard; la password
  di origine di Hyperdrive la inserisce l'utente nella dashboard di Cloudflare. **SQL
  sulla produzione solo da una lista chiusa di script versionati** in
  `supabase/scripts/`, eseguiti da `scripts/prod-sql.ts` con la transazione decisa
  dallo strumento. La build di rilascio legge URL e chiave pubblica di Supabase da
  `web/.env.production`, versionato, e rifiuta override locali. La rotazione delle
  password è prevista a fine collaudo; il 13 ottobre 2026 l'utente l'ha rimandata.
- **Collegamento al database con Hyperdrive**, il pool di connessioni di Cloudflare,
  con Postgres.js e query SQL scritte a mano, validate con zod. La cache delle query di
  Hyperdrive resta disattivata: le letture dipendono dall'utente tramite RLS e devono
  arrivare al database. La stringa di connessione sta nella configurazione di
  Hyperdrive, non nel codice. Origine: il Session pooler di Supabase (porta 5432,
  raggiungibile in IPv4 sul piano gratuito), con il limite di connessioni di Hyperdrive
  esplicito e sotto la dimensione del pool di Supabase: con il valore di default (20)
  la prova dell'11 ottobre ha avuto richieste appese sotto carico, con 10 nessun errore.
  Il Worker si chiama `cosasimangia` ed è servito dal dominio personalizzato
  `https://cosasimangia.app` (dal 17 ottobre 2026; prima
  `https://cosasimangia.qunidi.workers.dev`, ora spento); Hyperdrive
  (`cosasimangia`, creato dall'utente nella dashboard con la password di `app_server`)
  ha `origin_connection_limit` esplicito, in produzione 10: il pool di Supabase (15)
  meno 5 per migrazioni, strumenti e dashboard.
  Nel codice del Worker le cache di modulo conservano solo dati già risolti, mai
  promesse di I/O condivise fra richieste, che Workers annulla.
- **Email con Resend** (sezione 7): SMTP di Supabase Auth e API per le email del server.
  Il dominio `cosasimangia.app` è verificato in Resend dal 17 ottobre 2026 (DKIM
  `resend._domainkey`, MX e SPF su `send.`, DMARC `p=none`) e l'SMTP di Supabase Auth è
  configurato (sopra). Le email dell'app sono la parte software dell'attività D (PR
  #64, unita e rilasciata il 17 ottobre 2026; particolari nella spec di
  dettaglio `2026-10-17-email.md`, sezioni 2 e 5): l'email «Scegli la password» dopo un
  invito e «Rimanda l'email» le spedisce il Worker con l'API di Resend
  (`server/src/mail/`, una sola chiamata `fetch`, senza SDK), con il link di
  `generate_link`; la «Password dimenticata» la spedisce Supabase Auth con il suo SMTP e
  il template `recovery`; le email operative le spedisce il Worker con la stessa API
  (sezione 4). Segreti del Worker: **`RESEND_API_KEY`**, chiave Resend di solo invio
  limitata al dominio e distinta da quella dell'SMTP di Supabase, **obbligatoria per il
  rilascio** (senza, le accettazioni rispondono che l'email non è partita), e
  **`OPS_ALERT_EMAIL`**, l'indirizzo del referente, mai salvato nel database. Mittente
  `Cosa si mangia <noreply@cosasimangia.app>`. **Ritorno indietro** dopo il rilascio:
  correzione in avanti, perché con un `wrangler rollback` i link già spediti puntano a
  `/password`, che la versione precedente non ha; chi li ha ricevuti usa poi «Password
  dimenticata».
- **Foto delle ricette** (W12, PR #54, rilasciata il 16 ottobre 2026; particolari nella
  spec di dettaglio `2026-10-16-foto-ricette.md`): bucket R2 `cosasimangia-photos`
  nella giurisdizione `eu`, privato, senza dominio `r2.dev` né dominio personalizzato,
  binding `PHOTOS`, separato da quello delle esportazioni. Chiave dell'oggetto
  `photos/<22 caratteri base64url>.webp`, 128 bit casuali generati dal Worker a ogni
  caricamento; un oggetto non si riscrive mai. La rotta `/photos/<chiave>` serve le foto
  **senza autenticazione e senza URL firmati**, che cambierebbero nel tempo e
  romperebbero copia sul dispositivo e cache del service worker: le foto sono del
  ricettario, non dati di una famiglia, e la chiave non si indovina. La rotta applica un
  limitatore per IP (`PHOTO_READ_LIMIT`, `namespace_id` `9103`, 300 richieste ogni 60 s,
  poi `429`), valida la forma della chiave, chiede al database con `app.served_photo`
  (ruolo `anon`) se è la foto **corrente** di una ricetta, bozze comprese, e solo allora
  legge R2; una foto tolta o sostituita risponde `404`. Intestazioni:
  `Cache-Control: private, no-store` (nessuna cache HTTP che l'app non possa svuotare;
  l'offline lo dà solo il service worker, sotto), `nosniff`,
  `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`, `ETag`. **Formato salvato: WebP**, lato
  lungo al più 1600 px, qualità 80, una sola misura per schede e scheda ricetta,
  prodotta **una volta al caricamento** con il binding Images di Cloudflare (`IMAGES`,
  piano Free, mai trasformazioni alla lettura); in ingresso solo JPEG, PNG e WebP (AVIF
  è riservato al piano Enterprise; SVG e GIF rifiutati), lato corto almeno 400 px, al
  più 10 MB. Prima del caricamento dall'app il browser riduce l'immagine a 2048 px in
  JPEG con `createImageBitmap` e un `<canvas>`, senza librerie: meno dati su rete mobile
  e niente metadati (posizione GPS compresa). `PHOTOS` e `IMAGES` sono facoltativi
  nell'ambiente: senza, i caricamenti rispondono `internal` e la rotta `404`.
- **Skill per Claude** (W17, PR #68, unita e rilasciata il 18 ottobre 2026;
  prodotto e test nella sezione 13): sorgente unica `agent-skill/cosa-si-mangia/SKILL.md`,
  alla radice del repository perché la leggono i test del server e la build del web, e
  lontana da `.claude/skills/`, che sono le skill di chi sviluppa. Lo zip
  `cosa-si-mangia.zip`, con la cartella `cosa-si-mangia/` in cima come chiede claude.ai,
  lo genera `web/scripts/sync-assets.mjs` a ogni `predev` e `prebuild` in
  `web/public/downloads/`, **non versionato** (`web/.gitignore`). Lo scrive
  `web/scripts/skill-zip.mjs` con `node:zlib` (deflate e `crc32`) e una data fissa, così
  gli stessi file danno lo stesso zip: nessuna dipendenza nuova. Vite lo serve in
  sviluppo, la build lo copia in `dist` e il Worker lo serve come **file statico**, fuori
  da `run_worker_first`, senza modifiche al server. Il service worker lascia
  **`/downloads/` sempre alla rete** (`passthrough` in `web/src/pwa/sw-rules.ts`), anche
  per una navigazione: un download può arrivare come navigazione e riceverebbe la shell,
  e una copia in cache resterebbe ferma a una versione vecchia; per questo lo zip sta
  fuori da `/assets/`. La versione mostrata nella pagina la legge `web/vite.config.ts`
  dalla riga `Skill version: AAAA-MM-GG` del `SKILL.md` (`__SKILL_VERSION__`): senza la
  riga la build si ferma.
- **Un solo runtime.** Il modulo `domain/` gira solo nel Worker: il job settimanale non
  usa un'Edge Function e non serve la compatibilità con Deno. `domain/` resta
  TypeScript puro, senza dipendenze dal runtime.
- **Il database è la fonte di verità del catalogo.** Le scritture avvengono attraverso
  operazioni autorizzate e validate sul server. Importazioni ed esportazioni YAML non
  costituiscono una seconda copia modificabile da sincronizzare automaticamente.

**Strato delle operazioni.** Ogni funzione dell'app è un'operazione applicativa
(`menu.getWeek`, `shopping.setItemChecked`, `catalogue.publish`…), non un accesso
generico alle tabelle. Le operazioni stanno in `contract/src/`, divise per area
(`profile`, `family`, `recipes` con `ratings`, `menu`, `meals`, `shopping`,
`catalogue`, `agents`); il
prototipo le abbozzava in `prototype/src/lib/operations/`. L'implementatore del server
si costruisce in un solo punto, `server/src/router.ts`, e ogni area esporta un factory
che lo riceve. Ogni operazione autenticata segue lo stesso percorso:

```
Worker → verifica del JWT di Supabase → contesto (utente, canale, lingua)
     → permessi: appartenenza alla famiglia o ruolo globale; limiti di frequenza
     → transazione Postgres → dominio puro → registro (meal_changes, canale)
     → vista localizzata
```

Le operazioni `public` (pagine degli inviti all'app e alla famiglia) seguono un percorso separato, sotto
in «Operazioni senza utente»: limitatore per IP, nessuna verifica del token né della
sessione, transazioni brevi `anon` aperte dal gestore.

L'istante della richiesta si fissa una volta nel contesto. Un'operazione può dichiarare
un passo `prepare`, eseguito nella transazione dell'utente dopo i controlli di sessione e
ruolo e prima del calcolo della versione: può validare l'input contro lo stato del server
e scrivere (la generazione pigra del menu, sezione 4).

- **Token verificati nel Worker** con le chiavi pubbliche del progetto Supabase
  (`/auth/v1/.well-known/jwks.json`, libreria `jose`), tenute in memoria: non serve un
  segreto condiviso fra Cloudflare e Supabase. Requisito: chiavi di firma asimmetriche
  nel progetto Supabase. L'app web ottiene il token con il login della libreria di
  Supabase nel browser, gli agenti dal server OAuth (sezione 13). Claim obbligatori e
  validati: `exp`, `sub` e `session_id` (UUID); `client_id` assente oppure non vuoto,
  altrimenti `unauthorized`, mai il canale web.
- **Query nel ruolo dell'utente.** Ogni operazione autenticata apre una transazione e imposta per
  prima cosa `set local role authenticated` e `set_config('request.jwt.claims', …, true)`
  con i campi del token verificato, così `auth.uid()` e le policy valgono come per
  l'utente. Le impostazioni durano solo la transazione e non passano ad altre richieste
  che riusano la stessa connessione del pool. Il token non arriva a Postgres. L'utenza
  tecnica è un solo login `app_server` (NOINHERIT), membro di `authenticated`, `anon`,
  `app_job` e `app_backup`; ogni transazione sceglie il ruolo: utente → `authenticated`
  con i claim, job settimanale → `app_job`, pagina Bring! e pagina dell'invito all'app
  → `anon` tramite funzioni per token, esportazione notturna → `app_backup` (NOLOGIN, BYPASSRLS, sola lettura
  su `app`, utenti di Auth dalla funzione `security definer` `app.backup_auth_rows()`;
  sezione 8). La
  password si imposta a mano sul progetto, fuori dalle migrazioni. Tabelle e funzioni
  stanno nello schema `app`, non esposto dalla Data API di Supabase, così nessun client
  scrive saltando le operazioni; `EXECUTE` è revocato a PUBLIC su ogni funzione e
  concesso per ruolo.

- **Permessi su due livelli con compiti distinti.** L'RLS resta la garanzia
  dell'isolamento fra famiglie e del confine dei ruoli globali anche per le query del
  server, che girano con l'identità dell'utente. Le regole dei flussi (ultimo
  amministratore, conflitti, completezza, eccezioni solo web) stanno nelle operazioni.
  Il meccanismo del ruolo dell'utente, descritto sopra, è stato provato l'11 ottobre 2026
  tramite Hyperdrive con due utenti e 120 richieste concorrenti, senza dati scambiati.
- **Transazioni.** Le operazioni che toccano molte righe (pubblicazione, ripristini,
  eliminazione di una famiglia) sono atomiche, in una transazione o in una funzione
  Postgres. Della cancellazione di un account è atomica la prima transazione, che
  cancella tutti i dati dell'app; la cancellazione in Supabase Auth avviene dopo il
  commit ed è riprendibile (sezione 7). Le transazioni degli utenti girano in `read committed`: il
  ricontrollo sotto il lucchetto dell'ultimo amministratore dell'app (sezioni 2 e 7) ha
  bisogno di vedere ciò che chi aveva il lucchetto prima ha confermato, e un test lo
  verifica (PR #47); passare a `repeatable read` lo romperebbe. **Ordine dei
  lucchetti** (gestione della famiglia, PR #52; regola per ogni percorso presente e
  futuro, sezione 2): `app_admin_roles` (solo per chi può togliere `app_admin`) →
  lucchetto dell'utente → lucchetto dell'email → righe delle famiglie in ordine di id →
  link alla famiglia → prenotazioni → il resto, con il ricontrollo di chi chiama e
  delle condizioni sotto i lucchetti. Impostare o togliere la foto di una ricetta (PR
  #54) blocca prima la riga di `app.recipes` e poi scrive in `app.recipe_photos`
  («il resto»), così due sostituzioni concorrenti si serializzano e vince l'ultima. Le modifiche ordinarie di una famiglia (pasti,
  spesa, impostazioni) bloccano prima le proprie righe e poi la famiglia nel trigger di
  versione: contro l'eliminazione di una famiglia o di un account può nascere un ciclo
  che Postgres interrompe con `40P01`. Per questo le tre operazioni di cancellazione
  (`family.delete`, `account.delete`, `users.delete`, elenco `RETRY_ON_DEADLOCK` in
  `server/src/pipeline.ts`) ripetono la transazione una volta, rifacendo da capo
  sessione, ruolo e gestore; la modifica ordinaria che perde riceve il suo errore.
- **Lavoro dopo il commit** (`afterCommit` in `server/src/pipeline.ts`, PR #52): un
  gestore può restituire un seguito che la pipeline esegue dopo il commit, senza
  connessioni aperte, e il cui risultato diventa la risposta; un suo errore non annulla
  né ripete la transazione. Serve alla cancellazione dell'account, che chiama Supabase
  Auth solo dopo aver confermato la prima transazione (sezione 7), e dalla PR #64 a
  `profile.update`, che dopo un cambio di lingua allinea `user_metadata.locale` in Auth
  (un fallimento scrive solo un log).
- **Canale ricavato dal token.** Le sessioni dell'app web non hanno il claim
  `client_id`, i token rilasciati agli agenti dal server OAuth di Supabase sì: è il
  modo verificabile, richiesto dalla sezione 13, per distinguere web e MCP senza fidarsi
  di un parametro dell'agente.
- **Revoca immediata.** Un JWT resta valido fino alla scadenza anche dopo la
  cancellazione di un account (sezione 17): le operazioni autenticate verificano a ogni richiesta
  che l'utente esista e che l'accesso dell'agente non sia stato revocato. La verifica è
  `app.session_is_active()` sulla sessione del token, anche all'ingresso di `/mcp` per
  `initialize` e `tools/list`, prima della risposta `web_only`; appartenenze e ruoli si
  leggono a ogni query, quindi una rimozione dalla famiglia o la revoca del ruolo di
  curatore valgono subito con lo stesso token. Così anche i ruoli globali cambiati
  dall'amministrazione (area `users`, dal 16 ottobre 2026): `checkRole` chiama
  `app.has_role` a ogni richiesta, i ruoli non stanno nel token e valgono dalla
  richiesta successiva, nel web e per gli agenti già collegati, senza rinnovo della
  sessione. Scollegare un agente cancella in Supabase
  le sessioni di quel client per quell'utente, quindi questo controllo basta a rifiutare
  subito i suoi token non scaduti, senza un controllo del grant a ogni richiesta
  (verificato l'11 ottobre 2026 e provato in CI, sezione 13). **Cancellazione di un
  account** (PR #52): la prima transazione cancella il profilo, quindi da quel momento
  ogni token dell'utente, del web o di un agente, riceve `unauthorized`; la
  cancellazione definitiva in Supabase Auth (`DELETE /auth/v1/admin/users/{id}` senza
  cancellazione morbida) toglie poi a cascata sessioni, identità, consensi e
  autorizzazioni OAuth, senza scritture dell'app nello schema `auth`.

**Contratto delle operazioni.** Il contratto è la fonte unica della forma dell'API per
app web, MCP, coda offline e test. Si scrive separato dall'implementazione, con schemi
di validazione condivisi con `domain/`. Regole:

- **Ogni operazione dichiara** input, output, errori possibili con i relativi dati e
  metadati: obbligatori esposizione MCP (`mcp`), accodabile offline (`offline`) e ruolo
  richiesto (`role`: `user`, `familyMember`, `familyAdmin`, `curator`, `appAdmin`,
  controllati con le funzioni del database, oppure `public`, sotto); facoltativi
  riservata al web con URL di rimando (`webOnly`), contatori da cui la lettura dipende
  (`reads`), righe create (`creates`) e limite di frequenza (`rateLimit`). Un test
  verifica che ogni operazione abbia una scelta esplicita di esposizione.
- **Operazioni senza utente** (inviti all'app, 15 ottobre 2026): ruolo `public`, ammesso
  da `contract/src/check.ts` solo con `mcp: false`, senza `reads` né `webOnly` e con
  `rateLimit` obbligatorio (`read` o `accept`), che vale solo per loro; in OpenAPI
  l'operazione non richiede l'autenticazione. Per queste la pipeline applica per primo il
  limitatore per IP (`CF-Connecting-IP`), non legge il token né la sessione, non
  controlla ruoli e **non apre una transazione**: il gestore, tramite
  `publicContext(context)`, apre transazioni brevi nel ruolo `anon` (`anonDb`), così
  nessuna connessione resta occupata durante una chiamata a Supabase Auth (Hyperdrive
  restituisce la connessione al pool solo a fine transazione). I dati arrivano solo da
  funzioni `security definer` per impronta del token, eseguibili da `anon`; `checkRole`
  rifiuta con `internal` un'operazione pubblica arrivata per errore al controllo dei
  ruoli. Dalla gestione della famiglia (PR #52) sono `public` anche lettura e
  accettazione dell'invito alla famiglia (`familyInvitations.get` e `.accept`), con gli
  stessi limitatori degli inviti all'app; dalla PR #64 anche
  `appInvitations.resendPasswordEmail` e `familyInvitations.resendPasswordEmail`
  (`rateLimit: 'accept'`).
- **Email dell'app** (PR #64, unita il 17 ottobre 2026; particolari nella spec di
  dettaglio `2026-10-17-email.md`, sezioni 2 e 7): `appInvitations.accept` e
  `familyInvitations.accept` non chiedono più la password (una `password` mandata da
  un client vecchio si scarta) e rispondono con l'email normalizzata e `passwordEmail`
  (`sent`, `failed`, `too_soon`, `not_needed`, `not_sent`, `unavailable`); sparisce
  `weak_password`. Le due `resendPasswordEmail` (`{ token, email, locale }`) rimandano
  l'email con il testo generico. `family.get` (membri), `users.list` e `users.get`
  ricevono `emailUnconfirmed: boolean`, letto da `auth.users.email_confirmed_at`.
  `VersionScope` riceve l'ambito `emailUnconfirmed`, usato solo da `family.get`: la
  versione comprende un'impronta delle coppie (membro, non confermato), che cambia anche
  a conteggio invariato. `profile.update` ha il seguito dopo il commit per la lingua
  (sopra).
- **Amministrazione degli utenti** (PR #47, 16 ottobre 2026; particolari nella spec di
  dettaglio `2026-10-15-amministrazione-utenti.md`, sezione 2): area `users` con
  `users.list` (`{ query? }`, al più 50 righe e `more`, senza cursore), `users.get`
  (utente con `lastAppAdmin` e famiglie con solo `name` e `role`) e `users.setRole`
  (idempotente, risponde con il dettaglio aggiornato), tutte con ruolo `appAdmin` e
  `offline: false`. Dopo la rinuncia al proprio `app_admin` i ruoli della risposta sono
  quelli letti dalla funzione del database sotto il lucchetto, perché chi chiama non
  può più rileggerli.
- **Gestione della famiglia** (PR #52, unita e rilasciata il 16 ottobre 2026; particolari nella spec
  di dettaglio `2026-10-16-gestione-famiglia.md`, sezione 2): area nuova
  `familyInvitations` (`list`, `create`, `revoke`, `listJoins`, `status`, più `get` e
  `accept` pubbliche); nell'area `family` `join`, `setMemberRole`, `removeMember`,
  `leave`, `getDeletion` e `delete` (`webOnly`); area nuova `account` (`getDeletionPlan`,
  `delete`); nell'area `users` `getDeletionPlan` e `delete`, con il campo facoltativo
  `deletion` nelle righe e nel dettaglio per un account in attesa. `account.delete` e
  `users.delete` rispondono `{ completed }`: falso se la cancellazione in Auth è fallita
  e resta da riprendere (sezione 7).
- **Foto delle ricette** (PR #54, rilasciata il 16 ottobre 2026; particolari nella spec
  di dettaglio `2026-10-16-foto-ricette.md`, sezione 5): nell'area `catalogue`, ruolo
  `curator`, tutte `offline: false`, `catalogue.uploadPhoto` (`{ id, recipeId, file }`,
  **solo web** con `mcp: false`, perché MCP non trasporta file; il file arriva in
  multipart con il protocollo RPC di oRPC), `catalogue.setPhotoFromUrl`
  (`{ id, recipeId, imageUrl }`, anche MCP) e `catalogue.removePhoto` (`{ recipeId }`, a
  stato assoluto, anche MCP); le prime due rispondono con `{ recipeId, photo: { id,
  url, width, height } }`. Idempotenza sull'`id` scelto dal client; la foto si imposta
  su ricette in bozza, pubblicate e archiviate. **Limite del corpo prima del parser**:
  oRPC tiene i file in memoria, quindi `route` legge da sé, con un limite di 10 MiB più
  64 KiB, il corpo di ogni richiesta multipart sotto `/api/` e di quelle dirette ai
  percorsi di `uploadPhoto`, prima di verificare il token, e oltre il limite fa
  rifiutare la richiesta da un interceptor con `invalid` (stato 413) e l'issue
  `photo_too_large`, serializzato da oRPC per ciascun trasporto. **Scaricamento da un
  indirizzo** controllato: solo `https:`, niente credenziali né porte diverse da 443,
  niente IP letterali, nomi interni o l'origine dell'app, al più 3 redirect rivalidati,
  10 s e 10 MB; nessun cookie o token inviato. Errori con i codici esistenti: `invalid`
  sul campo (`file` o `imageUrl`) con un codice fra `photo_type`, `photo_too_small`,
  `photo_too_large`, `photo_unreadable`, `photo_url` e `photo_unreachable`;
  `not_found`; `forbidden`. Il lavoro di rete avviene dentro la transazione
  dell'utente, prima della scrittura della riga: un fallimento dopo la scrittura in R2
  lascia un oggetto orfano, mai un riferimento senza oggetto. Le viste delle ricette
  (riepilogo, quindi ricettario, scheda, menu e suggerimenti), i risultati di
  `catalogue.searchRecipes` e la vista della bozza ricevono il campo facoltativo
  `photoUrl`: relativo nell'app, assoluto via MCP con l'origine della richiesta, `null`
  senza foto e, nelle viste delle famiglie, per una ricetta mai pubblicata.
- **Viste già pronte.** Le letture restituiscono testi nella lingua dell'utente,
  quantità scalate e convertite nel sistema della famiglia, voti (media e proprio) e
  ultima modifica: web e MCP mostrano gli stessi contenuti e il client resta sottile.
  Le viste di una ricetta (riepilogo, voto, righe scalate) sono dell'area `recipes` e le
  riusano Menu e Spesa; si leggono sempre dal documento immutabile della versione,
  caricato con la riga della ricetta in una sola istruzione, così una pubblicazione in
  corso non mescola versioni. Ricerca, filtri e ordinamento del ricettario sono una
  funzione pura nel Worker sui documenti caricati in blocco sotto RLS, senza filtri SQL
  né estensioni nuove.
- **Errori a codici, non testi**: `forbidden`, `not_found`, `invalid` con il percorso
  dei campi, `conflict` con autore, momento e campi cambiati e il tipo (`draft`,
  `version`, `ingredient`), `not_allowed` (409) con il motivo per le regole di stato
  (`cited_by_meals`, `not_published`, `already_current`; per l'annullamento dei pasti
  `not_own_change`, `changed_since`, `draft_closed`) e un testo generico neutro,
  `last_admin`,
  `last_app_admin`, `sole_member`, `web_only` con l'URL della pagina; dagli inviti
  all'app (15 ottobre 2026) `invitation_unavailable` (410, invito non più valido per
  qualunque motivo), `rate_limited` (429) e i motivi `account_exists` e
  `already_accepted` di `not_allowed`; dall'amministrazione degli utenti (16 ottobre
  2026) `last_app_admin` e `not_found` di un utente arrivano dai codici SQLSTATE `P0A08`
  e `P0A07` delle funzioni del database (sezione 2), tradotti dal server; dalla gestione
  della famiglia (PR #52) i codici `P0A09`–`P0A15` (ultimo amministratore della
  famiglia → `last_admin`, unico membro → `sole_member`, piano di cancellazione cambiato
  → `conflict`, proprio account dall'amministrazione → motivo `own_account` di
  `not_allowed`, successore non valido → `invalid` sul campo, persona non membro →
  `not_found`, cancellazione via agente che eliminerebbe una famiglia → `web_only`). Il web li
  traduce; per MCP il server li rende nella lingua dell'utente. I codici sono in
  minuscolo con il loro stato HTTP; la validazione restituisce `invalid` su tutti i
  canali, MCP compreso (la fa oRPC, non l'SDK di MCP); il codice di una `refine` del
  contratto è il suo messaggio, quando è un identificatore (per esempio
  `password_too_long`), al posto di `custom`; `internal` porta un `requestId` e
  i log contengono campi scelti, mai segreti.
- **Concorrenza dichiarata.** Le bozze portano la revisione di partenza e ricevono
  `conflict` se superata (sezione 8); i pasti seguono l'ultimo salvataggio: ogni
  scrittura dell'area `meals` è un'azione con un `id` scelto dal client e risponde con
  la settimana aggiornata, l'azione e se ha cambiato qualcosa (`{week, actionId,
  changed}`); la vista del pasto dice chi ha cambiato e quando e, per chi legge, se
  l'ultima azione è annullabile e quali pasti tocca (`lastChange` con `actionId`,
  `undoable`, `slotIds`; sezione 5).
- **Idempotenza.** Le creazioni e le operazioni accodabili offline portano un
  identificativo generato dal client: ripetere la stessa richiesta non duplica nulla.
  Le operazioni accodabili sono a stato assoluto (spuntare con `checked: true`, non
  invertire la spunta); lo schema usa chiavi naturali univoche dove si crea una riga,
  senza una tabella generica delle ricevute. Le creazioni del ricettario si serializzano
  con un lucchetto consultivo, così uuid e slug restano idempotenti anche con richieste
  concorrenti; una revisione ripresa da `catalogue.startRevision` è ricordata per
  richiesta (`recipe_draft_requests`, sezione 2). Anche le azioni sui pasti sono
  ricordate per richiesta (`meal_actions`, sezione 2), comprese quelle senza effetti:
  ripetere una richiesta che non ha cambiato nulla non sovrascrive le modifiche fatte
  nel frattempo da altri. Le mutazioni della spesa e delle
  impostazioni rispondono con la vista aggiornata; nella spesa vale l'ordine di arrivo
  al server.
- **Famiglia esplicita.** Le operazioni di famiglia ricevono `familyId`, perché una
  persona può far parte di più famiglie; utente e canale arrivano solo dal token.
  Gli UUID dell'input si normalizzano in minuscolo nel contratto (`idSchema`), così la
  grafia non cambia la riga indicata né il riconoscimento delle ripetizioni.
- **Letture dalla copia sul dispositivo** (deciso l'8 ottobre 2026). Ogni famiglia ha
  un contatore di versione che cresce a ogni modifica dei suoi dati (pasti, spesa, voti,
  impostazioni, membri, settimana nuova); il ricettario ne ha uno suo, comune a tutte
  le famiglie. Le letture restituiscono la versione e ricevono quella già posseduta dal
  client: se non è cambiata, il server risponde che la vista è invariata senza
  ricalcolarla né trasferirla. La risposta sta nel contratto, non in HTTP 304 con `ETag`
  (deciso l'11 ottobre 2026): l'input porta `knownVersion` facoltativo, l'output è
  `{unchanged: true, version}` oppure `{unchanged: false, version, data}`, con la
  versione come stringa opaca. Il client conserva le risposte sul dispositivo (cache
  persistita di TanStack Query in IndexedDB), le mostra subito all'apertura e verifica
  la versione all'apertura, al ritorno in primo piano e alla riconnessione. Le proprie
  modifiche non aggiornano la copia in modo ottimistico: applicano alle viste della
  stessa famiglia il risultato confermato dal server, dopo aver annullato le letture in
  corso di quelle viste, e fanno rileggere le liste che dipendono dal valore cambiato,
  secondo una tabella per operazione (per le azioni sui pasti il bersaglio è la
  settimana del pasto e scadono apertura, spesa, ricette e suggerimenti; i suggerimenti
  scadono anche con esclusioni, impostazioni, libri, ingredienti evitati e voti; dettagli
  in `2026-10-11-revisione-pasti.md`). Una risposta superata da un'altra modifica della
  stessa vista o da un cambio di lingua non si scrive: marca scadute le viste. Vale
  anche fra mutazioni diverse: un voto confermato mentre un'azione sul pasto è in corso
  rende superata la risposta dell'azione, che porterebbe il voto vecchio, e la
  settimana si rilegge (revisione dei pasti nel web, 12 ottobre 2026). Lo stesso vale
  per le foto (PR #54): un contatore per sessione delle modifiche confermate del
  ricettario (`catalogueChangesConfirmed`), che cresce a ogni caricamento o rimozione
  riuscita, rende superata la risposta di un'azione sul pasto partita prima, e la
  settimana si rilegge. Le mutazioni delle foto non sono ottimistiche: fanno rileggere
  ricette, menu, suggerimenti e area `catalogue`.
  `users.setRole` ha nel registro delle mutazioni del web un bersaglio `users` che, come
  quello degli inviti all'app, non scrive la risposta nella cache in modo generico: fa
  rileggere le query `['users']` e il profilo; la pagina del dettaglio scrive la
  risposta solo se è la più recente per quell'utente (tracciamento `users:<id>`, PR #47).
  Ciò che dipende solo dall'ora, come i pasti già passati, si calcola sul dispositivo:
  le viste portano date e istanti dei pasti (`passesAt`) e tutti i pasti futuri di una
  ricetta, e la pagina aperta si ricalcola al prossimo istante. Dove l'ora cambia i dati
  (versione R1 dei pasti in `menu.getWeek` e `shopping.getWeekList`), la versione
  comprende il numero di pasti già passati; quella di `menu.getOpening` comprende la
  data effettiva. `profile.get`, le letture della gestione che dipendono dalle bozze e
  `meals.getSuggestions` (la classifica usa anche i voti globali, che nessun contatore
  segue), `agents.list` (i dati cambiano in Supabase Auth) e, dalla gestione della
  famiglia, l'elenco dei link d'invito e il registro degli ingressi (dipendono anche da
  prenotazioni e scadenze) non sono versionate. Gli
  agenti MCP leggono sempre dal server. I contatori (`families.data_version` e
  `catalogue_state.version`) crescono con trigger del database quando una transazione
  cambia i dati da cui dipendono, al massimo una volta per transazione: una scrittura
  senza effetti può farli crescere, con un'invalidazione in più ma mai dati sbagliati.
  Voti e nomi fanno crescere tutte le famiglie dell'utente, una bozza citata dai pasti le
  famiglie che la citano; le bozze non toccano il contatore del ricettario. La versione
  restituita compone i soli contatori dichiarati dall'operazione (`reads`), la lingua e
  la versione del Worker. L'etichetta «Non ha ancora confermato l'email» dei membri
  (PR #64) dipende da Supabase Auth, che nessun contatore segue: `family.get` aggiunge
  l'ambito `emailUnconfirmed`, un'impronta delle coppie (membro, non confermato) letta
  da una funzione del database (sezione 2).
- **Copia e sessione sul dispositivo** (app web di base, 11 ottobre 2026). La cache usa
  `@tanstack/react-query-persist-client` con un persister IndexedDB scritto a mano: una
  copia per utente, legata alla sessione e cancellata a ogni chiusura, `buster` sulla
  costante `CACHE_SCHEMA` (13 ottobre 2026, al posto della versione della build: la copia
  sopravvive agli aggiornamenti dell'app; le copie con `buster` in forma di data ISO
  valgono come schema `'1'`; quando cambiarla è scritto sotto, «Modifiche solo
  additive»), `maxAge` di 7 giorni. Una sola procedura chiude la sessione
  (Esci, uscita da un'altra scheda, cambio d'utente); `unauthorized` porta a un rinnovo
  e poi al login, `forbidden` rimuove le viste di quella famiglia, con un segno di
  revoca rispettato da ogni scrittura e ripristino della copia. Revoche e uscite passano
  alle altre schede con `BroadcastChannel`; un'uscita annunciata da un'altra scheda
  chiude la sessione subito, prima di aggiornare l'identità, così nessuna risposta in
  volo (per esempio di un consenso agli agenti) la usa ancora. Le risposte arrivate
  dopo l'uscita o dopo un cambio di lingua si scartano. **Famiglie sparite** (gestione
  della famiglia, PR #52; particolari nella spec di dettaglio
  `2026-10-16-gestione-famiglia.md`, sezione 3, «Dati sul dispositivo»): oltre al
  `forbidden`, revocano una famiglia sul dispositivo l'uscita, l'eliminazione e ogni
  profilo letto in cui una famiglia del profilo precedente manca; un `forbidden` su
  un'operazione riservata agli amministratori della famiglia, dopo una retrocessione,
  rilegge profilo e famiglia senza revocarla. Il segno di revoca diventa un record per
  utente e famiglia con due istanti, `revokedAt` e `restoredAt`, fusi col massimo fra
  le schede: la famiglia è revocata se `revokedAt > restoredAt`, e un rientro
  autorizzato (risposta di `family.join` o di `family.create`, profilo letto che la
  contiene) scrive subito `restoredAt` con l'istante d'inizio della richiesta. Le viste
  in cache portano `producedAt`, l'istante d'inizio della richiesta che le ha prodotte
  (una risposta «invariato» non lo rinnova); una risposta o una conferma della spesa
  iniziata prima di una revoca non entra mai nella cache né nella copia salvata, e ogni
  revoca ricevuta toglie comunque i dati salvati prima di quell'istante. Offline, se la sessione non si può rinnovare, la copia
  resta consultabile in sola lettura fino alla riconnessione, salvo la lista della spesa
  (sezione 6). Offline, una pagina coperta dagli skeleton senza copia salvata (W20,
  PR #75, sezione 14) mostra lo skeleton fermo, senza pulsazione, sotto il banner
  offline: la query è in pausa (`fetchStatus` `paused`) e riparte da sola al ritorno
  della rete; vale anche per il controllo della famiglia senza profilo salvato
  (`useFamily` espone la pausa). Il cambio della password (`changePassword` di `AuthBackend`, sezione 7)
  non passa dal client supabase-js e non emette eventi: verifica la password attuale con
  un accesso di prova diretto (`/auth/v1/token`), revocato con il suo token e, se la
  revoca fallisce, con un secondo tentativo; se falliscono entrambi per assenza di rete
  la sessione di prova può restare sul server fino alla sua scadenza (limite accettato).
  Poi cambia con `PUT /auth/v1/user` e il token della sessione letta all'inizio,
  controllando l'identità (utente e `session_id`) prima del cambio e dopo un rifiuto,
  mai dopo un successo; `session_expired` mostra il messaggio della sessione scaduta e
  porta all'uscita comune con il pulsante «Accedi di nuovo», non da sola. Allo stesso
  modo la pagina `/password` delle email dell'app (PR #64) non usa il client condiviso
  di Supabase e **non adotta sessioni**: verifica il codice del frammento con una
  chiamata diretta a `/auth/v1/verify`, tiene solo in memoria il token della verifica,
  salva la password con `PUT /auth/v1/user` legato a quel token e poi lo scarta; nel
  browser non si scrive nessuna sessione e si entra da `/login`. La pagina è occupata
  dalla richiesta di verifica finché conserva un token utilizzabile, anche dopo un
  salvataggio fallito, così l'aggiornamento della PWA non la ricarica a metà.
  Service worker scritto a mano, senza plugin (aggiornamento della PWA, 13 ottobre 2026):
  **navigazioni dalla shell installata** della versione attiva, rete solo se manca dalla
  cache, rotte del server mai intercettate. Sostituisce le navigazioni dalla rete con
  ripiego sulla shell: shell e asset dalla stessa cache completa e verificata rendono
  impossibili per costruzione le versioni mescolate, cioè file di rilasci diversi nella
  stessa pagina, e le pagine bianche che ne derivano, senza timeout né guardie (non è
  una garanzia contro gli altri errori dell'app). Il precache è legato alla build:
  elenco dei file dentro `sw.js` (niente più
  `/precache.json`) e versione in `<meta name="app-version">` di `index.html`, verificata
  all'installazione; si scrive in cache solo dopo aver scaricato e verificato tutto, con
  un segno di completezza per ultimo, e una cache completa della stessa versione si
  riusa. I font non hanno hash: chi ne cambia il contenuto ne cambia il nome. Dopo il
  precache il worker chiama `skipWaiting()`, senza `clients.claim()`; Cache Storage tiene
  le ultime tre versioni per le pagine rimaste aperte. La pagina si registra con
  `updateViaCache: 'none'`, chiama `registration.update()` all'avvio e al ritorno in
  primo piano, recuperando la registrazione se il primo tentativo è fallito, e **si
  ricarica quando la versione del worker attivo è diversa dalla sua**,
  senza banner, solo se è libera, visibile e non toccata dall'ultimo ritorno in primo
  piano; altrimenti al ritorno successivo. Un limite in `sessionStorage` evita i
  ricaricamenti senza convergenza. Scartati il banner «Aggiorna», che si può ignorare per
  sempre, e il passaggio solo all'apertura a freddo, perché su iOS l'app sospesa
  resterebbe vecchia. **Pagina occupata**: scritture fuori da TanStack Query contate con
  `trackBusy` (password, lingua, uscita, accesso, lettura e decisione delle richieste
  degli agenti, porzioni salvate all'uscita dal Menu, scrittura della coda della spesa,
  segno di famiglia revocata) e controlli registrati con `useBusyCheck` (mutazioni
  TanStack in corso, «Annulla» offerto, porzioni, voce della spesa o nuova password
  ancora da inviare, coda della spesa non vuota), più un foglio aperto o il cursore in un
  campo di testo. Chi aggiunge una scrittura fuori da TanStack Query o una bozza solo in
  memoria fuori da un foglio la registra come «occupata». Il rollback automatico vale
  solo fra versioni con questo meccanismo: per tornare ad A₀, la versione precedente
  al nuovo meccanismo, bisogna chiudere tutte le finestre dell'app. La prima apertura
  offline dell'app installata
  è garantita dalla seconda visita. **Foto** (PR #54): strategia a parte per `/photos/*`,
  prima la cache e poi la rete, in una cache dedicata `cosasimangia-photos-v1` non
  legata alla build, esclusa dalla rotazione delle versioni e mai nel precache; solo
  risposte `200` di tipo `image/*`, al più 300 foto, poi si tolgono le più vecchie; è
  l'unica cache delle foto. Alla chiusura della sessione la cache delle foto si
  cancella, e un numero d'epoca impedisce a una risposta arrivata durante l'uscita di
  ricrearla. Restano due limiti dichiarati: le copie salvate fuori dall'app non sono
  revocabili, e una foto mai vista non è disponibile offline (la scheda torna alla
  forma senza foto). Le query
  usano `queryOptions` scritte a mano con chiavi `[area, operazione, input]` e la lingua
  nella chiave. Senza le variabili di Supabase l'app parte in modalità finta, con un
  client che implementa la stessa interfaccia di quello vero.
- **Modifiche solo additive.** App e server si pubblicano insieme, ma richieste in coda
  offline e agenti possono usare una forma precedente: si aggiungono campi facoltativi
  e operazioni, non si rinominano né si tolgono senza un periodo di compatibilità.
  Esempio: il campo facoltativo `photoUrl` delle viste delle ricette (PR #54), assente
  nelle copie e nelle risposte di prima e trattato come `null`, senza cambiare
  `CACHE_SCHEMA`; così `emailUnconfirmed` (PR #64), che il client vecchio ignora,
  mentre le risposte di `accept` non si salvano. **`CACHE_SCHEMA`** (`web/src/api/persister.ts`): chi cambia in modo incompatibile la
  forma dei dati salvati sul dispositivo o le chiavi delle query (un campo tolto o
  rinominato, un tipo cambiato, una chiave diversa per la stessa lettura) cambia la
  costante, e la copia sul dispositivo si scarta senza migrazione. È l'unica eccezione
  alla conservazione offline della lista, quindi un cambio incompatibile resta da
  evitare; il periodo di compatibilità delle API resta richiesto, perché la costante
  protegge la copia, non le richieste in coda né gli agenti.

**Lingua del codice:** identificatori, nomi tecnici di file e directory, tabelle,
colonne, enum, API, strumenti MCP, commenti e test in inglese. Le etichette visibili
sono localizzate; il nome visualizzato di una ricetta o di un ingrediente non è un
identificatore tecnico. I nomi inglesi proposti qui saranno confermati nei piani.

**Motivazioni delle scelte:**

- **Supabase** invece di Django o Firebase (28-29 settembre 2026): login, inviti e
  isolamento tra famiglie garantito dal database (RLS); il modello è relazionale.
  Scelta rafforzata l'8 ottobre: il server OAuth 2.1 di Supabase Auth è conforme a MCP
  (registrazione dinamica dei client, pagina di consenso dell'app, revoca) ed evita di
  costruire in casa la parte più rischiosa. Sul piano gratuito (8 ottobre 2026):
  500 MB di database e 50.000 utenti attivi al mese bastano; la pausa dopo una
  settimana con poche query degli utenti si evita con il job orario, che interroga il
  database dal Worker ogni ora; i backup mancano e li sostituisce un'esportazione
  notturna (sezione 8). Valutate e scartate lo stesso giorno, per costo, due
  alternative: tutto su Cloudflare con D1 e Better Auth (niente RLS, solo transazioni a
  blocchi senza letture intermedie, autenticazione e server OAuth a carico nostro) e
  Neon con Better Auth (si perde il server OAuth già pronto).
- **React** invece di Svelte (8 ottobre 2026, scelta dell'utente dopo il prototipo):
  ecosistema più ampio e maggiore familiarità degli agenti che scrivono il codice. Il
  costo è la riscrittura delle schermate del prototipo.
- **SPA con un server separato** invece di Next.js o TanStack Start: il rendering lato server
  non serve; le Server Actions di Next.js non si prestano a una coda offline
  ripetibile né a MCP, che richiederebbero comunque rotte separate; le funzioni server
  di TanStack Start sono di nuovo un'API implicita. Un contratto esplicito servito da
  un server indipendente dal frontend si prova da solo e resta portabile fra host.
- **Cloudflare Workers** invece di Netlify (8 ottobre 2026, per il costo): i file
  statici sono gratuiti e senza limiti, il piano gratuito comprende 100.000 richieste al
  giorno e quello a pagamento costa 5 $ al mese, senza costi legati al numero di
  pubblicazioni (il piano gratuito di Netlify, a crediti, ne spende circa 15 per ogni
  pubblicazione in produzione). Si conta il tempo di CPU, non
  la durata: l'attesa di Postgres o del giudice non pesa. Il piano gratuito concede 10
  ms di CPU per richiesta: il pianificatore ne usa circa 20-25 per settimana (misurato l'8
  ottobre 2026, sezione 3), quindi si usa il piano a pagamento da 5 $ al mese, fino a 5
  minuti di CPU per richiesta, accettato dall'utente. Netlify era stato preferito a
  Vercel il 28-29 settembre perché il piano Hobby di Vercel è solo per uso personale non
  commerciale e i suoi cron girano al massimo una volta al giorno; il job settimanale è
  comunque un Cron Trigger del Worker (sezione 4). Documentazione consultata l'8 ottobre
  2026.

### 2. Modello dei dati

Il modello seguente conserva i concetti approvati e usa nomi tecnici inglesi. È stato
rivisto dopo il prototipo (8 ottobre 2026) e realizzato nelle migrazioni di
`supabase/migrations/` nell'ondata 1 (11 ottobre 2026). Tabelle e funzioni stanno nello
schema `app` (sezione 1). I testi nelle due lingue sono colonne jsonb `{it-IT, en-GB}`,
validate dallo schema zod e da vincoli check, al posto delle tabelle `*_translations`
(scelta dell'utente dell'11 ottobre 2026): le lingue sono due, fisse ed entrambe
obbligatorie per pubblicare.

**La ricetta è un documento** (deciso l'8 ottobre 2026). Un unico schema, definito in
`domain/` e usato dal contratto, descrive il contenuto di una ricetta: testi nelle due
lingue, fonte, attributi del pianificatore, porzioni e righe di ingredienti con
varietà, quantità e unità. Lo stesso schema vale per la bozza (documento parziale), la
versione pubblicata (documento completo e immutabile), l'import e l'export YAML, gli
strumenti MCP e il modulo dei curatori; la validazione di bozza e di pubblicazione
(sezione 8) sono due livelli dello stesso schema. Il documento ha una `schemaVersion`
e campi della fonte piatti; tag, foto (`recipe_photos`, sotto), stato e date stanno fuori
dal documento. Lo
schema zod descrive la struttura della bozza; la pubblicazione aggiunge controlli che
restituiscono codici e percorsi dei campi e uno schema stretto per il pubblicato. Le
colonne di `recipes` e `recipe_ingredients` sono **proiezioni** della versione
corrente, ricalcolate nella stessa transazione della pubblicazione o del ripristino:
servono a cercare, pianificare e fare la spesa, ma la fonte del contenuto resta la
versione. Una ricetta in bozza nuova ha comunque `name` e `description` in `recipes`,
presi dalla bozza all'import e a ogni salvataggio, così i membri leggono il nome dei
pasti senza accedere alle bozze; le altre proiezioni restano vuote fino alla
pubblicazione.

**Catalogo** (lettura delle ricette pubblicate per gli utenti autenticati; aggiunta e
modifica dell'intero ricettario tramite operazioni autorizzate ai curatori e validate
sul server; bozze escluse dall'accesso ordinario al catalogo; bozze, salvataggi,
ricette, ingredienti e libri non si cancellano mai: le bozze si chiudono, pubblicate o
scartate, e restano immutabili; ricette, ingredienti e libri si archiviano):

| Tabella | Campi principali |
|---|---|
| `recipes` | Identità, stato e proiezione della versione corrente: `id`, `slug`, `origin_slug` e `origin_type` (identità e tipo nel progetto d'origine, con cui l'import riconosce le sue ricette), `name` e `description` (jsonb nelle due lingue), `source_type` (`web`/`youtube`/`book`/`home`), `source_url`, `book_id`, `book_pages`, `duration_minutes`, `base_servings`, `protein_group` (`fish`/`white_meat`/`red_meat`/`cured_meat`/`legumes`/`eggs`/`cheese`/`vegetarian`: proteina principale), `is_fresh_fish` (pesce di pescheria, non in scatola), `carbohydrate_group` (`pasta`/`rice`/`potatoes`/`bread`/`cereals`/`none`), `has_vegetables`, `category` (tipo di piatto: `wok`/`skottle`/`oven_bake`/`grill`/`pan`/`soup`/`salad`/`savoury_pie`/`wrap_sandwich`/`burger`/`other`), `meal_type` (`lunch`/`dinner`/`both`), `seasons` (vuoto = tutto l'anno), `is_heavy`, `tags`, `status` (`draft`/`published`/`archived`), `version`, `archived_at`, `archived_by`, `created_by`, `created_at`, `updated_by`, `updated_at`. Tutte le ricette sono globali; `created_at` serve anche all'ordinamento "aggiunte di recente" del ricettario, con la data nel fuso della famiglia. `home` indica una ricetta senza fonte esterna. Vocabolari confermati l'8 ottobre 2026 con la classificazione delle 52 ricette d'origine (`scripts/import/recipe-attributes.yaml`, input anche dell'import); l'ingrediente principale per la somiglianza è `recipe_ingredients.is_primary`, sempre una riga della lista verificata |
| `ingredients` | `id`, `slug`, `name` e `synonyms` (jsonb nelle due lingue), `department` (codici `produce`, `butcher`, `fish`, `chilled`, `bakery`, `pasta_grains`, `tinned`, `frozen`, `condiments`, `other`, definiti in `domain/src/shopping/`), `is_pantry`, `version`, archiviazione: identità unica dell'ingrediente, indipendente dalla lingua; è il prodotto generico (Pomodori, Uva), senza varietà, taglia o preparazione nel nome. Reparto, dispensa, equivalenze ed evitati valgono per tutte le varietà |
| `ingredient_versions` | `ingredient_id`, `version`, contenuto completo dell'ingrediente (reparto, dispensa, nomi e sinonimi nelle due lingue, tutte le equivalenze), `changed_by`, `changed_at`: storico in sola aggiunta, scritto a ogni creazione o modifica di un ingrediente o delle sue equivalenze, che fanno crescere anche `ingredients.version`; serve al ripristino a una data (sezione 8) |
| `recipe_ingredients` | Proiezione: `recipe_id`, `position`, `ingredient_id`, `variety` (testo libero e facoltativo nelle due lingue: «Roma», «gialla senza semi»; solo quando cambia cosa si compra), `variety_key` (testo italiano della varietà normalizzato come nel consolidamento, vuoto senza varietà), `quantity_kind` (`amount`/`to_taste`/`text`), `quantity` e `unit` per `amount`, `quantity_text` nelle due lingue per `text`, `source_text` (la riga della fonte com'è scritta, sempre conservata), `preparation` (nelle due lingue: tritato, a dadini, succo, scorza…: dettaglio della ricetta che non cambia l'ingrediente da comprare), `is_optional`, `is_primary`. Lo stesso ingrediente compare più volte in una ricetta solo con varietà diverse (confronto normalizzato, quinto giro del prototipo) |
| `ingredient_unit_equivalences` | `ingredient_id`, `from_unit`, `to_unit`, `factor`, `scope` (`recipe` o `shopping`), `preparation` (facoltativa), `source` (obbligatoria e non vuota): equivalenze verificate per ingrediente (tazza USA in grammi o pezzi, succo di limone in limoni). Al massimo una per ingrediente, ambito, dimensione dell'unità di partenza e preparazione (o nessuna), con un vincolo nel database e un controllo nel dominio (sezione 6) |
| `books` | `id`, `slug` (con cui l'import riconosce i libri), `title` (titolo bibliografico originale), archiviazione |
| `recipe_drafts` | `id`, `recipe_id`, `kind` (`new`: ricetta mai pubblicata, con `recipes` in stato bozza; `revision`: modifica di una ricetta pubblicata), `base_version`, `content` (documento parziale), `created_by`, `updated_by`, `updated_at`, `revision` (cresce a ogni salvataggio e serve a riconoscere i conflitti), `closed_at`, `closed_by`, `outcome` (`published`/`discarded`). Una sola revisione aperta per ricetta; una bozza chiusa resta immutabile |
| `recipe_draft_saves` | `draft_id`, `revision`, `content`, `saved_by`, `saved_at`, `channel`, `overwritten` (sì se un salvataggio successivo l'ha sovrascritto in un conflitto): cronologia della bozza in sola aggiunta, da cui si recupera una versione sovrascritta (sezione 8) |
| `recipe_draft_requests` | `id` della richiesta, `draft_id`, `requested_by`, `requested_at`: una richiesta di revisione che ha ripreso una bozza già aperta, così la sua ripetizione restituisce la stessa bozza anche dopo la chiusura (sezione 1, idempotenza) |
| `recipe_versions` | `recipe_id`, `version`, `content` (documento completo pubblicato), `published_by`, `published_at` (istante della scrittura, letto dopo tutte le attese, non l'inizio della richiesta: un'attesa non rende una versione retroattiva per un pasto già passato), `channel`, `restored_from` (versione ripubblicata) e, per un ripristino dell'intero catalogo, la data ripristinata; storico in sola aggiunta. `recipes.version` indica la versione corrente; i pasti passati usano la versione in vigore quando sono diventati passati (sezione 5, review R1) |
| `recipe_status_changes` | `recipe_id`, `status`, `changed_by`, `changed_at`: storico in sola aggiunta di pubblicazioni, archiviazioni e ritorni nel ricettario. Con `recipe_versions` e `ingredient_versions` permette di ricostruire il catalogo com'era a qualunque istante, senza copie periodiche (deciso l'8 ottobre 2026, sezione 8) |
| `recipe_photos` | Foto delle ricette (migrazione `20261016110000_recipe_photos.sql`, PR #54, rilasciata il 16 ottobre 2026): `id` scelto dal client (idempotenza), `recipe_id`, `storage_key` (chiave dell'oggetto nel bucket delle foto, univoca, forma `photos/<22 caratteri base64url>.webp` controllata), `content_type` (solo `image/webp`), `width`, `height`, `bytes`, `created_by` e `removed_by` (`on delete set null`, come le altre colonne d'autore del ricettario), `created_at`, `channel` (`web`/`mcp`), `removed_at` (sostituita o tolta). Tabella dedicata e non una colonna di `recipes`, per conservare storico, attribuzione e idempotenza. **Al più una foto corrente per ricetta** (indice univoco parziale su `recipe_id` dove `removed_at` è nullo); righe mai cancellate. Nessuna provenienza della foto (decisione dell'utente del 16 ottobre 2026). RLS: lettura per chi può leggere la ricetta, scritture solo con `recipe_curator` (`insert` e `update` delle sole colonne di rimozione), nessun `delete`; `app_backup` legge tutto, `app_job` nulla. La funzione `app.served_photo(chiave)`, `security definer` ed eseguibile solo da `anon`, dice alla rotta pubblica se una chiave è di una foto corrente, bozze comprese. Un trigger fa crescere il contatore del ricettario a ogni scrittura, anche per la foto di una bozza. La foto non sta nel documento né nelle versioni: cambiarla non crea una versione né apre una bozza, il ripristino di una versione non la tocca, l'archiviazione la conserva; una bozza nuova può averla (via MCP) ma le viste la mostrano solo dopo la pubblicazione |

**Utenti, ruoli globali e amministrazione:**

| Tabella o concetto | Campi principali / responsabilità |
|---|---|
| `profiles` | `user_id`, `display_name`, `locale` (`it-IT`/`en-GB`). Dal 16 ottobre 2026 (PR #52) il trigger `profiles_reject_deleted_ids` rifiuta un profilo per un id presente in `account_deletions`, così un account cancellato non si ricrea nemmeno da una richiesta già in volo |
| `profile_preferences` | `user_id`, `current_family_id`: famiglia mostrata, ricordata sul server; privata (RLS del solo proprietario), perché `profiles` è leggibile dai co-membri; chiave esterna composta verso `family_members` |
| `user_roles` | `user_id`, `role`: permessi globali separati e cumulabili, curatore (`recipe_curator`) e amministratore dell'app (`app_admin`), con `granted_by` e `granted_at`. Nessuna scrittura diretta da `authenticated` (solo `SELECT` delle proprie righe): i ruoli si assegnano all'accettazione di un invito all'app e, dal 16 ottobre 2026, dall'amministrazione con `app.set_user_role` (sotto). Con la PR #52 il trigger `user_roles_require_profile` rifiuta (`P0A07`) un ruolo per chi non ha il profilo, cioè per un account in cancellazione |
| `account_deletions` | Cancellazioni avviate (PR #52): `user_id` senza chiave esterna (la riga sopravvive all'utente), `requested_by`, `requested_at`, `attempts`, `last_error` (solo un codice), `last_attempt_at`, `completed_at`. Nessun dato personale; le righe completate restano. Lettura solo dalle funzioni |
| `password_emails` | Ultimo invio dell'email «Scegli la password» per persona (migrazione `20261017100000_email.sql`, PR #64): `user_id` (chiave primaria), `sent_at`. Tiene l'intervallo di 60 secondi fra due invii dalla pagina dell'invito; nessun privilegio diretto, la scrivono solo le funzioni dei reinvii (sotto); righe più vecchie di 7 giorni cancellate dal cron orario |
| `ops_alerts` | Email operative (PR #64): chiave (`event`, `key`), `event` fra `weekly_job_overdue`, `weekly_job_abandoned`, `backup_export_missing`, `account_deletion_overdue` e `ops_alert_test`; `details` (solo id, codici, numeri e date), `subject` e `body` scritti una volta alla creazione, `created_at`, `claimed_at`, `sent_at`, `closed_at`, `closed_reason` (`expired`/`ambiguous`), `attempts`. Nessun indirizzo. RLS con tutto ad `app_job`, lettura ad `app_backup`, nulla per `authenticated` e `anon`; righe più vecchie di 90 giorni cancellate (sezione 4) |
| `app_invitations` | Inviti gestiti dall'amministrazione dell'app, distinti da quelli a una famiglia (sesto giro; migrazione `20261013100000_app_invitations.sql`, PR #45): `id` scelto dal client, `token_hash` (impronta SHA-256 del token, mai il token in chiaro), `email` normalizzata, `roles` (sottoinsieme di `recipe_curator` e `app_admin`, anche vuoto), `created_by`, `created_at`, `expires_at` (7 giorni), `status` (`pending`/`accepted`/`revoked`, scaduto calcolato), `revoked_at` e `revoked_by`, prenotazione dell'account all'accettazione (`reserved_user_id`, `reserved_at`), `accepted_by` e `accepted_at`. Un solo invito `pending` per email. RLS: lettura solo agli `app_admin`, nessuna scrittura diretta; tutto passa dalle funzioni descritte sotto. Dal 16 ottobre 2026 (PR #52) `email` ammette `null` per gli inviti di un account cancellato, con il vincolo `app_invitations_pending_email` (un invito `pending` ha sempre l'email) |
| `app.connected_agents()` | Funzione, non tabella (collegamento degli agenti, migrazione `20261011200000_connected_agents.sql`): agenti autorizzati da chi chiama, cioè client, nome registrato, data del collegamento e ultimo rinnovo dell'accesso (massimo di `updated_at` delle sessioni vive del client). `security definer`, legge `auth.oauth_consents`, `auth.oauth_clients` e `auth.sessions`, solo righe dell'utente corrente e grant non revocati; eseguibile solo da `authenticated`. Le autorizzazioni vivono nel server OAuth 2.1 di Supabase Auth (sezione 13): la tabella `agent_authorizations` prevista per l'ondata 3 non serve |
| `catalogue_state` | Contatore di versione del ricettario, comune a tutte le famiglie (sezione 1) |
| Tracciamento del catalogo e dell'amministrazione | Autore e data sulle righe; `channel` (`web`/`mcp`/`import`) su registro dei pasti, versioni, stati e salvataggi delle bozze. Regole di conservazione da definire |

**Per famiglia** (RLS: si vede e si scrive solo nella propria famiglia):

| Tabella | Campi principali |
|---|---|
| `families` | `name`, `settings` (vedi sotto), `measurement_system` (`metric`/`uk_imperial`), `time_zone` (fuso IANA, `Europe/Rome` nei dati demo), `data_version` (contatore di versione, sezione 1), `created_at`. Il fuso stabilisce quando un pasto diventa passato (sezione 5), la versione mostrata dai pasti passati (R1) e quando scatta la generazione del mercoledì (sezione 4); regole decise l'8 ottobre 2026 nelle impostazioni, qui sotto |
| `family_members` | `family_id`, `user_id`, `role` (`family_admin`/`member`), `joined_at` |
| `family_invitations` | Link d'invito alla famiglia (migrazione `20261016100000_family_management.sql`, PR #52): `id` scelto dal client, `family_id`, `token_hash` (impronta SHA-256, mai il token in chiaro), `created_by`, `created_at`, `expires_at` (7 giorni), `revoked_at`, `revoked_by`, `revoke_reason` (`manual`, `creator_left`, `creator_removed`, `creator_demoted`, `creator_deleted`). Usabile se non revocato e non scaduto; un link scaduto ma non revocato può ancora chiudere una registrazione già prenotata |
| `family_invitation_reservations` | Registrazioni di account nuovi da un link (PR #52): `user_id` prenotato (senza chiave esterna), `invitation_id` e `family_id` (nulli se la famiglia è eliminata), `token_hash` del link, `email` (nulla dopo la cancellazione dell'account), `status` (`reserved` → `joined` o `closed`, terminali), `reserved_at`, `finished_at`. Il numero di righe per link, in ogni stato, è il tetto di 10 persone registrate |
| `family_joins` | Registro degli ingressi da link (PR #52): `family_id`, `invitation_id`, `user_id`, `mode` (`new_account`/`existing_account`), `joined_at`; nessun nome né email; le righe di una persona si cancellano con il suo account |
| `family_removals` | `family_id`, `user_id`, `removed_by`, `removed_at` (PR #52): rimozioni di membri; un invito creato prima di `removed_at` non fa rientrare quella persona (review R2, deciso il 6 ottobre 2026). L'uscita volontaria non scrive nulla |
| `family_books` | `family_id`, `book_id`: libri posseduti |
| `recipe_exclusions` | `family_id`, `recipe_id`, `reason`, `created_by`, `created_at`: "non proporre più" |
| `family_ingredients` | `family_id`, `ingredient_id`, `restriction` (`avoid`/`limit`), `weekly_max` |
| `family_tried_recipes` | `family_id`, `recipe_id`, `source`, `created_at`: ricette già provate senza data, riempita dall'import (R4, sezione 11); per ora il pianificatore non la usa |
| `weeks` | `family_id`, `starts_on` (lunedì), `generated_at`. Unica per (`family_id`, `starts_on`) |
| `meal_slots` | `week_id`, `date`, `meal_type`, `recipe_id` o `free_text`, `servings`, `note`, `updated_by` (null = app: la generazione non scrive `meal_changes`), `updated_at`, `last_action_id` (l'ultima azione che ha cambiato lo slot, della stessa settimana: è l'ordine reale delle modifiche, scritto sotto il lucchetto della riga, indipendente dagli orologi) |
| `meal_actions` | `id` (dal client), `week_id`, `actor_id`, `channel`, `kind` (`set_servings`/`set_recipe`/`set_free`/`set_note`/`swap`/`undo`), `slot_ids` (uno o due slot), `undoes` (l'azione annullata), `created_at`: una riga per richiesta, mai modificata né cancellata, anche per le richieste senza effetti; è l'identità dell'azione e la memoria delle ripetizioni dell'area, non una tabella generica delle ricevute. Lettura ai membri, inserimento solo per sé |
| `meal_changes` | `meal_slot_id`, `actor_id`, `channel`, `before` (jsonb), `after` (jsonb), `undoes`, `action_id` (nullo solo per righe precedenti alle azioni, come l'import), `created_at`: registro append-only, una riga per slot cambiato. Per gli utenti il registro è veritiero: `before` deve coincidere con lo slot e l'azione deve essere loro e comprendere lo slot |
| `ratings` | `user_id`, `recipe_id`, `stars` (1-5), `updated_at`. Unico per (`user_id`, `recipe_id`); il voto è personale e contribuisce alle medie delle famiglie di cui l'utente fa parte |
| `weekly_jobs` | `family_id`, `target_week`, `status` (`pending`/`running`/`done`/`failed`/`abandoned`; `running` non si usa), `attempts`, `error` (solo il codice), `updated_at` |
| `shopping_lists` | `family_id`, `week_id`, `updated_by`, `updated_at`: la lista della settimana, una per (`family_id`, `week_id`), creata alla prima modifica |
| `shopping_list_checks` | `shopping_list_id`, `ingredient_id`, `variety_key`, `quantity_at_check` (jsonb, nella forma canonica del dominio: massa, volume, conteggi per unità, testi non numerici nelle due lingue del momento della spunta, «q.b.»), `checked_by`, `checked_at`: voce spuntata con la quantità del momento. La voce è identificata da ingrediente e varietà, perché varietà diverse sono voci diverse (sezione 6): `variety_key` è il testo italiano della varietà normalizzato come nel consolidamento, vuoto senza varietà. Se un curatore cambia la grafia in modo che la forma normalizzata cambi, la spunta non corrisponde più a nessuna voce e si perde, come per una voce uscita dalla lista |
| `shopping_list_items` | `shopping_list_id`, `client_id` (generato dal dispositivo, per l'idempotenza offline), `text`, `checked`, `created_by`, `created_at`: voci libere; più gli ingredienti esclusi rimessi in lista (`shopping_list_added_back`, con la stessa chiave di ingrediente e varietà) |
| `temporary_lists` | `token`, `items` (jsonb), `expires_at` (30 minuti), per l'esportazione Bring! |

**Viste:**

- `family_scores`: media delle stelle dei membri attuali per ricetta;
- `global_scores`: media anonima su tutte le famiglie, usata solo per l'avvio a freddo.

**Chiavi esterne e modifiche:** gli autori sono `on delete set null` (mostrati come «ex
membro»); dati personali e appartenenze sono `on delete cascade`; i dati di famiglia
seguono la famiglia; i pasti impediscono di cancellare una ricetta citata; nessuna
cascata sullo storico. Gli utenti modificano solo le colonne previste dalle operazioni;
identità di settimane e slot è immutabile e un annullamento vale solo sugli slot
dell'azione annullata. Istanti del registro e dell'ultima modifica con
`clock_timestamp()`, cioè dopo il lucchetto, non all'inizio della richiesta. I nomi degli autori del ricettario, compresi quelli di `ingredient_versions`, sono
leggibili dai curatori con `app.catalogue_author_names()` (solo id e nome), senza aprire
i profili. `app.recipe_is_cited` (`security definer`, solo curatori) dice se un pasto di
qualunque famiglia cita una ricetta, senza mostrare i pasti.

**Bozze nei pasti** (revisione dei pasti, 12 ottobre 2026). Collegare uno slot a una
ricetta mai pubblicata resta vietato, salvo quando un altro pasto della famiglia la
cita già oppure, con la bozza ancora aperta, quando la ricetta si sposta nella stessa
azione (scambio, anche fra due bozze) o torna con un annullamento: le prove vengono dal
registro veritiero, senza privilegi nuovi. `app.meal_action_restores_closed_draft`
(`security definer`, eseguibile dagli utenti) dice se annullare un'azione riporterebbe
una bozza chiusa senza pubblicazione; legge solo le righe di quell'azione e solo nelle
settimane di chi chiama, e blocca le ricette riportate come fanno scarto e
pubblicazione, così annullamento e scarto si mettono in fila. Particolari nella spec di
dettaglio `2026-10-11-revisione-pasti.md`, sezione 3.

**Inviti all'app e famiglie nuove** (PR #45, 15 ottobre 2026; particolari nella spec di
dettaglio `2026-10-13-inviti-app.md`, sezione 1). Le funzioni stanno nello schema `app`,
sono `security definer` ed eseguibili solo dal ruolo indicato. Per `authenticated`,
riservate agli `app_admin`: `app.create_app_invitation` (rifiuta un'email che ha già un
account; un nuovo invito alla stessa email revoca quello in attesa; ripetuta con lo stesso
id sostituisce l'impronta, quindi dà un link nuovo e il vecchio smette di valere),
`app.revoke_app_invitation` (anche su un invito scaduto ma ancora `pending`, che se
prenotato potrebbe ancora essere chiuso) e `app.app_invitations_view`. Per `anon`, con il
token confrontato solo come impronta: `app.app_invitation_by_token` (nome di chi invita e
ruoli, mai l'email), `app.claim_app_invitation` (controlla l'email e prenota l'id
dell'account; la scadenza conta solo prima della prenotazione) e
`app.complete_app_invitation` (chiude l'invito e assegna i ruoli globali nella stessa
istruzione, solo se l'account con l'id prenotato esiste con l'email dell'invito). Le
scritture si mettono in fila con lucchetti consultivi presi sempre nello stesso ordine.
Nessuna scrittura nello schema `auth`, solo letture di `auth.users` dentro queste
funzioni. `app.create_family` (per `authenticated`, idempotente sull'id) crea la famiglia,
fa di chi la crea il `family_admin` e la rende la sua famiglia corrente; **non genera
settimane**: il menu nasce alla prima lettura (sezione 4).

**Amministrazione degli utenti** (PR #47, 15–16 ottobre 2026; migrazione
`20261015100000_user_admin.sql`, solo funzioni, nessuna tabella né colonna nuove;
particolari nella spec di dettaglio `2026-10-15-amministrazione-utenti.md`, sezione 1).
Funzioni nello schema `app`, `security definer`, eseguibili solo da `authenticated`, che
rifiutano per prima cosa chi non è `app_admin`; leggono `auth.users` senza scriverci,
quindi l'email arriva senza chiave segreta. `app.admin_users` elenca e cerca gli utenti
per nome o email (`ilike` con i caratteri speciali resi letterali, senza `unaccent`),
partendo da `auth.users`, così compare anche un account senza profilo, ruoli né
famiglia; `app.admin_user` dà il dettaglio con `last_app_admin`, indicazione per
l'interfaccia; `app.admin_user_families` dà le famiglie di un utente con **solo nome e
ruolo**; `app.set_user_role` assegna (idempotente, con `granted_by`) o toglie un ruolo
globale e restituisce i ruoli dopo la modifica. **Lucchetto dell'ultimo amministratore
dell'app:** ogni percorso che toglie `app_admin` (`app.set_user_role`, la
cancellazione di un account con `app.begin_account_deletion` dell'attività C, qualunque
script futuro) prende
`pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))` nella stessa
transazione e, sotto il lucchetto, ricontrolla l'autorizzazione di chi chiama per
l'operazione richiesta e che il bersaglio non sia l'unico amministratore (altrimenti
`P0A08`). Per `app.set_user_role` ricontrollare l'autorizzazione significa verificare di
nuovo che chi chiama sia ancora `app_admin` (altrimenti `42501`); la cancellazione del
proprio account resta invece consentita anche a chi non ha ruoli globali. Un utente
inesistente dà `P0A07`. Le assegnazioni, compresa `app.complete_app_invitation`, e la rimozione di
`recipe_curator` non lo prendono, perché non possono lasciare l'app senza
amministratori. Due amministratori che si tolgono il ruolo a vicenda si mettono in fila:
il secondo, già retrocesso, riceve `forbidden`; due che rinunciano ciascuno al proprio:
il secondo riceve `last_app_admin`.

**Gestione della famiglia** (PR #52, unita e rilasciata il 16 ottobre 2026;
migrazione `20261016100000_family_management.sql`, solo additiva; particolari, elenco
delle funzioni e codici nella spec di dettaglio `2026-10-16-gestione-famiglia.md`,
sezioni 1 e 8). Tabelle nuove `family_invitations`, `family_invitation_reservations`,
`family_joins`, `family_removals` e `account_deletions` (sopra), con RLS attiva e nessun
privilegio diretto: tutto passa da funzioni `security definer` dello schema `app`, che
ricontrollano chi chiama. Per `anon`, con il token confrontato solo come impronta, le
funzioni della pagina dell'invito (`app.family_invitation_by_token`,
`app.claim_family_invitation`, `app.complete_family_invitation`), con lo schema
prenotazione → creazione → chiusura degli inviti all'app; per `authenticated` gli inviti
della famiglia, l'ingresso con un account esistente (`app.join_family`), membri e ruoli
(`app.set_family_member_role`, `app.remove_family_member`, `app.leave_family`),
l'eliminazione (`app.delete_family`) e la cancellazione dell'account
(`app.account_deletion_plan`, `app.begin_account_deletion`); per `app_job` la ripresa
delle cancellazioni. **Ultimo amministratore della famiglia:** ogni percorso che può
togliere amministratori o membri a una famiglia prende `select … for update` sulla riga
di `app.families` e solo dopo riconta, così due amministratori che escono o si
retrocedono insieme non lasciano una famiglia con membri senza amministratore.
**Ordine dei lucchetti** per ogni percorso presente e futuro:
`pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))` solo per chi può
togliere `app_admin` → lucchetto dell'utente `user_memberships:<id>`, preso da ogni
percorso che crea un'appartenenza o una prenotazione per quell'utente (anche
`app.create_family`, ridefinita con la stessa firma) e dalla cancellazione dell'account
→ lucchetto dell'email `registration_email:<email normalizzata>` → righe delle famiglie
in ordine di id → link → prenotazioni → il resto; sotto i lucchetti si rilegge e si
ricontrolla (`read committed`). I percorsi della famiglia non prendono mai
`app_admin_roles`. Nessun contatore di versione nuovo: il trigger esistente sui membri
basta alla vista dei membri. L'eliminazione di una famiglia cancella a cascata dati,
link, ingressi, rimozioni e job; le prenotazioni restano, senza famiglia, per ritrovare
l'account creato e per il tetto.

**Email dell'app** (PR #64, unita e rilasciata il 17 ottobre 2026;
migrazione `20261017100000_email.sql`, solo additiva; particolari nella spec di
dettaglio `2026-10-17-email.md`, sezioni 2, 5 e 11). Tabelle nuove `password_emails` e
`ops_alerts` (sopra). Funzioni `security definer` dello schema `app`: per `anon`
`app.app_invitation_password_email` e `app.family_invitation_password_email`, che
autorizzano un invio solo a chi ha il token del link e l'email di una prenotazione già
chiusa, rispondono `unavailable`, `not_needed` (email già confermata), `too_soon` o
`send` e, con `send`, registrano l'invio in modo atomico, così di due richieste
concorrenti una sola spedisce; il nome della famiglia esce solo per la prima email, con
la prenotazione `joined` e la persona ancora membro. Per `authenticated`
`app.family_email_unconfirmed` e `app.family_email_unconfirmed_version` (solo membri) e
`app.admin_email_unconfirmed` (solo `app_admin`, al più 200 id), che da `auth.users`
leggono soltanto se `email_confirmed_at` è nullo. Per `app_job`
`app.overdue_account_deletions` (cancellazioni con almeno N tentativi falliti in una
finestra, completate comprese) e `app.prune_password_emails`. Nessuna scrittura nello
schema `auth`; prenotazioni e chiusure degli inviti restano quelle di A e C.

**Ruolo dell'esportazione** (11 ottobre 2026, migrazione `20261012110000_backup.sql`):
`app_backup`, NOLOGIN e BYPASSRLS, ha solo `SELECT` su tutte le tabelle di `app`
(anche quelle create dopo) e sull'elenco delle migrazioni, ed esegue soltanto
`app.backup_auth_rows()`, che restituisce `auth.users` e `auth.identities`. È separato
da `app_job`, che scrive menu e legge solo ciò che serve al pianificatore: un errore
del job non legge tutto e un errore dell'esportazione non scrive niente. Ogni tabella di
`app` ha una chiave primaria e lo schema non ha sequenze (verificato da pgTAP);
dettagli in `2026-10-11-esportazione-r2.md`.

**Nessuno stato della settimana, deciso il 6 ottobre 2026.** Le settimane non hanno
fasi (bozza, in corso, da chiudere, chiusa) né chiusura: ogni settimana si consulta e si
modifica allo stesso modo. Ogni pasto passato con una ricetta conta come mangiato,
anche nello storico usato dal pianificatore: non esiste "non cucinato" (tolto il
6 ottobre 2026, dopo il secondo giro del prototipo); un pasto sbagliato si corregge
cambiandolo. Una settimana generata è visibile da `generated_at`.

**Impostazioni della famiglia** (`families.settings`, jsonb validato):

- matrice commensali per giorno e pasto, con porzioni di default;
- slot fissi (`free` con testo, per esempio sabato cena e domenica pranzo);
- limiti di tempo per slot (per esempio lunedì e mercoledì cena al massimo 15 minuti);
- regole di pasto: pasta solo a pranzo; pesce almeno una volta il venerdì; niente pesce
  fresco il lunedì;
- quota note/nuove (default 7/5 ± 1 su 12 pasti);
- intervalli settimanali per gruppo alimentare (sezione 3);
- pesi del punteggio (non mostrati nell'interfaccia).

Il sistema di misura (`metric` oppure `uk_imperial`) è una colonna,
`families.measurement_system`. `settings` conserva solo i valori cambiati; i default
vengono dal dominio. Schema dei valori salvati e risoluzione (`resolveFamilySettings`)
sono in `domain/src/family/settings.ts`: alla lettura un valore non valido lascia il
posto al default. Ogni gesto è un'operazione a stato assoluto che scrive solo la sua
chiave del jsonb; le regole si identificano dal loro valore.

**Fuso orario della famiglia** (`families.time_zone`, deciso l'8 ottobre 2026): alla
creazione si prende il fuso del browser di chi crea la famiglia, oppure quello
dichiarato dall'agente se la famiglia nasce via MCP, validato come fuso IANA; se manca
o non è valido si usa `Europe/Rome`. Vale come non valido anche uno scostamento
(`+01:00`, `-0500`), che i runtime recenti accettano ma Postgres non riconosce come nome
di fuso. Gli amministratori della famiglia lo cambiano
nella pagina delle impostazioni, accanto alle unità. Il cambio vale per tutto, anche
per i pasti passati:
gli istanti in cui un pasto diventa passato si ricalcolano con il nuovo fuso, quindi
può spostarsi di qualche ora il momento da cui un pasto conta come mangiato e, solo per
una ricetta aggiornata proprio in quelle ore, la versione mostrata da quel pasto (R1).
Nessun dato salvato cambia. Il fuso non dipende dalla lingua né dal sistema di misura.

Nell'app (quarto giro del prototipo) le impostazioni si vedono tutte tranne i pesi del
punteggio: le modificano solo gli amministratori della famiglia, i membri le leggono;
si salvano a ogni modifica e valgono per le generazioni successive e per i
suggerimenti, senza cambiare i menu già fatti. Quota note/nuove e intervalli per
gruppo alimentare stanno in una sezione «Avanzate» chiusa. Le regole di pasto si
scelgono da quattro modelli (un gruppo almeno una volta in un giorno, mai un gruppo in un
giorno, mai pesce di pescheria in un giorno, un tipo di piatto solo a pranzo), senza
regole in testo libero; il modello sul pesce di pescheria è stato aggiunto l'8 ottobre
2026, perché il divieto del lunedì riguarda la pescheria chiusa, non il pesce in scatola.
Una famiglia nuova parte con tutti i pranzi e le cene pianificati per 2 porzioni, i
pranzi da lunedì a venerdì entro 30 minuti (default deciso l'8 ottobre 2026 dopo
l'esperimento del pianificatore, modificabile), senza pasti fissi, altri limiti, regole,
ingredienti evitati né libri, e con gli intervalli CREA. Gli ingredienti da evitare o
limitare si cercano per nome e sinonimi nella lingua dell'utente.

La famiglia di Federico non parte dai default (messa in produzione, 11 ottobre 2026):
porzioni, tempi, pasti fissi, regole, quote e intervalli, il limite sui cetrioli e i
libri posseduti (tutti quelli citati dal ricettario d'origine) li scrive il caricamento
dalle regole del progetto di origine, **prima che qualcuno apra l'app**, perché la prima
apertura genera il menu. Si scrivono solo le chiavi diverse dai default e ancora
assenti, senza sovrascrivere ciò che la famiglia ha cambiato (sezione 11).

**Preferenze personali** (`profiles`): lingua `it-IT` oppure `en-GB`, indipendente dalla
famiglia e dal suo sistema di misura. La lingua del profilo vale a ogni accesso; prima
del login l'app usa quella del browser.

**Ruoli nella famiglia:**

- `member`: legge la propria famiglia, modifica gli slot, vota, gestisce le esclusioni;
- `family_admin`: in più gestisce inviti, membri e impostazioni di quella famiglia e
  può eliminarla esclusivamente dall'app web; MCP fornisce il collegamento alla pagina
  dedicata. Finché la famiglia resta attiva, l'ultimo amministratore non può uscire
  o perdere il ruolo senza nominarne un altro. Se è
  l'unico membro, può eliminare la famiglia; la cancellazione del suo account la
  elimina insieme ai relativi dati, secondo le regole della sezione 7.

**Ruoli globali:**

- `recipe_curator`: salva e riprende bozze, pubblica ricette complete e modifica l'intero
  ricettario, anche le ricette e le bozze inserite da altri; archivia una ricetta e la
  riporta nel ricettario. Le bozze hanno una sezione nell'app; il percorso guidato è
  disponibile tramite MCP (percorso consigliato) e il percorso manuale web viene
  realizzato nell'ultima fase. Può ripristinare una versione precedente di una
  singola ricetta;
- `app_admin`: gestisce utenti, ruoli e inviti dell'app, inclusa la nomina di altri
  amministratori e la cancellazione degli utenti; può ripristinare l'intero catalogo
  da backup. Inizialmente assegnato a Federico.

**Separazione confermata:** il ruolo di amministratore di famiglia non concede ruoli
globali. `recipe_curator` e `app_admin` sono indipendenti e cumulabili; un amministratore
dell'app può assegnare entrambi. Essere `app_admin` non concede automaticamente i permessi
del curatore né accesso a menu, note e contenuti delle altre famiglie. Per operare sui
contenuti di una famiglia occorre esserne membro, con i relativi permessi. La gestione
globale degli account e degli inviti deve rispettare questo confine.

In qualunque canale le operazioni verificano i permessi sul server, non soltanto la
visibilità dei comandi nell'interfaccia. I controlli di accesso ai dati familiari devono
valere anche per le operazioni eseguite da amministratori dell'app.

### 3. Pianificatore

**Ingresso:**

- impostazioni della famiglia, risolte con `resolveFamilySettings` (sezione 2);
- catalogo visibile alla famiglia: ricette pubblicate e non archiviate, escluse quelle da
  libri che la famiglia non possiede, con gli attributi presi dal documento della
  versione corrente (`toPlannerRecipe`), senza una seconda mappatura dalle proiezioni;
- esclusioni e ingredienti da evitare o limitare;
- punteggi;
- storico degli slot delle settimane precedenti e della settimana in corso, più i pasti
  delle settimane successive già pianificate (`PlannerInput.upcoming`);
- primo pasto da pianificare (`PlannerInput.from`), per generare una settimana già
  iniziata dai soli pasti non ancora passati;
- stagione.

**Vincoli rigidi** (filtrano, mai violati dalla generazione):

- limiti dello slot: tempo (una ricetta senza durata non entra in uno slot con tempo
  massimo), pasto adatto e regole di pasto della famiglia (per esempio niente pesce di
  pescheria il lunedì, niente pasta a cena);
- esclusioni, ricette archiviate, libri non posseduti;
- ingrediente con restrizione `avoid` come ingrediente non opzionale;
- stessa ricetta usata nei 14 giorni prima o dopo la settimana (settimane già
  pianificate) o già nella settimana;
- ingrediente con restrizione `limit` oltre `weekly_max` (reso vincolo rigido
  nell'esperimento dell'8 ottobre 2026);
- punteggio famiglia ≤ 2 stelle, salvo mancanza di alternative.

**Punteggio** (vincoli morbidi):

- **gradimento**: punteggio della famiglia, oppure quello globale nell'avvio a freddo;
- **tempo dall'ultima volta** che la famiglia l'ha cucinata;
- **stagione**;
- **equilibrio**: distanza dagli intervalli settimanali per gruppo alimentare;
- **somiglianza**: penalità per pasti vicini che condividono proteina principale,
  carboidrato principale, ingrediente principale o categoria, oppure quando l'ingrediente
  principale di uno è una riga non facoltativa dell'altro (`primary_ingredient_line`; per
  esempio orecchiette ai broccoli e riso saltato con broccoli e gamberi; deciso il 17
  ottobre 2026, issue #48, PR #60). Se le due ricette hanno lo stesso ingrediente
  principale conta una volta sola; una ricetta senza ingrediente principale conta solo
  dal lato dell'altra. Ogni caratteristica condivisa, compresa questa, pesa allo stesso
  modo e usa la stessa finestra; il peso decresce con la distanza in pasti. Resta una
  penalità, non un vincolo: nessuna regola sul giorno per ingredienti o proteine. La
  finestra è mobile, attraversa le settimane e guarda anche ai pasti già pianificati dopo;
- **quota note/nuove**: "nota" vuol dire cucinata da questa famiglia nelle ultime 8
  settimane; una ricetta non cucinata da più tempo conta di nuovo come nuova (deciso l'8
  ottobre 2026). La quota si applica da quando la famiglia ha almeno 10 ricette
  cucinate;
- **ingredienti con restrizione `limit`**: penalità, oltre al massimo settimanale.

**Valori di partenza dell'esperimento dell'8 ottobre 2026** (`domain/src/planner/settings.ts`,
da ritoccare con l'uso): somiglianza su una finestra di 6 pasti, scelta pesata fra i
migliori 4 candidati, pesi gradimento 3, tempo dall'ultima volta 1, stagione 1,
equilibrio 2, somiglianza 4, verdure 0,5, quota 1,5, ingredienti limitati 1, regole
«almeno un gruppo in un giorno» non ancora soddisfatte 2 (spinta già nella prima scelta,
così la riparazione interviene meno). Le scelte a parità usano l'ordine per identificativo,
indipendente dalla lingua del sistema e dall'ordine del catalogo ricevuto.

**Costo misurato l'8 ottobre 2026:** storico, ricette recenti e note si preparano una
volta per settimana generata, così il costo non cresce più con lo storico (dopo tre anni
circa 16 ms per settimana, contro 121 ms prima). Sui dati reali, su un Mac, la media va
da 19 a 26 ms secondo l'esecuzione, con picchi di circa 50 ms: la misura varia con il
carico della macchina e va ripetuta sul runtime di Workers. Il report stampa la
misura a ogni esecuzione.

**Intervalli di default per gruppo alimentare** sui pasti pianificati della settimana.
Sono derivati dalle frequenze CREA 2018 per l'adulto, pensate per 14 pasti, e adattati ai
circa 12 pasti pianificati. Sono impostazioni modificabili.

| Gruppo | Frequenza CREA | Default dell'app |
|---|---|---|
| Pesce | 2 volte a settimana | 2-3 |
| Legumi | 3 volte a settimana | 2-4 |
| Carne bianca | 2 volte a settimana | 1-3 |
| Carne rossa | 1 volta a settimana | massimo 1 |
| Salumi | 1 volta a settimana (occasionale) | massimo 1 |
| Uova | 3 volte a settimana | 1-2 come proteina principale (le uova compaiono anche in altre ricette) |
| Formaggi | 3 volte a settimana | massimo 2 come proteina principale |
| Patate | 2 volte a settimana | massimo 2 come carboidrato principale |
| Verdure | 2 porzioni e mezza al giorno | bonus per le verdure a ogni pasto |
| Fritti o piatti pesanti | non indicata | massimo 1 |

Fonte: CREA, "Le giuste porzioni e le frequenze di consumo consigliate"
(sapermangiare.an.crea.gov.it/493/le-giuste-porzioni.html), consultata il 29 settembre
2026.

**Algoritmo:**

1. prepara gli slot dalla matrice, con porzioni e slot fissi;
2. riempie per primo lo slot con meno candidati validi, ricalcolato a ogni passo (a
   parità, in ordine cronologico);
3. per ogni slot calcola il punteggio dei candidati nel contesto della settimana e ne sceglie
   uno a caso tra i migliori 4, pesando la scelta sul punteggio;
4. controlla le regole di settimana (venerdì pesce, quota, intervalli) e le ripara con
   sostituzioni di una ricetta o scambi fra due slot che non rompono vincoli rigidi;
   ogni giro tiene la modifica che sistema di più e, a parità, quella con il punteggio
   complessivo migliore della settimana (gradimento, stagione, somiglianza…), così il
   pesce del venerdì non finisce accanto a quello del giovedì sera e una ricetta gradita
   e di stagione non lascia il posto a una peggiore;
5. se uno slot non ha candidati validi resta vuoto, segnato "nessuna ricetta adatta".

**Esito dell'esperimento dell'8 ottobre 2026** (M0, codice in `domain/src/planner/`,
report in `progetto/reports/planner-report.md`): 20 settimane per la famiglia del
curatore, con le 52 ricette pubblicabili del progetto d'origine e le sue regole, senza
violazioni dei vincoli rigidi né pasti senza ricetta, con gruppi sempre negli intervalli
e venerdì pesce sempre presente; settimane giudicate credibili dall'utente. Con 52
ricette la quota note/nuove non si rispetta (dopo tre settimane le nuove scendono a 0-2
su 12): servono circa 25-30 ricette in più, lavoro di gestione del ricettario. Non
esprimibile con i modelli di regola la regola d'origine «niente skottle il lunedì sera».

Con la somiglianza per riga dell'ingrediente principale (17 ottobre 2026, PR #60) il
report ha la carne rossa oltre il massimo in 3 settimane su 20 invece di 1. L'utente lo
accetta senza correzioni: il passo 4 non cambia. Il ricettario ha ancora poche ricette e
le uniche nuove rimaste sono di carne rossa, quindi la quota le spinge; la soluzione è
aggiungere ricette più varie.

Il seme casuale è derivato da famiglia e settimana: a parità di ingresso la settimana è la
stessa, e quindi testabile. Il perché di una scelta non viene salvato né mostrato: non è un
requisito.

**Riuso durante la revisione:**

- **suggerimenti**: lo stesso punteggio con gli altri slot fissati, i migliori 5; come
  nella generazione, rispettano tempi massimi, regole di pasto, ingredienti evitati e
  massimi settimanali della famiglia (la ricerca nel ricettario resta libera). Una sola
  logica con la generazione (`rankSuggestions` nel dominio, sulle stesse funzioni di
  vincoli e punteggio): il piatto attuale si toglie prima della scelta fra ricette
  gradite e ripiego sui voti bassi, così se era l'unico gradito restano le alternative;
- **"proponimene altri"**: i 5 candidati successivi nella stessa classifica; finita la
  classifica si ricomincia dai primi. Non sostituisce il piatto: si sceglie tra i nuovi.

**Ricette archiviate già nel calendario** (`PlannerInput.fixedRecipes`, 12 ottobre
2026): le ricette archiviate citate dai pasti della famiglia non sono mai candidate, ma
contano come pasti vicini, storico e massimi settimanali, sia nei suggerimenti sia nella
generazione; prima restavano fuori dalla somiglianza e dalla recentezza. Le bozze mai
pubblicate non hanno documento e restano fuori.

Non ci sono avvisi di settimana sulle modifiche a mano (deciso il 6 ottobre 2026).

**Giudice AI (opzionale, sperimentale).** È l'unico ruolo dell'AI nella pianificazione.

- **Cosa fa.** Il pianificatore genera da 3 a 5 settimane candidate con semi diversi, tutte
  conformi ai vincoli rigidi. Il giudice le riceve e restituisce un punteggio per ciascuna.
  Si tiene la migliore. Serve a cogliere ciò che le regole, un criterio alla volta, non
  vedono: per esempio tre piatti pesanti di fila anche dentro gli intervalli, o una
  settimana monotona per colori, consistenze e tipi di piatto.
- **Cosa non fa.** Non propone né sostituisce piatti, non tocca singoli slot, non
  interviene su suggerimenti e "proponimene altri" (restano solo a regole). Non
  può rendere valida una settimana che viola un vincolo: vede solo candidate già valide.
- **Dati inviati.** Solo dati anonimi della settimana: per ogni pasto giorno, pasto, nome
  del piatto, gruppi alimentari, categoria, tempo e porzioni; più il riassunto delle ultime
  2 settimane per la somiglianza. Niente nome della famiglia, membri, note, né quali pasti
  sono liberi.
- **Ricaduta.** Se il giudice è spento, non risponde entro il timeout (per esempio 10
  secondi), fallisce o restituisce qualcosa di non valido, si tiene la candidata con il
  punteggio a regole più alto. La bozza non dipende mai dal giudice.
- **Fornitore intercambiabile.** Un'interfaccia `Judge` (candidate → punteggi) con
  un'implementazione per fornitore, scelta da configurazione. I candidati da provare sono
  Jev (jevmodel.org, API di scoring a $0,042 per milione di token in ingresso, pubblica dal
  21 settembre 2026, multilingue in beta) e un modello piccolo ospitato come Claude Haiku
  4.5. Modelli locali esclusi: le funzioni serverless non li possono eseguire e un
  server dedicato va contro l'impostazione a gestione minima.
- **Attivazione.** C'è un interruttore globale, spento di default, più uno per famiglia per
  il test alla cieca. Si accende in produzione solo se la valutazione (sezione 9) mostra un
  vantaggio chiaro.

### 4. Job settimanale

- **Cron Trigger di Cloudflare** (deciso l'11 ottobre 2026 al posto di `pg_cron` con
  `pg_net`): ogni ora (`0 * * * *`) il Worker riceve l'evento `scheduled` e lavora nel
  ruolo `app_job`. Non servono una rotta `/internal/jobs/*`, `pg_net` né un segreto
  condiviso. Le esecuzioni orarie, che interrogano il database dal Worker, tengono anche
  attivo il progetto gratuito di Supabase. Il codice considera solo le famiglie per cui
  è già passato il mercoledì alle 20:00 nel loro fuso (`families.time_zone`) e manca la
  settimana successiva: famiglie in fusi diversi sono servite all'ora giusta e l'ora
  legale non richiede di cambiare il cron. Un'esecuzione senza famiglie da servire non
  fa nulla. Un'invocazione ha fino a 15 minuti di CPU sul piano a pagamento.
  Accanto al cron orario c'è quello dell'esportazione notturna (`30 2,4 * * *`, sezione
  8): l'evento `scheduled` si smista sull'espressione (`controller.cron`), un test
  verifica che le espressioni del codice coincidano con `wrangler.jsonc` e una
  espressione sconosciuta scrive solo un log di errore.
- **Smistamento**: crea in modo idempotente una riga in `weekly_jobs` per ogni famiglia
  da servire e per il lunedì successivo; poi legge, a parte, tutti i job ancora
  `pending` o `failed`.
- **Elaborazione**: un job alla volta, ciascuno nelle sue transazioni e nel suo
  `try/catch`, così un errore o un rallentamento riguarda solo quella famiglia. Genera
  la settimana in un'unica transazione, se non esiste già: l'unicità di (`family_id`,
  `starts_on`) e un lucchetto consultivo per famiglia (`pg_advisory_xact_lock`), preso
  prima di ogni scrittura anche dalla generazione pigra, impediscono doppioni e
  intrecci. Il job crea solo le settimane dei suoi job. Con il giudice attivo genera le
  candidate e chiama il giudice fuori dalla transazione. Il carico reale del
  pianificatore va misurato (sezione 17). Non c'è chiusura della settimana precedente
  (decisione del 6 ottobre 2026, sezione 2).
- **Generazione pigra** (decisa l'8 ottobre 2026, regola unica dell'11 ottobre): a ogni
  lettura del menu, dall'app o da un agente, il server controlla due settimane. Se
  manca quella in corso la genera dai pasti non ancora passati; se manca la successiva
  ed è passato mercoledì alle 20:00 la genera intera. Copre la prima generazione di una
  famiglia nuova e i buchi, per esempio dopo l'import. Gira nella transazione
  dell'utente, nel ruolo `authenticated` con le policy esistenti, senza giudice e con lo
  stesso codice del job; ogni generazione sta in un savepoint e un errore non blocca la
  lettura. Il job resta il percorso normale per la settimana successiva: chi apre l'app
  dopo un fallimento del job attende un poco di più e trova il menu. Senza realtime,
  chi ha già l'app aperta vede la settimana nuova alla riapertura o aggiornando.
- **Errori**: un errore riguarda solo il suo job. Un job fallito si ritenta ogni ora
  finché la sua settimana non è finita (se è già iniziata, genera i pasti ancora
  aperti); poi si chiude come `abandoned`. Nel log restano solo campi scelti:
  `weekly_job_failed`, `weekly_job_overdue` (dal giovedì alle 08:00 che precede la
  settimana, cioè 12 ore dopo le 20:00 del mercoledì) e `weekly_job_abandoned`. Su
  questi ultimi due arriva un'email al referente operativo del servizio (sotto, «Email
  operative»), insieme a quelle sull'esportazione notturna mancante (sezione 8) e sulle
  cancellazioni bloccate. Questo destinatario è configurato esplicitamente, con il
  segreto `OPS_ALERT_EMAIL` (sezione 1): assegnare il ruolo di
  curatore non abilita a ricevere segnalazioni sulle altre famiglie. Contenuti e accessi
  operativi devono rispettare la separazione dei ruoli della sezione 2: le email portano
  l'id della famiglia, mai il nome né indirizzi.
- **Famiglia eliminata durante il job** (PR #52): una famiglia eliminata dopo la
  selezione fa fallire l'inserimento per chiave esterna (`23503`) o non trova più il
  job; il job lo tratta come «famiglia eliminata», scrive `weekly_job_family_gone`
  (info) e passa alla successiva, senza segnare un fallimento.
- **Ripresa delle cancellazioni degli account** (PR #52): nello stesso Cron Trigger
  orario, dopo il job settimanale e in un `try` proprio, il Worker riprende con
  l'identità `job` le cancellazioni ferme da almeno 5 minuti la cui cancellazione in
  Supabase Auth non è riuscita (sezione 7): un successo, anche «utente già assente»,
  chiude la riga; un fallimento la conta. Log `account_deletion_resumed` e
  `account_deletion_failed`; dopo 3 tentativi falliti `account_deletion_overdue` a
  livello `error`, come `weekly_job_overdue`, e di nuovo a ogni tentativo. Nessun
  abbandono: i dati dell'app sono già cancellati e la riga si riprova ogni ora. Nei log
  solo id, codici e numeri. Dal terzo tentativo fallito parte anche l'email operativa
  `account_deletion_overdue` (sotto).
- **Email operative** (PR #64, unita e rilasciata il 17 ottobre 2026;
  particolari nella spec di dettaglio `2026-10-17-email.md`, sezione 5): quattro eventi,
  `weekly_job_overdue`, `weekly_job_abandoned`, `backup_export_missing` e
  `account_deletion_overdue`, un'email ciascuno al referente, con l'API di Resend.
  **Meglio un doppione raro che un allarme perso** (decisione del coordinatore): ogni
  allarme si registra in `ops_alerts` in una transazione `job` **propria**, mai in
  quella del lavoro, quindi job, ripresa ed esportazione confermano il proprio stato
  anche se l'allarme non si registra. Gli agganci immediati (job abbandonato o in
  ritardo, terzo fallimento di una cancellazione, esecuzione delle 04:30 senza
  esportazione) accorciano l'attesa ma non sono la garanzia: la garanzia è la
  **riconciliazione oraria** sugli stati persistiti degli ultimi 7 giorni, conclusi
  compresi, con la chiave primaria che evita i doppioni. Limite dichiarato: un job
  chiuso `done` dopo la soglia del ritardo perché la settimana era già nata dalla
  generazione pigra può dare un allarme in più. **Consegna**: ogni riga si acquisisce in
  modo atomico (una sola esecuzione la spedisce), oggetto e corpo sono quelli salvati
  alla creazione, la chiamata porta una chiave di idempotenza e si ritenta fino a 24
  ore; ogni `409` di idempotenza chiude la riga come ambigua, tranne
  `concurrent_idempotent_requests` (la stessa chiave ancora in corso), che è transitorio:
  libera l'acquisizione (`claimed_at = null`) e la riga si ritenta entro la finestra.
  Una riga ambigua e una non spedita entro 24 ore, che scade, hanno un log di errore e
  restano **senza rispedizione**: si leggono con
  uno script di sola lettura e si gestiscono a mano. Senza `RESEND_API_KEY` o
  `OPS_ALERT_EMAIL` non si acquisisce nulla. Al primo giro dopo il rilascio la
  riconciliazione può segnalare eventi dei 7 giorni precedenti, già noti.
- **Generazione su richiesta** ("rigenera" se la settimana manca; il wizard non genera,
  deciso l'11 ottobre 2026): stessa funzione, al massimo 3 volte a settimana per famiglia.
  Il wizard è arrivato il 15 ottobre 2026 senza «rigenera», che resta nell'ondata 3
  (attività E).
- **Prima generazione di una famiglia nuova** (deciso il 6 ottobre 2026): riempie i
  pasti non ancora passati da oggi a domenica; se è già passato mercoledì alle 20:00
  genera anche la settimana successiva, come avrebbe fatto il job. È il risultato della
  generazione pigra: `family.create` (`app.create_family`, sezione 2) non genera nulla,
  il wizard porta al Menu e la prima lettura del menu prepara le settimane.

### 5. Revisione e modifiche

- **Vista di apertura**: dopo il login e a ogni apertura l'app mostra i pasti di oggi della
  famiglia corrente. Se oggi non ci sono slot con contenuto, mostra il primo giorno da
  oggi che ne ha, poi il primo giorno da oggi con uno slot anche vuoto, poi l'ultimo
  giorno con slot prima di oggi; le schede «Nessuna ricetta adatta» restano visibili.
  Prima di scegliere il giorno vale la generazione pigra (sezione 4). Se non c'è nessuna
  settimana (famiglia nuova), porta alla generazione della prima settimana: la crea la
  generazione pigra, anche dopo il wizard, che non genera, e l'apertura segnala l'assenza
  di settimane solo se la generazione non riesce.
- **Contenuto di un pasto**, in ogni vista che lo mostra: nome e descrizione breve della
  ricetta, porzioni,
  voto (sotto), ingredienti scalati. Se la ricetta è `web` o `youtube` c'è il collegamento
  al `source_url` della fonte, che si apre fuori dall'app senza passare il referrer
  (come fa oggi il sito del progetto di origine con `Referrer-Policy: no-referrer`).
- **Scheda ricetta aperta da un pasto** (decisa dall'utente l'11 ottobre 2026): parte dalle
  porzioni del pasto. Precedenza: porzioni esplicite nell'indirizzo, poi porzioni positive
  del pasto, poi porzioni della fonte; il selettore resta e la versione è quella del pasto
  (R1).
  Per `book` si mostrano titolo e pagine; per `home` nessun collegamento. Per gli slot
  liberi, il testo. Un pasto con zero porzioni mostra gli ingredienti alle porzioni di
  riferimento della ricetta.
- **Versione della ricetta nei pasti (review R1, deciso nel quinto giro del prototipo):**
  un pasto passato mostra la ricetta nella versione in vigore quando è diventato passato,
  anche nella scheda ricetta aperta da quel pasto e nella lista della sua settimana;
  oggi e i pasti futuri usano la versione corrente, quindi una correzione del curatore
  arriva subito anche alla spesa (una voce già spuntata che aumenta torna da spuntare).
  La scelta della versione per pasto è una sola funzione del server
  (`mealRecipeVersions`), usata da Menu e Spesa.
  Lo slot conserva solo `recipe_id`: la versione si ricava da `recipe_versions` e
  dall'istante in cui il pasto è passato, con le funzioni SQL `app.meal_passed_at` e
  `app.recipe_version_at`. Se in quell'istante la ricetta non aveva ancora una versione
  pubblicata, si usa la prima versione pubblicata; se non è mai stata pubblicata (pasti
  importati con ricette in bozza), il pasto mostra solo nome e descrizione e non entra
  nella spesa (deciso l'11 ottobre 2026); il nome è nella lingua dell'utente o, se manca,
  nell'altra. Le ricette in bozza arrivano ai pasti solo
  dall'import; gli utenti non le scelgono, ma una bozza già citata si sposta con lo
  scambio e torna con l'annullamento (sotto, «Annulla»). Solo i curatori vedono nella scheda l'avviso
  che la ricetta è stata aggiornata dopo, con il collegamento alla versione attuale.
- **Ricette archiviate:** restano leggibili e votabili dai pasti che le usano, anche
  futuri, finché la famiglia non li cambia; non compaiono in ricerca, suggerimenti e
  nuove generazioni.

- **Cosa è modificabile, deciso il 6 ottobre 2026:** tutto, in ogni settimana visibile,
  passata, in corso o futura. Nessuna azione dipende dalla settimana.
  - **Istante in cui un pasto diventa passato, confermato il 6 ottobre 2026:** il
    pranzo alle 15:30 e la cena alle 23:00, nell'ora locale della famiglia
    (`families.time_zone`, sezione 2; Europe/Rome nei dati demo). Serve solo a
    stabilire da quando un pasto conta come mangiato nello storico; non blocca
    modifiche. Personalizzare questi orari non è previsto per ora.
- **Navigazione fra i giorni:** sopra il selettore dei sette giorni il mese e un'icona
  aprono un calendario per scegliere qualunque giorno che abbia un menu, anche passato; i giorni
  senza menu non sono selezionabili.
  - **Swipe fra le settimane** (decisioni dell'utente del 18 ottobre 2026, W19, PR #72;
    trascinamento dalla W21, PR #74): uno swipe orizzontale sulla fila dei giorni porta
    alla settimana successiva (verso sinistra) o alla precedente (verso destra), sullo
    stesso giorno della settimana. Mentre il dito si muove la fila lo segue e dal lato
    opposto entrano i giorni della settimana accanto, come in una striscia unica: solo le
    date, con lo stesso giorno della settimana evidenziato. Al rilascio si cambia
    settimana oltre un terzo della larghezza della fila o con un colpo veloce anche
    corto; altrimenti la fila torna al suo posto. Verso una settimana che non esiste la
    fila segue il dito con resistenza crescente, al posto dei giorni non compare niente,
    e al rilascio torna sempre al suo posto, senza messaggi (sostituisce il rimbalzo di
    W19). All'arrivo la settimana di solito è già letta e compare senza attesa. La
    traccia dei pasti sotto resta com'è e scorre solo fra i giorni della settimana
    mostrata; un giorno di arrivo senza pasti si apre vuoto. Il calendario resta
    l'alternativa, anche per tastiera e lettore di schermo (con VoiceOver lo swipe a un
    dito è del sistema). Particolari tecnici nella sezione 14.
- **Azioni sullo slot**, confermate nel secondo giro del prototipo (6 ottobre 2026):
  cambia porzioni; cambia ricetta (cinque suggerimenti, "proponimene altri", ricerca con
  filtri), che raccoglie anche segna libero con testo, non proporre più e scambia con un
  altro slot della stessa settimana; nota; vota. Valgono per pasti passati, in corso e futuri e per slot
  liberi e vuoti. Sono le operazioni dell'area `meals` (`getSuggestions`,
  `setServings`, `setRecipe`, `setFree`, `setNote`, `swap`, `undo`), uguali dal web e
  da MCP; particolari in `progetto/superpowers/specs/2026-10-11-revisione-pasti.md`.
  Nell'app (PR #33, come nel secondo giro) ogni pasto, con ricetta, libero o vuoto, ha
  il footer con la matita, che apre il pannello delle azioni sotto la scheda; dettagli,
  voto e ingredienti ci sono solo con una ricetta e un pannello alla volta resta aperto.
  Uno slot vuoto mostra «Scegli una ricetta», che apre il foglio sui suggerimenti.
  - **Porzioni:** da 1 a 20, per ogni pasto: con ricetta, libero o vuoto (scelta
    dell'utente). Il valore si invia poco dopo l'ultimo tocco o alla chiusura del
    pannello, senza aggiornamenti ottimistici. Un salvataggio respinto si spiega
    sempre: errore nel pannello, con il valore che torna a quello del server, o, se nel
    frattempo si è cambiata pagina, anche con la richiesta già partita, un avviso nel
    Menu che resta finché l'utente non lo chiude; gli avvisi sono legati alla sessione e
    si cancellano alla sua chiusura.
  - **Cambia ricetta:** si sceglie solo una ricetta pubblicata, dai suggerimenti o
    dalla ricerca, anche di un libro che la famiglia non possiede. La ricerca parte con
    il tipo di pasto dello slot e si attiva anche con i soli filtri; i risultati, come i
    suggerimenti, mostrano il voto in sola lettura e tolgono il piatto attuale. La
    ricerca distingue caricamento, nessun risultato ed errore, con «Riprova» anche
    sopra risultati già mostrati. Dalla W20 (PR #75) i risultati della ricerca precedente
    restano visibili finché arrivano i nuovi, così la lista non crolla a ogni lettera;
    suggerimenti e prima ricerca in attesa sono skeleton (sezione 14). Se la ricetta o il pasto non sono più disponibili
    (`not_found`), il foglio si chiude, la settimana si rilegge e un avviso resta nel
    Menu finché l'utente non lo chiude.
  - **Pasto libero:** testo fino a 60 caratteri, conservato come scritto; le proposte
    rapide sono i quattro testi liberi più usati dalla famiglia. La nota resta.
  - **Scambio:** si spostano ricetta o testo libero e nota; le porzioni restano allo slot,
    perché dipendono da chi c'è quel giorno.
  - **Non proporre più:** aggiunge l'esclusione per la famiglia e apre subito la scelta
    del sostituto; i pasti già pianificati con quella ricetta non cambiano. L'esclusione
    resta anche se si chiude il foglio senza scegliere; si annulla dal foglio stesso o
    dall'elenco delle esclusioni, gestito nel percorso Famiglia e account (Profilo).
  - **Nota:** testo libero fino a 200 caratteri, conservato come scritto, visibile a
    tutta la famiglia.
  - **Annulla:** nell'app, dopo ogni modifica che ha cambiato qualcosa, un avviso offre
    «Annulla» per 6 secondi (scelta dell'utente); il server non pone limiti di tempo,
    anche sui pasti passati. L'annullamento dall'avviso vale per la settimana del pasto
    anche se nel frattempo è cambiata la settimana mostrata o la lingua; se non è più
    possibile, l'avviso dice che il pasto è stato cambiato e la settimana si rilegge.
    Si annulla solo la propria ultima azione e solo se nessuno ha cambiato dopo i suoi
    pasti; uno scambio torna sempre per intero, su entrambi i pasti. L'annullamento è a
    sua volta un'azione registrata e si può annullare. Da un agente si annulla la
    propria ultima modifica anche in una conversazione nuova: la vista del pasto dice se
    è annullabile e quali pasti coinvolge (sezione 13). Una bozza importata tolta da un
    pasto torna con l'annullamento se la bozza è ancora aperta; se nel frattempo è stata
    pubblicata torna la ricetta pubblicata (stesso id); se è stata chiusa senza
    pubblicazione l'annullamento non è più possibile (`draft_closed`; decisione del
    coordinatore, 12 ottobre 2026).
- **Voto**: è sulla ricetta (`ratings`: utente × ricetta), non sullo slot. È sempre possibile,
  dallo slot di qualsiasi settimana o dalla scheda della ricetta nel catalogo, e non dipende
  dallo stato della settimana. Ricettario e scheda della ricetta non offrono «non
  proporre più» e non nascondono le ricette escluse.
- **Voto sempre visibile**: ogni volta che l'interfaccia mostra una ricetta (slot,
  suggerimenti, risultati di ricerca, scheda della ricetta) mostra anche le stelline
  con:
  - la media della famiglia e il numero di voti (per esempio "4,3 · 3 voti"), oppure
    "nessun voto";
  - il voto dell'utente corrente, distinto dalla media, oppure "non hai votato".

  Dal voto mostrato si vota o si cambia il proprio voto direttamente, senza passare da
  un'altra schermata (da 1 a 5, più "togli il mio voto"); fanno eccezione i suggerimenti,
  dove il voto è solo visualizzato (deciso il 6 ottobre 2026). Il salvataggio aggiorna subito
  media e proprio voto in quella vista. È un unico componente riusato in tutte le viste; la
  sua forma si decide nel design delle superfici.
- **Tracciabilità**: ogni scrittura è un'azione (`meal_actions`) con un `id` scelto
  dal client; aggiorna `updated_by`, `updated_at` e `last_action_id` degli slot che
  cambia e aggiunge una riga a `meal_changes` per ciascuno, anche quando arriva da MCP.
  Una richiesta che non cambia nulla non tocca slot né registro e non cambia l'ultima
  modifica mostrata, ma resta ricordata: ripeterla non sovrascrive le modifiche fatte
  dopo da altri. La generazione crea e non
  modifica: lascia `updated_by` vuoto e non scrive il registro, quindi l'ultima modifica
  mostrata è sempre di una persona. L'interfaccia mostra solo
  l'ultima modifica, con persona e momento; il canale (web o MCP) resta nel registro e
  non si mostra (deciso il 6 ottobre 2026).
- **Concorrenza, decisa il 6 ottobre 2026:** vince l'ultimo salvataggio, senza avviso di
  conflitto; il registro `meal_changes` conserva tutte le modifiche e l'ultima modifica
  mostrata dice chi ha cambiato il pasto. Niente realtime in v1: aggiornamento
  all'apertura, al ritorno in primo piano e a richiesta dell'utente, con il controllo
  della versione della sezione 1.
- **Offline**: l'ultima settimana caricata resta consultabile in sola lettura, tranne
  la lista della spesa (sezione 6), modificabile anche offline. Senza rete matita,
  porzioni, comandi del foglio e «Annulla» si disattivano, anche se il foglio era già
  aperto; chiusura e consultazione restano.

### 6. Scalatura e lista della spesa

- **Scalatura**: quantità × porzioni dello slot ÷ `base_servings`.
- **Sistema scelto dalla famiglia**: metrico oppure imperiale britannico, anche nei
  risultati MCP. La lingua dell'utente non cambia il sistema di misura.
- **Conversioni**: masse tra g/kg e once/libbre; volumi tra ml/l e misure imperiali
  britanniche. Le unità britanniche devono essere identificate senza confonderle con
  quelle statunitensi. Codici, dimensioni e fattori (Weights and Measures Act 1985 e
  NIST) sono definiti in `domain/src/units/`, insieme a `Localized`, `Quantity` e ai loro
  schemi; le varianti di bozza della ricetta si costruiscono sopra.
- **Presentazione imperiale britannica** (confermata dall'utente l'11 ottobre 2026):
  grammi sotto ½ oz; once al ½ fino a 4 oz, poi intere; libbre al ¼ da 1 lb; volumi
  fino a 45 ml in cucchiaini e cucchiai di misura (5 e 15 ml) al ½; fl oz al ½ fino a
  4, poi intere; pinte al ¼ da 1 pinta. La soglia si sceglie dopo l'arrotondamento
  (15,8 oz → 1 lb). Cucchiai di misura e cucchiai domestici dello stesso tipo nella
  stessa voce si mostrano sommati; il calcolo resta separato.
- **Proposta per i calcoli**: conservare i valori della fonte e usare una rappresentazione
  comune per scalare e sommare quantità compatibili. Convertire e arrotondare solo per
  la presentazione, dopo il consolidamento della spesa. Cambiare la preferenza non
  modifica i dati della ricetta e non introduce conversioni ripetute sui valori salvati.
- **Dimensioni diverse**: non convertire massa in volume senza un'equivalenza verificata
  per quello specifico ingrediente. Conteggi, unità domestiche ambigue e quantità non
  numeriche mantengono il loro significato; la traduzione dell'etichetta non basta a
  stabilire una conversione. Cucchiai e cucchiaini sono unità domestiche: mai convertiti
  in ml né sommati ai volumi. Bicchieri, gocci, confezioni, vasetti, bustine, panetti e
  intervalli sono quantità testuali tradotte, che il curatore può convertire in g o ml
  con una fonte.
- **Arrotondamenti metrici della base approvata**, da verificare nel prototipo insieme
  alla nuova pipeline di calcolo: grammi alla decina (a 5 g sotto i 50 g), ml come i
  grammi, cucchiai e cucchiaini al mezzo. Unità contate scalate (decise dall'utente l'11
  ottobre 2026): spicchi, pizzichi, rametti, foglie, mazzi e fette all'intero superiore
  («5 spicchi», non «4½»); pezzi al mezzo superiore nella ricetta e nel pasto, perché
  molte ricette usano mezze cipolle o mezzi peperoni. Alle porzioni della fonte le unità
  contate restano come sono scritte. La regola si applica alla presentazione, non ai
  valori intermedi da sommare.
- **Codici delle unità** (ondata 1): massa `g`, `kg`, `oz`, `lb`; volume `ml`, `l`,
  `uk_fl_oz`, `uk_pint`; unità domestiche `tbsp`, `tsp`; conteggi `piece`, `clove`,
  `slice`, `pinch`, `sprig`, `bunch`, `leaf`; `us_cup` solo nelle bozze. Etichette
  localizzate in `domain/`, condivise da server e web. Una quantità è `amount` (valore e
  unità), `to_taste` («q.b.») oppure `text` (testo nelle due lingue), con il testo della
  fonte sempre conservato.
- **Equivalenze**: quelle di ambito `recipe` si applicano durante la gestione o l'import,
  perché le versioni sono immutabili, mai in lettura; quelle di ambito `shopping` a ogni
  calcolo della lista. Un'equivalenza con preparazione vale solo per le righe con quella
  preparazione e ha la precedenza sulla generica; quella di un'altra preparazione non si
  usa mai. La preparazione si legge solo dal campo bilingue della riga, mai dal testo
  della fonte (sezione 8).
- **Lista della settimana** (terzo giro del prototipo, 6 ottobre 2026): una lista per
  settimana con tutti i pasti della settimana, senza scelta dei pasti, senza altre liste
  e senza archivio; si apre dalla borsa nella barra del Menu sulla settimana mostrata;
  le settimane passate tengono la loro lista. Le quantità non si salvano: si ricalcolano
  dai pasti, quindi seguono ogni modifica.
- **Generazione delle voci**:
  1. si parte da tutti gli slot della settimana con ricetta (pasti liberi, vuoti e
     ricette senza ingredienti esclusi; le ricette senza ingredienti e quelle mai
     pubblicate compaiono negli avvisi della lista);
  2. si scalano gli ingredienti;
  3. si consolida per ingrediente e varietà: righe che differiscono solo per
     preparazione, taglia o forma della parola sono lo stesso ingrediente; prodotti
     diversi restano voci diverse (mandorle in scaglie, pomodorini perini). Righe con lo
     stesso ingrediente e varietà diverse sono voci separate («Pomodori», «Pomodori (Roma)»),
     scritte «Nome (varietà)» nelle due lingue e ordinate per ingrediente e poi per varietà
     (deciso l'11 ottobre 2026);
     grafie della stessa varietà si sommano (confronto che ignora maiuscole, accenti,
     punteggiatura e parole come «tipo») e la voce mostra la grafia più usata. Gli
     evitati della famiglia valgono per tutte le varietà. Le unità compatibili si
     sommano in una rappresentazione comune; le incompatibili restano sulla stessa
     voce ("50 g + 100 ml");
  4. si convertono nelle unità di acquisto le righe con un'equivalenza di ambito
     `shopping` (succo di limone in grammi → limoni, 47 g di succo a limone secondo
     USDA FoodData Central);
  5. si escludono gli ingredienti con `is_pantry` e quelli con restrizione `avoid`
     della famiglia, mostrati in "Non in lista", da cui si possono rimettere;
  6. si segnano gli opzionali;
  7. si raggruppa per reparto nell'ordine standard (frutta e verdura, macelleria,
     pescheria, banco frigo e latticini, pane, pasta riso e cereali, scatolame e
     conserve, surgelati, condimenti e dispensa, altro);
  8. si presentano le quantità nel sistema della famiglia e i testi nella lingua di chi
     guarda; tutte le unità contate (tranne cucchiai, cucchiaini e tazze) si
     arrotondano per eccesso all'intero; solo `piece` ignora un avanzo di 0,1 dovuto alle
     conversioni (½ peperone → 1, 2,06 limoni → 2). Ricetta, scheda del pasto e
     provenienza delle voci restano nelle unità della ricetta.
- **Tazze USA delle fonti americane**: si convertono solo con un'equivalenza verificata
  per l'ingrediente, conservando il testo della fonte: il conteggio dato dalla fonte se
  c'è ("½ cup (circa ½ cipolla media)" → ½ cipolla), grammi da fonti verificate per i
  solidi (cheddar grattugiato 113 g, lattuga sminuzzata 72 g), millilitri per liquidi e
  salse (236,6 ml). Senza equivalenza la ricetta resta in bozza.
- **Spunte condivise**: tutti i membri vedono e modificano la lista; per singola voce
  vince l'ultimo salvataggio; si ricorda chi ha cambiato la lista per ultimo. Una voce
  spuntata la cui quantità poi aumenta torna da spuntare e mostra la quantità spuntata
  ("prima: 200 g"); se diminuisce resta spuntata. Voci libere nella sezione "Altro",
  aggiunte dall'ultima riga della sezione, fino a 60 caratteri, conservate come scritte.
  La vista della lista espone la quantità canonica di ogni voce, che il client invia
  sempre con la spunta, anche via MCP: una ripetizione salva lo stesso contenuto. Se un
  membro cancella una voce libera mentre un altro ripete l'invio della sua aggiunta, la
  voce ricompare: caso accettato, si elimina di nuovo.
- **Offline**: la lista è l'unica parte dell'app modificabile offline (spunte, voci
  libere, ingredienti rimessi): le modifiche restano sul dispositivo in una coda locale
  e si inviano al ritorno della rete, con la regola dell'ultimo salvataggio per voce;
  l'interfaccia segnala le modifiche da sincronizzare. Ogni modifica in coda porta un
  identificativo generato dal dispositivo, così un invio ripetuto non la applica due
  volte (sezione 1, contratto delle operazioni). Bring! richiede la rete. La coda resta
  usabile anche quando la sessione non si può verificare, unica eccezione alla sola
  consultazione (deciso l'11 ottobre 2026): è per utente, in IndexedDB, mostrata come
  strato «da sincronizzare» fuori dalla cache delle letture; alla riconnessione si
  rinnova la sessione e si invia in ordine solo se l'utente è lo stesso; un rinnovo
  rifiutato chiude la sessione e cancella la coda; `forbidden` scarta le voci di quella
  famiglia. Niente Background Sync, che Safari iOS non supporta. Tutte le modifiche
  della lista passano dalla coda, anche online: ogni operazione è salvata come in attesa
  o inviata prima dell'invio, si compattano solo operazioni mai inviate e ogni risposta
  diventa la nuova base, con sopra le operazioni ancora in attesa. Più schede dello
  stesso utente si escludono con Web Locks; senza Web Locks è una limitazione
  dichiarata. Lista e coda sopravvivono agli aggiornamenti dell'app: la copia non dipende
  dalla versione della build e l'app non si ricarica con la coda non vuota (sezione 1).
- **Esportazioni** (dal menu "…" della lista; escludono le voci spuntate e includono le
  voci libere):
  - PDF di una pagina, nell'ondata 3 (nel traguardo A il menu non lo mostra);
  - Condividi: testo semplice calcolato sul dispositivo, quindi anche offline, con la
    Web Share API o, in mancanza, copiato negli appunti;
  - Bring!: richiede la rete e la lista sincronizzata (senza operazioni in coda). Si
    salva in `temporary_lists` con un token casuale e si apre
    `https://api.getbring.com/rest/bringrecipes/deeplink?url=<app>/shopping-lists/<token>&source=web`
    in due passi, compatibili con Safari iOS: creazione del link, poi «Apri in Bring!».
    La pagina `/shopping-lists/<token>` è pubblica, `noindex` e senza cache, letta nel
    ruolo `anon`, e contiene solo il JSON-LD `schema.org/Recipe` con nome «Cosa si
    mangia» e `recipeIngredient` nel formato "quantità nome", senza nome della famiglia
    né giorni. Una lista vuota non crea il link (`invalid`). Scade dopo 30 minuti; un job
    `pg_cron` la pulisce. È lo stesso meccanismo di `scripts/sito_lib.py` nel progetto di
    origine.

  Tramite MCP si devono ottenere gli stessi contenuti esportabili: testo e collegamento
  Bring!, poi il PDF. La consegna di file e collegamenti dipende dalle capacità del
  client e verrà provata nel design MCP; il requisito non implica poter comandare
  direttamente l'interfaccia di condivisione del dispositivo da qualunque agente.

### 7. Account, Famiglia, inviti

- **Supabase Auth: accesso con email e password**, dal traguardo A in poi (decisione
  dell'utente del 13 ottobre 2026, che sostituisce il link via email della specifica di
  base). Sull'iPhone la PWA installata sulla schermata Home non condivide cookie e
  archivio con Safari: un link che apre Safari lascia lì la sessione e l'app installata
  resta fuori. Per questo nessun link via email serve a entrare: i link delle email
  dell'app (attività D dell'ondata 3, PR #64, unita e rilasciata il 17 ottobre
  2026) servono solo a scegliere o reimpostare la password (sotto). Nel
  traguardo A (sezione 10) gli account li ha creati
  l'amministratore dalla dashboard di Supabase (*Add user*, con email confermata e
  password scelta da lui) e famiglia, appartenenze e ruoli globali li ha preparati lo
  script di avvio `bootstrap.sql` (sezione 10); dal 15 ottobre 2026 gli account nascono
  dagli inviti all'app e le famiglie dal wizard (sotto).
- **Cambio della password dal Profilo** (issue #37, rilasciato il 13 ottobre 2026 e
  provato dall'utente sull'iPhone): funzione permanente, perché la password è la strada
  permanente. Profilo › «Cambia password» chiede la password attuale, la nuova (almeno 8
  caratteri) e la conferma; esito ed errori tradotti, nessuna email. La password attuale
  si verifica sempre con un accesso di prova (sezione 1), anche dove Supabase non la
  ricontrolla. Dopo il cambio Supabase chiude tutte le altre sessioni dell'utente,
  dispositivi e agenti collegati compresi (provato in CI); il dispositivo resta dentro e
  la pagina lo dice prima della conferma. **Precondizione di produzione**: «Secure
  password change» spento, perché senza email non c'è riautenticazione (con l'opzione
  accesa una sessione di più di 24 ore riceverebbe `reauthentication_needed`).
  «Require current password when updating» acceso dall'utente il 13 ottobre 2026; il
  minimo di produzione non è verificato, la SPA impone 8 (sezione 1).
- **Password dimenticata** (ondata 3, attività D, PR #64, unita e rilasciata il 17
  ottobre 2026; decisioni dell'utente; particolari nella spec di dettaglio
  `2026-10-17-email.md`, sezione 3): sotto «Entra» la pagina di accesso ha
  «Password dimenticata?» verso `/password/forgot`, con l'email già scritta. La pagina
  chiede l'email e risponde **sempre allo stesso modo**, che l'account esista o no,
  anche oltre il limite di un invio al minuto per indirizzo; solo il limite orario del
  progetto ha un suo messaggio. L'email la spedisce Supabase Auth
  (`resetPasswordForEmail`, template `recovery`, sezione 1) e il link, valido **24 ore**,
  apre Safari una volta su `/password`, la stessa pagina degli inviti: password con le
  regole del Profilo, ripetuta, poi «Salva la password». Dopo il salvataggio Supabase
  chiude le altre sessioni, agenti compresi, e la pagina mostra «Password salvata.» con
  **«Accedi»** verso `/login` con l'email già scritta: **nessun ingresso automatico**
  (decisione del coordinatore e dell'utente), perché nella PWA installata si entra
  comunque con email e password. Un link scaduto o già usato dà «Questo link non vale
  più» con «Chiedi un link nuovo»; con un altro account aperto nel browser la pagina
  propone «Esci e continua» prima di usare il codice. **Rischio noto accettato**:
  l'endpoint pubblico `/auth/v1/recover` di Supabase risponde 429 a una seconda
  richiesta entro un minuto solo per un indirizzo con un account, e la UI non lo rivela.
  È un caso raro e il passaggio da Safari è accettabile.
- **Google** (decisione dell'utente del 13 ottobre 2026): comodità facoltativa, da
  aggiungere solo dopo una prova sull'iPhone con l'app installata. Da verificare nel
  progetto: se il ritorno dal redirect OAuth porta la sessione dentro la PWA
  installata, e come collegare un'identità Google con le iscrizioni spente.
- **Iscrizioni libere spente in produzione** (decisione dell'utente del 12 ottobre
  2026, confermata il 13 ottobre anche per l'ondata 3): in Supabase Auth «Allow new
  users to sign up» è disattivato; ogni anteprima di rilascio verifica
  `disable_signup: true` leggendo le impostazioni di Auth, senza tentare un'iscrizione.
  L'OAuth server degli agenti funziona comunque (sezione 1). Dal 15 ottobre 2026 sono
  spente anche nello stack locale e in CI; le persone di prova si creano con l'API di
  amministrazione e la chiave segreta locale (sezioni 1 e 9).
- **L'invito crea l'account** (ondata 3, decisione dell'utente del 13 ottobre 2026):
  quando una persona senza account accetta un invito valido, alla famiglia o all'app, il
  **server crea il suo account**; le iscrizioni libere restano spente. Inviti all'app e
  creazione delle famiglie da parte degli utenti sono in produzione dal 15 ottobre 2026
  (attività A, PR #45); inviti alla famiglia ed eliminazione delle famiglie sono in
  produzione dal 16 ottobre 2026 con l'attività C (PR #52). Come si sceglie
  la password dipende dall'attività D (sotto): prima sulla pagina dell'invito, senza
  email (il flusso in produzione fino al rilascio di D); dopo con il link dell'email
  «Scegli la password» (sotto, «Dopo l'attività D»).
- **Prima della verifica del dominio di invio** (decisione dell'utente del 13 ottobre
  2026, temporanea; in produzione dal 15 ottobre con l'attività A): il DNS di
  `qunidi.it` per ora non si può modificare, quindi Resend non verifica
  `cosasimangia.qunidi.it` e l'app non spedisce email. Dal 17 ottobre 2026 il dominio di
  invio `cosasimangia.app` è verificato e la parte software dell'attività D è unita
  (PR #64): il flusso è stato questo fino al rilascio, il 17 ottobre alle 17:54 UTC,
  poi vale «Dopo l'attività D» (sotto). L'invito all'app si accetta sulla
  pagina `/invite/app#<token>`: la persona scrive in un solo modulo l'email dell'invito,
  che deve coincidere, il suo nome e la password (due volte); il server crea l'account
  già confermato. Subito dopo la creazione la stessa pagina fa entrare la persona con
  quell'email e quella password (`signInWithPassword`, decisione del coordinatore del
  13 ottobre 2026) e la porta al wizard della famiglia nuova. Se l'accesso fallisce dopo
  la creazione, la pagina lo dice e porta a `/login` con l'email già scritta: l'account
  esiste già e l'invito risulta usato. Con credenziali rifiutate (account creato da un
  tentativo precedente con un'altra password) il testo è «Il tuo account è pronto: entra
  con la password che hai scelto la prima volta». L'amministratore copia il link, o lo
  condivide, e lo manda a mano (per esempio su WhatsApp). Il possesso del link vale
  come prova al posto dell'email, con i limiti già decisi: un'email, uso singolo, 7
  giorni, revoca. Per gli inviti alla famiglia, riusabili e non legati a un'email, la
  regola equivalente è una **decisione dell'utente del 16 ottobre 2026** (attività C):
  sulla pagina `/invite#<token>` la persona scrive email, nome e password e con una
  conferma esplicita ottiene account e ingresso nella famiglia in un solo passaggio; con lo stesso link si registrano **al più 10 persone** (il tetto conta le
  email distinte che hanno iniziato a registrarsi, riuscite o no; un `weak_password`
  riprovato con la stessa email non consuma un'altra quota; chi ha già un account entra
  anche a tetto raggiunto). Oltre il tetto il link vale come non valido per creare
  account. L'email scritta non è verificata fino al rilascio dell'attività D, che chiude
  questo rischio accettato: fino ad allora un'email presa da
  altri si rimedia cancellando quell'account dall'amministrazione. Niente «password
  dimenticata» e niente email di allarme in questa fase: una password dimenticata la
  reimposta l'amministratore dalla dashboard di Supabase.
- **Accettazione dell'invito all'app** (PR #45; particolari nella spec di dettaglio
  `2026-10-13-inviti-app.md`, sezione 2): tre passi ripetibili dallo stesso link senza
  doppioni. **Prenotazione**: una transazione breve controlla l'email e fissa l'id del
  futuro account sull'invito. **Creazione**: fuori da ogni transazione, il modulo
  `server/src/accounts/` (`createInvitedAccount`, l'unico che legge
  `SUPABASE_SECRET_KEY`) chiama `POST /auth/v1/admin/users` con l'id prenotato,
  `email_confirm: true`, password e `user_metadata` con nome e lingua della pagina; la
  chiave va nell'intestazione `apikey`, mai come `Bearer`. Ogni esito diverso dal
  successo (email già usata, errore del server, tempo scaduto, rete) è ambiguo e si
  riconcilia leggendo l'utente con l'id prenotato: se c'è con l'email dell'invito la
  creazione è avvenuta e si prosegue; se l'email appartiene a un altro account la
  risposta è `account_exists`; se Auth ha rifiutato la password come debole e l'account
  non esiste la risposta è `invalid` sul campo `password` con codice `weak_password`
  (l'invito resta prenotato e si riprova con un'altra password); se l'account non si vede
  ancora la risposta è `internal` e la persona riprova dallo stesso link. **Il server non riscrive mai le credenziali né i
  metadati di un account esistente**: un'accettazione ripresa conserva password, nome e
  lingua del primo tentativo riuscito. **Chiusura**: una seconda transazione breve segna
  l'invito accettato e assegna i ruoli globali. Un account creato e poi rimasto senza
  chiusura per una revoca nel frattempo resta senza ruoli né famiglia e si gestisce
  dall'elenco degli utenti (attività B, dal 16 ottobre 2026), dove compare. Nei log mai password, token, email né corpi di
  richiesta e risposta. Con l'attività D cambia solo la creazione (sotto): senza
  password, con `email_confirm: false` e i soli nome e lingua nei metadati, e un esito
  ambiguo riconciliato dice anche se l'email è già confermata.
- **Dopo l'attività D** (dominio di invio verificato il 17 ottobre 2026, parte software
  unita e rilasciata lo stesso giorno con la PR #64; decisioni dell'utente;
  testi, stati delle pagine e sequenze nella spec di dettaglio `2026-10-17-email.md`,
  sezioni 2 e 3). **Un solo meccanismo per i due inviti**, all'app e alla famiglia:
  il link d'invito si condivide a mano come prima; chi non ha un account scrive sulla
  pagina solo email e nome, non la password (pulsanti «Continua» per l'app ed «Entra
  nella famiglia» per la famiglia, con la riga «Ti mandiamo un'email per scegliere la
  password.»); il server prenota e chiude come prima e crea l'account **senza password
  e con l'email da confermare** (nessuno conosce la password: chi scrive l'email di un
  altro non ottiene nulla). Dopo la chiusura, fuori da ogni transazione, il server
  spedisce con Resend l'email **«Scegli la password»** con un link a
  `/password#token_hash=…&type=recovery` ottenuto da `generate_link` (sezione 1), valido
  24 ore; solo la prima email di un invito alla famiglia nomina la famiglia. Il link apre
  Safari una volta su `/password`: la verifica del link conferma l'email, prima di ogni
  salvataggio; poi la persona sceglie la password (regole del Profilo) e, con «Accedi»,
  entra con email e password,
  anche nella PWA installata. Un errore dell'email **non annulla l'accettazione**. La
  pagina dell'invito non fa più entrare: mostra **«Controlla la posta»** con l'email,
  la durata del link, «Rimanda l'email» (dopo 60 secondi, testo generico, mai il nome
  della famiglia) e, solo per la famiglia, **«Email sbagliata? Ricomincia»**, che riporta
  al modulo vuoto sullo stesso link; ha messaggi propri per email non partita, invio
  troppo ravvicinato, account già pronto, link già usato con quella email e account
  cancellato nel frattempo. Chi entra da un invito all'app non passa più dal wizard: dopo
  la password entra e trova «Crea la tua famiglia». **Durante l'attesa** la persona
  compare subito tra i membri, o ha i ruoli dell'invito all'app, con l'etichetta
  **«Non ha ancora confermato l'email»** (pagina dei membri e `/admin`, sotto), finché
  la verifica del link non conferma l'email; chi apre
  il link e conferma l'email senza salvare la password usa «Password dimenticata».
  **Chi ha già un account** accetta un invito alla famiglia con la sua password, senza
  verifiche; **gli account creati prima di D restano come sono**. Il passaggio fra
  versioni non alza `CACHE_SCHEMA`; una PWA rimasta indietro che manda ancora la
  password ottiene comunque l'account e l'email (matrice nella spec di dettaglio,
  sezione 3). Arrivano anche la «password dimenticata» (sopra) e le email operative
  (sezioni 4 e 8). Dal 17 ottobre 2026 app ed email stanno sullo stesso
  dominio, `cosasimangia.app`, verificato in Resend, e Supabase Auth spedisce con l'SMTP
  di Resend (sezione 1).
- **Uscita e revoca sul dispositivo**: «Esci» chiude la sessione solo su questo
  dispositivo e cancella i dati salvati dell'utente anche se il servizio non risponde;
  un accesso revocato a una famiglia ne toglie subito i dati dal dispositivo (sezione 1).
- **Email con Resend** (deciso l'8 ottobre 2026; dominio e SMTP di Supabase Auth
  configurati il 17 ottobre 2026, email dell'app attive con il rilascio della parte
  software dell'attività D, PR #64),
  piano gratuito: 3.000 email al mese, al massimo 100 al giorno, condivise fra SMTP di
  Supabase e API del server; oltre il limite l'invio si sospende, senza addebiti.
  Supabase Auth lo usa come SMTP personalizzato solo per la «password dimenticata»; il
  server lo chiama via API per l'email «Scegli la password» degli inviti, per «Rimanda
  l'email» e per le proprie email operative (sezioni 4 e 8). Il servizio di default di
  Supabase non basta: consegna solo agli indirizzi dei membri del team
  dell'organizzazione Supabase, con pochi invii all'ora ed è solo per le prove. Con un
  SMTP personalizzato Supabase parte da 30 email all'ora, configurabile. Il dominio di
  invio, previsto prima in `cosasimangia.qunidi.it`, è dal 17 ottobre 2026
  `cosasimangia.app`, lo stesso dell'app (decisione dell'utente), verificato in Resend
  con DKIM `resend._domainkey`, MX e SPF su `send.` e DMARC `p=none`; mittente
  `Cosa si mangia <noreply@cosasimangia.app>`, chiave API dedicata di solo invio
  limitata al dominio (sezione 1).
- **Inviti alla famiglia** (uniti e rilasciati il 16 ottobre 2026 con l'attività C, PR
  #52; testi, stati delle pagine e sequenze nella spec di dettaglio
  `2026-10-16-gestione-famiglia.md`, sezioni 2 e 3):
  - link `/invite#<token>`, con il token nel **frammento** come per gli inviti all'app
    (32 byte casuali, nel database solo l'impronta SHA-256), valido 7 giorni,
    riusabile fino alla scadenza, revocabile; gli amministratori lo creano, lo
    condividono e lo revocano dalla pagina dei membri. **Il link si vede solo alla
    creazione**: per ricondividerlo se ne crea uno nuovo. L'elenco mostra autore,
    scadenza e persone registrate, più i link scaduti con registrazioni da completare,
    tutti revocabili; i membri non amministratori vedono a chi chiederlo;
  - **i link creati da una persona si revocano per tutti** quando esce dalla famiglia,
    viene rimossa, perde il ruolo di amministratore o cancella l'account, anche se
    scaduti ma con registrazioni da completare; le conferme di questi passaggi dicono
    quanti link smetteranno di valere (scelta di prodotto del coordinatore del 16
    ottobre 2026);
  - **registro degli ingressi** (decisione del coordinatore del 16 ottobre 2026): ogni
    ingresso da link, con account nuovo o esistente, registra persona, link e momento;
    gli amministratori della famiglia vedono gli ultimi 50 nella pagina dei membri;
  - la pagina dell'invito si legge anche senza accesso (solo nome della famiglia e chi
    invita); chi non ha un account lo crea sulla pagina (sopra, «Prima della verifica
    del dominio di invio» e, dal rilascio di D, «Dopo l'attività D») ed entra nella
    famiglia, che diventa quella mostrata; chi ha
    un account accede, torna alla pagina con il token sempre nel frammento e conferma
    l'ingresso; chi ne fa già parte non cambia niente. A tetto raggiunto la pagina
    lascia solo l'accesso;
  - **accettazione** come per gli inviti all'app: prenotazione, creazione dell'account
    con `createInvitedAccount`, chiusura che fa entrare nella famiglia; ripetibile dallo
    stesso link senza doppioni, e una ripetizione dopo la chiusura non crea account né
    fa rientrare nessuno. Se l'ingresso diventa impossibile fra la prenotazione e la
    chiusura (link revocato, autore retrocesso, famiglia eliminata, rimozione), l'account
    già creato **resta**, senza famiglia: la pagina porta all'accesso con l'email, poi
    c'è lo stato senza famiglia, e l'account compare nell'elenco degli utenti (decisione
    del coordinatore del 16 ottobre 2026). Un account esistente non si cancella mai per
    un invito;
  - link scaduto, revocato o inesistente: un solo messaggio, con l'invito a chiedere un
    link nuovo a un amministratore della famiglia;
  - **rientro dopo la rimozione** (review R2, deciso il 6 ottobre 2026): un membro
    rimosso non rientra con un link creato prima della rimozione, anche se ancora
    valido, e vede lo stesso messaggio di un link non più valido; la rimozione non
    invalida per gli altri i link creati da altri amministratori, mentre quelli creati
    dalla persona rimossa si revocano per tutti (sopra). L'uscita volontaria non impone
    un link successivo per rientrare, ma revoca comunque i link creati da chi esce. Un
    rientro con un link valido funziona anche nella stessa sessione: la famiglia torna
    sul dispositivo senza dati vecchi (sezione 1).
- **Inviti all'app** (decisi nel sesto giro del prototipo): gestibili dagli
  amministratori dell'app nella pagina di amministrazione e tramite MCP. Un invito è
  per un'email e indica, se si vuole, i ruoli globali da assegnare all'accettazione
  (curatore, amministratore dell'app); non fa entrare in nessuna famiglia. Il link vale
  7 giorni, si usa una sola volta e solo con quell'email, si può revocare; un nuovo
  invito alla stessa email sostituisce quello in attesa. A un'email che ha già un
  account non si crea un invito: i ruoli si cambiano dall'elenco degli utenti, e dal
  16 ottobre 2026 il foglio del nuovo invito collega a quella persona (sotto). Il link
  è `/invite/app#<token>` (PR #45): il token sta nel **frammento**, che il browser non
  manda mai al server, quindi non finisce nei log, nei proxy né nell'intestazione
  `Referer`; il token è di 32 byte casuali e nel database ne resta solo l'impronta
  SHA-256, perché un invito può dare `app_admin`. Per questo **il link si vede solo alla
  creazione**, sul web e via MCP, e nessuna operazione lo ricostruisce: nell'elenco
  c'è «Nuovo link», che crea un invito nuovo con la stessa email e gli stessi ruoli e
  sostituisce quello in attesa (differenza dal sesto giro, sezione 14). La pagina si
  legge senza accesso: «Hai un invito per Cosa si mangia?», chi invita e i ruoli, mai
  l'email; chi non ha un account lo ottiene accettando l'invito (sopra) ed entra con
  email e password; con un altro account aperto la pagina propone «Esci e continua».
  Invito scaduto, revocato, già usato o inesistente danno **lo stesso messaggio**:
  «Questo invito non vale più» e «Chiedi un link nuovo a chi ti ha invitato».
  Alla cancellazione di un account (attività C, PR #52) i suoi inviti all'app ancora in
  attesa, creati da lui o indirizzati alla sua email, si revocano, e gli inviti
  accettati dall'account o indirizzati alla sua email perdono l'email: le righe restano
  con ruoli, autore e date, e l'elenco mostra «account cancellato».
  `/invite/*` ha `Referrer-Policy: no-referrer` in `web/public/_headers`, e `index.html`
  porta anche `<meta name="referrer" content="no-referrer">`, perché con il service
  worker attivo la navigazione riceve la shell dalla cache, senza le intestazioni di
  `_headers`; vale per tutta l'app, che non dipende dal referrer. Il link si copia o si
  condivide e si manda a mano, senza email dall'app, anche dopo l'attività D
  (decisione dell'utente del 17 ottobre 2026; «Invia per email» resta un'idea futura).
  L'iscrizione aperta
  della specifica di base non c'è più: le iscrizioni libere sono spente dal 12 ottobre
  2026 e restano spente (decisione dell'utente del 13 ottobre 2026).
- **Amministrazione globale**: pagina riservata agli `app_admin` per consultare e gestire
  utenti e inviti, cambiare i ruoli degli utenti, assegnare il ruolo di curatore,
  nominare altri amministratori e cancellare utenti (la cancellazione arriva con
  l'attività C, sotto). Le operazioni devono essere
  disponibili anche via MCP. Forma decisa nel sesto giro del prototipo: dal Profilo,
  pagina `/admin` con le sezioni Utenti (ricerca per nome o email, ruoli come
  etichette), Inviti all'app e Ripristino del ricettario (dall'8 ottobre 2026 si
  sceglie giorno e ora invece di una copia, con l'elenco dei ripristini fatti da cui
  annullarli; sezione 8). Il dettaglio di un utente ha gli
  interruttori dei due ruoli: la nomina di un amministratore e la rinuncia al proprio
  ruolo chiedono conferma, l'interruttore dell'ultimo amministratore è bloccato con il
  motivo. Le famiglie di un utente si vedono solo per nome e ruolo, senza contenuti.
  La cancellazione di un utente usa la stessa pagina e le stesse regole della
  cancellazione dell'account, in terza persona; il proprio account si cancella solo
  dalle proprie preferenze. La nomina iniziale di Federico è avvenuta con lo script di
  avvio della messa in produzione (13 ottobre 2026: `app_admin` e `recipe_curator`
  sul suo account, creato a mano). **Al rilascio del 15 ottobre 2026** (attività A, PR
  #45) `/admin` aveva soltanto la sezione «Inviti all'app», che resta com'era; la voce «Amministrazione dell'app» compare
  nel Profilo, in Account, solo con `app_admin`, e chi non lo è vede «Non hai accesso a
  questa pagina» (il server rifiuta comunque). «Nuovo invito» apre un foglio con l'email
  e le caselle «Curatore del ricettario» e «Amministratore dell'app»; dopo «Crea il
  link» il foglio mostra il link con «Copia» e «Condividi» e la nota «Il link si vede
  solo ora: se lo perdi, crea un nuovo link». A un'email con un account risponde
  «Questa email ha già un account». L'elenco mostra email, ruoli, stato con la data
  (scade, scaduto, accettato da chi, revocato) e autore; «Nuovo link» e «Revoca», con
  conferma, valgono per gli inviti in attesa **e per quelli scaduti**, che possono
  ancora essere chiusi se prenotati. Così un invito può dare i ruoli globali a un
  account nuovo.
  **Dal 16 ottobre 2026** (attività B, issue #38, PR #47; particolari nella spec di
  dettaglio `2026-10-15-amministrazione-utenti.md`, sezione 3) i ruoli di chi ha già un
  account si cambiano dall'app e via MCP. Sopra «Inviti all'app» c'è la sezione
  **Utenti**: ricerca per nome o email che ignora maiuscole e minuscole ma non gli
  accenti, 250 ms dopo l'ultima battuta; righe con nome (« · Tu » per il proprio
  account), email e ruoli come etichette; al più 50 risultati, poi «Ci sono altri
  utenti: restringi la ricerca»; «Nessun utente» se non ce ne sono. Compare ogni
  account, anche quello senza ruoli né famiglia. Il dettaglio
  `/admin/users/<id>` ha il nome nell'intestazione, l'email, per il proprio account la
  riga «Questo è il tuo account», la card «Ruoli» con gli interruttori «Curatore del
  ricettario» e «Amministratore dell'app», ciascuno con una spiegazione, e la card
  «Famiglie» con nome e ruolo, «Nessuna famiglia» e la nota «Si vedono solo nome e
  ruolo». **Senza il numero di agenti collegati del prototipo**: contarli per un altro
  utente richiederebbe una lettura nuova di `auth` per un dato che l'amministratore non
  può usare, perché dal dettaglio non si scollegano agenti. La cancellazione
  dell'attività C non l'ha ripreso: la pagina in terza persona dice solo che si
  cancellano anche gli accessi degli agenti collegati. Nominare un
  amministratore («Nominare {nome} amministratore dell'app?», pulsante «Nomina») e
  rinunciare al proprio ruolo («Rinunciare al ruolo di amministratore?», «Non vedrai più
  questa pagina. Potrà ridartelo solo un altro amministratore.», pulsante «Rinuncia» in
  rosso) chiedono conferma; le altre modifiche sono dirette. Per l'ultimo amministratore
  l'interruttore è disattivato con il motivo «È l'unico amministratore dell'app:
  nominane un altro prima». Gli interruttori mostrano solo stati confermati dal server,
  restano bloccati dal tocco alla risposta e sono disattivati senza connessione. **Dopo
  la propria rinuncia** il profilo si rilegge e l'app porta a `/profile` senza avviso a
  comparsa (scostamento dal prototipo, sezione 14). Per un amministratore retrocesso
  altrove, alla prima risposta `forbidden` dati e comandi spariscono subito e l'accesso
  si verifica rileggendo il profilo, senza fidarsi della copia in memoria: solo dopo la
  verifica compare «Non hai accesso a questa pagina»; se la verifica fallisce compare
  l'errore con «Riprova», senza recuperare i dati precedenti. Nel foglio del nuovo invito, accanto a «Questa email
  ha già un account» compare «Apri l'utente», che porta al dettaglio di quella persona
  (il web la cerca con `users.list`; il contratto degli inviti non cambia). La
  sezione Ripristino del ricettario arriva dopo, nella stessa pagina. **Con l'attività
  C** (PR #52, unita e rilasciata il 16 ottobre 2026) il dettaglio ha, sotto
  la card «Famiglie», il comando di cancellazione verso `/admin/users/<id>/delete` e,
  per il proprio account, il rimando alle Preferenze; un account in attesa di
  cancellazione è segnato nell'elenco e, nel dettaglio, ha lo stato dei tentativi e il
  comando per completarla al posto degli interruttori dei ruoli (sotto, «Cancellazione
  dell'account»).
  **Con l'attività D** (PR #64) righe e dettaglio degli utenti mostrano accanto ai ruoli
  l'etichetta «Non ha ancora confermato l'email» per gli account nati da un invito che
  non hanno ancora confermato l'email aprendo il link (sopra, «Dopo l'attività D»).
- **Recupero del ricettario**: il ripristino completo a una data è riservato agli
  amministratori dell'app. Il percorso dedicato deve essere rappresentato nel prototipo;
  i curatori hanno invece il ripristino della singola ricetta.
- **Primo accesso** (quarto giro del prototipo, aggiornato il 15 ottobre 2026): per chi
  entra da invito è l'accettazione stessa. Il nome si chiede sulla pagina dell'invito,
  insieme all'email (e, fino al rilascio di D, alla password), e arriva al profilo
  tramite `user_metadata.display_name`; non c'è una schermata separata, e il nome resta
  modificabile nelle Preferenze. Con D il primo ingresso avviene da `/login`, dopo la
  password scelta su `/password`. Lingua
  iniziale dal browser (italiano → `it-IT`, altrimenti `en-GB`), modificabile già nella
  pagina di accesso e in quella dell'invito, e scritta nel profilo all'accettazione.
  Senza famiglie il Menu, la Spesa e le altre schermate della famiglia mostrano «Non fai
  ancora parte di una famiglia» con «Crea la tua famiglia» e, dall'attività C (unita il
  16 ottobre 2026), una riga che spiega come entrare con un link d'invito.
- **Wizard della famiglia nuova** (minimo, deciso il 6 ottobre 2026; in produzione dal
  15 ottobre su `/family/new`): nome e sistema di misura (metrico, imperiale britannico
  di default con la lingua `en-GB`), con la nota «Il resto si sistema dalle
  impostazioni»; il fuso viene dal browser (sezione 2). L'id della famiglia nasce
  all'apertura della pagina, così un doppio tocco non crea due famiglie
  (`family.create`). Non c'è un pulsante "Genera la prima settimana" (deciso l'11
  ottobre 2026): il menu si prepara da solo alla prima apertura, con la generazione
  pigra (sezione 4). Commensali, pasti fissi, ingredienti, libri e obiettivi partono dai
  default (sezione 2) e si sistemano dalle impostazioni. Dopo la creazione il wizard
  porta al Menu con `?welcome=1`, e solo allora, a chi amministra la famiglia e quando
  la settimana è caricata, il Menu mostra una scheda richiudibile: «Il primo menu è
  pronto» con "Sistema le impostazioni". Chiusa o usata, la scheda toglie il parametro
  senza lasciarlo nella cronologia; non si salva nulla. Su iOS fuori dalla modalità
  standalone, cioè in Safari, la scheda aggiunge una riga: «Per usarla dalla schermata
  Home: Condividi › Aggiungi alla schermata Home, poi entra con email e password», perché
  la PWA installata non condivide la sessione con Safari. Con gli inviti alla famiglia
  (attività C, dal 16 ottobre 2026; decisione del coordinatore del 13 ottobre
  2026) la scheda ha anche «Invita la famiglia», verso la pagina dei membri.
- **Vista Profilo**: quarta voce della navbar, con famiglia corrente (membri e inviti,
  impostazioni, "non proporre più"), elenco delle proprie famiglie (un tocco cambia la
  famiglia mostrata) e "Crea un'altra famiglia", account e preferenze. La famiglia
  mostrata è ricordata sul server, uguale su tutti i dispositivi; gli agenti indicano
  sempre la famiglia su cui operano. Dal 15 ottobre 2026 il Profilo ha «Crea un'altra
  famiglia» (verso il wizard) e, per gli `app_admin`, «Amministrazione dell'app».
  **Con l'attività C** (PR #52, unita e rilasciata il 16 ottobre 2026) arrivano
  gli altri comandi, nella forma del quarto giro: nella pagina dei membri
  (`/profile/family`) link d'invito, ingressi con i link, azioni sui membri e uscita;
  in fondo alle impostazioni della famiglia, per gli amministratori, l'eliminazione;
  nelle Preferenze la cancellazione dell'account. Tutti i comandi sono disattivati
  senza connessione e nessuna modifica è ottimistica. **Con l'attività D** (PR #64)
  nella pagina dei membri, sotto il nome, chi non ha ancora confermato l'email ha
  l'etichetta «Non ha ancora confermato l'email», visibile a tutti i membri.
- **Cambio di ruolo nella famiglia** (attività C): un amministratore nomina un altro
  membro amministratore con un gesto diretto; la retrocessione chiede conferma solo se
  la persona ha link attivi, perché smetteranno di valere. L'ultimo amministratore non
  si retrocede; la protezione vera è nel database, anche sotto concorrenza (sezione
  2).
- **Rimozione di un membro**: la decide un amministratore con una conferma che ne
  spiega gli effetti; i suoi voti escono dalla media; le tracce diventano "ex membro".
  Nell'app (attività C) la conferma spiega anche che per rientrare servirà un link
  nuovo e quanti link di quella persona smetteranno di valere; la rimozione si
  registra in `family_removals`. I voti restano della persona:
  escono dalla media perché la media conta solo i membri attuali, e i nomi degli autori
  si mostrano solo finché sono membri. Chi viene rimosso perde i dati della famiglia sul
  dispositivo al primo profilo letto o al primo `forbidden` (sezione 1).
- **Uscita dalla famiglia**: libera per i membri; l'ultimo amministratore con altri
  membri nomina il successore nello stesso passaggio; l'unico membro deve eliminare la
  famiglia. Nell'app (attività C) l'uscita ha i tre casi del prototipo: unico membro
  (rimando all'eliminazione), ultimo amministratore con la scelta del successore,
  altrimenti la conferma; i link attivi di chi esce smettono di valere e la conferma
  lo dice. Se nel frattempo un altro amministratore è
  uscito e ora serve un successore, il foglio rilegge la famiglia e chiede di sceglierlo.
  L'uscita non registra una rimozione. Dopo l'uscita i dati della famiglia lasciano il
  dispositivo e l'app va al Profilo se resta un'altra famiglia, altrimenti al Menu con
  lo stato senza famiglia.
- **Preferenze personali**: nome e lingua, modificabili dall'utente nelle proprie
  impostazioni e tramite MCP, indipendentemente dalle impostazioni della famiglia.
  Da qui si esce dall'account e si apre la cancellazione. Dall'attività D un cambio di
  lingua, dal web o via MCP, si copia anche nei metadati di Supabase Auth, così l'email
  della «password dimenticata» arriva nella lingua scelta (sezioni 1 e 12).
- **Cancellazione dell'account, regole confermate**: possibile da parte dell'utente
  stesso e degli amministratori dell'app. Entrambe arrivano con l'attività C
  dell'ondata 3 (PR #52, unita e rilasciata il 16 ottobre 2026): la
  cancellazione di un utente dall'amministrazione è passata dall'attività B alla C,
  insieme alla cancellazione dell'account (decisione dell'utente del 15 ottobre 2026);
  C aggiunge nel dettaglio dell'utente, sotto la card «Famiglie», «Cancella l'utente»
  verso `/admin/users/<id>/delete` e, per il proprio account, il rimando alle
  Preferenze. Rimuove dati personali e voti e revoca gli
  accessi dell'utente, compresi quelli MCP. Le ricette pubblicate restano nel catalogo.
  Per ciascuna famiglia in cui l'utente è l'ultimo amministratore e ci sono altri
  membri, occorre nominare un successore prima di cancellare l'account. Se è l'unico
  membro, la cancellazione elimina anche quella famiglia e i suoi dati. Una condizione
  non soddisfatta impedisce di completare la cancellazione; la procedura tecnica deve
  evitare cancellazioni parziali: la prima transazione è completa o assente, quindi
  nessun successore nominato a metà e nessuna famiglia senza amministratore, mentre il
  completamento in Supabase Auth, esterno al database, si riprende finché non riesce
  (sotto). Il trattamento di attribuzioni, inviti ancora aperti
  e bozze condivise, completato con l'attività C senza cancellare implicitamente i
  contributi pubblicati dell'utente: le colonne d'autore diventano nulle (le tracce si
  mostrano come «ex membro»); bozze aperte, salvataggi, versioni e ricette pubblicate
  restano e le bozze restano agli altri curatori (sezione 8); i link alla famiglia
  creati dall'utente e i suoi inviti all'app in attesa si revocano; le registrazioni
  da link dell'utente perdono l'email e le sue righe del registro degli ingressi si
  cancellano; gli inviti all'app perdono l'email (sopra).
  Se la cancellazione comporta l'eliminazione di almeno una famiglia, una richiesta
  MCP restituisce soltanto il collegamento alla pagina appropriata dell'app e non
  effettua cancellazioni parziali o complete. La restrizione vale sia per l'utente
  che cancella il proprio account sia per l'amministratore che cancella un altro utente.
  **Procedura in tre passi** (attività C; particolari nella spec di dettaglio
  `2026-10-16-gestione-famiglia.md`, sezioni 1, 2 e 4). **Prima transazione**, il punto
  di non ritorno: sotto i lucchetti (sezione 2) ricalcola il piano mostrato dalla pagina
  (`conflict` se le famiglie da eliminare sono cambiate, `invalid` se manca un
  successore), nomina i successori, revoca link e inviti, elimina le famiglie rimaste
  senza altri membri e cancella profilo, ruoli, voti e appartenenze, poi scrive la riga
  in `account_deletions`. **Dopo il commit** il Worker cancella l'utente in Supabase Auth
  con la chiave segreta, da `deleteAccount` di `server/src/accounts/`, accanto a
  `createInvitedAccount`; la cascata di Auth toglie sessioni e accessi degli agenti
  (sezione 1). **Chiusura**: la riga si segna completata. Se la chiamata ad Auth
  fallisce la risposta ha `completed: false`, ma l'utente è comunque già fuori e il
  Cron Trigger orario riprova (sezione 4); un amministratore dell'app vede l'account in
  attesa e può ripetere subito il passo. Durante l'attesa l'account esiste ancora in
  Auth senza profilo: ogni operazione risponde `unauthorized`, un nuovo invito all'app
  per quell'email risponde ancora `account_exists` e chi prova ad accedere legge che
  l'account è stato cancellato. Un id cancellato non si ricrea (sezione 2). La pagina
  chiude poi la sessione e cancella la copia sul dispositivo.
- **Ultimo amministratore dell'app, regola confermata**: non può essere cancellato o
  perdere il ruolo `app_admin` finché non viene nominato un successore. Il vincolo vale
  anche per la cancellazione del proprio account e per le operazioni via MCP. Dal 16
  ottobre 2026 (PR #47) la protegge sul server un lucchetto consultivo,
  `app_admin_roles`, **obbligatorio per ogni percorso che toglie `app_admin`**: la
  rimozione del ruolo dall'amministrazione, la cancellazione di un account (proprio o di
  un altro utente, attività C, che toglie il ruolo per cascata) e qualunque script
  futuro. Sotto il lucchetto, nella stessa transazione, si ricontrollano l'autorizzazione
  di chi chiama per l'operazione richiesta (per la rimozione del ruolo, che sia ancora
  `app_admin`; la cancellazione del proprio account resta consentita anche senza ruoli
  globali) e il numero di amministratori; se il bersaglio è l'ultimo la risposta è
  `last_app_admin`.
  Le assegnazioni non lo prendono, perché possono solo aumentare gli amministratori
  (sezione 2). L'indicazione «ultimo amministratore» del dettaglio serve solo
  all'interfaccia: la protezione vera è nel database. Con l'attività C la cancellazione
  di un account prende il lucchetto come primo passo della sua prima transazione, e un
  ruolo non si può assegnare a un account in cancellazione (trigger
  `user_roles_require_profile`, sezione 2), così la cascata di Auth non toglie mai un
  `app_admin` comparso dopo il controllo.
- **Eliminazione della famiglia, permesso confermato**: un `family_admin` può eliminare
  la famiglia che amministra, anche se ha altri membri, **solo dall'app web**. Rimuove
  la famiglia e i suoi dati, compresi menu, note, impostazioni, appartenenze e inviti familiari; interrompe
  i relativi job e impedisce ulteriori accessi a quella famiglia da web e MCP.
  Gli account dei membri, i loro voti personali, le altre famiglie, il ricettario e i
  ruoli globali restano invariati. L'azione non richiede di nominare un successore,
  perché la famiglia cessa di esistere. Un semplice membro non può eseguirla; il solo
  ruolo di amministratore dell'app non conferisce questo permesso su qualunque famiglia.
  Resta distinta la cancellazione automatica di una famiglia rimasta senza membri
  quando si elimina il suo unico utente, descritta sopra.
  L'utente apre la pagina dedicata e conferma esplicitamente l'operazione. La pagina
  identifica la famiglia e chiarisce la rimozione dei dati per tutti i suoi membri.
  MCP restituisce un esito che richiede un'azione nell'app con il relativo URL, senza
  eseguire l'eliminazione. Il link è soltanto una navigazione: non contiene un comando
  che cancelli dati all'apertura. La pagina richiede l'accesso e verifica nuovamente
  i permessi al momento della conferma. Forma decisa nel quarto giro del prototipo:
  pagina `/profile/family/delete?family=<id>`, raggiungibile dalle impostazioni, con
  nome della famiglia, membri coinvolti, dati cancellati e dati che restano, e un
  pulsante di conferma dopo il riepilogo; un membro vede che solo un amministratore
  può eliminarla. Realizzata con l'attività C (PR #52, unita e rilasciata il 16 ottobre
  2026), dalle impostazioni della famiglia, nella forma del quarto giro. Si
  cancellano anche link, registro degli ingressi, rimozioni e job; le registrazioni da
  link restano senza famiglia, per ritrovare gli account già creati. Dopo
  l'eliminazione l'app va al Profilo se resta un'altra famiglia, altrimenti al Menu con
  lo stato senza famiglia; gli altri membri perdono i dati sul dispositivo al primo profilo letto o al primo
  `forbidden`.
- **Pagina di cancellazione dell'account** (quarto giro del prototipo): elenca,
  famiglia per famiglia, se continua senza l'utente, se serve scegliere un successore
  (scelta sulla pagina stessa) o se viene eliminata; spiega cosa si cancella (nome,
  email, voti, accessi anche MCP, link d'invito creati ancora attivi) e cosa resta
  (ricette pubblicate, modifiche ai menu come "ex membro"). Il pulsante resta
  disattivato finché manca un successore o l'utente è l'ultimo amministratore
  dell'app. Realizzata con l'attività C in `/profile/account/delete`, dalle Preferenze,
  e in terza persona in `/admin/users/<id>/delete`. Il numero di agenti collegati
  compare solo sulla propria pagina, dove il dato è già disponibile; per un altro utente
  contarli richiederebbe una lettura nuova di `auth` per un dato che non cambia la
  decisione. Se il server risponde `conflict` la pagina rilegge il piano e conserva le
  scelte dei successori ancora valide.
- **Privacy**: informativa, dati minimi (email, nome visualizzato, dati della famiglia).
- **Limiti di frequenza**: accessi ed email di Supabase Auth (rate limit) e generazioni su
  richiesta. Le operazioni senza utente (sezione 1) hanno un limite per IP con il binding
  `ratelimit` dei Workers, solo configurazione in `server/wrangler.jsonc`, senza
  librerie: `INVITE_READ_LIMIT` (lettura dell'invito, 30 al minuto) e
  `INVITE_ACCEPT_LIMIT` (accettazione, 5 al minuto); oltre il limite la risposta è
  `rate_limited` e la pagina dice «Troppi tentativi. Riprova tra un minuto». I contatori
  sono per sede di Cloudflare e approssimati: un freno al carico su database e Auth
  (l'API di amministrazione di Auth non ha limiti propri), non una garanzia. **Email
  dell'app** (PR #64): dalla pagina dell'invito, accettazione e «Rimanda l'email» stanno
  sotto `INVITE_ACCEPT_LIMIT` e in più **un invio al minuto per persona**, tenuto da una
  riga nel database (`password_emails`, sezione 2) perché deve valere per persona e la
  stessa funzione autorizza la richiesta con token ed email: oltre, «Ti abbiamo appena
  mandato un'email: aspetta un minuto prima di chiederne un'altra.». Il reinvio richiede
  il token del link e l'email della prenotazione, quindi non serve a sondare indirizzi.
  La «password dimenticata» ha i limiti di Supabase Auth: un invio al minuto per
  indirizzo, che la pagina tratta come «Inviato», e 30 email all'ora per il progetto,
  con «Abbiamo inviato troppe email in poco tempo. Riprova tra qualche minuto.».

### 8. Ricettario: database, curatori, validazione e scambio dati

**Fonte di verità confermata:** il catalogo autorevole è nel database Supabase. Le
ricette nuove si salvano mediante operazioni applicative autorizzate, senza dover aprire
una pull request. Lo schema, i validatori e le migrazioni restano codice versionato in
Git. Un merge di codice non sostituisce il catalogo e non archivia ricette sulla base
della loro assenza da un file YAML.

**Aggiunta guidata tramite MCP:**

1. Il curatore collega il proprio agente e indica la ricetta e la sua fonte, oppure
   fornisce direttamente le informazioni per una ricetta di casa.
2. Il servizio espone i dati richiesti e i vincoli; l'agente raccoglie le informazioni e
   chiede quelle mancanti. La guida non deve dipendere dalla memoria di un singolo agente:
   il servizio fornisce istruzioni scritte, a partire da quelle sugli ingredienti decise
   nel quinto giro del prototipo (sotto, "Ingredienti e varietà"): flusso, requisiti per
   pubblicare e ingredienti, servite come `catalogue.getGuide`.
3. La validazione sul server restituisce campi mancanti e incoerenze in forma strutturata,
   così l'agente può proseguire con domande mirate.
   Le informazioni parziali possono essere salvate in una bozza persistente e recuperate
   in una sessione successiva; restano escluse dal catalogo pubblicato.
4. Prima di pubblicare l'agente presenta al curatore la scheda completa, comprese le
   traduzioni predisposte, e pubblica solo dopo un sì esplicito (scelta dell'utente
   dell'11 ottobre 2026). La conferma la chiedono le istruzioni servite all'agente: la
   pubblicazione prende l'ultima revisione della bozza, senza vincoli sulla revisione
   mostrata né un segno sulle traduzioni.
5. Il server verifica nuovamente ruolo, completezza e validità al momento della
   pubblicazione e salva la ricetta con i suoi ingredienti e riferimenti in modo atomico.
   Un errore non deve lasciare una ricetta parzialmente inserita nel catalogo.

**Bozze persistenti confermate:** una bozza ammette informazioni incomplete e sopravvive
alla conversazione con l'agente. È consultabile nella sezione dell'app per la gestione
del ricettario e recuperabile tramite MCP. Dal 6 ottobre 2026 la sezione per consultare
le bozze è in testa al ricettario: una sezione "Bozze" collassabile, visibile
solo ai curatori, con una scheda per bozza (Nuova o Modifica, nome, chi l'ha salvata e
quando, dati che mancano per pubblicare); le ricette archiviate sono in fondo al
ricettario, in una sezione chiusa (quinto giro). Un pasto passato che usa una
ricetta in bozza mostra nome e descrizione; la scheda si apre solo ai curatori e il
voto non è disponibile finché la ricetta non è pubblicata. Tutti i curatori possono consultare e modificare le bozze
degli altri; autore e ultima modifica sono visibili. Salvare una bozza non pubblica
una ricetta: la completezza resta vincolante per l'ingresso nel catalogo utilizzato
dalle famiglie. Nel traguardo A le sezioni «Bozze» e «Archiviate» (con «Riporta nel
ricettario») sono visibili ai curatori anche senza famiglia e la bozza si apre in una
pagina di sola lettura; modifica, archiviazione, versioni e ripristino nell'app arrivano
con l'ondata 3 e intanto si fanno via MCP. I salvataggi di una bozza, anche chiusa, si
leggono via MCP: un salvataggio sovrascritto si recupera salvandolo di nuovo.

Il salvataggio di una bozza applica controlli sui dati forniti senza richiedere i campi
ancora mancanti: rifiuta solo dati sbagliati (indirizzo non valido, numeri non
positivi, ingrediente inesistente), accetta quantità e testi ancora vuoti. Una bozza
può contenere righe duplicate e righe senza ingrediente del catalogo, con il solo testo
della fonte: sono problemi di pubblicazione, non errori di salvataggio; righe con
varietà solo in inglese non si confrontano. La pubblicazione applica invece l'intera
validazione.

**Campi obbligatori per pubblicare, decisi nel quinto giro del prototipo:** nome e
descrizione in italiano e inglese britannico; durata; porzioni di riferimento; almeno un
ingrediente, ciascuno con quantità e unità quando applicabili (oppure "q.b." o una
quantità a parole nelle due lingue) e con la varietà nelle due lingue se indicata; per
le fonti `web` e `youtube` l'indirizzo, per `book` libro e pagine, per `home` nessun
dato aggiuntivo; i campi della fonte non pertinenti al tipo restano vuoti (stringhe
vuote o di soli spazi valgono come assenti). Dall'11 ottobre 2026 (decisione
dell'utente, che supera il gruppo alimentare facoltativo del quinto giro) sono
obbligatori anche gli attributi del pianificatore: `meal_type`, `protein_group`,
`carbohydrate_group`, `category`, `is_fresh_fish`, `has_vegetables`, `is_heavy`;
restano facoltativi stagioni e ingrediente principale. La preparazione di una riga è
facoltativa ma, se presente, va nelle due lingue come la varietà; ogni riga ha il testo
della fonte com'è scritto, anche dopo una conversione da tazze USA. Le tazze USA si
convertono al controllo e alla pubblicazione con le equivalenze di ambito ricetta: la
bozza resta com'è scritta, la versione pubblicata ha la quantità convertita e il testo
originale, e l'esito elenca le conversioni fatte. Una preparazione verificata va nel
campo bilingue della riga anche quando compare già nel testo della fonte, perché le
equivalenze legate alla preparazione leggono solo quel campo.

**Conflitti fra curatori, decisi nel quinto giro:** ogni salvataggio dichiara la
revisione della bozza da cui parte. Se nel frattempo un altro curatore ha salvato, il
salvataggio è rifiutato con autore, momento e campi cambiati da ciascuno; chi salva
sceglie se prendere l'altra versione o sovrascriverla consapevolmente, e quella
sovrascritta resta nella cronologia della bozza. Allo stesso modo, pubblicare una
revisione partita da una versione superata richiede una conferma esplicita.

**Percorso manuale web confermato, a bassa priorità** (secondario rispetto a MCP;
forma provata nel quinto giro):

1. Il curatore crea una ricetta da un modulo oppure apre una bozza esistente, anche
   iniziata tramite MCP o da un altro curatore. Il modulo è una pagina unica a sezioni
   (nome e descrizione, fonte, pasto e porzioni, ingredienti), con un selettore di
   lingua in cima (italiano/inglese, un punto sulla lingua a cui mancano testi; deciso
   il 7 ottobre 2026): i campi tradotti mostrano una lingua per volta e un problema
   in un'altra lingua porta il selettore su quella.
2. Inserisce o modifica i dati e può salvare la bozza incompleta con «Salva bozza»;
   uscendo con modifiche non salvate l'app chiede se salvarle.
3. «Pubblica» salva le modifiche e applica l'intera validazione, con gli stessi
   validatori del percorso MCP: se passa la ricetta è pubblicata, altrimenti resta in
   bozza e il modulo mostra in cima e accanto ai campi cosa correggere. Non c'è un passo
   di verifica separato (deciso nella review del quinto giro); il server riesegue sempre
   i controlli e verifica i permessi.

Non sono usate funzionalità AI nel percorso manuale: niente compilazione, classificazione
o traduzione automatica tramite modelli. I dati e le traduzioni richiesti sono inseriti
dal curatore. La verifica automatica applica regole deterministiche e non certifica
da sola che ingredienti e quantità siano stati trascritti correttamente dalla fonte.

**Caricamento da file, non previsto per ora** (deciso nel quinto giro): l'aggiunta passa
dall'agente MCP o dal modulo. Se tornasse utile, dovrà leggere uno dei formati concordati
senza AI e portare i dati in una bozza modificabile, con gli stessi controlli del modulo,
senza pubblicare direttamente nel catalogo.

Il percorso manuale, inclusa la modifica web delle bozze, viene
implementato dopo le altre funzionalità (ondata 3, ultima priorità). La sezione web per consultare le bozze e
il lavoro guidato tramite MCP restano parte del percorso iniziale di gestione del
ricettario. Una stessa bozza deve poter passare da MCP al modulo manuale e viceversa,
senza creare copie distinte.

**Ingredienti e fonti:** solo dati verificati sulla fonte o forniti dal curatore,
trascritti per `base_servings`, mai dedotti dal nome del piatto. Un validatore strutturale
non prova la correttezza della trascrizione: la provenienza e le verifiche devono far
parte del percorso di gestione del ricettario. Ingredienti equivalenti si collegano alla
stessa entità canonica, anche se i nomi sono in lingue diverse.

**Ingredienti e varietà, decisi nel quinto giro del prototipo:**

- l'ingrediente del catalogo è il prodotto generico; si cerca prima di crearne uno nuovo
  (la ricerca trova anche le varietà già usate) e un ingrediente nuovo ha reparto e nome,
  senza varietà, taglia o preparazione nel nome. Si può creare con il solo nome italiano
  (deciso l'11 ottobre 2026, come nel prototipo): la pubblicazione di una ricetta che lo
  usa segnala il nome inglese mancante, quindi nessuna ricetta pubblicata resta senza;
- la **varietà** è testo libero e facoltativo sulla riga della ricetta, nelle due lingue,
  solo quando cambia cosa si compra (cultivar o tipo: «Roma», «cuore di bue», «gialla
  senza semi»). Taglia, maturazione e preparazione non sono varietà e restano nel testo
  della fonte o nella preparazione. Non esiste un elenco di varietà da mappare;
- il testo si salva com'è scritto, ripulito dagli spazi; i confronti (spesa, suggerimenti,
  righe ripetute) ignorano maiuscole, accenti, punteggiatura e parole come «tipo» e
  «varietà». Tutto minuscolo è escluso perché rovinerebbe i nomi propri;
- all'inserimento il sistema dà consigli che non bloccano: una grafia diversa di una
  varietà già usata per quell'ingrediente, il nome dell'ingrediente ripetuto («Pomodoro
  Roma» → «Roma»), parole di preparazione. Gli stessi controlli valgono per il modulo e
  per MCP, che ha operazioni per elencare le varietà note e controllare un testo;
- se la fonte cita due volte lo stesso ingrediente senza varietà diverse, le quantità si
  uniscono in una riga e il testo della fonte le riporta entrambe; l'import non le unisce
  da solo: lascia entrambe le righe e la ricetta in bozza;
- via MCP un curatore cerca, legge, crea e modifica gli ingredienti (nomi, sinonimi,
  reparto, dispensa) dichiarando la versione da cui parte, con lo stesso conflitto delle
  bozze, e gestisce le equivalenze di ambito ricetta con la loro fonte; archiviazione
  degli ingredienti ed equivalenze di spesa arrivano nell'ondata 3;
- le istruzioni per l'agente su questi punti sono una bozza nel prototipo
  (`prototype/src/lib/operations/curation-guide.ts`, copia italiana in
  `design/percorsi.md`) e diventeranno parte della guida servita da MCP (sezione 13).

**Completezza degli ingredienti confermata:** per pubblicare occorrono un elenco
verificato degli ingredienti, quantità e unità quando applicabili e `base_servings`
positivo, corrispondente alle porzioni per cui sono fornite le quantità. Questo vale
per ogni fonte, comprese le ricette da libro o di casa, e per l'importazione del
ricettario precedente. Se questi dati mancano, la ricetta resta in bozza.

Indicazioni non numeriche esplicite, come "q.b.", sono ammesse quando risultano dalla
fonte o dai dati forniti dal curatore: vengono elencate senza inventare una quantità
numerica. Una quantità ignota non può essere trasformata in "q.b." per superare la
validazione. La pubblicazione richiede anche entrambe le lingue (sezione 12).

**Validazione condivisa:** schema, identificatori unici, riferimenti a ingredienti e
libri esistenti, quantità e unità ammesse, porzioni di riferimento, attributi del
pianificatore e dati della fonte coerenti con il tipo. La stessa logica serve l'aggiunta
MCP, le operazioni manuali web del curatore e l'importazione: è lo schema del documento
ricetta (sezione 2), applicato con i controlli parziali al salvataggio di una bozza e
con quelli completi alla pubblicazione. I test di questa logica
sono eseguiti in CI; la CI non sostituisce la validazione di ogni scrittura sul server.

**Modifica dell'intero ricettario confermata:** ogni curatore può modificare le ricette
di qualunque autore. Le modifiche pubblicate devono rispettare gli stessi controlli
di completezza, unità, riferimenti e fonti delle nuove ricette. **Deciso nel quinto
giro:** «Modifica» crea una bozza di revisione collegata alla ricetta (una sola aperta
per ricetta, ripresa da chiunque); le famiglie vedono la versione pubblicata finché la
revisione non viene pubblicata come versione successiva. I pasti passati restano sulla
versione con cui sono stati mangiati (sezione 5); conflitti come sopra.

**Archiviazione, decisa nel quinto giro:** qualunque curatore archivia una ricetta
pubblicata (con «Annulla» subito dopo) e la riporta nel ricettario dall'elenco delle
archiviate. Una ricetta archiviata esce da ricettario, ricerca, suggerimenti e
generazioni; i pasti che la usano restano leggibili e votabili, anche quelli futuri,
finché la famiglia non li cambia. La precedente archiviazione automatica per assenza dal
YAML è eliminata. Una bozza nuova mai pubblicata si può eliminare solo se nessun pasto
di nessuna famiglia la cita: si chiude come scartata e la ricetta resta nel database,
fuori da bozze e pasti. Scarto e annullamento di un pasto che riporterebbe la bozza si
mettono in fila: se arriva prima lo scarto l'annullamento è rifiutato, se arriva prima
l'annullamento lo scarto risponde `cited_by_meals` (sezione 5). Una revisione si può
scartare. Anche una ricetta archiviata si
può rivedere e pubblicare: resta archiviata finché un curatore non la riporta nel
ricettario. La cancellazione del curatore non implica la
cancellazione delle ricette che ha contribuito. Con la cancellazione dell'account
(attività C, PR #52) ricette pubblicate, versioni, bozze aperte e salvataggi di un
curatore cancellato restano; le colonne d'autore diventano nulle per cascata e le
bozze aperte restano agli altri curatori, che possono riprenderle, pubblicarle o
scartarle.

**Foto delle ricette** (W12, PR #54, rilasciata il 16 ottobre 2026; particolari nella
spec di dettaglio `2026-10-16-foto-ricette.md`): una foto per ricetta, fuori dal
documento e dalle versioni (sezione 2). **Decisioni dell'utente del 16 ottobre 2026:**
nell'app la foto si aggiunge, si sostituisce e si toglie solo dalla scheda ricetta
aperta, dai curatori: «Aggiungi foto» senza foto, che apre il selettore del telefono
(scatto o libreria); con la foto, il pulsante «Foto» sulla foto apre un foglio con
«Sostituisci la foto» e «Togli la foto», con conferma per togliere. Le schede compatte
del menu e del ricettario non hanno comandi per la foto; gli altri utenti non vedono
comandi. Nessun aggiornamento ottimistico: la foto appare quando il server conferma.
**Nessuna provenienza**: con la foto si salvano solo chi l'ha caricata, quando e da
quale canale, che l'app non mostra. **Via MCP** l'agente imposta la foto da un
indirizzo (`catalogue.setPhotoFromUrl`), di norma l'immagine della pagina della fonte
(`og:image` o l'immagine della ricetta in schema.org), ma può prenderla da qualunque
sito, anche per le ricette di casa o da libro; la mostra al curatore e la imposta solo
dopo un sì esplicito, come per la pubblicazione, e non deduce mai ingredienti
dall'immagine. Queste istruzioni sono nella sezione «Foto» di `catalogue.getGuide`.
Una bozza nuova può avere la foto via MCP prima della pubblicazione; nell'app la bozza
resta in sola lettura e le viste mostrano la foto solo dopo la pubblicazione. Il
16 ottobre 2026, con l'autorizzazione esplicita dell'utente a caricarle senza conferme
una per una, le foto sono state impostate via MCP dalle pagine delle fonti e con una
ricerca online: 46 ricette hanno la foto, 4 ne sono ancora senza.

**Backup e ripristino richiesti:** il ricettario deve poter essere recuperato dopo
modifiche errate o eventi imprevisti. Il design deve coprire ricette, ingredienti,
traduzioni, fonti, riferimenti ai libri e bozze, mantenendo coerenti i collegamenti con
i pasti delle famiglie. Un export YAML occasionale non è da solo un piano di backup.

**Recupero su due livelli:** la divisione dei permessi è confermata.

- **Singola ricetta, decisa nel quinto giro:** dal menu della ricetta, «Versioni» elenca
  le versioni con autore e data; una versione precedente si apre com'era e
  «Ripristina» la ripubblica subito come nuova versione, dopo una conferma. Nessun
  confronto campo per campo (escluso nella review). Lo storico resta intero; il
  ripristino riporta solo campi e righe di ingredienti di quella ricetta, non le entità
  condivise (ingredienti del catalogo, nomi, reparti), e non avviene se la vecchia
  versione non supera i controlli di oggi. Se la ricetta è cambiata dopo che il
  curatore l'ha guardata serve una nuova conferma, come per la pubblicazione da una
  versione superata. Accessibile ai curatori.
- **Intero catalogo:** ripristino a una data scelta, con anteprima dell'impatto e
  verifica della coerenza. **Deciso l'8 ottobre 2026:** lo stato del catalogo a una
  data si ricostruisce dallo storico in sola aggiunta (`recipe_versions`,
  `recipe_status_changes`, `ingredient_versions`, sezione 2), senza copie giornaliere o
  settimanali da pianificare e conservare. Ciò che il sesto giro chiamava «backup» è
  quindi un istante dello storico. Il ripristino complessivo è riservato
  agli amministratori dell'app, perché può annullare modifiche di più
  curatori. Il recupero del catalogo non deve riavvolgere menu, voti, utenti o permessi
  delle famiglie e non concede accesso ai loro contenuti. **Deciso nel sesto giro del
  prototipo,** con il riferimento alla data invece che alla copia: le ricette pubblicate
  a quella data tornano com'erano, pubblicate come nuova versione (lo storico resta
  intero); quelle nate dopo, o archiviate allora, vengono archiviate, non cancellate, e
  i pasti che le citano restano leggibili; quelle archiviate oggi ma pubblicate allora
  tornano nel ricettario. Una ricetta la cui versione di allora non supera i controlli
  di oggi resta com'è e l'anteprima lo dice. Gli ingredienti del catalogo tornano come
  erano allora; quelli nati dopo restano. Bozze, menu, voti, famiglie e utenti non
  cambiano; i pasti passati restano sulla versione mangiata (R1). L'anteprima mostra le
  ricette per gruppo prima della conferma. Il ripristino scrive solo nuove versioni,
  quindi per annullarlo basta ripristinare l'istante che lo precede: la copia «Prima
  del ripristino» del sesto giro non serve più. Le foto non fanno parte dello storico
  ricostruibile: come trattarle si decide con questa attività (sezione 15).

Storico e backup hanno scopi distinti: lo storico permette di correggere un contributo
o riportare il catalogo a una data; la perdita o il danneggiamento del database sono
coperti da un'esportazione notturna dell'intero database, che comprende quindi anche i
dati delle famiglie. Il piano gratuito di Supabase non offre backup della piattaforma
(deciso l'8 ottobre 2026): l'esportazione va in R2 di Cloudflare e la perdita massima
di lavoro è di circa un giorno. Si conservano le ultime 7 esportazioni notturne (deciso
l'11 ottobre 2026: poche copie, una settimana per accorgersi di un errore).

**Esportazione notturna** (decisa l'11 ottobre 2026, PR #30; particolari in
`progetto/superpowers/specs/2026-10-11-esportazione-r2.md`):

- **Contenuto:** tutte le tabelle di `app` (dati delle famiglie e catalogo) e gli
  account di Supabase Auth (`auth.users` e `auth.identities`, con email e password
  cifrate da Supabase), così un ripristino riporta gli stessi account con gli stessi
  id. Sessioni, token e autorizzazioni degli agenti restano fuori: dopo un ripristino
  da esportazione tutti rifanno l'accesso e ricollegano gli agenti.
- **Strumento:** il Worker stesso, su un Cron Trigger dedicato alle 02:30 UTC, con un
  secondo tentativo alle 04:30 solo se manca l'esportazione del giorno (sezione 4): un
  errore transitorio non porta la perdita a due giorni. Legge nel ruolo `app_backup`
  (sezione 2) in una sola fotografia `repeatable read`. Scartate una GitHub Action con
  `pg_dump` (password del database e token di R2 nei secret di GitHub, workflow
  programmati in ritardo e disattivati dopo 60 giorni) e un'esportazione a pagine.
- **Formato e cifratura:** un documento JSON per tabella prodotto da Postgres, con
  l'elenco delle migrazioni, compresso con gzip e cifrato nel Worker con AES-256-GCM,
  oltre alla cifratura a riposo di R2: l'account Cloudflare è quello di POWA e chi vi
  accede non deve leggere email e password. Chiave nel secret `BACKUP_ENCRYPTION_KEY`
  e copia nel gestore di password dell'utente: perdere la chiave vuol dire perdere le
  esportazioni.
- **Conservazione:** bucket privato `cosasimangia-backups` nella giurisdizione UE; le
  ultime 7 le tiene il codice, dopo una scrittura riuscita, non una regola di ciclo di
  vita, che dopo giorni di fallimenti cancellerebbe le ultime copie buone.
- **Limite:** 8 MB di documento, misurati in workerd con un picco sotto 64 MB di
  memoria; si controlla prima di leggere le righe con una stima del database e oltre il
  limite l'esportazione non parte e scrive un log di errore (avviso già a metà). Oggi il
  database pesa pochi MB; avvicinandosi al limite servirà un'esportazione a pagine,
  come nuova attività.
- **Ripristino:** CLI `scripts/backup/restore.ts` (`inspect` e `restore`, con
  `--dry-run`) in un database appena preparato con le migrazioni del commit ricavato
  dall'esportazione e vuoto salvo le righe inserite dalle migrazioni, elencate nel
  codice; non esiste un modo per sovrascrivere dati veri. Caricamento in modalità
  `replica` in una sola transazione, contatori di versione conservati e marcatori di
  transazione `xid8` azzerati; prima del commit verifica delle chiavi esterne e
  confronto esatto con l'esportazione. Destinazione remota solo con TLS e verifica del
  certificato (`sslmode=verify-full`), argomenti validati prima di collegarsi; errori
  senza dati. Procedura scritta in `supabase/README.md`, comprese le configurazioni che
  dipendono dal progetto Supabase, da aggiornare in ordine dopo un ripristino su un
  progetto nuovo.
- **Foto delle ricette** (PR #54, 16 ottobre 2026): `recipe_photos` è una tabella di
  `app` ed entra da sola nell'esportazione, che contiene quindi i **riferimenti** alle
  foto (chiavi, misure, autori, date), **non le immagini**; il ripristino riporta le
  righe e le immagini restano nel bucket `cosasimangia-photos`, che non si ripristina.
  **Conservazione illimitata** (decisione del coordinatore del 16 ottobre 2026): gli
  oggetti del bucket non si cancellano mai in automatico, né le foto tolte o sostituite
  né gli orfani (caricamenti la cui transazione è fallita, foto caricate dopo
  un'esportazione poi ripristinata), così un ripristino da qualunque esportazione
  conservata trova tutte le immagini che cita; le regole di ciclo di vita di R2 hanno lo
  stesso difetto di una pulizia a tempo. Il costo resta minimo rispetto ai 10 GB
  gratuiti di R2. Una pulizia futura dovrà considerare i riferimenti di tutte le
  esportazioni conservate oltre al database corrente, e nel dubbio conservare.
- **Collaudo in due prove** (sezione 9): una prova locale completa, criterio di fine
  della PR, ripetuta in CI; una prova di produzione, voce separata a carico
  dell'utente dopo la creazione del bucket, con la chiave presa dal gestore di
  password, così si verifica anche la copia: fatta il 13 ottobre 2026 sulla prima
  esportazione notturna, prima dell'import dei dati veri, con ripristino locale
  riuscito. L'email di allarme `backup_export_missing` arriva con quelle del job
  (sezione 4), con la parte software dell'attività D (PR #64, unita e rilasciata il 17
  ottobre 2026): dall'esecuzione delle 04:30 senza l'esportazione del giorno,
  con il motivo (`failed`, `too_large`, `not_configured`), e dalla riconciliazione oraria
  per ogni data degli ultimi 7 giorni senza un'esportazione in R2 (`missing`; oggi solo
  dalle 05:00, mai oggi-7, che la conservazione delle ultime 7 copie cancella). Restano
  da misurare i tempi di recupero con un'esportazione vera (sezione 15).

Le azioni di recupero esposte nell'app devono essere disponibili anche via MCP con gli
stessi permessi e controlli. Il design distinguerà queste azioni dai compiti operativi
di backup dell'infrastruttura: esportazione e ripristino da esportazione sono compiti
operativi, senza operazioni del contratto, schermate né strumenti MCP.

**Azzeramento prima dell'uso** (messa in produzione, decisione del coordinatore dell'11
ottobre 2026, corretta il 12 ottobre dopo la review della PR #34). Finché la famiglia
non usa l'app, un avvio fallito si ritira con un **azzeramento** dei dati di `app`
(famiglie, catalogo, dati delle famiglie), che lascia schema, account, profili e ruoli
globali, cioè lo stato iniziale. È ammesso solo se l'impronta di tutto lo schema `app`
coincide con l'ultima **impronta di avvio**, prodotta dentro la transazione del
bootstrap (ammesso solo dallo stato iniziale) o del caricamento di avvio, con tutte le
tabelle bloccate: qualsiasi scrittura successiva, anche una sola, la cambia e
l'azzeramento si rifiuta. I rilanci non la rinnovano. Non si rimuove la sola famiglia:
il catalogo resterebbe e non ci sarebbe più un'impronta da cui ripartire.
**All'inizio del collaudo completo** l'impronta si chiude: da lì niente azzeramento e
i dati si correggono in avanti, dall'app, dall'agente o, per un danno grave,
con il ripristino dall'esportazione su un progetto nuovo. Per la famiglia di Federico
l'impronta si è chiusa il 13 ottobre 2026, all'inizio del collaudo completo (passo R23
del runbook); il collaudo completo è ancora in corso, compresa la verifica della prima
generazione dal cron giovedì 15 ottobre. Particolari in
`progetto/superpowers/specs/2026-10-11-messa-in-produzione.md`, sezione 8.

**YAML per importazione ed esportazione:** formato di scambio con chiavi tecniche in
inglese, da precisare nel piano. Un export rappresenta il catalogo a una certa data;
non viene risincronizzato automaticamente come seconda fonte di verità. L'import
iniziale legge `../meal_planner/ricettario/ricette.yaml`, mappa ingredienti e unità,
prepara schede da rivedere e un **report delle ambiguità**, senza inventare valori.
Solo le schede che soddisfano le regole concordate entrano nel catalogo. Le ricette
importate prive di ingredienti verificati, quantità e unità richieste, porzioni di
riferimento o testi in entrambe le lingue restano bozze da completare; non sono
pubblicate con una deroga per i dati pregressi.

Voti B, `storico` ed esclusioni nelle `note` del formato di origine diventano i **dati
della famiglia di Federico**, separati dal catalogo. Conversione dei voti: B=1, BB=3,
BBB=4, BBBB=5 stelle, come voto di Federico. I nomi italiani citati qui sono campi
dell'input preesistente, non nomi da usare nel nuovo codice. Le **preferenze
condizionali** nelle note delle schede d'origine (per esempio «non proporla nelle cene
per 4, solo per i 2 adulti») non diventano esclusioni, che sarebbero un divieto più
ampio di quello voluto, né si perdono in silenzio. L'import le elenca nel report e
nell'anteprima come «preferenze da sistemare a mano», con ricetta e nota, e si
rivedono con l'utente (decisione del coordinatore, 11 ottobre 2026).

### 9. Test

- **Pianificatore**:
  - test unitari per regola su un catalogo di prova;
  - test di proprietà: su centinaia di semi, zero violazioni dei vincoli rigidi e ogni slot
    pieno o segnato "nessuna ricetta adatta";
  - **report di qualità**: `npm run planner-report` (`scripts/planner-report.ts`) genera 20
    settimane con i dati reali della famiglia del curatore e riporta violazioni, gruppi
    rispetto agli intervalli, quota note/nuove, coppie simili più vicine e ripetizioni,
    in `progetto/reports/planner-report.md`. Usa gli ingredienti dell'import
    (`scripts/import/ingredient-lines.yaml`) come la produzione, non lo slug del nome
    della riga d'origine (17 ottobre 2026, PR #60). Va guardato prima di attivare il job.
    Prima esecuzione l'8 ottobre 2026 (esito nella sezione 3); i test unitari e di proprietà
    del pianificatore sono in `domain/src/planner/`.
- **Giudice** (solo se lo si sperimenta):
  - test unitari della ricaduta: spento, timeout, errore, risposta non valida portano sempre
    alla candidata migliore a regole;
  - test sui dati inviati: nessun campo identificativo della famiglia nel payload;
  - valutazione del valore: report di qualità con solo regole e con regole più giudice, poi
    un test alla cieca di qualche settimana sulla famiglia del curatore (due proposte senza
    sapere quale ha scelto il giudice). Se il giudice non vince in modo chiaro, resta
    spento.
- **Scalatura e lista**: casi tabellari su unità, arrotondamenti finali, non scalabili,
  sinonimi, unità incompatibili, `is_pantry` e `avoid`; conversioni metriche e imperiali
  britanniche, indipendenza dalla lingua, cambio di preferenza senza alterare i dati.
- **Strumenti** (ondata 1): test del server in Node con Vitest, chiamando la `fetch`
  del Worker con un ambiente finto (Postgres locale, chiavi JWT generate nel test),
  senza il pool di Workers; ciò che Node non copre si verifica con `wrangler dev` e sul
  Worker pubblicato. In CI il database ha le migrazioni reali e nessuna suite è
  saltata. Database locale con la CLI di Supabase su Podman e test pgTAP delle policy
  isolati dal seed. Web con Vitest, Testing Library e jsdom; prova visiva con
  agent-browser e su iPhone, senza Playwright.
- **RLS**: test contro il Supabase locale. Un membro della famiglia A non legge né scrive
  niente della famiglia B; un utente senza ruolo di curatore non aggiunge ricette; un
  membro non amministratore non gestisce inviti e impostazioni della famiglia. I test
  dei privilegi globali seguiranno la matrice dei permessi concordata.
- **Ricettario**: validazione con casi validi, mancanti e incoerenti; mancata scrittura
  di schede incomplete nel catalogo pubblicato anche se l'agente prova a pubblicarle;
  blocco della pubblicazione senza ingredienti, quantità o unità richieste e porzioni
  di riferimento, anche per l'importazione; accettazione di "q.b." documentato e
  distinzione rispetto a una quantità ignota;
  salvataggio e ripresa delle bozze da MCP e consultazione dal web, senza renderle
  disponibili nei menu o nella spesa; modifica di ricette di altri curatori, con
  controllo dei conflitti; atomicità della pubblicazione;
  import con i casi presi dal ricettario attuale e nessuna sovrascrittura dei contributi
  già presenti. Cambi di codice ed esportazioni non devono sostituire il catalogo.
- **Gestione manuale del ricettario (ondata 3)**: creazione, modifica di bozze anche altrui,
  pubblicazione rifiutata finché mancano dati e riuscita dopo la correzione, con gli
  stessi vincoli di MCP; nessuna chiamata a servizi AI; ripresa della stessa bozza fra
  web e MCP e risoluzione dei conflitti fra curatori.
- **Recupero del catalogo**: ripristino di una singola ricetta e dell'intero catalogo a
  una data rispettivamente da curatori e amministratori dell'app, con rifiuto delle
  operazioni non autorizzate; ricostruzione esatta del catalogo a una data dallo
  storico; coerenza fra ricette, proiezioni, ingredienti, traduzioni e bozze;
  conservazione dei riferimenti dai pasti e assenza di modifiche a dati e ruoli
  familiari; annullamento di un ripristino ripristinando l'istante precedente. Il
  collaudo comprende anche l'effettivo recupero da un'esportazione notturna.
- **Esportazione e ripristino** (sezione 8): pgTAP sui permessi di `app_backup` (sola
  lettura su ogni tabella di `app`, anche futura, chiavi primarie, nessuna sequenza,
  marcatori `xid8` elencati); test del formato e della cifratura. **Prova di
  ripristino in CI** con destinazione reale (`npm run test:drill -w server`, ultimo
  passo perché azzera il database): `inspect`, rifiuto di una destinazione con
  migrazioni diverse, caricamento fallito senza dati nei messaggi e destinazione
  invariata, `--dry-run`, `restore` con rilettura identica all'origine e contatori che
  crescono alla scrittura successiva. **Due prove distinte:** quella locale completa
  (esportazione da `wrangler dev`, ripristino, accesso e lettura dall'app) è il
  criterio di fine della PR; quella di produzione la fa l'utente dopo la creazione del
  bucket, con la chiave dal gestore di password, ed è una voce separata.
- **Contratto e operazioni**: test delle operazioni contro il Supabase locale, con
  l'identità di utenti diversi, così permessi e RLS si provano insieme; test ricavati
  dal contratto che verificano per ogni operazione la scelta esplicita di esposizione
  MCP, la presenza dello strumento corrispondente e la risposta `web_only` con URL per
  le operazioni riservate al web; idempotenza delle operazioni accodabili offline;
  rifiuto delle richieste dopo la cancellazione dell'account o la revoca dell'agente.
- **Lingue**: copertura di italiano e inglese britannico, identità stabili del catalogo,
  formattazione e rifiuto della pubblicazione quando manca un testo richiesto in una
  delle due lingue, anche per importazione e percorso manuale. Una bozza può invece
  essere salvata e ripresa con traduzioni ancora mancanti.
- **MCP**: parità di operazioni, permessi, validazione, attribuzione, conflitti e limiti
  rispetto al web, salvo l'eliminazione delle famiglie riservata all'app; isolamento
  fra utenti e famiglie; riconnessione e accessi revocati;
  esportazioni effettivamente utilizzabili nei client supportati. Verifica del
  collegamento e dei percorsi previsti su ciascuno dei quattro client obiettivo:
  Codex CLI, Claude Code, ChatGPT e Claude Desktop, registrando versioni o modalità
  provate ed eventuali limitazioni emerse.
- **Collegamento degli agenti** (PR #31): prova end-to-end in CI a ogni PR, sullo stack
  locale con il server OAuth e il Worker vero, solo con client registrati
  dinamicamente e utenti del seed: confini OAuth (PKCE, codice riusato o scambiato fra
  client, `redirect_uri` non registrato, richiesta scaduta, annullamento); richiesta
  legata alla prima persona che ne legge i dettagli, con una richiesta nuova che
  funziona per l'altro account; canale `mcp` e risposta `web_only` su MCP, RPC e REST
  anche dopo il rinnovo del token (con le operazioni di test della piattaforma in un
  Worker di test mai pubblicato); scollegamento sempre tramite `agents.disconnect`, anche
  dall'agente stesso, che rifiuta access e refresh token di tutte le sessioni del client,
  anche dopo un nuovo collegamento, lasciando attivi gli altri agenti, il web e lo
  stesso client autorizzato da un'altra persona. pgTAP su `app.connected_agents()`; test
  web degli stati del consenso, delle risposte superate e della pagina degli agenti.
- **Amministrazione dell'app**: accesso alla pagina e agli strumenti MCP riservato al
  ruolo autorizzato; assegnazione e revoca di ruoli, nomina di altri amministratori,
  inviti e cancellazione di utenti; protezione dell'ultimo amministratore dell'app,
  trasferimento dell'amministrazione familiare prima della cancellazione quando ci
  sono altri membri, eliminazione della famiglia dell'unico membro e revoca degli
  accessi MCP dell'utente cancellato. Il catalogo pubblicato rimane disponibile.
- **Eliminazione della famiglia**: permesso limitato agli amministratori di quella
  famiglia ed esecuzione riservata all'app web, con controllo sul server; rimozione
  dei dati e degli accessi familiari senza cancellare account, voti personali o altre famiglie. Il solo ruolo
  `app_admin` e il ruolo `member` non autorizzano l'operazione diretta. Verificare anche
  famiglia con più membri e job in corso, senza lasciare una famiglia parzialmente attiva.
  Da MCP si ottiene soltanto l'URL, senza eliminazioni, anche tentando la cancellazione
  dell'account dell'unico membro. Aprire il link non ha effetti di scrittura; il
  completamento richiede autenticazione, permessi validi e conferma nella pagina web.
- **Cambio della password**: sullo stack locale in CI, backend reale e pagina con il
  backend reale: cambio riuscito con la sola sessione del dispositivo rimasta (confronto
  per `session_id`), password attuale errata, password debole o uguale, sessione chiusa
  altrove, altre sessioni chiuse, sessione più vecchia di 24 ore; nella prova degli
  agenti, token dell'agente rifiutato su MCP, RPC e REST e refresh token annullato dopo il
  cambio.
- **Aggiornamento della PWA**: test di precache, service worker, pagina occupata (con i
  provider veri e una prova di rottura per ogni protezione) e copia con `CACHE_SCHEMA`;
  prova del passaggio fra versioni nel browser vero con agent-browser, compresi rollback,
  ripubblicazione, rilascio cambiato durante l'installazione e pagina occupata; prova a
  mano sull'iPhone dopo il rilascio, unica prova con la sessione Supabase vera.
- **Inviti all'app e famiglie nuove** (PR #45): pgTAP su permessi, funzioni per token
  (nessuna email in uscita), prenotazione, scadenza, revoca anche di un invito scaduto e
  `app.create_family`; test del server con un'Auth finta su creazione ambigua
  riconciliata, mai un `PUT`, accettazioni concorrenti con un solo account e i dati del
  primo tentativo, nessuna transazione aperta durante la chiamata ad Auth, rinnovi,
  revoche e chiusure concorrenti; test web di tutti gli stati della pagina, del wizard,
  della scheda e di `/admin`. **Stack locale con le iscrizioni spente**: le persone di
  prova si creano con l'API di amministrazione e la chiave segreta locale;
  `scripts/invitations/invite-stack.sh`, in CI, prova contro Auth reale il percorso
  completo (invito con un ruolo, lettura e accettazione senza token, accesso, ruoli,
  `family.create`, prima settimana), la prevalenza del primo tentativo, la ripresa dopo
  `internal`, due accettazioni concorrenti e il rifiuto della Data API sullo schema
  `app`. Provato con agent-browser su `wrangler dev` anche a 390 px, e sull'iPhone
  dall'utente dopo il rilascio del 15 ottobre 2026.
- **Email dell'app** (PR #64; elenco completo nella spec di dettaglio
  `2026-10-17-email.md`, sezione 8): pgTAP su `ops_alerts`, `password_emails` e sulle
  funzioni dei reinvii, dell'etichetta e di `app_job`; test del server con Auth, Resend
  e Mailpit finti (nessuna chiamata a `/auth/v1/invite` né a `/auth/v1/recover` dalle
  accettazioni, account cancellato prima o dopo l'autorizzazione senza account ricreati,
  reinvii concorrenti con una sola email, impronta della versione a conteggio invariato,
  allarmi con interruzioni e lavoro concluso dopo, consegna concorrente, `409` ambiguo,
  scadenza). **Mailpit acceso nella CI** (`supabase start` senza escluderlo), con le
  email del server mandate a Mailpit da `MAILPIT_API_URL`; i test dello stack leggono i
  link da Mailpit, verificano, salvano la password e accedono, anche quelli degli inviti
  già esistenti. **Prova obbligatoria con «Require current password when updating»
  acceso** su un secondo servizio di Auth dello stack
  (`scripts/test-support/auth-require-current.sh`), perché la CLI non esprime l'opzione
  in `config.toml`: `/password` salva per un invitato e per un recupero, mentre il
  Profilo senza password attuale è rifiutato; un altro servizio dedicato, con il limite
  orario delle email basso, prova il 429 del progetto. Test web delle pagine `/password`
  e `/password/forgot`, delle pagine d'invito e delle etichette; agent-browser sullo
  stack locale, compreso il passaggio dalla shell vecchia (`/password#…` non trovata con
  il frammento intatto, poi verificata dalla versione nuova). Dopo il rilascio
  l'utente prova sull'iPhone email, PWA e resa delle email nelle due lingue.
- **End to end** (agent-browser e iPhone): accettazione di un invito con creazione dell'account, scelta della password e accesso con email e password nella PWA installata, creazione della famiglia, invito, modifica di uno
  slot, voto, generazione della lista con pagina Bring!, cambio lingua e unità,
  collegamento MCP e operazioni di gestione del ricettario e amministrazione.

### 10. Fasi di rilascio

**Ordine confermato il 3 ottobre:** prima costruire e concordare il prototipo dell'app,
salvato nel repository; poi verificare le scelte funzionali e architetturali alla luce
del prototipo; infine aggiornare e approvare i piani prima dell'implementazione dell'app.
Prototipo e verifica dell'architettura sono conclusi (sezioni 1 e 14).

**Dall'11 ottobre 2026 le fasi sono nel piano generale**
`progetto/superpowers/plans/2026-10-11-piano-generale.md`, approvato dall'utente, che
sostituisce la tabella M1–M6 precedente e il piano M1a del 29 settembre. Il piano
generale tiene l'ordine delle attività, le interfacce fra attività e il registro delle
decisioni del coordinamento.

**Metodo per ogni attività:** brainstorming, spec di dettaglio in
`progetto/superpowers/specs/2026-10-11-*.md` e piano, review avversariale di spec e
piano, implementazione con TDD, pull request con review avversariale del codice, merge
su `main`. Dopo il merge le decisioni della sezione «Decisioni da riportare» della spec
di dettaglio entrano in questa specifica, che resta il riferimento: per i particolari
tecnici rimanda alle spec di dettaglio, subordinate a essa. Nell'ondata 2 un'attività
implementa solo ciò che dipende da interfacce già fissate nel piano generale o già unite.

| Ondata | Contenuto | Risultato |
|---|---|---|
| **1 Fondamenta** | Piattaforma (Worker, contratto, verifica dei token, CI), schema e permessi, documento ricetta e import, dominio di unità e spesa, app web di base | Base comune per le attività del traguardo A |
| **2 Traguardo A** | Profilo, famiglia e impostazioni senza inviti; ricettario e voti; menu, pianificatore, job del mercoledì e generazione pigra; revisione dei pasti; spesa, anche offline; gestione del ricettario tramite MCP, con le bozze visibili nell'app; collegamento degli agenti; esportazione notturna in R2; messa in produzione con l'import del ricettario e dei dati della famiglia | La famiglia di Federico usa l'app ogni settimana, con il ricettario gestito anche tramite agente MCP |
| **3 Prodotto** | Inviti familiari e all'app, che creano l'account con la password scelta dalla persona (prima della verifica del dominio di invio sulla pagina dell'invito, senza email), wizard e generazione su richiesta, Google facoltativo dopo la prova sull'iPhone; dominio di invio con Resend, link della password via email, recupero della password, email del job e dell'esportazione (subordinati al DNS di `qunidi.it` fino al 16 ottobre 2026, poi su `cosasimangia.app` insieme all'app); amministrazione dell'app, ripristino dell'intero catalogo, archiviazione, versioni e ripristino della ricetta nell'app, PDF della spesa, Claude Desktop e ChatGPT, cancellazioni, apertura ad altre famiglie, modulo manuale del ricettario (ultima priorità), giudice AI opzionale | L'app diventa un prodotto aperto ad altre famiglie |

Ondata 3 avviata il 13 ottobre 2026, con l'ordine A–E del piano generale: le attività
che non spediscono email procedono subito, quelle che dipendono dal DNS di `qunidi.it`
sono raccolte nell'attività D, che può restare bloccata senza fermare le altre. Il
trasferimento dell'app su `cosasimangia.qunidi.it` non fa parte dell'ondata 3 e
richiederà una decisione distinta (sezione 7). Il 17 ottobre 2026 l'utente ha scelto
invece `cosasimangia.app` per app ed email (sezione 1), sbloccando il DNS dell'attività D:
i suoi passi esterni (DNS, dominio in Resend, SMTP di Supabase Auth) sono fatti lo
stesso giorno. Ordine concordato con l'utente il 17
ottobre 2026: la correzione del difetto #48 del pianificatore prima della generazione di
mercoledì 21 ottobre (insieme a #51), poi la parte software di D, unita lo stesso giorno
(PR #64) e rilasciata alle 17:54 UTC, poi le parti di E scelte dall'utente (piano
generale).

**Stato al 18 ottobre 2026:**

| Attività | Stato |
|---|---|
| Ondata 1: piattaforma, schema e permessi, ricetta e import, unità e spesa, app web di base con il client reale | Unite su `main` (PR #3–#9, #17) |
| Profilo, famiglia e impostazioni | Server e web uniti (PR #10, #16, #18, #21) |
| Ricettario e voti | Viste condivise, server e web uniti (PR #12, #14, #19); scheda aperta da un pasto con le sue porzioni (PR #28) |
| Menu, pianificatore, job e generazione pigra | Server, job con Cron Trigger e web uniti (PR #13, #15, #20) |
| Spesa, anche offline | Server, pagina Bring!, coda offline e web uniti (PR #11, #22) |
| Gestione del ricettario tramite MCP | Server, strumenti MCP e sezioni web delle bozze uniti (PR #23, #26) |
| Revisione dei pasti | Server, dominio, strumenti MCP e web uniti (PR #29: azioni, suggerimenti, annullamento, registro; PR #33: pannello, foglio, «Annulla» e invalidazioni nel web) |
| Collegamento degli agenti | Unito (PR #31: consenso, «Collega un agente», elenco e scollegamento, prova end-to-end in CI); OAuth server attivo in produzione e Claude Code collegato il 13 ottobre 2026, con ricettario tramite agente e «Scollega» verificati |
| Esportazione notturna in R2 | Unita (PR #30; migrazione `20261012110000_backup.sql`, rinominata nella PR #32 per una versione duplicata); bucket e chiave in produzione, prima esportazione e prova di produzione il 13 ottobre 2026 |
| Messa in produzione | Strumenti uniti (PR #34: caricamento, `npm run release`, `scripts/prod-sql.ts`, runbook), risorse compilate in `server/README.md` (PR #36). **Traguardo A in produzione**: primo rilascio il 12 ottobre 2026 su `https://cosasimangia.qunidi.workers.dev`; il 13 ottobre famiglia avviata (50 ricette pubblicate, 6 bozze, 6 settimane importate) e primo collaudo riuscito, poi agenti collegati. Impronta di avvio chiusa il 13 ottobre all'inizio del collaudo completo, che è ancora in corso, con la verifica della prima generazione dal cron giovedì 15 ottobre. Rotazione delle password rimandata dall'utente (13 ottobre) |
| Cambio della password dal Profilo | Unito (PR #41, issue #37 chiusa) e rilasciato il 13 ottobre 2026, provato dall'utente sull'iPhone; in produzione «Secure password change» spento e «Require current password when updating» acceso dall'utente il 13 ottobre; minimo di produzione non verificato (la SPA impone 8) |
| Aggiornamento della PWA | Unito (PR #43, issue #42) e rilasciato il 13 ottobre 2026 (versione `759ce4d6`). Sull'iPhone dell'utente il primo passaggio dalla versione precedente non è avvenuto con due aperture a freddo: è servito togliere l'app, cancellare i dati del sito nelle impostazioni di Safari e aggiungerla di nuovo. Il passaggio automatico è stato verificato al rilascio del 15 ottobre 2026: la PWA si è aggiornata da sola |
| Inviti all'app e famiglie nuove (ondata 3, attività A) | Unita (PR #45) e rilasciata il 15 ottobre 2026, con la migrazione `20261013100000_app_invitations.sql` e il segreto `SUPABASE_SECRET_KEY` (chiave dedicata `worker-invitations`); provata dall'utente sull'iPhone: invito, account, nome, famiglia, schermata Home e accesso nella PWA installata |
| Amministrazione di utenti e ruoli (ondata 3, attività B, issue #38) | Unita (PR #47) il 15 ottobre 2026 e rilasciata il 16 ottobre con la migrazione `20261015100000_user_admin.sql` (versione del Worker `75d29930-6125-41bd-acf4-786814218171`), senza segreti né risorse nuove; provata dall'utente sull'iPhone. La cancellazione degli utenti è passata all'attività C |
| Gestione della famiglia (ondata 3, attività C) | Unita (PR #52) e rilasciata il 16 ottobre 2026 con la migrazione `20261016100000_family_management.sql` (versione del Worker `c5f006a4-9404-423c-84c8-11f748ea1dd8`, commit `9228598`), senza segreti, binding, Cron Trigger né risorse nuove; provata con agent-browser sullo stack locale e nella modalità finta. Collaudo e prove sull'iPhone riusciti il 16 ottobre 2026: l'utente ha collaudato con l'account e la famiglia di prova di A, eliminati con i comandi di C (spec di dettaglio, sezione 6), e ha provato a mano sull'iPhone la pagina dell'invito aperta da WhatsApp, la condivisione del link, i fogli di conferma e la cancellazione dell'account nella PWA installata |
| Foto delle ricette (ondata 3, attività E, issue #39) | Unita (PR #54) e rilasciata il 16 ottobre 2026 con la migrazione `20261016110000_recipe_photos.sql` (versione del Worker `5dce4dda-67d7-4315-97f3-608631f45796`, commit `41d9918`), con il bucket `cosasimangia-photos` creato dall'utente e i binding `PHOTOS` e `IMAGES`; provata con agent-browser sullo stack locale. Foto popolate via MCP la sera stessa: 46 ricette con la foto, 4 ancora senza. Restano le prove a mano sull'iPhone (scatto e libreria, foto HEIC, orientamento, tempi su rete mobile, offline dopo una visita) e la verifica dei metadati con il binding Images di produzione (spec di dettaglio, sezione 9) |
| Dominio `cosasimangia.app` | PR #56 (dominio personalizzato del Worker, `workers_dev` spento) unita e rilasciata il 17 ottobre 2026 alle 04:23 UTC; PR #57 (controllo del rilascio) unita dopo, senza nuovo rilascio (versione del Worker `8d4763ec-b29d-4d09-941b-9411c22fa3f9`); il vecchio indirizzo risponde 404. Dominio verificato in Resend, *Site URL* e *Redirect URLs* solo sul nuovo dominio, SMTP di Supabase Auth su Resend con una prova riuscita, PWA reinstallata sull'iPhone e agente MCP di Claude Code ricollegato a `https://cosasimangia.app/mcp` |
| Dominio di invio ed email (ondata 3, attività D) | Passi esterni fatti il 17 ottobre 2026 (righe sopra). Parte software (W15, spec `2026-10-17-email.md`) unita il 17 ottobre 2026 con la PR #64 e la migrazione `20261017100000_email.sql`: email «Scegli la password» dal server dopo l'accettazione di un invito, `/password` e «password dimenticata», etichetta «Non ha ancora confermato l'email», email operative di job, esportazione e cancellazioni (sezioni 4, 7 e 8), fine del rischio accettato delle email non verificate negli inviti. **Rilasciata** il 17 ottobre 2026 alle 17:54 UTC (versione del Worker `21616921-3cfe-4390-b19c-9e42d824cebe`, commit `4e1483e`), dopo i segreti `RESEND_API_KEY` e `OPS_ALERT_EMAIL`, il template di recupero e `mailer_otp_exp` 86400 in produzione; collaudata dall'utente: invito di prova, «password dimenticata», allarme di prova e prova sull'iPhone riusciti (runbook nella spec di dettaglio, sezione 9) |
| Skill per Claude (W17) | Unita (PR #68) e **rilasciata** il 18 ottobre 2026 alle 09:22 UTC (versione del Worker `03721d89-5d69-4ed3-92fb-a2de8746f751`, commit `cdbd7fe`), senza migrazioni, segreti né risorse nuove; zip verificato in produzione (`/downloads/cosa-si-mangia.zip`, 200 `application/zip`). Collaudata dall'utente il 18 ottobre: zip caricato su claude.ai e skill provata dall'app Claude, funziona (sezione 13) |
| Swipe fra le settimane (W19) | Unito (PR #72, merge `160d83b`) e **rilasciato** il 18 ottobre 2026 alle 12:09 UTC (versione del Worker `3260a367-c445-490d-abd3-359614a19f61`, commit `160d83b`), senza migrazioni, segreti né operazioni nuove. Rimbalzo e transizione sostituiti dalla W21 (riga sotto) |
| Fila dei giorni che segue il dito (W21) | Correzione chiesta dall'utente dopo il rilascio di W19. Unita (PR #74, merge `341bdb1`) e **rilasciata** il 18 ottobre 2026 alle 13:49 UTC (versione del Worker `c3a72b02-bf2f-4100-8628-b8ce61bcadd0`, commit `cbe5869`), senza migrazioni, segreti né operazioni nuove; provata con agent-browser ed eventi touch veri sul server di sviluppo. Collaudo sull'iPhone dell'utente ancora da fare: soglia e colpo veloce, resistenza, nessun rimbalzo verticale della pagina, arrivo senza lampeggi, «Riduci movimento», gesto «indietro» di Safari (sezioni 5 e 14) |
| Skeleton nei caricamenti (W20, issue #49) | Unito il 18 ottobre 2026 (PR #75, merge `bb523a2`), senza migrazioni, segreti, operazioni né dipendenze nuove; rilascio in preparazione. Da provare dall'utente sull'iPhone dopo il rilascio: «Cambia ricetta» su un pasto mai aperto, Cerca, «Riduci movimento», VoiceOver, avvio a freddo della PWA, Spesa con spunte fatte offline (spec `2026-10-18-skeleton.md`; sezione 14) |

Scelte dell'utente sul traguardo A: accessi diretti con utenze Supabase, primi utenti e
famiglie creati a mano, con le iscrizioni libere spente (12 ottobre 2026); passi
esterni (DNS di `qunidi.it`, Resend, Google) rimandati finché non servono, partendo
dall'indirizzo `workers.dev`. Aperte il 13 ottobre 2026: cambio della password dal
Profilo nel traguardo A, ad alta priorità perché la password è la strada permanente
(issue #37, rilasciato lo stesso giorno), pagina dei ruoli globali nell'ondata 3 (issue #38,
rilasciata il 16 ottobre), foto delle ricette da progettare (issue #39, rilasciate il 16
ottobre 2026; sezioni 1, 2 e 8).

**Messa in produzione** (decisa l'11–12 ottobre 2026; particolari, runbook e ritorni
indietro in `progetto/superpowers/specs/2026-10-11-messa-in-produzione.md` e nel suo
piano):

- **Avvio a fasi.** Prima l'infrastruttura senza famiglia (iscrizioni spente, OAuth
  server e *Site URL*, migrazioni iniziali, password di `app_server`, Hyperdrive, bucket
  e chiave delle esportazioni, primo rilascio, accesso di prova): scopre i problemi di
  Hyperdrive, chiavi e build senza dati veri ed è smontabile senza perdite. Poi, dopo la
  prima esportazione notturna provata, import e avvio della famiglia; infine le prove
  degli agenti. Chiude la rotazione delle password.
- **Avvio a finestra.** Famiglia, caricamento e primo collaudo in sola lettura si fanno
  di seguito da lunedì a mercoledì entro le 19, prima che il job del mercoledì alle 20
  generi la settimana successiva, e nessun altro apre l'app nel frattempo. Se non
  terminano, o il primo collaudo fallisce, si **azzera** (sezione 8) e si ritenta in una
  finestra successiva ripartendo dal bootstrap; non si rimuove la sola famiglia e non si
  sospende la generazione (decisione del coordinatore, corretta il 12 ottobre 2026 dopo
  la review della PR #34). All'inizio del collaudo completo l'impronta di avvio si
  chiude: da lì la famiglia usa l'app e si corregge solo in avanti, anche se le prove
  del collaudo completo non sono ancora finite.
- **Pubblicazione** con `npm run release` e **operazioni sulla produzione** con
  anteprima, impronta e «vai» dell'utente: sezione 1.

Lingue, unità e accesso MCP sono requisiti trasversali: ogni funzione introdotta li
rispetta dalla sua prima versione, con due eccezioni esplicite: le operazioni `public`
senza utente, fuori da MCP (sezione 13), e l'eliminazione delle famiglie, per cui MCP
restituisce il link all'app. La collocazione delle attività nella
roadmap non rinvia la progettazione delle relative dipendenze al termine dello sviluppo.
La priorità finale riguarda il modulo manuale, non la consultazione delle bozze nell'app,
richiesta insieme alla gestione del ricettario tramite MCP.

### 11. Convivenza con il progetto di origine

- `meal_planner` resta com'è: YAML, PDF e sito Netlify pubblicato da `main`. Questa app è
  separata, con il suo repository, il suo Worker su Cloudflare e il suo progetto Supabase.
- Il ricettario del progetto di origine è la fonte dell'import iniziale. Fino allo
  spegnimento del vecchio flusso, lo script di import è **rilanciabile**: prepara per la
  revisione solo le schede nuove, riconosciute tramite lo slug di origine, e non tocca
  quelle già importate o curate nel database. La corrispondenza con l'identità originale
  deve essere conservata anche se cambiano nome, lingua o identificatori nel nuovo
  catalogo. Una ricetta aggiunta nel vecchio repository può arrivare qui attraverso
  revisione e validazione, senza una sincronizzazione automatica che sovrascriva i dati.
- **Casi R4 dell'import** (decisi l'11 ottobre 2026): le ricette provate senza storico
  si registrano come provate senza data (`family_tried_recipes`, sezione 2) e nel
  report, senza pasti inventati; le ricette «casa» con URL si importano come `web` con
  l'URL, conservando il tipo d'origine e segnalando gli adattamenti nel report; lo
  storico con `cucinata: false` non si importa; `null` in settimane concluse alla data
  dell'import si importa come mangiato e si segnala, in settimane non concluse non si
  importa; giorni o pasti non riconosciuti e settimane non valide (data inesistente o
  non di lunedì) si scartano e si segnalano.
- **Import** (ondata 1): produce un pacchetto JSON, un report e una pagina di revisione,
  senza scritture sul database; `--existing` per i rilanci; `--today` obbligatorio;
  numeri ambigui come `1.000` mai interpretati, restano testo e si segnalano. I tag
  d'origine non si importano: li sostituiscono gli attributi del pianificatore. Gli
  ingredienti di dispensa esclusi nell'origine non si aggiungono e il report li elenca.
  La pubblicazione resta bloccata finché i dati di revisione non sono approvati
  (sezione 12). Nella messa in produzione la scrittura nel database riusa il modulo
  della gestione del ricettario (`server/src/catalogue/write.ts`), con canale `import` e
  gli slug dell'import conservati.
- **Caricamento nel database** (messa in produzione, 11 ottobre 2026):
  `scripts/import/load.ts`, collegato come `postgres`, in **una sola transazione**: o
  entra tutto o niente. L'anteprima esegue lo stesso codice e chiude con `rollback`, e
  stampa un'impronta degli input (file d'origine letti una volta, commit, data, famiglia,
  curatore, destinazione); il caricamento vero la richiede e si ferma se è cambiata. Il
  catalogo si scrive come il curatore, con canale `import`; storico e menu in corso nel
  ruolo `app_job`, perché possono citare bozze. Prende lo stesso lock della generazione
  della famiglia, quindi una generazione concorrente aspetta e trova settimane e
  impostazioni già scritte. Voti, ricette provate e storico si calcolano sull'intero
  ricettario d'origine, così un rilancio aggiunge i voti rimasti in sospeso su ricette
  pubblicate nel frattempo. È rilanciabile e scrive **solo in aggiunta**: nessun valore
  del catalogo già presente (slug, ricette d'origine, equivalenze) si sovrascrive,
  qualunque valore abbia, e le equivalenze divergenti vanno nel report; impostazioni
  solo dove la chiave manca (sezione 2); una settimana già presente nell'app si salta.
  Una ricetta importata si pubblica solo se la revisione non ha voci in sospeso.
- **Menu in corso** (decisione del coordinatore e dell'utente, 11 ottobre 2026):
  all'avvio l'import porta le settimane già pianificate nel progetto di origine e non
  concluse alla data dell'import come settimane e pasti dell'app (ricetta e porzioni,
  testi liberi, anche i giorni già passati), senza segnarle come mangiate: diventano
  storico quando passano. Le note per pasto dell'origine non si importano (l'app
  ricalcola le dosi) e il report le elenca. La prima settimana generata dall'app è la
  successiva, dal job del mercoledì con impostazioni e storico già presenti. **Da quel
  momento il vecchio flusso non pianifica più settimane**: due menu per la stessa
  settimana no. Per la famiglia di Federico l'avvio è del 13 ottobre 2026 e la prima
  settimana generata dall'app è quella del 19 ottobre.
- **Due ricette nello stesso pasto storico** (R4, decisione del coordinatore, 11 ottobre
  2026): il pasto prende la prima per slug; l'altra entra fra le ricette provate
  (`family_tried_recipes`, `source: 'import'`) e nel report. L'informazione «l'abbiamo
  mangiata» non si perde e non si inventa un pasto.
- **Ripiego per la famiglia:** se l'app non è usabile, finché il progetto di origine
  resta attivo la famiglia torna al suo PDF settimanale e riprende a pianificare lì; i
  dati dell'app restano e si riprende con un nuovo passaggio di consegne.
- Quando spegnere il vecchio flusso (YAML, PDF e sito) lo decide l'utente, dopo il
  traguardo A.

### 12. Lingue e contenuti tradotti

**Confermato:** lingua scelta per utente, italiano e inglese britannico nella prima
versione. Il sistema di misura appartiene invece alla famiglia; nessuna scelta impone
automaticamente l'altra. Le nuove pagine di guida MCP e amministrazione fanno parte
dell'esperienza tradotta. Il nome dell'app, «Cosa si mangia», non si traduce.

**Ambito del design proposto:**

- testi dell'interfaccia, messaggi di errore, avvisi, impostazioni, ruoli e reparti;
- nomi e descrizioni delle ricette, ingredienti e relativi sinonimi di ricerca;
- contenuti della lista della spesa ed esportazioni nella lingua di chi li genera;
- date, numeri, plurali e nomi delle unità coerenti con la lingua selezionata;
- identificatori e codici tecnici stabili in inglese, indipendenti dalle traduzioni,
  utilizzabili allo stesso modo dal web e da MCP.

**Ricerca nella lingua dell'utente** (11 ottobre 2026): il ricettario si cerca su nome e
descrizione della ricetta, nomi e varietà degli ingredienti e sinonimi degli ingredienti
nella lingua di chi cerca; ogni parola cercata deve comparire, senza distinguere
maiuscole, accenti e punteggiatura. Allo stesso modo si cercano gli ingredienti da
evitare della famiglia e, per i curatori, ricette e ingredienti del catalogo. Una ricetta
mai pubblicata citata da un pasto mostra il nome nell'altra lingua se manca in quella
dell'utente.

Le stringhe dell'interfaccia vivono nel codice, senza librerie: dizionari TypeScript
tipati per area, hook `useT()`, plurali con `Intl.PluralRules`, date e numeri con
`Intl`; etichette di unità e reparti in `domain/`, condivise da server e web. Le
traduzioni del catalogo seguono le ricette nel database autorevole, in campi
`{it-IT, en-GB}` (sezione 2). La lingua è quella del profilo a ogni accesso; prima del
login quella del browser; la scelta nel Profilo è per utente. È proposta una preparazione e revisione
delle traduzioni durante la gestione del ricettario, anche con l'aiuto dell'agente,
anziché tradurre nuovamente ogni volta che si apre una ricetta.

**Pubblicazione bilingue confermata:** i testi richiesti di una ricetta devono essere
disponibili sia in italiano sia in inglese britannico prima della pubblicazione.
Questo comprende nome e descrizione della ricetta, i nomi degli ingredienti collegati
e, dal 6 ottobre 2026, il testo delle quantità non numeriche (per esempio "1 mazzetto",
"3 matasse"), mostrato nella lingua dell'utente; le identità e le quantità numeriche
sono condivise fra le due lingue. La regola vale per nuove
ricette, modifiche e importazioni e viene verificata dal server in ogni canale.
Le traduzioni mancanti sono segnalate nella bozza e impediscono di pubblicarla: mostrare
l'originale italiano non è un'alternativa alla completezza del catalogo pubblicato.

Nel percorso MCP l'agente può aiutare a preparare le traduzioni; nel percorso manuale
il curatore le inserisce senza funzionalità AI dell'app. Per l'import (11 ottobre 2026)
le traduzioni en-GB e la mappatura degli ingredienti sono preparate dall'agente in YAML
versionati in `scripts/import/`, riviste dall'utente su una pagina generata e approvate
con una riga in testa a ogni file, con data e impronta del contenuto: una modifica
successiva richiede una nuova revisione e senza approvazione valida non si pubblica.
Nella gestione tramite MCP le traduzioni suggerite le rivede il curatore sulla scheda
completa che l'agente mostra prima di pubblicare (sezione 8, deciso l'11 ottobre 2026).
**Testi liberi degli utenti** (decisione del coordinatore, 12 ottobre 2026): note e
testi dei pasti liberi restano come li scrive l'utente, senza traduzione, come le voci
libere della spesa (sezione 6); si mostrano uguali in entrambe le lingue, mentre tutti i
testi dell'interfaccia restano bilingui. Questi testi,
le trascrizioni originali delle fonti e i titoli bibliografici sono distinti dai testi
localizzati obbligatori. I collegamenti alle fonti non diventano traduzioni dei siti o
dei libri.

**Lingua delle email** (decisione dell'utente, PR #64, unita il 17 ottobre 2026): ogni
email arriva nella lingua della persona, italiano o inglese britannico. L'email «Scegli
la password», spedita dal server, usa la lingua della pagina dell'invito; la «password
dimenticata», spedita da Supabase Auth, usa `user_metadata.locale`, che il server
allinea alla lingua delle Preferenze a ogni cambio (web e MCP), con l'italiano se manca.
Una scrittura concorrente dei metadati può lasciare al più la lingua precedente nel
recupero, difetto innocuo accettato. Le email operative al referente sono solo in
italiano.

### 13. MCP e guida al collegamento

**Requisito:** ogni operazione dell'utente autenticato disponibile nell'app deve avere un
equivalente MCP per lo stesso utente e con gli stessi permessi, **tranne l'eliminazione di
una famiglia**, che MCP può soltanto indirizzare alla pagina dell'app. Le operazioni
`public` senza utente (lettura e accettazione degli inviti all'app e alla famiglia e,
dalla PR #64, reinvio dell'email per la password) restano fuori da MCP
per costruzione (`mcp: false` imposto da `contract/src/check.ts`). Il caricamento di un
file di foto (`catalogue.uploadPhoto`, dal 16 ottobre 2026) è solo web perché MCP non
trasporta file: l'equivalente per l'agente è l'impostazione da un indirizzo (sotto). Il
server espone operazioni applicative, non accesso generico alle tabelle.

**Architettura decisa l'8 ottobre 2026** (sezione 1):

- **Stessa applicazione.** Il server MCP è la rotta `/mcp` del server nel Worker, con il
  trasporto Streamable HTTP senza stato, adatto alle funzioni serverless; non è un
  servizio separato.
- **Autenticazione con il server OAuth 2.1 di Supabase Auth**, conforme alla
  specifica di autorizzazione MCP: metadati di scoperta, registrazione dinamica dei
  client, flusso con PKCE e pagina di consenso ospitata dall'app (`/authorize`, sesto
  giro). Il server MCP verifica i token come risorsa protetta. Scollegare un agente
  dall'app revoca la sua autorizzazione, con i token di aggiornamento e le sessioni di
  quel client. **Verificato l'11 ottobre 2026**: il server OAuth è disponibile sul
  piano gratuito; Claude Code e Codex CLI si registrano da soli, passano dalla pagina di
  consenso dell'app e leggono solo i dati dell'utente, con il claim `client_id` che
  distingue il canale. Ogni client ha il proprio `client_id` e chiede un consenso
  separato. I token hanno `aud: authenticated` e valgono su tutte le rotte: la
  separazione fra web e MCP si regge sul claim `client_id`, presente anche dopo il
  rinnovo. **In produzione dal 13 ottobre 2026**: con le iscrizioni libere spente
  (sezione 7) Claude Code si registra da solo e accede con un account esistente;
  `session_whoami`, ricettario tramite agente, elenco degli agenti e «Scollega»
  verificati sul progetto di produzione.
- **Scollegamento con la gestione dei grant di Supabase** (prova della revoca dell'11
  ottobre 2026, PR #31). Supabase non pubblica endpoint di revoca né di introspezione dei
  token: `agents.disconnect` chiama `DELETE /auth/v1/user/oauth/grants` con il token di
  chi chiede e la chiave pubblica del progetto, e dichiara il successo solo con 204 o con
  il 404 `oauth_consent_not_found` (nessun grant attivo); ogni altro esito è `internal`,
  mai un falso «scollegato», e l'agente resta nell'elenco. Supabase cancella le sessioni
  di quel client per quell'utente: il controllo della sessione a ogni richiesta (sezione
  1) rifiuta subito il suo access token non scaduto su MCP, RPC e REST, i refresh token
  sono annullati, anche di più sessioni dello stesso client, mentre gli altri client, il
  web e lo stesso client autorizzato da un'altra persona restano attivi. Ricollegare
  chiede di nuovo il consenso e i vecchi token restano rifiutati. Un agente scollegato
  riceve 401 con `WWW-Authenticate` e riparte dall'autorizzazione. PostgREST accetta un
  token revocato fino alla scadenza (un'ora), ma espone solo `public` e
  `graphql_public`, vuoti: nessun dato raggiungibile finché `app` non è esposto.
  Chiudere le «altre sessioni» dal web chiude anche gli agenti; «Esci» chiude solo la
  sessione del dispositivo e non li tocca. Anche il cambio della password dal Profilo
  chiude le sessioni degli agenti: dopo il cambio i loro token sono rifiutati su MCP, RPC
  e REST e i refresh token annullati (provato in CI, sezione 7).
- **Poteri di un token d'agente su Supabase Auth: rischio aperto accettato** (decisione
  dell'utente dell'11 ottobre 2026). Il token vale come quello dell'utente su tutti gli
  endpoint di Supabase Auth: senza passare dal Worker l'agente può cambiare la password,
  e mantenere così l'accesso web anche dopo «Scollega», revocare gli altri agenti, chiudere le sessioni web, modificare
  `user_metadata`; cambiare l'email richiede la conferma su entrambe le caselle, e non
  può cancellare l'account. Il server OAuth di Supabase non permette di limitarlo: offre
  solo gli scope OIDC, che decidono i dati inviati all'agente e non gli endpoint, non ha
  restrizioni per client e Supabase Auth non controlla `aud` (provato con un hook che lo
  cambiava). Per ora si documenta, nei testi per la persona (sotto) e qui, senza
  promettere un blocco totale; la limitazione resta aperta (sezione 15). **Chiuso in
  parte il 13 ottobre 2026**: in produzione l'utente ha acceso «Require current password
  when updating», quindi un token d'agente cambia la password solo conoscendo quella
  attuale; nello stack locale l'opzione resta spenta. Restano aperti gli altri poteri:
  revocare gli altri agenti, chiudere le sessioni web, modificare `user_metadata`.
- **Strumenti generati dal contratto delle operazioni**, con i metadati di esposizione
  di ciascuna operazione: nessuno strumento scritto a mano che possa divergere dal web.
  Oggi uno strumento per operazione, con nome `area_operazione` (`profile_get`,
  `catalogue_publish`…), descrizione per l'agente in inglese e letture segnate in sola
  lettura; le letture del menu possono comunque generare una settimana (sezione 4). Il
  raggruppamento (uno per area con l'azione come parametro) resta da provare sui client
  (sezione 15).
- **Operazioni senza utente fuori da MCP** (inviti all'app, 15 ottobre 2026): il ruolo
  `public` (sezione 1) si ammette solo con `mcp: false`, perché senza utente non esiste
  un canale MCP che le chiami. Lettura e accettazione di un invito
  (`appInvitations.get`, `appInvitations.accept`) sono quindi solo web; sono strumenti
  MCP `appInvitations_create`, `appInvitations_list` e `appInvitations_revoke`, solo per
  `app_admin` (il link si restituisce alla creazione anche all'agente), e
  `family_create`, con il fuso dichiarato dall'agente e validato (sezione 2).
- **Amministrazione degli utenti** (PR #47, 16 ottobre 2026): strumenti `users_list` e
  `users_get` in sola lettura e `users_setRole`, solo per `app_admin`, con gli stessi
  permessi e lo stesso ultimo amministratore protetto del web. Come per la
  pubblicazione delle ricette (decisione dell'utente dell'11 ottobre 2026), **la
  conferma per nominare un amministratore dell'app e per togliere a sé stessi
  `app_admin` è affidata alle istruzioni dell'agente** nella descrizione dello
  strumento; il server non chiede campi in più. Un ruolo assegnato o tolto vale dalla
  richiesta successiva anche per l'agente già collegato: chi rinuncia al proprio ruolo
  perde gli strumenti di amministrazione dalla chiamata successiva (sezione 1).
- **Gestione della famiglia** (PR #52, unita e rilasciata il 16 ottobre 2026):
  strumenti `familyInvitations_list`, `_create`, `_revoke`, `_listJoins` e `_status`,
  `family_join`, `family_setMemberRole`, `family_removeMember`, `family_leave`,
  `family_getDeletion`, `family_delete` (solo rimando), `account_getDeletionPlan`,
  `account_delete`, `users_getDeletionPlan` e `users_delete`. Lettura e accettazione
  della pagina dell'invito restano solo web: un agente non crea account. Chi ha già un
  account entra con `family_join`, che si fa dare la conferma della persona; la
  descrizione di `familyInvitations_create` dice che il link si vede solo ora, quelle
  di `family_removeMember` e `family_leave` ne riportano gli effetti, quella di
  `users_delete` chiede una conferma esplicita prima di cancellare. **Rimando
  condizionato** di `account_delete` e `users_delete`: la regola vera è nel database,
  dove la prima transazione della cancellazione ricava il canale dal claim `client_id`
  del token e, se la richiesta viene da un agente e il piano ricalcolato sotto i
  lucchetti elimina almeno una famiglia, rifiuta prima di qualsiasi scrittura; il server
  risponde `web_only` con l'URL della pagina (`/profile/account/delete` o
  `/admin/users/<id>/delete`). Un controllo preliminare del gestore è solo una
  scorciatoia. Gli strumenti non dichiarano `webOnly`, perché non sempre rimandano.
- **Foto delle ricette** (PR #54, rilasciata il 16 ottobre 2026): strumenti
  `catalogue_setPhotoFromUrl` e `catalogue_removePhoto`, solo per i curatori;
  `catalogue.uploadPhoto` non è uno strumento (`mcp: false`, non `webOnly`: uno
  strumento con un file in ingresso non avrebbe uno schema utile agli agenti). Via MCP
  l'URL della foto nelle risposte, nei risultati di `catalogue_searchRecipes` e nelle
  bozze è assoluto, così l'agente la scarica o ne dà il link al curatore, che lo apre nel
  browser. **Decisione dell'utente del 16 ottobre 2026:** l'agente può prendere
  l'immagine da qualunque sito, di norma dalla pagina della fonte, la mostra al curatore
  e la imposta solo dopo un sì esplicito: come per la pubblicazione, la conferma è
  affidata alle istruzioni della guida, senza campi in più. Lo scaricamento lo fa il
  Worker con i controlli della sezione 1.
- **Email dell'app** (PR #64, unita il 17 ottobre 2026): **nessuno strumento nuovo**.
  `appInvitations.resendPasswordEmail` e `familyInvitations.resendPasswordEmail` sono
  `public` e restano fuori da MCP; gli strumenti esistenti di famiglia e utenti
  (`family_get`, `users_list`, `users_get`) ricevono `emailUnconfirmed` dalle stesse
  viste del web, e `profile_update` allinea la lingua anche nei metadati di Auth
  (sezione 12).
- **Istruzioni per l'agente**, a partire da quelle sugli ingredienti (sezione 8),
  servite dal server MCP stesso, non solo descritte nella pagina dell'app: per la
  gestione del ricettario sono `catalogue.getGuide`, testo in inglese con flusso,
  conferma del curatore, conflitti, requisiti per pubblicare e ingredienti; dal 16
  ottobre 2026 anche la sezione «Foto» (una foto per ricetta fuori dalle versioni, dove
  cercarla, conferma prima di impostarla, mai ingredienti dedotti dall'immagine). La
  skill per Claude (sotto) vi rimanda senza copiarne le regole.

Compatibilità effettiva dei quattro client e consegna delle esportazioni restano da
verificare con una prova prima dell'implementazione (sezione 15).

**Client obiettivo confermati per la prima versione:** Codex CLI, Claude Code, ChatGPT
e Claude Desktop. Questa scelta definisce il perimetro da supportare e documentare;
non attesta una compatibilità già verificata. Il design tecnico deve verificare per
ciascuno collegamento, autenticazione, operazioni di lettura e scrittura, rispetto dei
ruoli e consegna delle esportazioni. Le differenze emerse devono essere riportate nella
guida e risolte o concordate prima del rilascio, senza introdurre altre eccezioni
implicite alla copertura delle operazioni.

| Ambito | Operazioni da coprire tramite MCP |
|---|---|
| Accesso e contesto | Collegare l'account, elencare le proprie famiglie e indicare quella su cui operare; elencare gli agenti collegati e scollegarne uno, anche sé stesso (`agents_list`, `agents_disconnect`, PR #31: non `webOnly`, perché un agente può già revocare grant con il proprio token; lo scollegamento è a stato assoluto e non rivela se un client esiste) |
| Pasti e ricettario | Consultare oggi e settimane, cercare e leggere ricette, ingredienti e voti |
| Revisione | Area `meals` (PR #29): cambiare ricetta e porzioni, chiedere suggerimenti (`meals_getSuggestions`, sola lettura), scambiare pasti, segnare pasti liberi, note ed esclusioni; annullare la propria ultima modifica di un pasto anche in una conversazione nuova, con `menu_getWeek` → `lastChange.actionId` se `lastChange.undoable` → `meals_undo` (sezione 5). Ogni scrittura porta un `id` nuovo scelto dall'agente; ripeterla non cambia nulla |
| Voti e generazione | Dare, cambiare o togliere il proprio voto (`ratings.set`, a stato assoluto, `null` per toglierlo); richiedere la generazione nei limiti previsti (ondata 3) |
| Spesa | Leggere la lista di una settimana, spuntare voci (con la quantità letta dalla vista), rimettere ingredienti esclusi, aggiungere voci libere, ottenere testo e collegamento Bring!, poi il PDF |
| Famiglia e account | Nel traguardo A profilo (nome, lingua, famiglia mostrata), famiglia, membri, impostazioni e «non proporre più», sempre con `familyId`; dal 15 ottobre 2026 creare una famiglia (`family_create`). Con l'attività C (unita e rilasciata il 16 ottobre 2026): creare, elencare e revocare i link d'invito e leggere gli ingressi (`familyInvitations_*`), entrare con un link avendo già un account (`family_join`), cambiare ruolo, rimuovere un membro e uscire (`family_setMemberRole`, `family_removeMember`, `family_leave`); leggere il riepilogo dell'eliminazione (`family_getDeletion`) e richiederla (`family_delete`), ottenendo solo il collegamento alla pagina web; leggere il piano e cancellare il proprio account (`account_getDeletionPlan`, `account_delete`), rimandando all'app quando comporterebbe anche l'eliminazione di una famiglia |
| Gestione del ricettario | Area `catalogue`, ruolo di curatore, senza famiglia: conoscere i requisiti e le istruzioni sugli ingredienti, cercare le ricette pubblicate e archiviate, salvare e riprendere bozze (con la stessa risoluzione dei conflitti del web) e leggerne i salvataggi, controllare una bozza senza pubblicarla, pubblicare ricette complete, scartare bozze, modificare ricette di qualunque autore, cercare, leggere, creare e modificare ingredienti con le equivalenze di ricetta, elencare varietà già usate e controllare una varietà, elencare e creare libri, archiviare e riportare nel ricettario, elencare le versioni e ripristinarne una; dal 16 ottobre 2026 impostare la foto di una ricetta da un indirizzo, sostituirla e toglierla (`catalogue_setPhotoFromUrl`, `catalogue_removePhoto`), mentre il caricamento di un file resta solo web |
| Amministrazione globale | Dal 15 ottobre 2026 inviti all'app (`appInvitations_create`, `_list`, `_revoke`); dal 16 ottobre cercare e leggere gli utenti, assegnare e togliere i ruoli e nominare amministratori (`users_list`, `users_get`, `users_setRole`). Con l'attività C (unita e rilasciata il 16 ottobre 2026) cancellare utenti con i vincoli previsti (`users_getDeletionPlan`, `users_delete`), restituendo solo un URL quando l'operazione eliminerebbe anche una famiglia. Poi ripristino dell'intero catalogo a una data |

Il server ricava l'identità dall'accesso autenticato e verifica il diritto di operare
sulla famiglia o sulla funzione globale richiesta. Il nome di un ruolo fornito
dall'agente non concede quel ruolo. Risultati ed errori devono permettere all'agente di
mostrare gli stessi errori previsti dal web.

**Eliminazione della famiglia: passaggio obbligatorio all'app.** Una richiesta MCP
non esegue né prepara una cancellazione automatica; restituisce un risultato
strutturato che spiega la necessità di aprire l'app e contiene l'URL della pagina
appropriata. L'utente deve aprirla, autenticarsi se necessario e confermare. La pagina
verifica i permessi, senza considerarli concessi dal possesso del link.

La restrizione deve essere applicata sul server e coprire anche le cancellazioni
indirette tramite eliminazione dell'account dell'unico membro. Nascondere un comando
nella lista degli strumenti non basta: il design deve distinguere il contesto di
accesso web da quello MCP in modo verificabile, senza fidarsi di un parametro con cui
l'agente dichiara il canale della richiesta. **Meccanismo deciso l'8 ottobre 2026:** i
token rilasciati agli agenti dal server OAuth portano il claim `client_id`, assente
nelle sessioni dell'app web; le operazioni riservate al web rifiutano con `web_only` e
l'URL della pagina ogni richiesta che lo contiene, qualunque rotta usi. Le altre
operazioni rimangono disponibili via MCP secondo i ruoli già concordati. Per le
cancellazioni indirette (attività C) lo stesso claim si legge nel database, sotto i
lucchetti della cancellazione, perché l'elenco delle famiglie da eliminare mandato dal
chiamante non basta: conta il piano ricalcolato (sopra, «Gestione della famiglia»).

Un agente può assistere il curatore o l'utente nelle operazioni manuali, ma il
pianificatore automatico resta il sistema a regole della sezione 3. L'app non impone
un modello o un fornitore AI al client MCP.

**Pagina web di istruzioni** («Collega un agente» nel Profilo, forma decisa nel sesto
giro del prototipo, `/profile/agents`):

- nessun paragrafo introduttivo (tolto nella review): cosa l'agente può fare con i
  ruoli dell'utente si legge nella schermata di autorizzazione;
- offre percorsi distinti per Codex CLI, Claude Code, ChatGPT e Claude Desktop, con
  indirizzo MCP e comandi o configurazioni copiabili quando il client usa questa
  modalità, oppure passaggi nell'interfaccia quando previsti;
- spiega accesso e autorizzazione nel browser, ammessi dall'utente, ed eventuale
  riautenticazione, dicendo in parole semplici che da quel momento l'agente agisce con
  l'account della persona e può anche cambiare la password e chiudere le sue sessioni;
- chiarisce che l'eliminazione delle famiglie si completa soltanto nell'app, tramite
  il collegamento restituito dall'agente;
- include un esempio per verificare il collegamento e un esempio del flusso del curatore;
- per i curatori, rimanda alle istruzioni scritte che il servizio fornisce all'agente
  (ingredienti, varietà e quantità: sezione 8), senza riportarne il testo, che è per
  l'agente e in inglese (diverge dal prototipo, che lo mostrava);
- descrive come scollegare l'agente secondo il meccanismo di autorizzazione scelto.

Ordine deciso nel sesto giro: indirizzo del servizio con «Copia»; i quattro client a
fisarmonica (scelta nella review rispetto alle schede), ciascuno con passaggi numerati e
comandi da copiare; accesso; esempi da chiedere all'agente (per i curatori anche il
flusso di gestione del ricettario e il rimando alle istruzioni sugli ingredienti servite
all'agente); nota sull'eliminazione delle famiglie; in fondo «Agenti collegati».

Realizzata nella PR #31 (12 ottobre 2026):

- **indirizzo** `<origine>/mcp`: l'origine della pagina, perché in produzione SPA, MCP e
  metadati di scoperta stanno sullo stesso Worker; sul Vite di sviluppo, che inoltra solo
  `/api`, l'origine del Worker a cui inoltra. Ogni «Copia» dice «Copiato» solo se gli
  appunti sono stati aggiornati; altrimenti seleziona il testo e chiede di copiarlo a
  mano;
- **client**, con il nome del servizio `cosasimangia`: Claude Code (`claude mcp add
  --transport http --scope user cosasimangia <url>`, poi `/mcp` › Authenticate) e Codex
  CLI (`codex mcp add cosasimangia --url <url>`, con `codex mcp login cosasimangia` se il
  login non parte da solo), verificati l'11 ottobre 2026; Claude Desktop (connettore
  personalizzato) e ChatGPT (connettore in modalità sviluppatore) portano la nota
  «Passaggi non ancora provati con questo servizio.» finché la verifica della sezione 15
  non è fatta;
- **«Agenti collegati»**: una riga per client con il nome, «Collegato il {data}» e, se
  c'è, l'**ultimo rinnovo dell'accesso**, al posto dell'«ultimo uso» del sesto giro
  (decisione del coordinatore dopo la review): è l'ultima emissione o rinnovo del token
  di una sessione viva del client, letta da Supabase Auth senza registrazioni
  aggiuntive, e una riga sotto l'elenco spiega che non dice quando l'agente ha usato
  l'app. Ordine dal rinnovo più recente;
- **«Scollega»** apre una conferma: revoca l'autorizzazione del client e chiude le sue
  sessioni, da subito non potrà più usare l'app con questo collegamento; non chiude
  accessi ottenuti in altro modo (se l'agente ha cambiato la password, la si cambia);
  spiega anche come togliere il servizio dal client, con istruzioni scelte dal nome
  registrato. Dopo la conferma l'elenco si rilegge, senza aggiornamento ottimistico; un
  errore lascia il foglio aperto e l'agente nell'elenco; senza rete i pulsanti sono
  disattivati;
- **voce nel Profilo**, nella sezione «Account»: «Collega un agente» con il numero di
  agenti collegati, oppure «Claude, ChatGPT o Codex con MCP» se non ce ne sono.

**Skill per Claude** (decisioni dell'utente del 18 ottobre 2026; W17, PR #68 unita il 18
ottobre e rilasciata lo stesso giorno; piano `2026-10-18-skill-claude.md`): sezione «Skill
per Claude» della pagina, dopo gli esempi e la nota sull'eliminazione delle famiglie e
prima di «Agenti collegati».

- **Visibile a tutti; la skill distingue i ruoli.** Una sola skill, `cosa-si-mangia`,
  per tutti: l'agente legge `profile_get` (ruoli globali, famiglie con il ruolo in
  ciascuna, famiglia mostrata) e usa solo le parti che i ruoli consentono. Il server
  controlla comunque i permessi e un ruolo nominato nella richiesta non concede nulla.
- **Cosa copre**: menu della settimana (lettura, pasti, scambi, porzioni, note,
  suggerimenti, annullamento, voti), impostazioni, membri e inviti della famiglia,
  ricettario per i curatori, amministrazione (utenti, ruoli globali, inviti all'app).
  **Non la spesa**, per scelta dell'utente: l'agente ne usa gli strumenti solo se la
  persona lo chiede. Testo in inglese, come la guida del curatore, con l'indicazione di
  rispondere nella lingua della persona; presuppone il connettore già collegato e, se
  gli strumenti mancano, rimanda a Profilo › Collega un agente.
- **Regole del ricettario solo in `catalogue_getGuide`**: la skill non le copia e chiede
  di leggere la guida prima di ogni lavoro su ricette, ingredienti, libri o foto, perché
  la guida può cambiare. Ripete soltanto che gli ingredienti vengono dalla fonte o dalla
  persona, mai dal nome del piatto o da una foto.
- **Conferme esplicite prima delle azioni irreversibili** o che toccano altre persone:
  pubblicare una ricetta, impostare o togliere una foto, ripristinare una versione,
  rimuovere un membro, cambiare un ruolo di famiglia o globale, nominare un
  amministratore dell'app o togliere a sé stessi `app_admin`, revocare un invito,
  entrare in una famiglia, uscirne o eliminarla, cancellare un utente o il proprio
  account. Le modifiche ordinarie al menu chieste dalla persona si fanno e si
  riferiscono, perché `meals_undo` le annulla. Password e sessioni solo su richiesta
  esplicita. Per ogni codice d'errore la skill dice cosa fare (`web_only` con
  `data.url`, `conflict`, `not_allowed`…).
- **Nella pagina**: una riga su cosa fa la skill, «Scarica la skill»
  (`/downloads/cosa-si-mangia.zip`, sezione 1) e quattro passaggi numerati per
  claude.ai: in Settings › Capabilities attivare «Code execution and file creation»; in
  Customize › Skills premere «+», poi «Create skill» › «Upload a skill» e scegliere il
  file; controllare che la skill sia attiva; nell'app Claude sul telefono c'è già, con
  il connettore collegato. I nomi dei menu di claude.ai restano in inglese anche nel
  testo italiano. Sotto, «Versione del {data}: quando cambia, scaricala e caricala di
  nuovo.». **La versione mostrata è quella scritta nella skill**, letta dalla build
  (sezione 1), così le due non divergono.
- **Formato**: un solo `SKILL.md`, senza cartella `references/`, con il frontmatter
  `name` e `description` (nome uguale alla cartella, minuscole e trattini, al più 64
  caratteri; descrizione al più 200); claude.ai accetta uno zip con la cartella della
  skill in cima, non un `SKILL.md` alla radice.
- **Test che legano la skill al contratto** (`server/test/agent-skill.test.ts`): ogni
  nome in forma `gruppo_operazione` citato nel `SKILL.md` è uno strumento generato da
  `collectTools`, salvo ruoli globali, codici d'errore e motivi di `not_allowed`, così
  uno strumento rinominato o tolto fa fallire il test; l'elenco degli `id` nuovi
  coincide con le operazioni MCP che creano, spesa esclusa; frontmatter e riga della
  versione hanno la forma attesa. Il web controlla lo zip (una sola voce
  `cosa-si-mangia/SKILL.md`, contenuto identico), `/downloads/` nel service worker e la
  sezione nelle due lingue.
- Collaudo dell'utente dopo il rilascio del 18 ottobre 2026: zip caricato su claude.ai
  e skill provata dall'app Claude, funziona.

**Schermata di autorizzazione** (sesto giro, `/authorize`, vera dalla PR #31): l'agente
la apre nel browser, all'indirizzo con cui Supabase passa la richiesta
(`/authorize?authorization_id=…`); senza accesso si passa dal login e si torna qui, senza
rete un avviso e nessun pulsante, una richiesta mancante, scaduta o già usata dice di
riprovare dall'agente. Mostra:

- il client con il nome con cui si presenta, precisando che non è verificato (la
  registrazione dinamica è aperta), e in «Dettagli dell'agente», chiuso, identificativo
  del client e pagina di ritorno, per distinguere agenti con lo stesso nome;
- l'account in uso con «Non sei tu? Cambia account»;
- cosa l'agente potrà fare: agire con l'account, come la persona stessa; secondo i ruoli
  anche gestire il ricettario o amministrare l'app; anche cambiare la password e
  chiudere le sessioni, nel browser e degli altri agenti, quindi consentire solo agli
  agenti di cui ci si fida; eliminare una famiglia resta solo nell'app. Tolto «vedere le
  credenziali» del sesto giro da ciò che l'agente non può fare;
- i dati che riceverà (gli scope richiesti, ciascuno con una frase, uno sconosciuto così
  com'è), precisando che riguardano i dati ricevuti all'accesso, non ciò che l'agente può
  fare;
- come scollegarlo e i limiti di «Scollega», come nella pagina;
- «Consenti» e «Annulla». «Consenti» è attivo solo quando il profilo, e quindi i ruoli,
  è letto con successo per la persona corrente, ricontrollato al clic sullo stato
  attuale della lettura: durante una rilettura non si consente. «Annulla» restituisce
  al client il rifiuto.

Ogni risposta appartiene alla coppia di sessione e richiesta in cui è partita: uscita
dalla pagina, cambio di richiesta, uscita anche da un'altra scheda e cambio account la
rendono superata, così una risposta tardiva non porta il browser alla pagina di ritorno
di una richiesta abbandonata.

**Riautorizzazione dello stesso client** (decisione del coordinatore, 11 ottobre 2026):
finché l'agente è collegato, autorizzarlo di nuovo non chiede un altro consenso (la
pagina torna subito all'agente) e aggiunge un accesso accanto al precedente, che resta
valido; «Agenti collegati» mostra comunque una riga per client e «Scollega» revoca tutti
i suoi accessi. Sostituire l'accesso precedente richiederebbe scritture nello schema
`auth`.

**Cambia account durante il consenso** (decisione del coordinatore dopo la review della
PR #31): Supabase lega la richiesta alla prima persona che ne legge i dettagli, quindi
un altro account non può proseguirla. «Cambia account» chiude la sessione con la
procedura comune di «Esci» e, dopo il nuovo accesso, la pagina chiede di ripartire
dall'agente, che aprirà una richiesta nuova per quell'account, senza promettere la
prosecuzione di quella vecchia.

I client iniziali sono scelti; comandi e modalità di collegamento effettivi vanno
verificati nel relativo design. La specifica non assume che tutti gli agenti abbiano
lo stesso comando o le stesse capacità di
gestione di file. Il prototipo distinguerà gli esempi dalle istruzioni operative finali.

### 14. Prototipo e consolidamento del design

**Confermato:** il primo artefatto da costruire è un prototipo dell'app conservato nel
repository e sottoposto a review dell'utente, prima dell'implementazione del prodotto.
La review deve poter cambiare sia funzionalità sia scelte architetturali. Il prototipo
è in `prototype/`; tutti i percorsi sono stati rivisti entro il 7 ottobre 2026.

**Metodo e percorsi, concordati il 6 ottobre 2026.** Il prototipo si costruisce per
giri, ciascuno con preparazione, piano approvato, sviluppo, review con l'utente e
consolidamento. L'ordine dei percorsi, il loro stato, l'architettura del prototipo e
il contenuto di ogni giro sono tracciati in `design/percorsi.md`, guida dei flussi da
seguire anche nello sviluppo dell'app. Le decisioni di prodotto emerse nelle review
restano registrate in questa specifica; il documento dei percorsi descrive come si
attraversano nelle schermate e vi rimanda.

- ordine: Fondamenta, Menu, Ricettario e voti, Revisione dei pasti, Spesa, Famiglia e
  account, Gestione del ricettario, MCP, Amministrazione dell'app;
- primo giro: Fondamenta, Menu, Ricettario e voti insieme, con una tappa intermedia
  dopo Fondamenta e Menu; i giri successivi si compongono alla fine di ogni review;
- prototipo SvelteKit autonomo eseguito nel browser, con dati demo in `localStorage`,
  operazioni applicative simulate che abbozzano quelle condivise fra web e MCP e un
  pannello di prova per utente, ruoli, lingua, unità, data simulata e scenari;
- tracciamento nel repository: `design/percorsi.md` per il percorso complessivo, un
  piano per giro in `progetto/superpowers/plans/`, commit Git locali per la storia.

**Primo giro approvato il 6 ottobre 2026:** Fondamenta, Menu e Ricettario e voti, con
il perimetro descritto in `design/percorsi.md` e il prototipo in `prototype/`.

**Secondo giro approvato il 6 ottobre 2026:** Revisione dei pasti. Le azioni si aprono
dalla matita nel footer della scheda, in un pannello sotto la scheda con porzioni,
cambia ricetta e nota; cambio ricetta, scambio, pasto libero, nota ed esclusione si
completano in un foglio dal basso. "Cambia ricetta" mostra in cima pasto libero,
"non proporre più" e "scambia con un altro pasto", poi i suggerimenti in schede scorrevoli con
"proponimene altri" e infine la ricerca. Dopo ogni modifica un avviso offre "Annulla".

**Terzo giro approvato il 6 ottobre 2026:** Spesa. Una lista per settimana, aperta
dalla borsa nella barra del Menu sulla settimana mostrata, con tutti i pasti della
settimana; spunte condivise e possibili offline; voci libere nell'ultima riga di
"Altro"; "Non in lista" richiudibile per dispensa ed evitati; freccia per vedere da
quali pasti viene una voce; esportazioni nel menu "…" in alto a destra. Pagine
secondarie con freccia "indietro" e nome della destinazione; un tocco su Menu nella
navbar con il Menu aperto porta a oggi. Dopo tre revisioni nel giro sono state
scartate la scelta dei pasti, le liste fatte a mano, l'elenco delle liste e lo storico
(dettagli in `design/percorsi.md`).

**Quarto giro approvato il 6 ottobre 2026:** Famiglia e account. Primo accesso
simulato, wizard minimo con prima generazione, pagina dell'invito, vista Profilo,
membri e inviti, impostazioni della famiglia (griglia «Chi mangia quando» con pasti
fissi e tempi per pasto, regole a modelli, ingredienti, libri, unità, «Avanzate»),
"non proporre più", preferenze, uscita, eliminazione della famiglia e cancellazione
dell'account su pagine dedicate con conferma a pulsante. Le azioni irreversibili usano
un pulsante rosso. Dettagli in `design/percorsi.md`.

**Quinto giro approvato il 7 ottobre 2026:** Gestione del ricettario. Bozze in testa al
ricettario a schede e archiviate in fondo; «+» per una ricetta nuova; menu «…» nella
scheda ricetta per i curatori (modifica tramite bozza di revisione, versioni,
archiviazione); modulo manuale a pagina unica con «Salva bozza» e «Pubblica» in un
passo, problemi in cima e accanto ai campi, avviso di conflitto fra curatori e richiesta
di salvare uscendo; varietà degli ingredienti in testo libero con consigli; versione
precedente aperta com'era con «Ripristina»; versione dei pasti passati (R1). Il percorso
consigliato per la gestione del ricettario resta MCP. Dettagli in `design/percorsi.md`.

**Sesto giro approvato il 7 ottobre 2026:** MCP e Amministrazione dell'app, senza
agente simulato. «Collega un agente» nel Profilo con indirizzo, client a fisarmonica,
accesso, esempi e agenti collegati; schermata di autorizzazione nel browser.
Amministrazione dal Profilo in una pagina con utenti e ruoli, inviti all'app con ruoli
facoltativi e backup del ricettario con anteprima del ripristino; cancellazione di un
utente sulla stessa pagina della cancellazione dell'account. Dettagli in
`design/percorsi.md`. Tutti i percorsi del prototipo sono stati rivisti.

**Differenze dell'app dal sesto giro negli inviti all'app** (PR #45, 15 ottobre 2026;
sezione 7): il link è `/invite/app#<token>`, con il token nel frammento, al posto di
`/invite/app/<token>`; il link si vede solo alla creazione e nell'elenco c'è «Nuovo
link» al posto di «Copia il link», perché il database conserva solo l'impronta del
token; il nome si chiede sulla pagina dell'invito, con email e password, invece che in
una schermata di primo accesso; le pagine `/invite/*` non passano il referrer, anche
quando la shell arriva dalla cache del service worker. La forma della pagina
dell'invito (marchio, colonna stretta, cambio di lingua) resta quella del prototipo.

**Differenze dell'app dal sesto giro negli utenti e ruoli** (PR #47, rilasciata il 16
ottobre 2026; sezione 7): il dettaglio dell'utente non mostra il numero di agenti
collegati; dopo la rinuncia al proprio ruolo di amministratore si torna al Profilo
senza l'avviso a comparsa del prototipo, perché la conferma ha già spiegato la
conseguenza; nel dettaglio del proprio account c'è la riga «Questo è il tuo account».
B non ha lasciato l'area di cancellazione del dettaglio, nemmeno come segnaposto: l'ha
aggiunta l'attività C (sotto). Sezione Utenti, interruttori, conferme e ultimo
amministratore bloccato restano nella forma del prototipo.

**Differenze dell'app dal quarto e dal sesto giro nella gestione della famiglia** (PR
#52, unita e rilasciata il 16 ottobre 2026; sezione 7): il link d'invito è
`/invite#<token>`, con il token nel frammento, al posto di `/invite/<token>`; il link si
vede solo alla creazione e l'elenco non lo ricondivide: mostra autore, scadenza e
persone registrate, i link scaduti con registrazioni da completare e «Revoca», e per
condividere di nuovo si crea un link nuovo; la pagina dell'invito crea l'account con
email, nome e password e il pulsante «Crea l'account ed entra», al posto del primo
accesso simulato; nella pagina dei membri c'è la card nuova «Ingressi con i link»;
«Rendi membro» chiede conferma quando la persona ha link attivi (il prototipo non
chiedeva conferme per il cambio di ruolo), e rimozione, uscita e cancellazione dicono
quanti link smetteranno di valere; dopo l'uscita o l'eliminazione senza altre famiglie
si va al Menu con «Non fai ancora parte di una famiglia», perché l'app non ha
`/welcome`; «Sei uscito» diventa «Non fai più parte di {famiglia}», senza genere; il
numero di agenti collegati compare solo sulla pagina di cancellazione del proprio
account; un account in attesa ha nell'amministrazione «Cancellazione in corso» e
«Completa la cancellazione», e chi vi accede vede «Questo account è stato cancellato.».
**Con le email dell'app** (PR #64, unita e rilasciata il 17 ottobre 2026;
sezione 7) le due pagine d'invito non chiedono più la password e non fanno entrare:
dopo email e nome mostrano «Controlla la posta»; si aggiungono le pagine pubbliche
`/password` e `/password/forgot`, con la forma delle pagine d'ingresso (marchio, colonna
stretta, cambio di lingua), e «Password dimenticata?» nella pagina di accesso; l'etichetta «Non ha ancora confermato
l'email» sta sotto il nome nella pagina dei membri, nello stile di «Dal {data}», e
accanto ai ruoli in `/admin`. Il prototipo non aveva questi stati.
Pagine dedicate con conferma a pulsante rosso, riepiloghi famiglia per famiglia e
scelta del successore restano nella forma del prototipo.

**Comandi delle foto nell'app** (decisioni dell'utente del 16 ottobre 2026, PR #54;
sezione 8): la foto si gestisce solo dalla scheda ricetta aperta, mai dalle schede
compatte del menu o del ricettario. Senza foto il curatore vede sotto l'intestazione il
pulsante bordato «Aggiungi foto», che apre il selettore di file del telefono (sull'iPhone
«Scatta foto» o «Libreria foto»); con la foto, un pulsante a icona «Foto» nell'angolo in
alto a destra della foto apre il foglio dal basso con «Sostituisci la foto» e «Togli la
foto», con la conferma «Togliere la foto?» nel foglio. Durante il caricamento il
pulsante mostra «Caricamento…» ed è disabilitato; gli errori compaiono nel foglio o sotto
il pulsante. Gli altri utenti non vedono comandi; offline i comandi sono disabilitati.
Nessuna riga sulla provenienza della foto.

**Skill per Claude in «Collega un agente»** (decisione dell'utente del 18 ottobre 2026,
PR #68, rilasciata il 18 ottobre 2026; sezione 13): sezione nuova senza prototipo, fatta con i componenti già presenti
nella pagina (scheda, link di testo per scaricare, passaggi numerati, riga di metadati
per la versione), fra gli esempi e «Agenti collegati».

**Linguaggio visivo definitivo, approvato il 4 ottobre 2026.** L'utente ha scelto
il linguaggio del riferimento HTML derivato dallo studio di HelloFresh e verificato
su iPhone. Il materiale approvato è raccolto in `design/`:

- `design/design.md`: guida operativa di palette, font, gerarchie, spazi e componenti;
- `design/index.html`: riferimento interattivo approvato;
- `design/assets/`: font e fotografie usati dal riferimento;
- `design/references/hellofresh/`: screenshot approvati e provenienza degli asset.

La guida attua questa decisione e rimane subordinata ai requisiti di questa specifica.
Il piano e lo sviluppo del prototipo devono usarla esplicitamente; non è necessario
riaprire la scelta del linguaggio. Ogni variazione successiva richiede accordo con
l'utente e aggiornamento della specifica e della guida.

**Caratteri del linguaggio approvato:** fondo crema `#FAF8F3`, superfici bianche,
testo e pulsanti primari `#232323`, verde `#067A46` per gli accenti e stato attivo
della navbar; titoli dei piatti in Agrandir Regular, sezioni in Agrandir Tight Bold,
corpo e controlli in Roboto. Schede bianche con fotografia quando disponibile e
ombra leggera; pulsanti da 8 px di raggio e separatori sottili. File dei font,
dimensioni, pesi, spazi e stati sono definiti nella guida. Dal 16 ottobre 2026 (PR
#54, issue #39) le ricette possono avere una foto (sezioni 2 e 8): con la foto le
schede del menu, del ricettario e dei suggerimenti della revisione dei pasti hanno il
banner 3:1 con l'etichetta del pasto o del gruppo sopra la foto, in verde con testo
bianco, e la foto del pasto passato è desaturata; senza foto, o se l'immagine non si
carica, la scheda resta identica a quella senza foto, senza riquadri vuoti. La foto è
decorativa (testo alternativo vuoto) e non si stampa. Il testo dei campi (`input`,
`select`, `textarea`) è sempre di almeno 16 px, con una dimensione esplicita che non
dipende dall'etichetta, perché iOS non ingrandisca la pagina al tocco; lo zoom del
viewport resta libero (17 ottobre 2026, issue #51, PR #60). Lo controlla il test del CSS
`web/src/design/fieldFontSize.test.ts`.

**Swipe sulla fila dei giorni** (W19, PR #72, e W21, PR #74, rilasciate il 18 ottobre
2026; particolari nei piani `progetto/superpowers/plans/2026-10-18-swipe-settimane.md` e
`2026-10-18-swipe-trascinamento.md`; prodotto nella sezione 5). Trascinamento diretto, non
uno scorrimento: la fila (`.day-links`, `DaySelector`) contiene una striscia di tre
settimane, quella mostrata nel flusso e le due accanto in posizione assoluta ai lati, e a
ogni `touchmove` la pagina scrive `translateX` sulla striscia nel DOM, senza rendering
React. Le settimane accanto hanno solo le date calcolate, senza collegamenti né fuoco e
`aria-hidden`: lettore di schermo e tastiera vedono solo la settimana mostrata; dal lato di
una settimana inesistente la striscia è vuota. Eventi touch della piattaforma su un solo
effetto: `touchstart`, `touchend` e `touchcancel` passivi, `touchmove` non passivo con
`preventDefault` solo dopo che il gesto è diventato orizzontale, così Safari non somma il
rimbalzo verticale della pagina; `touch-action: pan-y pinch-zoom` sulla fila lascia al
sistema scorrimento verticale e zoom. Con il mouse non c'è gesto. L'asse si decide a 10 px:
orizzontale se prevale lo spostamento orizzontale, altrimenti il gesto si abbandona fino al
tocco successivo. Al rilascio si cambia settimana oltre un terzo della larghezza o con un
colpo veloce (almeno 0,5 px/ms negli ultimi 100 ms e almeno 20 px); un colpo veloce nel
verso opposto annulla anche uno spostamento oltre il terzo. Verso una settimana inesistente
la fila segue il dito con la curva dei bordi di iOS (coefficiente 0,55), senza superare mai
la larghezza, e torna sempre indietro. Completamento in 220 ms e ritorno in 200 ms con la
Web Animations API, istantanei con `prefers-reduced-motion` (il trascinamento segue comunque
il dito); un tocco durante il ritorno riprende la fila da dove si trova, dalla distanza del
dito prima della resistenza. Un secondo dito, anche fuori dalla fila, annulla il gesto. Il
clic sintetico sul giorno sotto il dito dopo un trascinamento si ignora (entro 400 ms, una
volta); un tocco durante il completamento non è né gesto né scelta del giorno e anche il suo
clic si ignora; tastiera e mouse scelgono sempre il giorno. La settimana esiste se un suo
giorno qualsiasi è nelle letture `menu.getDates` dei mesi toccati dalle due settimane
vicine, lette con la stessa query del calendario, oppure se la settimana è nella copia
salvata; una settimana senza alcuno slot non compare in `getDates` e, senza copia salvata,
conta come inesistente. Le due settimane accanto che esistono e non sono salvate si leggono
in anticipo una volta, senza osservatori (`prefetchQuery` con `staleTime: Infinity`):
all'apertura fino a due `menu.getWeek` in più, mai ripetute al ritorno in primo piano, alla
riconnessione o alle invalidazioni; all'arrivo la lettura normale della settimana ne
controlla la versione. Alla fine del completamento la striscia resta sulla settimana
accanto finché arrivano i giorni nuovi, poi un `useLayoutEffect` toglie la trasformazione
prima del disegno: niente lampeggi né salti. La navigazione è quella del calendario, con una
voce nella cronologia. Se la settimana di arrivo non è nella copia locale (lettura anticipata
non finita, oppure offline e non salvata) il Menu mostra l'attesa come dal calendario; una
settimana già salvata si raggiunge anche offline senza le date del mese. Scartato lo
scorrimento nativo con snap: soglia di un terzo e movimento ridotto non si controllano.
Nessuna libreria e nessuna operazione nuova. Da provare dall'utente sull'iPhone: soglia e
colpo veloce, durate, resistenza paragonata alla fine di un elenco, pagina che non rimbalza
in verticale, arrivo senza lampeggi, «Riduci movimento», gesto «indietro» di Safari.

**Caricamenti (skeleton)** (W20, issue #49, PR #75 unita il 18 ottobre 2026, rilascio in
preparazione; spec `progetto/superpowers/specs/2026-10-18-skeleton.md`, piano
`progetto/superpowers/plans/2026-10-18-skeleton.md`; regole visive in `design/design.md`,
sezione «Caricamenti (skeleton)»). Durante le attese dei dati, al posto del contenuto ci sono
blocchi pieni della sua forma e della sua altezza, così la pagina non si sposta all'arrivo
(il caso segnalato: in «Cambia ricetta» «Oppure cerca nel ricettario» saltava). Ogni scheda
è un blocco unico `#EBE7DE`, senza testo; pulsanti, campi e righe isolate sono blocchi con
raggio 8 px. I blocchi riusano elementi, classi globali e classi dei moduli CSS del
contenuto, con righe vuote alte una riga di testo, e sono sempre a blocco: nel caso comune
(schede con foto 3:1, nome su una riga, tre schede) lo spostamento è zero. **Variante B,
scelta dall'utente il 18 ottobre 2026** fra tre provate sull'iPhone: pulsazione lenta
dell'opacità da 1 a 0,5 in 1,6 s e ritorno, ripetuta, solo sui blocchi esterni. È
un'eccezione approvata alla regola di `design/design.md` sulle animazioni decorative; si
ferma con `prefers-reduced-motion` e in pausa offline. Lo spazio si riserva subito e i
blocchi compaiono dopo **200 ms**: un'attesa più breve non mostra nulla e non sposta nulla;
la soglia riparte a ogni attesa nuova. Pagine coperte: «Cambia ricetta» (suggerimenti, prima
ricerca, proposte del pasto libero), Menu, Spesa, Ricetta, Ricettario, controllo della
famiglia (`FamilyGate`) e avvio dell'app (prima schermo vuoto); le pagine rare (profilo,
impostazioni, membri, esclusioni, agenti, amministrazione, bozze, eliminazioni, inviti,
`/password`) restano con «Caricamento…». Attese coperte: controllo dell'accesso, ripristino
della copia salvata quando dura più di 200 ms (ammesso anche con copia salvata, decisione
del coordinatore), lettura della coda della Spesa (la lista non si mostra prima, per non far
sparire le spunte fatte sul telefono, PR #22) e lettura dal server senza dati; con dati
disponibili il contenuto compare subito e l'aggiornamento in background non mostra
skeleton. Offline senza copia salvata lo skeleton resta fermo sotto il banner offline
(sezione 1). Ogni pagina coperta ha un layout di attesa completo, con gli stessi
contenitori e la stessa intestazione, condiviso con `FamilyGate`; link indietro, titoli e
filtri che non dipendono dai dati sono veri (Spesa, Ricetta, Ricettario; nel Menu mese e
fila dei giorni quando la settimana è nota). Nel Ricettario titolo e filtri non si
rimontano durante le attese; le sezioni dei curatori (Bozze, Archiviate) non hanno skeleton
né spazio riservato e compaiono quando ruolo e riepilogo sono disponibili: lo spostamento
è ammesso perché riguarda solo i curatori (decisione del coordinatore). Nei suggerimenti
errore e «nessun suggerimento» prendono lo spazio delle schede; nelle pagine restano le
schede di stato. Accessibilità: area dei dati con `aria-busy`, un solo `role="status"` per
pagina o area che annuncia «Caricamento…» quando i blocchi compaiono, blocchi `aria-hidden`
e mai toccabili. Componente condiviso `web/src/components/Skeleton.tsx` (`LoadingScope`
con una sola attesa per pagina, anche per i blocchi dell'intestazione, `Skeleton`,
`BusyArea`, `LoadingArea`), stili in `web/src/design/global.css`, nessuna dipendenza
nuova. Da provare dall'utente sull'iPhone dopo il rilascio: «Cambia ricetta» su un pasto
mai aperto, Cerca che non crolla a ogni lettera, «Riduci movimento», un solo annuncio con
VoiceOver, avvio a freddo della PWA, Spesa con spunte fatte offline.

**Struttura del riferimento approvato:** il Menu si apre direttamente sul calendario,
senza header introduttivo o footer decorativo. I giorni restano in colonne da
scorrere lateralmente, con selettore superiore sincronizzato; il giorno attivo è
scuro con testo bianco. Nessuna ripetizione del numero del giorno o contatori nel
contenuto. Dal 6 ottobre 2026 la navbar inferiore mostra Menu, Ricettario e una voce
per famiglia, account, cambio di famiglia e funzioni dei ruoli (gestione del
ricettario, amministrazione, istruzioni MCP), con etichetta «Profilo» / «Profile» (rinominata
nella review del quarto giro); la Spesa esce dalla navbar e si apre dal Menu (terzo giro). Sopra il
selettore dei giorni una barra con il mese e le icone di azione (calendario e borsa
della spesa); la scheda del pasto ha un footer a icone
per scheda ricetta, voto, ingredienti e modifica (dal secondo giro; "non cucinato" è
stato tolto); foto in
banner basso 3:1 e fonte sulla riga del tempo, troncata. Le schede del ricettario usano
lo stesso componente; il ricettario ha ricerca, un'icona che apre filtri e
ordinamento (nome, voto, aggiunte di recente, mangiate di recente), con una freccia
per invertire l'ordine scelto, che lascia in fondo le ricette senza voto o mai mangiate
(correzione dell'11 ottobre 2026 rispetto al prototipo); nessun filtro per stagione.
Nella scheda
ricetta il titolo apre la fonte e sotto seguono voto, descrizione, porzioni e
ingredienti (dettagli in `design/design.md`); aperta da un pasto, parte dalle porzioni del
pasto (sezione 5). Con la foto, la scheda ricetta la mostra in 16:9 sotto l'intestazione,
prima della riga della fonte.
La navbar mostra solo icone, con nomi accessibili,
rispettando l'area sicura dell'iPhone e senza coprire i contenuti. Gli ingredienti si
espandono nelle singole card. Questi elementi costituiscono la base delle relative
viste del prototipo; le altre funzioni vanno declinate nello stesso linguaggio.

**Ambito dell'approvazione:** l'HTML in `design/` è un riferimento visivo e di
interazione, non il prototipo completo o l'implementazione del prodotto. Il menu
fisso, il ricettario limitato alle ricette della settimana e la spesa del solo
giorno selezionato sono dimostrativi: non sostituiscono il catalogo globale e la
spesa consolidata delle sezioni 6 e 8. Il prototipo dovrà coprire i flussi, le lingue,
le unità, i ruoli e gli stati previsti dalla specifica. Il sito esterno documenta
l'origine dello stile; cambiamenti futuri di quel sito non alterano la scelta
consolidata nel repository.

**Perimetro proposto da concordare nel piano del prototipo:**

- navigazione provabile da telefono e desktop, con dati dimostrativi;
- pasti di oggi, settimana e revisione, ricerca e scheda ricetta, voti e lista della spesa;
- famiglia, membri e inviti, preferenze personali e della famiglia; eliminazione della
  famiglia da parte del suo amministratore solo nell'app, con passaggio dal link
  restituito da MCP; differenza rispetto alla cancellazione di un account, con i
  vincoli sull'ultimo amministratore e sull'eliminazione indiretta delle famiglie;
- cambio lingua e sistema di misura osservabile nei dati mostrati;
- pagina di collegamento MCP e rappresentazione del percorso guidato del curatore;
- sezione bozze nell'app, ripresa del lavoro e pubblicazione; modifica di una ricetta
  di un altro curatore e rappresentazione del recupero da errore;
- rappresentazione del futuro percorso manuale senza AI, con modifica, verifica e
  correzione di una bozza condivisa; la sua presenza nel prototipo non anticipa la
  priorità di implementazione M6;
- pagina di amministrazione dell'app, con elenco utenti, ruoli, inviti, cancellazione
  e percorso di ripristino dell'intero catalogo;
- stati significativi: dati mancanti, nessun risultato, permessi insufficienti e conflitti.

Proposta: simulare le integrazioni per rivedere l'esperienza prima di collegare servizi
reali. La review del prototipo non certifica la compatibilità di un client MCP, il
funzionamento dell'autenticazione o l'applicazione dei permessi: questi richiedono le
successive verifiche tecniche.

**Criterio di passaggio all'implementazione:** review del prototipo, decisioni riportate
nelle sezioni pertinenti di questo documento, verifica dell'architettura risultante
(svolta l'8 ottobre 2026, sezione 1, con i punti aperti della sezione 15),
piani aggiornati e approvati, scelta del metodo di esecuzione. Il linguaggio visivo
è già approvato; le ulteriori decisioni sulle superfici e sui flussi entreranno qui
insieme ai riferimenti ai file del prototipo completo.

### 15. Decisioni da completare nel design

Questa sezione è parte della specifica di lavoro: rende visibili le scelte ancora aperte,
non autorizza a risolverle implicitamente durante l'implementazione. Quando una scelta
viene concordata, si aggiorna la relativa sezione e si chiude la voce qui.

| Tema | Decisione da concordare | Dove confluisce |
|---|---|---|
| Utenti e inviti | Gestione degli inviti familiari da parte dell'amministrazione globale (per ora esclusa: l'amministrazione non entra nelle famiglie). Google, facoltativo, solo dopo una prova sull'iPhone con l'app installata: verificare se il redirect OAuth riporta la sessione nella PWA installata e come collegare un'identità Google con le iscrizioni spente. Minimo di lunghezza della password in produzione da verificare (la SPA impone 8). **Chiusa il 15–16 ottobre 2026 la pagina dei ruoli globali** (issue #38, PR #47): sezione Utenti di `/admin` con ricerca, dettaglio e ruoli, anche via MCP (sezioni 7 e 13). Deciso nel quarto giro: un membro rimosso rientra solo con un link creato dopo la rimozione (review R2). Decise nel sesto giro le regole degli inviti all'app (email, ruoli facoltativi, 7 giorni, uso singolo, revoca, sostituzione); il 12 ottobre 2026 iscrizioni libere spente in produzione; il 13 ottobre accesso con email e password anche dopo il traguardo A, account creato dall'invito con il link nell'email solo per scegliere la password, recupero della password via email, iscrizioni libere che restano spente; cambio della password dal Profilo rilasciato il 13 ottobre (issue #37), con «Secure password change» spento e «Require current password when updating» acceso in produzione. Il 13 ottobre, finché manca il dominio di invio, invito all'app accettato scegliendo la password sulla pagina dell'invito, senza email; recupero della password rimandato al dominio. **Chiusa il 16 ottobre 2026 la regola equivalente per gli inviti alla famiglia** (decisione dell'utente, attività C, PR #52): il link crea l'account a chi non ce l'ha, al più 10 persone registrate per link, con account e ingresso in un solo passaggio e l'email non verificata fino all'attività D (sezione 7). **Chiusa il 13–15 ottobre 2026 l'API di Supabase per creare l'utente** (PR #45, rilasciata il 15 ottobre): l'account dell'invito all'app lo crea il Worker con `POST /auth/v1/admin/users`, con l'id prenotato e `email_confirm: true`, usando la chiave segreta dedicata `SUPABASE_SECRET_KEY` letta solo da `server/src/accounts/`; gli esiti ambigui si riconciliano leggendo l'utente e un account esistente non si riscrive mai (sezioni 1 e 7). **Chiusi il 17 ottobre 2026 i dettagli tecnici per inviare il link per scegliere la password** (W15, parte software dell'attività D, PR #64, rilasciata il 17 ottobre 2026; spec `2026-10-17-email.md`): account creato senza password e con l'email da confermare, link da `generate_link` di tipo `recovery` spedito dal server con Resend, pagina `/password` senza adozione della sessione, stesso meccanismo per inviti all'app e alla famiglia, fine del rischio delle email non verificate; «password dimenticata» con il template di Supabase (sezioni 1, 2 e 7) | Sezione 7 |
| Cancellazione | **Chiusa il 16 ottobre 2026** con l'attività C (PR #52, unita e rilasciata il 16 ottobre 2026): passaggio da MCP al web, procedura tecnica e revoca degli accessi, attribuzioni, inviti pendenti e bozze condivise decisi nella spec `2026-10-16-gestione-famiglia.md` e riportati nelle sezioni 1, 2, 4, 7, 8 e 13 | Sezioni 2, 7 e 13 |
| Backup e ripristino | Tempi di recupero misurati con un'esportazione vera. Foto delle ricette nel ripristino dell'intero catalogo: non fanno parte dello storico ricostruibile, da decidere con quell'attività (sezione 8; le esportazioni ne contengono i riferimenti e gli oggetti non si cancellano mai). Prova di produzione fatta il 13 ottobre 2026 (prima esportazione decifrata con la chiave del gestore di password e ripristinata in locale). Decisi il 12 ottobre l'azzeramento prima dell'uso legato all'impronta di avvio (sezione 8). Decisi l'11 ottobre (PR #30) strumento (Worker su Cron Trigger, con secondo tentativo nella notte), contenuto (anche gli account; dopo un ripristino si rifà l'accesso), conservazione delle ultime 7 copie decisa dal codice, cifratura AES-256-GCM con la chiave anche nel gestore di password, limite di dimensione e procedura tecnica di ripristino provata in CI (sezioni 2, 8 e 9). Decisi nel quinto giro il ripristino della singola ricetta e la versione usata dai pasti passati, nel sesto il ripristino dell'intero catalogo (ricette successive archiviate, anteprima), l'8 ottobre l'esportazione notturna in R2 al posto dei backup della piattaforma e la ricostruzione a una data dallo storico al posto delle copie periodiche | Sezioni 8 e 9 |
| MCP | Verifica di Claude Desktop e ChatGPT (Claude Code e Codex CLI verificati l'11 ottobre 2026 con il server OAuth 2.1 di Supabase, sezione 13), raggruppamento degli strumenti (per ora uno per operazione), consegna delle esportazioni e comportamento dei ritentativi. Limitazione dei poteri dei token d'agente su Supabase Auth, per ora solo documentati (decisione dell'utente dell'11 ottobre 2026; candidato: server di autorizzazione nel Worker). La password attuale richiesta per cambiarla è attiva in produzione dal 13 ottobre 2026 con «Require current password when updating» (sezione 13). Ultimo uso vero degli agenti: sostituito dall'ultimo rinnovo dell'accesso, servirebbe registrare le richieste autenticate. Decise nel sesto giro la pagina di collegamento, la schermata di autorizzazione e lo scollegamento dall'app; l'8 ottobre architettura, autenticazione e distinzione del canale (sezioni 1 e 13); l'11–12 ottobre (PR #31) revoca con la gestione dei grant di Supabase provata in CI, elenco e scollegamento come operazioni anche MCP, riautorizzazione che aggiunge un accesso, testi veritieri sui poteri, cambio account che riparte dall'agente (sezioni 1, 2 e 13) | Sezioni 1, 2 e 13 |
| Prototipo | Tutti i percorsi approvati entro il sesto giro (7 ottobre 2026); architettura verificata l'8 ottobre. Il prototipo resta in Svelte come riferimento dei percorsi; dall'8 ottobre il ripristino del catalogo vi si fa scegliendo una data (sezione 8) | Sezione 14 |
| Implementazione | Automazione della pubblicazione con GitHub Actions, da rivalutare quando i rilasci diventano frequenti. Decisi l'11 ottobre le fasi nel piano generale (sezione 10), il flusso Git con CI e l'integrazione Supabase senza «Deploy to production» (sezione 1); l'11–12 ottobre, nella messa in produzione, pubblicazione a mano con `npm run release` al posto dell'automazione prima del traguardo A, migrazioni di produzione con la CLI di Supabase dentro `npm run release` prima del deploy, operazioni sulla produzione con anteprima e impronta (sezioni 1 e 10) | Sezioni 1 e 10 |
| Foto delle ricette | **Chiusa il 16 ottobre 2026** (issue #39, W12, PR #54 unita e rilasciata il 16 ottobre; spec `2026-10-16-foto-ricette.md`): una foto per ricetta in `recipe_photos`, fuori dalle versioni; bucket R2 privato con rotta `/photos/<chiave>` che serve solo le foto correnti; caricamento dall'app solo dalla scheda ricetta e solo per i curatori, impostazione da un indirizzo via MCP con conferma del curatore; nessuna provenienza della foto (decisione dell'utente, supera la «fonte» fra le domande di questa voce); cache offline solo nel service worker; esportazione con i soli riferimenti e oggetti mai cancellati in automatico (sezioni 1, 2, 8, 13 e 14). Resta da decidere, con il ripristino dell'intero catalogo, come trattare le foto (voce Backup e ripristino) | Sezioni 1, 2, 8, 13 e 14 |
| Architettura | Valutare nell'ondata 2 `@orpc/tanstack-query` (per ora `queryOptions` scritte a mano). Decisi l'11 ottobre 2026 oRPC senza Hono, Postgres.js senza ORM e l'SDK ufficiale di MCP, provati su Workers con RLS tramite Hyperdrive, e cosa fa crescere i contatori di versione (sezione 1) | Sezione 1 |
| Hosting e costi | Pausa del progetto gratuito evitata davvero dal job orario; CPU del giudice, se lo si sperimenta. Decisi l'8 ottobre Cloudflare Workers sul piano a pagamento da 5 $ al mese (il pianificatore usa circa 20-25 ms di CPU per settimana, sezione 3; una richiesta all'API ne usa circa 7, una chiamata MCP circa 13, misurati l'11 ottobre), Supabase gratuito, Resend, il dominio `cosasimangia.qunidi.it` e il DNS di `qunidi.it` su Cloudflare; dal 13 ottobre il dominio serve solo per l'invio, subordinato al DNS (attività D), e l'app resta su `workers.dev`; **dal 17 ottobre 2026** app ed email su `cosasimangia.app`, comprato dall'utente su Cloudflare, con `workers.dev` spento, dominio verificato in Resend e SMTP di Supabase Auth su Resend (sezioni 1 e 7). Decisi il 16 ottobre (PR #54) per le foto: bucket R2 dentro i 10 GB gratuiti, una sola trasformazione WebP per caricamento con il binding Images sul piano Free (5.000 trasformazioni uniche al mese, oltre falliscono senza addebiti), mai trasformazioni alla lettura, ridimensionamento JPEG nel browser prima del caricamento (sezione 1) | Sezioni 1, 4, 7 e 8 |
| Calendario | Fuso orario della famiglia deciso l'8 ottobre (dal browser alla creazione, modificabile dagli amministratori, ricalcolo anche per i pasti passati; sezione 2). Generazione su richiesta («rigenera») nell'ondata 3; il wizard non genera (deciso l'11 ottobre) (review R3; le chiusure sono state eliminate; prima generazione di una famiglia nuova decisa nel quarto giro; generazione pigra come rete di sicurezza del job decisa l'8 ottobre; l'11 ottobre regola unica di generazione all'apertura per la settimana in corso e la successiva, recupero e abbandono dei job, generazioni serializzate per famiglia, sezione 4) | Sezioni 2, 4 e 5 |
| Pianificatore e giudice | Classificazione dei vincoli in parte decisa nell'esperimento dell'8 ottobre: vincoli rigidi (compreso il massimo settimanale degli ingredienti limitati) filtrano, voto ≤ 2 ammesso solo senza alternative, slot senza candidati segnati «nessuna ricetta adatta», regole di settimana (venerdì pesce, intervalli, quota) riparate quando possibile e altrimenti mostrate nel report. Restano: come mostrare alla famiglia una regola non soddisfatta, un modello di regola per «niente skottle il lunedì sera», crescita del ricettario per la quota note/nuove; chiarire se il giudice può conoscere la posizione dei pasti liberi (review R5) | Sezioni 3 e 9 |

### 16. Registro delle revisioni

| Data | Decisioni consolidate |
|---|---|
| 29 settembre 2026 | Approvata la base funzionale e tecnica dell'app, con pianificatore a regole e rilascio per fasi |
| 3 ottobre 2026 | Aggiunti unità metriche/imperiali britanniche, lingua personale italiano/inglese britannico, parità MCP, ruolo di curatore e inserimento guidato, catalogo autorevole nel database, guida MCP, amministrazione globale degli utenti e codice in inglese. Confermati ruoli globali cumulabili senza accesso automatico ai contenuti familiari. Stabiliti prototipo prima dell'implementazione e questo documento come riferimento unico aggiornato a ogni nuova scelta |
| 3 ottobre 2026, prosecuzione | Confermate bozze persistenti visibili in una sezione dell'app, possibilità per ogni curatore di modificare l'intero ricettario e necessità di backup e ripristino. La completezza è richiesta per pubblicare nel catalogo, mentre le bozze possono essere incomplete. Il ripristino della singola ricetta spetta ai curatori, quello dell'intero catalogo agli amministratori dell'app |
| 3 ottobre 2026, curatela manuale | Confermate bozze condivise e modificabili da tutti i curatori. Aggiunto il percorso manuale web senza AI per creare, modificare, verificare nuovamente e pubblicare ricette; ultima priorità di implementazione (M6). Upload da file registrato come opzione da definire |
| 3 ottobre 2026, traduzioni | Confermati italiano e inglese britannico entrambi obbligatori per pubblicare una ricetta; traduzioni mancanti mantengono la scheda in bozza, anche per l'importazione |
| 3 ottobre 2026, ingredienti | Confermati elenco verificato degli ingredienti, quantità e unità quando applicabili e porzioni di riferimento come requisiti di pubblicazione anche per le ricette pregresse. Ammessi "q.b." espliciti; i dati mancanti mantengono la ricetta in bozza |
| 3 ottobre 2026, client MCP | Scelti Codex CLI, Claude Code, ChatGPT e Claude Desktop come client obiettivo della prima versione, con guida dedicata e verifica tecnica per ciascuno |
| 3 ottobre 2026, cancellazioni | Confermate le regole per cancellare utenti: protezione dell'ultimo amministratore dell'app, successore nelle famiglie con altri membri, eliminazione della famiglia dell'unico membro, conservazione delle ricette pubblicate e revoca degli accessi. Aggiunto al ruolo di amministratore della famiglia il diritto di eliminarla senza cancellare gli account dei membri |
| 3 ottobre 2026, eccezione MCP | Eliminazione delle famiglie riservata all'app web: MCP restituisce un URL e l'utente completa l'operazione nella pagina dedicata. La restrizione copre anche la cancellazione di account che comporterebbe l'eliminazione di una famiglia |
| 3 ottobre 2026, review avversariale | Riesame indipendente della revisione `e473472`: direzione di prodotto adatta al prototipo esplorativo, implementazione ancora subordinata alle decisioni e correzioni della sezione 17. Nessuna soluzione proposta dal revisore è automaticamente una decisione approvata |
| 4 ottobre 2026, linguaggio visivo definitivo | Approvato il linguaggio derivato dallo studio HelloFresh e rappresentato in `design/index.html`: guida vincolante in `design/design.md`, istruzioni per gli agenti e materiale approvato consolidato in `design/`. Il futuro prototipo deve riusare questa base; flussi e servizi restano soggetti alla specifica e ai piani successivi |
| 6 ottobre 2026, percorsi del prototipo | Concordati metodo per giri, ordine dei nove percorsi, primo giro su Fondamenta, Menu e Ricettario con tappa intermedia, prototipo SvelteKit con dati e operazioni simulate, tracciamento in `design/percorsi.md` e nei piani di giro |
| 6 ottobre 2026, preparazione del primo giro | Pasto passato alle 15:30 (pranzo) e alle 23:00 (cena); quarta voce della navbar per famiglia, account e ruoli; due varianti del componente voto da confrontare nella review |
| 6 ottobre 2026, tappa intermedia del prototipo | Eliminati stati e chiusura delle settimane: ogni settimana è modificabile, i pasti passati contano come cucinati salvo "non cucinato", il job genera soltanto. Calendario per scegliere qualunque giorno con menu; Spesa fuori dalla navbar, ingresso da decidere nel percorso Spesa |
| 6 ottobre 2026, "non cucinato" tolto | Ogni pasto passato conta come mangiato; un pasto sbagliato si corregge cambiandone il piatto o segnandolo libero. Tolto il campo `cooked` di `meal_slots`; lo storico del pianificatore usa tutti i pasti passati con ricetta |
| 6 ottobre 2026, secondo giro del prototipo approvato | Revisione dei pasti: niente avvisi di settimana; vince l'ultimo salvataggio senza conflitto; ultima modifica senza canale; scambio nella stessa settimana con piatto e nota; "non proporre più" che apre la scelta del sostituto; "proponimene altri" al posto di "proponimene un altro"; voto solo visualizzato nei suggerimenti; annullamento delle proprie modifiche; azioni dalla matita in un pannello nella scheda (porzioni, cambia ricetta, nota), con pasto libero, esclusione e scambio dentro "Cambia ricetta" |
| 6 ottobre 2026, terzo giro del prototipo approvato | Spesa: una lista per settimana con tutti i pasti, aperta dal Menu, senza scelta dei pasti, altre liste o archivio; persistente e condivisa, con spunte che valgono per "ce l'ho già" e "comprato", voci libere e modifica offline con coda locale; quantità che seguono i pasti, pezzi interi, unità di acquisto e tazze USA tramite equivalenze per ingrediente; voci distinte solo per prodotti diversi; esportazioni nel menu "…". Tolta la scorciatoia "solo quelli non ancora in lista" |
| 6 ottobre 2026, quarto giro del prototipo approvato | Famiglia e account: rientro dopo la rimozione solo con un link nuovo (R2); impostazioni tutte visibili tranne i pesi, con «Avanzate» e regole a modelli; wizard minimo (nome e unità) e prima generazione da oggi a domenica più la settimana successiva dopo mercoledì alle 20:00; vista «Tu» rinominata «Profilo», con cambio di famiglia; pagine dedicate per eliminare la famiglia e cancellare l'account con conferma a pulsante; pulsanti rossi per le azioni irreversibili; i suggerimenti rispettano le impostazioni della famiglia |
| 7 ottobre 2026, quinto giro del prototipo approvato | Curatela: pasti passati sulla versione con cui sono stati mangiati, oggi e futuri sulla corrente (R1); modifica tramite bozza di revisione; conflitti fra curatori rifiutati e risolti consapevolmente; archiviazione reversibile; ripristino di una versione aperta com'era, senza confronto; pubblicazione in un passo senza verifica esplicita; campi obbligatori per tipo di fonte; varietà degli ingredienti in testo libero con confronto normalizzato e consigli, istruzioni per l'agente; caricamento da file escluso per ora; avviso della versione solo ai curatori; percorso MCP consigliato rispetto al modulo |
| 7 ottobre 2026, sesto giro del prototipo approvato | MCP e Amministrazione dell'app: nessun agente simulato; selettore di lingua nel modulo della ricetta; pagina «Collega un agente» senza introduzione, con client a fisarmonica, comandi d'esempio verificati e agenti collegati da scollegare; schermata di autorizzazione nel browser; amministrazione dal Profilo con utenti e ruoli (conferma per nominare amministratori, ultimo amministratore bloccato, famiglie solo per nome e ruolo), cancellazione di un utente con le regole dell'account; inviti all'app per un'email con ruoli facoltativi, 7 giorni, uso singolo e revoca, senza ingresso in famiglie; ripristino dell'intero catalogo come nuova versione con archiviazione delle ricette successive, anteprima e copia prima del ripristino |
| 8 ottobre 2026, verifica dell'architettura | Dopo una challenge del piano e dell'architettura iniziali alla luce del prototipo: interfaccia in React (SPA con Vite, TanStack Router e Query) al posto di Svelte; strato unico di operazioni con contratto esplicito servito da Hono su Netlify, da cui derivano API web, OpenAPI e strumenti MCP (libreria del contratto aperta); MCP nella stessa app con il server OAuth 2.1 di Supabase e canale ricavato dal claim `client_id`; job con `pg_cron` verso il server, senza Edge Function né Deno; ricetta come documento con proiezioni; ripristino dell'intero catalogo a una data dallo storico, senza copie periodiche; spunte della spesa per ingrediente e varietà, cronologia delle bozze in tabella e fuso orario della famiglia nel modello. Poi confermata la generazione pigra come rete di sicurezza del job e aggiornato il prototipo (ripristino del catalogo scegliendo giorno e ora, con elenco dei ripristini da annullare). Campi bilingui restano una proposta; le fasi di rilascio diventano un punto aperto. Deciso il fuso orario della famiglia: dal browser alla creazione, modificabile dagli amministratori, ricalcolato anche per i pasti passati; job orario per famiglie in fusi diversi |
| 8 ottobre 2026, hosting e costi | Cloudflare Workers al posto di Netlify per server e SPA, con Hyperdrive verso Supabase; Supabase sul piano gratuito, con esportazione notturna in R2 al posto dei backup della piattaforma e pausa evitata dal job orario; email con Resend gratuito per Supabase Auth e per il server, dominio da scegliere; token verificati con le chiavi pubbliche di Supabase e query nel ruolo dell'utente dentro la transazione; letture dalla copia sul dispositivo con contatori di versione e risposta «invariato». Valutate e scartate: tutto su Cloudflare con D1 e Better Auth, Neon con Better Auth |
| 8 ottobre 2026, nome dell'app | Scelto «Cosa si mangia» al posto di «App Famiglia»: punto di domanda solo nel marchio, nome identico in inglese britannico; nomi tecnici invariati. Dominio `cosasimangia.qunidi.it`, sottodominio del dominio dell'utente, anche per l'invio delle email; DNS di `qunidi.it` da Aruba a Cloudflare gratuito, registrazione su Aruba. Scartati la configurazione parziale (CNAME), che richiede il piano Business, e un dominio diverso |
| 8 ottobre 2026, esperimento del pianificatore (M0) | Generazione della settimana in `domain/src/planner/` provata su 20 settimane con le 52 ricette pubblicabili d'origine: nessuna violazione, settimane credibili per l'utente. Confermati i vocabolari degli attributi delle ricette e la loro classificazione; il lunedì vale per il pesce di pescheria (nuovo attributo e nuovo modello di regola), il pesce in scatola è ammesso; pranzi feriali entro 30 minuti come default delle famiglie nuove; una ricetta non cucinata da 8 settimane torna «nuova» per la quota; peso della somiglianza più alto e riparazione che, a parità di regole sistemate, sceglie la settimana con il punteggio complessivo migliore (gradimento, stagione, somiglianza); il report mostra voti e pasti fuori stagione (15 su 240). Il ricettario attuale è troppo piccolo per la quota note/nuove |
| 8 ottobre 2026, revisione dell'esperimento del pianificatore | Applicate le osservazioni della revisione indipendente: confronto degli identificativi indipendente dalla lingua del sistema, catalogo ordinato all'ingresso, spinta nella prima scelta verso le regole «almeno un gruppo in un giorno» (la riparazione cambia 31 piatti in 20 settimane invece di 41), storico e catalogo preparati una volta per settimana (costo che non cresce più con lo storico: dopo tre anni circa 16 ms invece di 121), lettura delle durate più prudente («e mezza» e trattino lungo), tempi in ore letti correttamente, controllo dei tipi di `domain/` senza Node. Peso della stagione confermato a 1. Workers sul piano a pagamento da 5 $ al mese. Validazione dei giorni dello storico rimandata all'import |
| 6 ottobre 2026, primo giro del prototipo approvato | Barra con mese e icone sopra i giorni; schede con footer a icone, foto 3:1 e fonte troncata sulla riga del tempo; stesso componente nel ricettario; voto in riga; scheda ricetta con titolo collegato alla fonte; filtri richiudibili con ordinamento invertibile e senza stagione; quantità non numeriche tradotte e obbligatorie per pubblicare; etichetta «Tu» confermata; bozze in testa al ricettario solo per i curatori; navbar con sole icone |
| 11 ottobre 2026, gestione del ricettario | «Gestione del ricettario» (o «gestione») sostituisce «curatela» nei documenti vivi e nell'interfaccia italiana del prototipo («Gestione del ricettario» nel Profilo). Il ruolo resta «curatore», il codice in inglese resta `curation`; piani chiusi e righe precedenti di questo registro invariati |
| 11 ottobre 2026, prove tecniche | Scelti oRPC senza Hono, Postgres.js senza ORM, `jose` e l'SDK ufficiale di MCP, per tenere al minimo le dipendenze con pochi utenti. Provati su un Worker: RPC, OpenAPI e strumenti MCP dal contratto, RLS nel ruolo dell'utente tramite Hyperdrive senza scambi di dati sotto carico, limite di connessioni di Hyperdrive sotto il pool di Supabase, cache senza promesse condivise. Server OAuth 2.1 di Supabase disponibile sul piano gratuito; Claude Code e Codex CLI collegati con consenso e canale `client_id`; revoca da provare in M1; Claude Desktop e ChatGPT da verificare. Esito in `spike/REPORT.md`. Deciso l'account Cloudflare di POWA; installata la CLI di Supabase |
| 11 ottobre 2026, fine dell'ondata 1 | Riportate le decisioni delle cinque attività unite (piattaforma, schema e permessi, ricetta e import, unità e spesa, app web di base) e del piano generale: fasi a tre ondate con il traguardo A; campi bilingui jsonb; attributi del pianificatore obbligatori per pubblicare; «invariato» nel contratto; Cron Trigger per il job; R1 con la prima versione pubblicata; spesa offline anche senza sessione verificabile; ruoli Postgres e schema `app`; contatori di versione; copia e sessione sul dispositivo; codici delle unità, presentazione imperiale e pezzi nella spesa; casi R4 e import con revisione approvata; accesso con email e password nel traguardo A |
| 11 ottobre 2026, attività dell'ondata 2 unite | Riportate le decisioni di profilo e famiglia, ricettario e voti, menu e pianificatore, spesa e gestione del ricettario tramite MCP: regola unica di generazione all'apertura, settimane successive già pianificate considerate dal pianificatore, recupero e abbandono dei job, apertura sul primo giorno con pasti; famiglia mostrata sul server e Profilo senza i comandi dell'ondata 3; ricerca nella lingua dell'utente e ordinamento con i valori mancanti in fondo; Condividi e Bring! nel traguardo A, PDF nell'ondata 3, coda della spesa per ogni modifica; conferma del curatore nelle istruzioni dell'agente, eliminazione di una bozza come chiusura, revisione di ricette archiviate, ingredienti ed equivalenze via MCP, bozze in sola lettura nell'app; errori `not_allowed` e `conflict` con tipo, hook `prepare`, tabelle `profile_preferences` e `recipe_draft_requests`; fasi della sezione 10 con lo stato delle attività |
| 11 ottobre 2026, decisioni dell'utente sul consolidamento | Ingrediente creabile con il solo nome italiano, con il nome inglese richiesto alla pubblicazione della ricetta; nessun pulsante «Genera la prima settimana» nel wizard, perché il menu si genera all'apertura; confermati il rinvio all'ondata 3 dell'email di allarme del job e del PDF della spesa; esportazione notturna in R2 con le ultime 7 copie; progetto Supabase `lronuqvtjdhfyychnscr` confermato come produzione |
| 11–12 ottobre 2026, revisione dei pasti (server) ed esportazione notturna unite | Riportate le decisioni delle PR #29 e #30 (con la #32, che rinomina la migrazione dell'esportazione in `20261012110000_backup.sql`). Revisione dei pasti: area `meals` con azioni a `id` del client (`meal_actions`, `last_action_id`, registro veritiero), richieste senza effetti ricordate, annullamento della propria ultima azione senza limiti di tempo lato server (6 secondi nell'app, anche da una conversazione MCP nuova con `lastChange.undoable`), scambio annullato per intero, porzioni da 1 a 20, pasto libero fino a 60 caratteri con i quattro testi più usati, solo ricette pubblicate, bozze importate che seguono scambio e annullamento (con la bozza pubblicata nel frattempo ripristinata e quella scartata che blocca, decisione del coordinatore del 12 ottobre), «non proporre più» che resta chiudendo il foglio, ricerca del sostituto con i soli filtri, salvataggi delle porzioni respinti sempre spiegati; suggerimenti con `rankSuggestions` e ricette archiviate fissate anche nella generazione; nuovi motivi di `not_allowed`, UUID in minuscolo, suggerimenti non versionati. Note e testi dei pasti liberi come scritti. Esportazione: Worker su un Cron Trigger dedicato con secondo tentativo, ruolo `app_backup`, account compresi, JSON con gzip e AES-256-GCM, bucket UE, ultime 7 dal codice, limite di 8 MB, CLI di ripristino con verifiche e TLS verificato, prova in CI e prova di produzione separata; email di allarme nell'ondata 3. Chiuse in sezione 15 le voci «Lingue» e, salvo tempi di recupero e prova di produzione, «Backup e ripristino». Sezione 10 aggiornata |
| 12 ottobre 2026, collegamento degli agenti e revisione dei pasti nel web unite | Riportate le decisioni delle PR #31 e #33. Agenti: consenso vero su `/authorize` e pagina «Collega un agente» con i comandi di Claude Code e Codex CLI verificati; area `agents` (`agents.list`, `agents.disconnect`, anche MCP) con `app.connected_agents()` al posto della tabella `agent_authorizations`; scollegamento con la gestione dei grant di Supabase e il controllo della sessione già presente, provato in CI con token reali; riautorizzazione dello stesso client che aggiunge un accesso; «ultimo rinnovo dell'accesso» al posto dell'ultimo uso; poteri dei token d'agente su Supabase Auth accettati come rischio aperto, con testi veritieri nel consenso, nella pagina e in «Scollega»; nome del client non verificato e scope come dati ricevuti; cambio account che riparte dall'agente; configurazione del server OAuth e `SUPABASE_PUBLISHABLE_KEY`. Revisione dei pasti nel web: matita e porzioni da 1 a 20 per ogni pasto, anche libero o vuoto; salvataggi respinti spiegati anche dopo la navigazione; «Annulla» per 6 secondi nell'app; `not_found` che chiude il foglio; ricerca con errore e «Riprova»; comandi disattivati offline anche nel foglio aperto; voto confermato che rende superata una risposta dei pasti. Sezione 15 «MCP» aggiornata; sezione 10 aggiornata |
| 12–13 ottobre 2026, messa in produzione | Riportate le decisioni della spec `2026-10-11-messa-in-produzione.md` (PR #34, con le correzioni delle review) e l'esito del lancio (PR #36). Iscrizioni libere spente in produzione, verificate da ogni anteprima di rilascio; OAuth server, *Site URL* e *Redirect URLs* attivati prima del primo rilascio; pubblicazione con `npm run release` in due tempi con impronta, al posto dell'automazione prima del traguardo A, e migrazioni di produzione al suo interno; operazioni sulla produzione dal coordinatore con anteprima, impronta e «vai», SQL solo da una lista chiusa di script versionati, nessuna password negli argomenti, Hyperdrive creato dall'utente in dashboard, TLS verificato, progetto di destinazione in un file versionato; caricamento in una transazione con anteprima, solo in aggiunta, con impostazioni della famiglia, menu in corso, pasti doppi fra le provate e preferenze condizionali nel report; avvio a fasi e a finestra con azzeramento legato all'impronta di avvio al posto della rimozione della famiglia; ripiego sul PDF d'origine. Esito: primo rilascio il 12 ottobre su `cosasimangia.qunidi.workers.dev`, famiglia avviata e agenti collegati il 13, collaudo completo in corso, rotazione delle password rimandata dall'utente. Sezioni 1, 2, 7, 8, 10, 11, 13 e 15 aggiornate |
| 13 ottobre 2026, accesso e inviti | Decisioni dell'utente: accesso principale con email e password dal traguardo A in poi, non provvisorio, perché sull'iPhone la PWA installata non condivide cookie e archivio con Safari e un link che apre Safari lascia lì la sessione; tolto il link via email come modo di entrare. L'invito crea l'account e le iscrizioni libere restano spente; il link nell'email serve solo a scegliere la password, come quello della «password dimenticata» (recupero via email, raro), entrambi con Resend. Google facoltativo, solo dopo una prova sull'iPhone con l'app installata (redirect OAuth nella PWA, identità Google con le iscrizioni spente: sezione 15). Cambio della password dal Profilo ad alta priorità nel traguardo A (issue #37); citate anche le issue #38 (pagina dei ruoli) e #39 (foto delle ricette). Sezioni Parte 1, 1, 7, 9, 10, 14 e 15 aggiornate |
| 13 ottobre 2026, cambio della password e aggiornamento della PWA rilasciati | Riportate le decisioni delle spec `2026-10-13-cambio-password.md` (W7, PR #41, issue #37) e `2026-10-13-aggiornamento-pwa.md` (W8, PR #43, issue #42), entrambe rilasciate il 13 ottobre. Cambio della password dal Profilo senza email, con verifica della password attuale nella SPA e chiusura delle altre sessioni, agenti compresi; in produzione «Secure password change» spento (precondizione) e «Require current password when updating» acceso dall'utente, che chiude in parte il rischio dei poteri dei token d'agente; minimo di produzione non verificato (la SPA impone 8). Navigazioni dalla shell installata al posto di quelle dalla rete con ripiego sulla shell, perché rendono impossibili versioni mescolate e pagine bianche; precache dentro `sw.js` verificato con la versione di `index.html`, `skipWaiting`, ricaricamento quando la versione del worker attivo è diversa, solo con la pagina libera, visibile e non toccata; pagina occupata registrata con `trackBusy`; `CACHE_SCHEMA` al posto della versione della build come `buster`, con la regola accanto a quella delle modifiche solo additive. Esito: cambio della password provato dall'utente sull'iPhone; versione `759ce4d6` in produzione, ma sull'iPhone dell'utente il primo passaggio non è avvenuto con due aperture a freddo ed è servito togliere l'app, cancellare i dati del sito nelle impostazioni di Safari e aggiungerla di nuovo; passaggio automatico da verificare al prossimo rilascio, #42 aperta. Sezioni Parte 1, 1, 6, 7, 9, 10, 13 e 15 aggiornate |
| 13 ottobre 2026, ondata 3 senza email | Decisione dell'utente: il DNS di `qunidi.it` per ora non si può modificare e `workers.dev` non permette di verificare un dominio in Resend, quindi finché manca il dominio di invio l'invito all'app si accetta scegliendo la password sulla pagina dell'invito (email dell'invito da ridigitare, account creato già confermato, link mandato a mano), il recupero della password via email aspetta il dominio e l'app resta su `workers.dev`. Ordine dell'ondata 3 nel piano generale. Con la revisione della PR #44: distinti ovunque il flusso prima della verifica del dominio di invio (attività A, password sulla pagina dell'invito) e quello dopo l'attività D (link nell'email, recupero della password, email operative di job ed esportazione); dominio di invio separato dall'origine dell'app, con *Site URL* e *Redirect URLs* su `workers.dev` e il trasferimento dell'app fuori dall'ondata 3, da decidere a parte; decisioni del coordinatore: dopo la creazione dell'account la pagina dell'invito fa entrare con email e password e, se l'accesso fallisce, porta all'accesso normale; fino agli inviti alla famiglia (C) la scheda dopo la prima generazione mostra solo «Sistema le impostazioni». Riportati anche il secondo tentativo di revoca dell'accesso di prova e il pulsante «Accedi di nuovo» (W7), il recupero della registrazione e il ritorno ad A₀ chiudendo tutte le finestre (W8). Intestazione, Parte 1 e sezioni 1, 4, 7, 8, 10 e 15 aggiornate |
| 15 ottobre 2026, inviti all'app e famiglie nuove | Riportate le decisioni della spec `2026-10-13-inviti-app.md` (W9, attività A dell'ondata 3, PR #45, rilasciata il 15 ottobre). Pagina dell'invito con email, nome e password in un solo modulo, che vale come primo accesso; link `/invite/app#<token>` con il token nel frammento, solo l'impronta SHA-256 nel database, link visibile solo alla creazione e «Nuovo link» nell'elenco (differenza dal sesto giro); un solo messaggio per invito scaduto, revocato, usato o inesistente; «Crea la tua famiglia» senza famiglie, wizard `/family/new` e scheda di benvenuto con il solo «Sistema le impostazioni» e la nota della schermata Home su iOS in Safari. Tecniche: ruolo `public` del contratto con `mcp: false` e `rateLimit`, pipeline in `anon` senza token e senza transazione propria; codici `invitation_unavailable` e `rate_limited`, motivi `account_exists` e `already_accepted`, codice delle `refine` dal messaggio; tabella `app_invitations` con prenotazione e funzioni per token; account creato dal Worker con l'API di amministrazione di Supabase Auth e la chiave segreta dedicata, senza mai riscrivere un account esistente; limiti di frequenza con il binding `ratelimit`; `family.create` con `app.create_family`, senza generazione; iscrizioni spente anche nello stack locale; `Referrer-Policy: no-referrer` anche nella shell; fusi a scostamento trattati come non validi. Chiusa in sezione 15 l'API di Supabase per creare l'utente. Esito: provata dall'utente sull'iPhone. Intestazione, Parte 1 e sezioni 1, 2, 4, 5, 7, 9, 10, 13, 14 e 15 aggiornate |
| 15–16 ottobre 2026, amministrazione di utenti e ruoli | Riportate le decisioni della spec `2026-10-15-amministrazione-utenti.md` (W10, attività B dell'ondata 3, issue #38, PR #47 unita il 15 ottobre e rilasciata il 16 con la versione `75d29930-6125-41bd-acf4-786814218171`). Decisione dell'utente del 15 ottobre: la cancellazione degli utenti dall'amministrazione passa all'attività C, con la cancellazione dell'account. Prodotto: sezione Utenti di `/admin` sopra «Inviti all'app», ricerca per nome o email che ignora le maiuscole ma non gli accenti, al più 50 risultati con l'invito a restringere; dettaglio con «Questo è il tuo account», interruttori dei due ruoli e famiglie per solo nome e ruolo, senza il numero di agenti collegati del prototipo; conferma per nominare un amministratore e per rinunciare al proprio ruolo, ritorno al Profilo senza avviso a comparsa dopo la rinuncia (scostamenti dal sesto giro); «Apri l'utente» da `account_exists`; per un amministratore retrocesso altrove dati e comandi che spariscono alla prima risposta `forbidden`, poi «Non hai accesso a questa pagina» dopo la verifica del profilo o, se fallisce, l'errore con «Riprova» senza i dati precedenti; ruoli di chi ha già un account cambiati dall'app e via MCP, con la conferma affidata alle istruzioni dell'agente. Tecniche: funzioni `app.admin_users`, `app.admin_user`, `app.admin_user_families`, `app.set_user_role` (`security definer`, solo `app_admin`, letture di `auth.users` senza scritture); lucchetto consultivo `app_admin_roles` obbligatorio nella stessa transazione per ogni percorso che toglie `app_admin`, compresa la cancellazione di un account, con il ricontrollo sotto il lucchetto dell'autorizzazione di chi chiama per l'operazione richiesta (per `app.set_user_role` di nuovo `app_admin`; la cancellazione del proprio account resta consentita senza ruoli globali) e dell'ultimo amministratore, e assegnazioni senza lucchetto; transazioni degli utenti in `read committed`, verificato da un test; codici SQLSTATE `P0A07` e `P0A08`; area `users` del contratto e strumenti `users_list`, `users_get`, `users_setRole`; ruoli letti a ogni richiesta, validi subito anche per gli agenti collegati; bersaglio `users` nel registro delle mutazioni del web senza scrittura generica della risposta. Chiusa in sezione 15 la pagina dei ruoli globali. Esito: provata dall'utente sull'iPhone. Intestazione, Parte 1 e sezioni 1, 2, 7, 10, 13, 14 e 15 aggiornate |
| 16 ottobre 2026, gestione della famiglia | Riportate le decisioni della spec `2026-10-16-gestione-famiglia.md` (W11, attività C dell'ondata 3, PR #52 unita e rilasciata il 16 ottobre con la versione del Worker `c5f006a4-9404-423c-84c8-11f748ea1dd8`; collaudo e prove sull'iPhone riusciti il 16 ottobre 2026). Decisione dell'utente: un link d'invito alla famiglia crea l'account a chi non ce l'ha, al più 10 persone per link, con account e ingresso in un solo passaggio ed email non verificata fino all'attività D. Decisioni del coordinatore: tetto contato sulle persone registrate; link di chi esce, viene rimosso, retrocesso o cancellato revocati per tutti; registro degli ingressi; account rimasto senza famiglia se l'ingresso diventa impossibile; ripresa delle cancellazioni dal Cron Trigger orario. Inoltre: link visibile solo alla creazione; cancellazione dell'account e degli utenti in tre passi, con rimando MCP deciso nel database; ultimo amministratore della famiglia protetto dalla riga della famiglia e ordine unico dei lucchetti; famiglie sparite revocate sul dispositivo; scostamenti dal quarto e dal sesto giro in sezione 14. Chiuse in sezione 15 la regola degli inviti alla famiglia senza email e la voce Cancellazione. Intestazione, Parte 1 e sezioni 1, 2, 4, 7, 8, 10, 13, 14, 15 e 17 aggiornate |
| 16–17 ottobre 2026, foto delle ricette | Riportate le decisioni della spec `2026-10-16-foto-ricette.md` (W12, attività E dell'ondata 3, issue #39, PR #54 unita e rilasciata il 16 ottobre con la migrazione `20261016110000_recipe_photos.sql` e la versione del Worker `5dce4dda-67d7-4315-97f3-608631f45796`; bucket `cosasimangia-photos`). Decisioni dell'utente: foto gestita solo dalla scheda ricetta aperta e solo dai curatori («Aggiungi foto», pulsante «Foto» con «Sostituisci la foto» e «Togli la foto»), nessun comando nelle schede compatte; nessuna provenienza della foto; agente libero di prendere l'immagine da qualunque sito, di norma dalla fonte, con il sì esplicito del curatore. Tecniche: tabella `recipe_photos` con una foto corrente per ricetta, fuori dal documento e dalle versioni, trigger sul contatore del ricettario e lucchetto sulla ricetta; bucket R2 privato, chiavi casuali da 128 bit, rotta `/photos/<chiave>` senza autenticazione che serve solo le foto correnti, con `Cache-Control: private, no-store` e limitatore per IP; WebP da 1600 px prodotto una volta con il binding Images, ridimensionamento JPEG nel browser; `catalogue.uploadPhoto` solo web con il limite del corpo prima del parser, `setPhotoFromUrl` e `removePhoto` anche MCP con scaricamento controllato; `photoUrl` facoltativo nelle viste; risposte superate dei pasti dopo una modifica delle foto; cache delle foto solo nel service worker, cancellata all'uscita; esportazione con i soli riferimenti e oggetti mai cancellati in automatico. Foto popolate via MCP il 16 ottobre: 46 ricette con la foto, 4 ancora senza. Chiusa in sezione 15 la voce Foto delle ricette; aperta in Backup e ripristino la questione delle foto nel ripristino dell'intero catalogo. Intestazione, Parte 1 e sezioni 1, 2, 8, 10, 13, 14 e 15 aggiornate |
| 17 ottobre 2026, dominio | Decisione dell'utente: app ed email su `cosasimangia.app`, comprato su Cloudflare, al posto di `cosasimangia.qunidi.it`; `workers.dev` spento senza reindirizzamenti, `www` rimandato al dominio, mittente `noreply@cosasimangia.app`. Il controllo del rilascio richiede un dominio personalizzato del Worker con `workers_dev` spento. Sezioni 1 e 10 e intestazione aggiornate |
| 17 ottobre 2026, dominio completato e attività D | Rilascio del dominio il 17 ottobre alle 04:23 UTC (PR #56, versione del Worker `8d4763ec-b29d-4d09-941b-9411c22fa3f9`); DNS nella zona Cloudflare dell'account di POWA; dominio verificato in Resend (DKIM `resend._domainkey`, MX e SPF su `send.`, DMARC `p=none`); *Site URL* e *Redirect URLs* solo sul nuovo dominio; SMTP personalizzato di Supabase Auth su Resend (`smtp.resend.com:465`, chiave dedicata di solo invio limitata al dominio), mittente `Cosa si mangia <noreply@cosasimangia.app>`, prova con un magic link riuscita; PWA reinstallata sull'iPhone e agente MCP ricollegato a `https://cosasimangia.app/mcp`. L'attività D non è più bloccata: resta la parte software (link della password via email dopo un invito, «password dimenticata», email operative di job ed esportazione, fine del rischio delle email non verificate negli inviti). Ordine concordato con l'utente: correzione di #48 prima della generazione del 21 ottobre (insieme a #51), poi la parte software di D, poi E. Intestazione, Parte 1 e sezioni 1, 4, 7, 8, 10 e 15 aggiornate |
| 17 ottobre 2026, somiglianza e zoom | Riportate le decisioni del piano `2026-10-17-somiglianza-e-zoom.md` (W13, issue #48 e #51, PR #60). Decisione dell'utente: nuova caratteristica della somiglianza `primary_ingredient_line`, quando l'ingrediente principale di una ricetta è una riga non facoltativa dell'altra, con lo stesso peso e la stessa finestra delle altre; solo penalità, nessun vincolo sul giorno per ingredienti o proteine. Accettata la carne rossa oltre il massimo in 3 settimane su 20 nel report, senza cambiare la riparazione. Report del pianificatore con gli ingredienti dell'import; testo dei campi di almeno 16 px perché iOS non ingrandisca la pagina, zoom del viewport libero (sezioni 3, 9 e 14, `design/design.md`) |
| 17 ottobre 2026, email dell'app | Riportate le decisioni della spec `2026-10-17-email.md` (W15, parte software dell'attività D dell'ondata 3, PR #64 unita il 17 ottobre con la migrazione `20261017100000_email.sql`; rilasciata lo stesso giorno alle 17:54 UTC con la versione del Worker `21616921-3cfe-4390-b19c-9e42d824cebe` e collaudata dall'utente). Decisioni dell'utente: verifica dell'email negli inviti con un solo meccanismo per inviti all'app e alla famiglia (pagina con email e nome, account con l'email da confermare, email «Scegli la password» con il nome della famiglia solo nella prima, password scelta su `/password`, prenotazione e chiusura invariate), fine del rischio accettato; link d'invito all'app non spedito per email; account creati prima di D invariati; attesa con la persona subito visibile e l'etichetta «Non ha ancora confermato l'email», «Controlla la posta», «Rimanda l'email» ed «Email sbagliata? Ricomincia»; «password dimenticata» dalla pagina di accesso con risposta sempre uguale, link di 24 ore e «Accedi» dopo il salvataggio, senza ingresso automatico; email nella lingua della persona; quattro email operative, un'email per evento. Decisioni del coordinatore: prima email e reinvio spediti dal server con Resend e il link di `generate_link` di tipo `recovery`, template di Supabase solo per il recupero, nei metadati di Auth solo nome e `locale`; allarmi registrati fuori dalle transazioni del lavoro, riconciliazione oraria su 7 giorni di stati persistiti, consegna atomica con corpo immutabile, ogni `409` di idempotenza ambiguo tranne `concurrent_idempotent_requests`, transitorio e ritentato, e scadenza a 24 ore senza rispedizione; non enumerazione nella UI con il rischio residuo dell'endpoint pubblico di Supabase; correzione in avanti come ritorno indietro. Tecniche: segreti `RESEND_API_KEY` (obbligatorio, distinto dall'SMTP) e `OPS_ALERT_EMAIL`, `MAILPIT_API_URL` solo in locale e in CI; `mailer_otp_exp` 86400; `/password` con chiamate dirette e nessuna adozione della sessione; `accept` senza password con `passwordEmail`, `resendPasswordEmail` pubbliche, `emailUnconfirmed` nelle viste e ambito di versione `emailUnconfirmed`; tabelle `ops_alerts` e `password_emails`; un invio al minuto per persona dalla pagina dell'invito; Mailpit nella CI e prova obbligatoria con «Require current password» su un secondo servizio di Auth; nessuno strumento MCP nuovo. Chiusi in sezione 15 i dettagli tecnici del link per scegliere la password. Intestazione, Parte 1 e sezioni 1, 2, 4, 7, 8, 9, 10, 12, 13, 14 e 15 aggiornate |
| 18 ottobre 2026, skill per Claude e attività D rilasciata | Riportate le decisioni del piano `2026-10-18-skill-claude.md` (W17, PR #68 unita il 18 ottobre; rilascio nella riga sotto). Decisioni dell'utente: una sola skill `cosa-si-mangia` per tutti i ruoli, un solo `SKILL.md` in inglese che rimanda a `catalogue_getGuide` senza copiarne le regole, menu, famiglia, ricettario e amministrazione senza la spesa, conferme esplicite prima delle azioni irreversibili, zip con la cartella in cima da caricare su claude.ai, sezione visibile a tutti, niente prototipo. Tecniche: sorgente in `agent-skill/`, zip generato da `sync-assets` in `web/public/downloads/`, non versionato e servito come file statico anche a una navigazione, `/downloads/` fuori dalla cache del service worker, versione della pagina letta dalla skill, test che legano i nomi degli strumenti al contratto. Stato dell'attività D: rilasciata il 17 ottobre alle 17:54 UTC (versione del Worker `21616921-3cfe-4390-b19c-9e42d824cebe`, commit `4e1483e`) e collaudata dall'utente. Intestazione, Parte 1 e sezioni 1, 10, 13, 14 e 16 aggiornate per W17; per D anche 2, 4, 7, 8 e 15 |
| 18 ottobre 2026, skill per Claude rilasciata | Rilascio della skill per Claude (W17, PR #68) il 18 ottobre alle 09:22 UTC (versione del Worker `03721d89-5d69-4ed3-92fb-a2de8746f751`, commit `cdbd7fe`), senza migrazioni né segreti; zip verificato in produzione (`/downloads/cosa-si-mangia.zip`, 200 `application/zip`). Collaudata dall'utente lo stesso giorno: zip caricato su claude.ai e skill provata dall'app Claude, funziona. Intestazione, Parte 1 e sezioni 1, 10, 13, 14 e 16 aggiornate |
| 18 ottobre 2026, swipe fra le settimane | Riportate le decisioni del piano `2026-10-18-swipe-settimane.md` (W19, PR #72 unita il 18 ottobre, merge `160d83b`; rilascio in preparazione). Decisioni dell'utente: swipe orizzontale solo sulla fila dei giorni del Menu, verso sinistra la settimana successiva e verso destra la precedente, sullo stesso giorno della settimana; settimana inesistente con un piccolo rimbalzo e nessun messaggio; giorno di arrivo senza pasti aperto vuoto; calendario invariato come alternativa (sezione 5). Tecniche: eventi touch passivi, soglia di 48 px e prevalenza 2:1 sul verticale, un solo dito, clic sintetico dopo lo swipe ignorato; esistenza della settimana da `menu.getDates` dei mesi toccati o dalla copia salvata, con la navigazione del calendario anche offline; animazioni brevi con la Web Animations API, assenti con `prefers-reduced-motion`; nessuna libreria nuova (sezione 14) |
| 18 ottobre 2026, swipe rilasciato, trascinamento (W21) e skeleton (W20) | Swipe fra le settimane (W19) rilasciato alle 12:09 UTC (versione del Worker `3260a367-c445-490d-abd3-359614a19f61`, commit `160d83b`). Riportate le decisioni del piano `2026-10-18-swipe-trascinamento.md` (W21, PR #74, merge `341bdb1`, rilasciata alle 13:49 UTC, versione `c3a72b02-bf2f-4100-8628-b8ce61bcadd0`, commit `cbe5869`; collaudo sull'iPhone da fare). Decisioni dell'utente: la fila segue il dito e mostra i giorni della settimana accanto (solo date); cambio oltre un terzo della larghezza o con un colpo veloce; resistenza verso una settimana inesistente al posto del rimbalzo; arrivo senza salti. Tecniche: striscia di tre settimane con trasformazioni scritte nel DOM, `touchmove` non passivo con `preventDefault` solo a gesto orizzontale e `touch-action: pan-y pinch-zoom`, asse a 10 px, colpo veloce da 0,5 px/ms e 20 px, curva dei bordi di iOS, 220/200 ms con la Web Animations API, letture anticipate non osservate delle settimane accanto (`prefetchQuery`, `staleTime: Infinity`, decisione del coordinatore dopo la revisione della PR #74), scartato lo scorrimento nativo con snap. Riportate le decisioni della spec `2026-10-18-skeleton.md` (W20, issue #49, PR #75, merge `bb523a2`, rilascio in preparazione). Decisioni dell'utente: variante B con pulsazione lenta, eccezione approvata alla regola sulle animazioni decorative; pagine coperte e pagine rare invariate; in Cerca i risultati precedenti restano. Decisioni del coordinatore: skeleton anche in un ripristino locale oltre 200 ms; skeleton fermo offline; sezioni dei curatori senza skeleton, con lo spostamento ammesso. Tecniche: soglia di 200 ms, attesa della coda della Spesa, una sola attesa e un solo annuncio per pagina, layout di attesa condiviso con `FamilyGate`, componente `Skeleton.tsx` senza dipendenze nuove. Intestazione e sezioni 1, 5, 10 e 14 aggiornate; percorso 1 di `design/percorsi.md` |

### 17. Review avversariale del 3 ottobre 2026

**Perimetro:** revisore indipendente con contesto nuovo, senza la conversazione di
progettazione; lettura integrale della specifica alla revisione
`e47347200045f1a82ad5b296fad4b95ead45f6f9`, confronto con la base `0ff8a66`, AGENTS,
README e dati pertinenti del progetto di origine. Il revisore ha lavorato in sola
lettura. I rilievi sostanziali sono stati ricontrollati nel testo e negli esempi
dell'origine prima di essere registrati qui.

**Verdetto:** pronto per un **prototipo esplorativo**, non pronto per l'implementazione.
La review non ha dimostrato incompatibilità che impongano di cambiare stack o rinunciare
a MCP. Il prototipo può servire proprio a confrontare le alternative ancora aperte;
non deve presentare come definitivi comportamenti che non sono stati concordati.

**Ripresa concordata con l'utente:** al termine della review del 3 ottobre è confermato
che il prossimo passo sarà iniziare dal prototipo. I casi emersi dalla review guideranno
la sua progettazione e le decisioni ancora aperte, prima dei nuovi piani del prodotto.

I rilievi seguenti sono **aperti**. Le raccomandazioni sono proposte di revisione e non
sostituiscono i requisiti confermati finché non viene concordata e integrata la soluzione.

**R1 — Impatto alto: versioni delle ricette e significato del ripristino.**
Sezioni 2, 5 e 8. Uno slot che conserva solo l'identità della ricetta potrebbe mostrare
ingredienti e dosi nuovi dopo una modifica del curatore, anche quando la famiglia ha
già fatto la spesa. Inoltre un backup precedente alla creazione di una ricetta non può
sostituire semplicemente il catalogo se menu e voti ormai la referenziano. Ripristinare
traduzioni o dati di ingredienti condivisi potrebbe cambiare altre ricette, mentre il
recupero singolo promette di non farlo. È una decisione di prodotto ancora aperta,
non un'impossibilità tecnica dimostrata. Occorre scegliere la versione usata dai pasti,
il destino delle ricette successive al backup e l'ambito delle dipendenze ripristinate.
**Quando:** rappresentare i casi in P0, chiudere la semantica prima dello schema M1.
**Decisione del 7 ottobre 2026 (quinto giro del prototipo), per la singola ricetta:** i
pasti passati usano la versione in vigore quando sono diventati passati, oggi e i pasti
futuri la corrente (sezione 5); il ripristino di una ricetta riporta solo i suoi campi e
le sue righe, non le entità condivise, e si rifiuta se non supera i controlli di oggi
(sezione 8). **Decisione del 7 ottobre 2026 (sesto giro), per l'intero catalogo:** le
ricette del backup sono ripubblicate come nuova versione e quelle successive al backup
archiviate, con i pasti che restano leggibili; le entità condivise (ingredienti)
tornano come nel backup, quelle nate dopo restano; anteprima e copia «Prima del
ripristino» (sezione 8).

**R2 — Impatto alto sul controllo degli accessi: rientro dopo rimozione.**
Sezione 7. Gli inviti familiari sono riutilizzabili per sette giorni: secondo il flusso
descritto, un membro rimosso potrebbe riaprire un invito ancora valido e rientrare.
L'esistenza di questo percorso deriva dalle regole scritte; l'aspettativa che la
rimozione debba impedirlo è un'inferenza da confermare con l'utente. Va deciso se la
rimozione richieda una nuova autorizzazione esplicita per tornare, anche in presenza di
più inviti validi. **Quando:** scenario in P0 e regola chiusa prima di M1.
**Decisione del 6 ottobre 2026 (quarto giro del prototipo):** la rimozione si registra
e nessun link creato prima di essa fa rientrare quella persona; serve un link nuovo.
Regola in sezione 7, tabella `family_removals` in sezione 2.

**R3 — Impatto medio: generazione su richiesta e chiusura delle settimane.**
Sezioni 2, 4 e 5. Il worker chiude la settimana precedente e la generazione su richiesta
usa la stessa funzione: eseguire letteralmente questo flusso il lunedì può anticipare
la chiusura rispetto al mercoledì previsto. Se tutte le esecuzioni di un mercoledì
falliscono, manca inoltre una regola per chiudere le settimane scadute più vecchie e
per rappresentarne lo stato. Raccomandazione: distinguere generazione richiesta e
chiusura di tutte le settimane effettivamente scadute, con condizioni proprie. Sono
da precisare anche il target della prima generazione e l'istante in cui un pasto passa.
**Quando:** comportamento visibile in P0; orchestrazione e recupero prima di M3.
**Aggiornamento del 6 ottobre 2026:** le chiusure delle settimane sono state eliminate
(sezione 2) e l'istante del pasto passato è deciso (sezione 5); resta aperta solo la
parte su generazione su richiesta e prima generazione. **Aggiornamento dell'11 ottobre
2026:** la prima generazione segue la regola unica di generazione all'apertura (sezione
4); resta da definire la generazione su richiesta con il wizard (ondata 3).

**R4 — Impatto medio: mappature dell'import che i dati reali richiedono.**
Sezioni 3, 8 e 11. Nell'origine `pasta-tonno` e `lenticchie-comidista` risultano
`collaudata: true` senza apparizioni in `storico`; esistono inoltre ricette `casa` con
URL, mentre il nuovo tipo `home` indica assenza di fonte esterna. Conservare soltanto
voti, storico ed esclusioni perderebbe la familiarità iniziale; copiare il tipo senza
analizzarne la provenienza potrebbe perdere collegamenti. Il report delle ambiguità
deve coprire questi casi, senza inventare pasti passati o cambiare la fonte degli
ingredienti. Non è un errore di un import già implementato: è un requisito da precisare
nel contratto di import. **Quando:** prima dell'importazione M1; non blocca P0.

**R5 — Impatto basso, solo per il giudice opzionale: pasti liberi deducibili.**
Sezione 3. Trasmettere giorno e tipo di pasto di ogni ricetta permette di dedurre gli
slot liberi mancanti in una settimana completa, mentre il testo promette di non inviare
quali pasti sono liberi. Va chiarito se il divieto riguardi il testo libero oppure
anche la posizione degli slot; nel secondo caso occorre adeguare il payload.
**Quando:** prima dell'esperimento del giudice in M3; non blocca P0 o M1.

**Verifiche tecniche da portare nei piani, senza nuove decisioni implicite:**

- La revoca degli accessi richiesta dalla sezione 7 deve coprire anche token già
  emessi, letture del catalogo e sessioni MCP (8 ottobre 2026: le operazioni verificano
  a ogni richiesta utente e autorizzazione, sezione 1). La documentazione Supabase consultata
  dal revisore tramite Context7 precisa che eliminare un utente non invalida subito
  tutti i suoi JWT: la cancellazione dell'account non basta da sola a realizzare il
  requisito. [Gestione utenti Supabase](https://supabase.com/docs/guides/auth/managing-user-data).
  Per gli agenti la verifica è fatta (PR #31): scollegare cancella le sessioni del
  client e i suoi token non scaduti sono rifiutati subito su MCP, RPC e REST, provato in
  CI (sezione 13). Restava la revoca alla cancellazione di un account (ondata 3), per
  cui vale che i token degli agenti seguono le sessioni: realizzata con l'attività C
  (PR #52, unita e rilasciata il 16 ottobre 2026), con la cascata della
  cancellazione definitiva in Supabase Auth e il profilo cancellato nella prima
  transazione (sezione 1).
- Un token d'agente ha su Supabase Auth gli stessi poteri di quello dell'utente
  (cambiare la password, revocare altri agenti, chiudere le sessioni): rischio aperto
  accettato e documentato dall'11 ottobre 2026, da limitare in seguito (sezioni 13 e
  15).
- Il recupero applicativo del catalogo deve essere distinto dal ripristino dell'intero
  database, per rispettare l'indipendenza dei dati familiari richiesta in R1 (8 ottobre
  2026: il primo si ricava dallo storico, il secondo dall'esportazione notturna del
  database, perché il piano gratuito di Supabase non ha backup della piattaforma).
  [Backup Supabase](https://supabase.com/docs/guides/platform/backups).
- Prima di M3 serve una classificazione unica di vincoli rigidi, obiettivi e deroghe:
  `weekly_max`, massimi degli intervalli e venerdì pesce devono avere esiti verificabili
  quando non soddisfacibili. I limiti di runtime dichiarati non sostituiscono la misura
  del carico reale del pianificatore.
- Restano da verificare effettivamente i quattro client MCP (Claude Code e Codex CLI
  verificati l'11 ottobre 2026), il contesto web richiesto per eliminare famiglie (la
  risposta `web_only` è provata in CI su MCP, RPC e REST con un'operazione di test), le
  esportazioni e i ritentativi. Il prototipo simulato non
  dimostra questi comportamenti tecnici.

**Aspetti risultati coerenti:** fonte unica dei requisiti; database autorevole;
separazione fra bozze e pubblicato; nuova validazione al momento della pubblicazione;
ruoli globali distinti da quelli familiari; eccezione MCP estesa alle cancellazioni
indirette; conversioni senza arrotondamenti cumulativi né equivalenze massa/volume
inventate; implementazione manuale differita deliberatamente a M6.

**Limiti della review:** nessuna implementazione o integrazione reale eseguita; nessuna
certificazione della compatibilità MCP o del deploy. Non sono stati rivalidati criteri
nutrizionali o prezzi dei fornitori AI. Le decisioni già elencate come aperte nella
sezione 15 non sono state automaticamente classificate come difetti.

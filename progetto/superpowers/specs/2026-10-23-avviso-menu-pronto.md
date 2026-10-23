# Avviso «menu della settimana prossima pronto» (W24)

Spec di dettaglio dell'attività W24 (brief `progetto/coordinamento/brief/w24-avviso-menu-pronto.md`).
Estende la specifica principale (`2026-09-29-app-famiglia-design.md`); dove questa dice «Non manda
notifiche sui menu» la supera, su richiesta dell'utente del 23 ottobre 2026.

## 1. Perché

Il mercoledì sera il job prepara il menu della settimana dopo, ma nessuno lo sa finché non apre l'app e
va a cercarlo. L'utente vuole che la famiglia lo sappia in due modi: un'email con il menu proposto e un
avviso leggero nell'app, che si vede appena si apre il Menu e sparisce quando la persona ha guardato la
settimana nuova. Così la famiglia rivede il menu nei giorni giusti, prima della spesa.

**Obiettivi:** email una volta sola per persona, famiglia e settimana; avviso discreto, per persona,
che non ruba spazio; opzione per non ricevere più le email.

**Non obiettivi:** notifiche push; email per altre modifiche al menu; avviso per l'agente MCP; email
aggiornata se il menu cambia dopo l'invio.

**Da evitare (anti-obiettivi):** un'email doppia per un nuovo tentativo del job; un'email arrivata a
chi l'ha spenta; un avviso che resta dopo che la persona ha visto la settimana; le email del menu che
consumano la quota giornaliera di Resend e fanno saltare un'email «Scegli la password» o un allarme
operativo.

## 2. Decisioni dell'utente (brainstorming e anteprima del 23 ottobre 2026)

1. L'avviso in app si deve vedere quando si apre l'app, ma è **discreto**: un **pallino verde
   sull'icona del calendario** nella barra del Menu, non una scheda che ruba spazio.
2. Aprendo il mese, i **giorni della settimana nuova hanno il numero in verde** (colore d'accento) **su
   un fondo verde chiaro** (lo stesso dello stato attivo della navbar, scelta dell'utente del 23 ottobre
   2026 dopo la revisione) finché la settimana non è stata vista; niente puntini sotto i giorni. Il
   giorno scelto resta scuro con testo bianco, anche se è della settimana nuova.
3. **Quando sparisce:** la prima volta che la persona vede nel Menu un giorno qualsiasi della settimana
   nuova (calendario, fila dei giorni, swipe, link). Vale **per persona**, su tutti i suoi dispositivi
   (stato sul server). Se la settimana non viene mai guardata, sparisce il lunedì in cui comincia.
4. **Email** a tutti i membri della famiglia, ognuno nella sua lingua; **attiva all'inizio**, anche per
   chi entra dopo; si spegne dalle **Preferenze** con un'opzione **per persona** (una sola per tutte le
   sue famiglie). In fondo all'email un link «Non ricevere più queste email» che apre le Preferenze
   dell'app (con l'accesso, se serve); niente disiscrizione con un clic senza accesso.
5. **Contenuto dell'email:** oggetto con la settimana («Il menu della settimana 26 ottobre – 1 novembre
   è pronto»), con il nome della famiglia se la persona ne ha più di una; una riga per pasto con
   miniatura quadrata della foto, etichetta Pranzo/Cena e nome del piatto (forma B «righe compatte»
   scelta sull'anteprima); pasti liberi con il loro testo e i loro colori; pulsante «Apri il menu» che
   porta al lunedì di quella settimana; una riga che dice che il menu si può ancora cambiare. È una
   **fotografia**: non si aggiorna se il menu cambia. Una colonna sola, larga fino a 600 px, uguale su
   telefono e computer.
6. **Una sola email** per persona, famiglia e settimana, anche se il job riprova. Chi sta in due
   famiglie riceve un'email per ciascuna.
7. **Casi particolari:**
   - la settimana preparata dalla generazione pigra (job in ritardo o fallito): email e pallino come se
     l'avesse fatta il job;
   - famiglia appena creata che trova già pronta la settimana dopo (creata dopo il mercoledì alle 20:00
     che la precede): né email né pallino per quella settimana; dal mercoledì seguente tutto normale;
   - chi entra in famiglia a settimana nuova già annunciata: niente email arretrata, il pallino sì.
8. Limiti accettati delle foto: Outlook classico per Windows potrebbe non mostrarle; una foto sostituita
   o tolta da un curatore smette di essere servita alle email vecchie, ma le copie già scaricate o messe
   in cache dai programmi di posta possono restare visibili fino a un giorno, o più a lungo nei
   programmi che le conservano (decisione del coordinatore del 23 ottobre 2026; sezione 5.4).

## 3. Regola unica: la settimana da annunciare

Per una famiglia, a un istante dato, con `local` = data e ora nel fuso della famiglia
(`families.time_zone`), la **settimana da annunciare** è `W = nextWeekStart(local)` (il lunedì dopo la
settimana di `local`, funzioni di `@app/domain/planner`) se valgono tutte:

- `isNextWeekDue(local)`: è passato il mercoledì alle 20:00 della settimana di `local`;
- la settimana (`family_id`, `W`) esiste in `app.weeks`;
- la famiglia esisteva già al momento del job: `families.created_at` precede il mercoledì alle 20:00,
  nel fuso della famiglia, che precede `W` (cioè `W − 5 giorni` alle 20:00 locali).

Dal lunedì `W` in poi `nextWeekStart(local)` è un'altra settimana: l'avviso scade da solo, senza job.
La regola vale uguale per il pallino e per l'email; il codice la scrive una volta sola (funzione SQL,
sezione 4) e la usano sia la lettura del pallino sia l'annuncio delle email. Il pallino non dipende
dall'email: compare anche se l'invio non è configurato o fallisce.

## 4. Modello dei dati (migrazione `20261023100000_menu_ready_notice.sql`)

Solo aggiunte. Nessuna PR aperta tocca le migrazioni al 23 ottobre (W22 e W23 non ne hanno); il
worker ricontrolla la versione prima della PR.

### 4.1 Preferenza

`app.profile_preferences.menu_emails boolean not null default true`. La riga può mancare: si legge
`coalesce(pp.menu_emails, true)`. `grant update (menu_emails, updated_at)` ad `authenticated`; la
policy esistente `profile_preferences_own` copre già la riga propria. L'inserimento usa
`insert … on conflict (user_id) do update set menu_emails = excluded.menu_emails, updated_at = now()`
come `setCurrentFamily`.

### 4.2 Settimane viste

```sql
create table app.menu_week_views (
	family_id uuid not null,
	user_id uuid not null,
	week_start date not null,
	seen_at timestamptz not null default now(),
	primary key (family_id, user_id, week_start),
	foreign key (family_id, user_id) references app.family_members (family_id, user_id) on delete cascade
);
```

RLS: `select` e `insert` ad `authenticated` con policy `user_id = auth.uid() and app.is_member(family_id)`.
Nessun aggiornamento né cancellazione dall'app. Uscire dalla famiglia, essere rimossi, eliminare la
famiglia o l'account cancellano le righe (cascata). Nessuna pulizia periodica: una riga per persona e
settimana. `grant select` ad `app_backup`.

### 4.3 Annunci ed email

```sql
-- One row per family and announced week: the recipients are chosen once, at the announcement.
create table app.menu_announcements (
	family_id uuid not null references app.families (id) on delete cascade,
	week_start date not null,
	created_at timestamptz not null default now(),
	primary key (family_id, week_start)
);

-- One email per family, week and person; subject and bodies fixed at the announcement (snapshot).
create table app.menu_emails (
	family_id uuid not null,
	week_start date not null,
	user_id uuid not null references app.profiles (user_id) on delete cascade,
	subject text not null,
	html text not null,
	text text not null,
	created_at timestamptz not null default now(),
	first_attempt_at timestamptz,
	claimed_at timestamptz,
	sent_at timestamptz,
	closed_at timestamptz,
	closed_reason text check (closed_reason in ('expired', 'ambiguous', 'skipped')),
	attempts int not null default 0,
	primary key (family_id, week_start, user_id),
	foreign key (family_id, week_start) references app.menu_announcements (family_id, week_start) on delete cascade
);
```

RLS attiva su entrambe, policy `for all to app_job using (true) with check (true)` e
`grant select, insert, update, delete` ad `app_job`, come `ops_alerts`; la lettura di `app_backup` viene
dai privilegi predefiniti di `20261012110000_backup.sql`.

Nessun privilegio ad `authenticated`. Gli indirizzi email **non** si salvano: si leggono al momento
dell'invio (4.4). Pulizia: il giro di consegna cancella le righe di `menu_announcements` (e con loro le
email) più vecchie di 90 giorni, come `ops_alerts`.

**Primo rilascio** (scelta del worker, confermata dal coordinatore il 23 ottobre 2026): la migrazione
inserisce in `menu_announcements` una riga per **ogni settimana già esistente**, passate comprese,
senza email; le righe vecchie le toglie la pulizia dei 90 giorni. Così un rilascio fatto fra giovedì e
domenica non manda l'email di un menu preparato giorni prima, in qualunque fuso sia la famiglia (un
filtro sulla data del database sbaglierebbe a cavallo della mezzanotte UTC). Il pallino per quella
settimana compare comunque, anche a chi l'aveva già guardata (prima nessuno registrava le visite), e
sparisce alla prima visita: accettato. Meglio comunque rilasciare prima di un mercoledì sera
(sezione 11).

### 4.3 bis Budget giornaliero delle email

```sql
-- Menu emails reserved per UTC day: the cap of section 5.5, shared by concurrent deliveries.
create table app.menu_email_budget (
	day date primary key,
	reserved int not null check (reserved >= 0)
);
```

RLS attiva, policy `for all to app_job`, `grant select, insert, update, delete` ad `app_job`. La
pulizia dei 90 giorni toglie anche i giorni vecchi.

### 4.4 Funzioni (`security definer`, `set search_path = ''`)

- `app.menu_week_to_announce(p_family_id uuid, p_now timestamptz) returns date`: la regola della
  sezione 3, `null` se non c'è settimana da annunciare. `stable`, **senza** controllo dei membri
  (`app_job` non ha `auth.uid()`): eseguibile solo da `app_job`; per i membri passa da
  `new_menu_week`, che il controllo lo fa.
  Il calcolo di «mercoledì alle 20:00» e di `nextWeekStart` deve dare gli stessi risultati delle
  funzioni di `@app/domain/planner`: un test li confronta su date di confine (ora legale compresa).
- `app.new_menu_week(p_family_id uuid, p_now timestamptz) returns date`: per il pallino, con
  `auth.uid()`: la settimana di `menu_week_to_announce(p_family_id, p_now)` se la persona non ha la riga
  in `menu_week_views`, altrimenti `null`. Solo `authenticated`, solo per i membri (altrimenti `42501`,
  come `family_email_unconfirmed`). L'istante è quello della richiesta
  (`context.now` della pipeline), come nelle altre letture del menu: i test lo fissano.
- `app.menu_email_recipients(p_family_id uuid) returns table (user_id uuid, locale text, family_count int)`:
  i membri con `coalesce(menu_emails, true)` e email confermata (`auth.users.email_confirmed_at is not
  null`); `family_count` = famiglie di cui la persona è membro (per l'oggetto). Solo `app_job`.
- `app.menu_email_address(p_family_id uuid, p_user_id uuid) returns text`: l'indirizzo, solo se la
  persona è ancora membro, ha ancora l'opzione attiva e l'email confermata; altrimenti `null`. Solo
  `app_job`. È il controllo finale prima di ogni invio: chi spegne l'opzione dopo l'annuncio non riceve
  l'email.
- `app.menu_email_week(p_family_id uuid, p_week_start date)`: i pasti della settimana per l'email,
  `returns table (date date, meal_type text, recipe_name jsonb, free_text text, photo_key text)`, con
  il nome della ricetta (`{it-IT, en-GB}`) nella versione che il pasto mostra secondo la regola R1 di
  `server/src/menu/versions.ts`: i pasti della settimana nuova sono tutti futuri, quindi la versione
  pubblicata corrente; per una ricetta mai pubblicata, il nome che la vista del menu mostra in quel caso
  (sezione 12 della specifica principale: nell'altra lingua se manca). `photo_key` è la `storage_key`
  della foto corrente (`app.recipe_photos`, `removed_at is null`), se c'è. Solo `app_job`.

`supabase/tests/coverage_test.sql` va aggiornato con le nuove funzioni e i loro destinatari; un file
pgTAP nuovo `menu_ready_notice_test.sql` copre RLS, la regola della sezione 3 e le funzioni.

## 5. Server

### 5.1 Contratto oRPC e MCP

- `profile.get` / `profile.update`: `profileViewSchema.user.menuEmails: boolean`; `profile.update`
  accetta `menuEmails?: boolean` (il `refine` «non vuoto» lo include). Esposto anche via MCP, come il
  resto del profilo: un agente può accendere o spegnere le email per la persona. Descrizione dello
  strumento aggiornata.
- `menu.getNewWeek` (nuova, `GET /families/{familyId}/menu/new-week`): `role: 'familyMember'`,
  `mcp: false`, `offline: false`, **non versionata** (dipende dalla persona, non dai contatori della
  famiglia). Output `{ weekStartsOn: monday | null }`. Prima esegue `ensureWeeks` come le altre
  letture del menu (generazione pigra, sezione 4 della specifica principale), poi chiama
  `app.new_menu_week`: così non risponde `null` per una settimana che la stessa lettura avrebbe
  generato. Il lucchetto per famiglia di `ensureWeeks` serializza questa lettura con le letture del
  menu in parallelo: chi arriva dopo trova la settimana già creata.
- `menu.markWeekSeen` (nuova, `PUT /families/{familyId}/menu/weeks/{weekStartsOn}/seen`):
  `role: 'familyMember'`, `mcp: false`, `offline: false`. Inserisce la riga in `menu_week_views` con
  `on conflict do nothing`; idempotente; non tocca `data_version` della famiglia. Accetta solo la
  settimana che `app.new_menu_week` restituisce o una già vista: per una qualsiasi altra risponde senza
  scrivere (così il client non riempie la tabella di settimane a caso). Output `{ ok: true }`.
- Il test del contratto del menu oggi pretende che ogni operazione del menu sia una lettura versionata
  esposta a MCP: va ristretto alle tre letture esistenti.

Perché niente MCP sulle due operazioni nuove (confermato dal coordinatore il 23 ottobre 2026, eccezione
alla parità della sezione 13): l'avviso è uno stato di visualizzazione personale nell'app;
un agente che legge il menu non lo spegne e non ne ha bisogno (decisione del worker, coerente con la
decisione 3).

### 5.2 Annuncio (giro orario)

Nuovo modulo `server/src/menu-emails/`. In `dispatchScheduled`, ramo `HOURLY_CRON`, dopo il job
settimanale e la ripresa delle cancellazioni, un passo nuovo in un `try` proprio, con una connessione
`postgres` propria come `runAlertSteps` (non dentro `runWeeklyJob`): un suo errore scrive un log e non fa fallire l'esecuzione né le altre famiglie.

1. **Annuncio**, una famiglia alla volta, ognuna nel suo `try`. Per ogni famiglia con
   `menu_week_to_announce(f, now)` non nullo e senza riga in `menu_announcements` (lettura breve):
   prima le **miniature** (punto 2), **fuori** da ogni transazione, perché leggono e scrivono R2 e
   chiamano Images; poi, in **una** transazione `job` propria, fuori da quella della generazione:
   - inserisce la riga di `menu_announcements` (`on conflict do nothing`; se non inserisce, ha già
     annunciato un'altra esecuzione e si passa oltre);
   - legge i destinatari (`menu_email_recipients`) e i pasti (`menu_email_week`);
   - per ogni destinatario compone oggetto, HTML e testo nella sua lingua (5.3) e inserisce la riga di
     `menu_emails`.
   La generazione pigra non chiama nulla: la settimana che crea viene annunciata al giro orario
   successivo (al più un'ora dopo). Il job crea la settimana nello stesso giro, prima dell'annuncio.
2. **Miniature** (5.4) per le foto della settimana, prima della transazione dell'annuncio; sono
   idempotenti (esiste già l'oggetto → niente), quindi due esecuzioni concorrenti al più rifanno lo
   stesso lavoro, e solo una inserisce l'annuncio. Un errore toglie solo la miniatura da quella foto
   (riquadro vuoto al suo posto) e scrive un log.
3. **Consegna** (5.5).

Senza `RESEND_API_KEY` né `MAILPIT_API_URL` l'annuncio si fa lo stesso (le righe scadranno, sezione
5.5) e la consegna scrive `menu_email_not_configured` una volta per esecuzione. Senza `APP_ORIGIN`
(5.3) non si annuncia nulla e si scrive un log di errore: un'email senza link valido non deve partire.

### 5.3 Contenuto dell'email

Funzione pura `menuEmail(input) → { subject, html, text }` in `server/src/menu-emails/content.ts`, sul
modello di `passwordEmail` e dell'anteprima approvata `prototype/static/w24-email/it.html`: tabelle,
stili in linea, una colonna larga fino a 600 px, colori di `design/design.md`, font di sistema; ogni
valore che viene dal database (nomi delle ricette, testi dei pasti liberi, nome della famiglia) è
**escaped** nell'HTML. Testi in italiano e inglese britannico nello stesso file (come
`password-email.ts`), date con `Intl.DateTimeFormat` nella lingua della persona.

- **Oggetto:** «Il menu della settimana {intervallo} è pronto» / «The menu for {range} is ready»; con
  `family_count > 1`: «… è pronto · {famiglia}» / «… is ready · {family}».
- **Intestazione:** «Cosa si mangia?» verde maiuscolo; titolo «Il menu della settimana prossima è
  pronto»; sotto, nome della famiglia e intervallo; pulsante «Apri il menu»; la riga «Il menu si può
  ancora cambiare nell'app: qui lo vedi com'era quando è stato preparato».
- **Giorni:** titolo del giorno («Lunedì 26 ottobre», solo la prima lettera maiuscola); per pranzo e
  cena una riga: miniatura 72×72 a sinistra (o un riquadro verde chiaro senza foto), etichetta
  «PRANZO»/«CENA» verde maiuscola, nome del piatto. Pasto libero: fondo e bordo dei pasti liberi,
  etichetta «Cena · Pasto libero», testo del pasto. Pasti vuoti (`kind: 'empty'`) e giorni senza pasti
  non compaiono.
- **Fondo:** pulsante «Apri il menu» ripetuto; «Ricevi questa email perché fai parte della famiglia
  {nome} su Cosa si mangia.» e il link «Non ricevere più queste email» a `{APP_ORIGIN}/profile/preferences`.
- **Testo semplice:** stesse informazioni, una riga per pasto («Lunedì 26 ottobre – Pranzo: …»), link
  completi.
- **Link «Apri il menu»:** `{APP_ORIGIN}/menu?day={W}&family={familyId}`. Il web accetta il nuovo
  parametro `family` (5.7).
- `APP_ORIGIN`: nuova variabile (non segreta) in `wrangler.jsonc`, `https://cosasimangia.app`; nello
  stack locale e nei test l'origine locale. Il cron non ha una richiesta da cui ricavare l'origine.

### 5.4 Miniature per le email

Le foto delle ricette sono WebP fino a 1600 px, servite con `cross-origin-resource-policy: same-origin`
e senza cache: troppo pesanti per un'email (fino a 14 per email) e bloccate da alcuni client web. Per
le email:

- all'annuncio, per ogni foto della settimana (`storage_key` `photos/{id}.webp`), se manca l'oggetto R2
  `email/{id}.jpg` nel bucket `PHOTOS`: legge l'originale, lo trasforma con il binding `IMAGES`
  (`transform({ width: 144, height: 144, fit: 'cover' })`, `output({ format: 'image/jpeg', quality: 80 })`)
  e lo salva. Una trasformazione per foto, una volta sola (piano gratuito di Images: 5.000
  trasformazioni uniche al mese, oggi meno di 60 foto). JPEG perché lo leggono tutti i client;
- nuova rotta pubblica `GET /photos/email/{id}.jpg` (`id` di 22 caratteri, stessa forma di `PHOTO_KEY`)
  smistata in `server/src/app.ts` accanto a `/photos/*` (già in `run_worker_first`), con un ramo
  proprio: `servePhoto` accetta solo `PHOTO_KEY`. Serve la miniatura solo se
  `app.served_photo('photos/{id}.webp')` trova ancora la foto corrente
  (una foto tolta non viene più servita), con `content-type: image/jpeg`,
  `cache-control: public, max-age=86400`, `cross-origin-resource-policy: cross-origin`,
  `x-content-type-options: nosniff`; stesso limitatore per IP `PHOTO_READ_LIMIT` (300 al minuto);
- l'email usa `{APP_ORIGIN}/photos/email/{id}.jpg` con `width="72" height="72"` e `alt=""` (il nome
  del piatto è già nel testo accanto).

Senza `PHOTOS` o `IMAGES` le email partono senza miniature.

**Limite dichiarato** (decisione del coordinatore del 23 ottobre 2026): la cache pubblica di un giorno è
un'**eccezione** alla decisione del W12 «`/photos/*` senza cache HTTP» (le foto dell'app restano senza
cache). Il controllo di `served_photo` vale solo per le richieste che arrivano al Worker: le copie già
scaricate dai programmi di posta o dai loro proxy (per esempio quello di Gmail) possono restare
visibili anche dopo che la foto è stata tolta. Non c'è garanzia di scomparsa per le email già lette.

### 5.5 Consegna

Stesso schema degli allarmi operativi (`ops-alerts/index.ts`), in `server/src/menu-emails/deliver.ts`:

**Principio** (confermato dal coordinatore il 23 ottobre 2026): **meglio nessuna email che un
doppione**. Una consegna ambigua o scaduta può lasciare una persona senza email; l'avviso in app resta.

**Orologio unico:** la consegna riceve un orologio (`clock: () => Date`, predefinito `() => new Date()`)
e lo legge **a ogni fase** (scadenze, candidate, prenotazione e acquisizione, controllo finale). Ogni
predicato temporale delle sue query usa quell'istante come parametro (`${at}::timestamptz`), **mai**
`now()` di Postgres; anche `claimed_at`, `first_attempt_at` e `sent_at` si scrivono con quell'istante.
Così l'ora del Worker e quella delle query coincidono e i test la controllano tutta (sezione 8). Nel
seguito «adesso» è il valore dell'orologio letto in quella fase.

- **Finestra di invio di una riga** («valida» a un istante `t`): `sent_at is null and closed_at is null`,
  `t` precede di almeno **1 minuto** la mezzanotte locale del lunedì `week_start` (con
  `families.time_zone`), e `first_attempt_at is null or first_attempt_at > t - interval '23 hours'`.
  Le 23 ore lasciano un'ora di margine sulle 24 in cui Resend conserva la chiave di idempotenza; il
  minuto copre il timeout di 10 secondi del trasporto.
- **Candidate:** righe valide con acquisizione libera o più vecchia di 15 minuti, in ordine di
  `created_at`.
- **Scadenza:** prima del giro si chiudono come `expired` (log `menu_email_expired`, livello `warn`) le
  righe aperte non più valide. La stessa condizione di validità sta **anche** nell'`update` di
  acquisizione di ogni riga, come negli allarmi: una riga che diventa non valida mentre il giro elabora
  le precedenti non si acquisisce (e la chiude il giro successivo).
- **Acquisizione e budget, in un'unica transazione `job` breve** per riga:
  1. prenotazione del budget del giorno UTC di «adesso» (`d`), salvo che «adesso» sia nell'ultimo
     minuto del giorno UTC: in quel caso il giro si ferma senza prenotare (riprende all'ora dopo):
     `insert into app.menu_email_budget (day, reserved) values (d, 1) on conflict (day) do update set reserved = menu_email_budget.reserved + 1 where menu_email_budget.reserved < 60 returning reserved`;
     nessuna riga restituita → budget esaurito: la transazione si annulla e il giro **si ferma** (le
     altre righe aspettano il giorno UTC dopo, entro la loro finestra);
  2. acquisizione atomica della riga, solo se ancora valida a «adesso» (`claimed_at = adesso`,
     `attempts + 1`, `first_attempt_at = coalesce(first_attempt_at, adesso)`), `returning` anche
     `first_attempt_at` e il fuso della famiglia; nessuna riga → la transazione si annulla (la
     prenotazione con lei) e si passa alla successiva. La transazione restituisce anche `d`, il giorno
     della prenotazione.
  Il conflitto sulla chiave primaria di `menu_email_budget` serializza le consegne concorrenti: con 59
  prenotazioni due giri insieme ne ottengono una sola.
- **Ogni tentativo consuma una prenotazione, qualunque esito**: anche un successo con la risposta
  persa, un errore di rete, un `5xx`, un `409` o un `429`, perché Resend potrebbe averlo contato. Una
  riprova dopo la mezzanotte UTC prenota dal giorno nuovo. Una riprova della stessa riga entro la
  finestra usa la stessa chiave di idempotenza e lo stesso oggetto e corpo salvati: Resend non
  spedisce una seconda volta.
- **Controllo dell'indirizzo:** dopo l'acquisizione, `menu_email_address`: se `null`, la riga si chiude
  come `skipped` (persona uscita, opzione spenta o email non confermata) senza inviare; la prenotazione
  di quel giro resta consumata (prudenza, costo trascurabile).
- **Controllo finale, subito prima di `sendEmail`**, con l'orologio letto in quel momento (`t`), in
  codice e senza query:
  - la riga è ancora valida a `t` (23 ore da `first_attempt_at` e lunedì locale con il minuto di
    margine, calcolato con il fuso restituito dall'acquisizione); se no, non chiama Resend e chiude la
    riga come `expired`;
  - `t` è ancora nel giorno UTC `d` della prenotazione e non nel suo ultimo minuto; se no, **non usa**
    la prenotazione di `d`: non chiama Resend, libera l'acquisizione (`claimed_at = null`, in una
    transazione propria) e la riga riprova a un giro successivo con una prenotazione nuova sul suo
    giorno. La prenotazione di `d` resta consumata (prudenza).
  Il controllo dell'indirizzo sta fra acquisizione e controllo finale: è il tratto in cui il tempo può
  passare un confine.
- **Invio** con `sendEmail` (`mail/transport.ts`), corpo e oggetto salvati, chiave di idempotenza
  `menu-email/{familyId}/{weekStart}/{userId}`. Esiti: successo → `sent_at`; `409` di idempotenza
  diverso da `concurrent_idempotent_requests` → chiusa come `ambiguous` (log di errore, nessun nuovo
  invio, come gli allarmi); `429` → si libera l'acquisizione e il giro **si ferma** (quota o velocità:
  le altre righe riprovano all'ora dopo); altri errori, risposta persa compresa → si libera
  l'acquisizione, la riga riprova entro la finestra. Se fallisce il salvataggio di `sent_at` dopo un
  successo, la riga resta acquisita: dopo 15 minuti un giro la riprende e la rispedisce con la stessa
  chiave (Resend risponde senza un secondo invio), consumando un'altra prenotazione.
- **Quota giornaliera:** il piano gratuito di Resend dà 100 email al giorno (giorno UTC) e 3.000 al
  mese, condivise con le email «Scegli la password» e gli allarmi. Il budget di **60 prenotazioni per
  giorno UTC** lascia almeno 40 email alle altre. Con l'uso attuale (una famiglia, pochi membri) il
  limite non si raggiunge; il numero sta in una costante con il commento sul perché.
- **Velocità:** Resend accetta 10 richieste al secondo per team; il giro spedisce in sequenza, una
  richiesta alla volta, e si ferma al primo `429`.
- **Log:** `menu_email_announced` (famiglia, settimana, destinatari), `menu_email_sent`,
  `menu_email_skipped`, `menu_email_expired`, `menu_email_ambiguous`, `menu_email_failed`,
  `menu_email_deferred` (cambio di giorno UTC fra prenotazione e invio); solo id,
  codici e numeri, mai indirizzi, oggetti o corpi (regola di `sendEmail`).

## 6. Web

### 6.1 Pallino e giorni in verde

- `MenuPage` legge `menu.getNewWeek` per la famiglia mostrata (query propria con chiave per famiglia,
  `staleTime` breve, di nuovo al ritorno in primo piano come le altre letture del menu). Inoltre la
  ricarica (invalida) ogni volta che la lettura del menu che può generare (`getOpening` o `getWeek`)
  si conclude con dati nuovi: se la settimana nasce dalla generazione pigra durante la stessa apertura,
  il pallino compare senza aspettare il ritorno in primo piano. Passa al `DatePicker`, **solo con la
  rete** (`useOnline()`):
  - `dot`: pallino verde 10 px con bordo del colore di fondo, in alto a destra dell'icona del
    calendario; il nome accessibile del pulsante diventa «Scegli un giorno, menu della settimana
    prossima pronto» / «Choose a day, next week's menu is ready»;
  - `fresh`: i sette giorni della settimana nuova, con il numero in `var(--green)` (`#067a46`) su fondo
    `var(--soft-green)` (`#eef5e8`, il fondo dello stato attivo della navbar), stessa forma e raggio di
    8 px delle celle del calendario e del giorno scelto, nessuno spazio in più; il fondo resta uguale
    al passaggio del mouse. Contrasto del numero sul fondo: **4,86:1** (sopra 4,5:1). Il giorno scelto
    resta `var(--ink)` con testo bianco: le regole dei giorni nuovi valgono solo per
    `:not([aria-pressed='true'])`, così né il fondo né il passaggio del mouse lo coprono. Il nome
    accessibile dei giorni nuovi aggiunge «, settimana nuova» / «, new week».
- Appena il giorno mostrato (`selected`) cade nella settimana nuova, con la rete, `MenuPage` chiama
  `menu.markWeekSeen` e mette subito a `null` la cache di `getNewWeek` di quella famiglia (pallino e
  verde spariscono senza attendere). Vale per ogni modo di arrivarci: calendario, fila dei giorni,
  swipe, link con `?day=`.
  - **Stato delle visite** per coppia (`familyId`, `weekStartsOn`), non per sola settimana: `MenuView`
    non si rimonta cambiando famiglia, e la stessa settimana va registrata in ogni famiglia. Due stati:
    «in corso» (non si richiama) e «confermata» (non si richiama più in questa sessione). Lo stato vive
    accanto al `QueryClient` (una mappa per client, come l'accesso alle famiglie in `api/queries.ts`),
    non nel componente.
  - **Lo stato della visita prevale sulle risposte:** la funzione di lettura di `getNewWeek`, **dopo**
    aver ricevuto la risposta, la confronta con lo stato delle visite: se la coppia (famiglia, settimana
    restituita) è «in corso» o «confermata», restituisce `{ weekStartsOn: null }`. Il confronto avviene
    alla consegna della risposta, non alla partenza della richiesta: così anche una lettura partita
    **dopo** l'aggiornamento ottimistico, che ha letto il server prima del commit di `markWeekSeen`, non
    rimette il pallino.
  - **Aggiornamento ottimistico:** alla visita, stato «in corso», `cancelQueries` sulla query della
    famiglia, poi `null` nella cache.
  - **Successo:** stato «confermata» e **riconciliazione**: `null` di nuovo nella cache della famiglia
    (sovrascrive qualunque risposta arrivata nel frattempo) e nessuna invalidazione.
  - **Errore:** lo stato della coppia si toglie e la query si invalida (il pallino torna se il server
    lo conferma); la chiamata si ripete alla visita successiva della settimana (anche dopo esserne
    usciti). Nessuna coda offline.
  - **Revoca della famiglia** (uscita, rimozione, eliminazione: `session.onRevoke`, lo stesso
    `QueryClient` resta): si cancellano **tutte** le voci di quella famiglia e sale un contatore di
    generazione per famiglia. Sul server la cascata ha già cancellato le visite: se la persona rientra
    nella stessa sessione, la settimana torna «non vista» anche qui. Gli esiti di `markWeekSeen` partiti
    **prima** della revoca (successo o errore) si applicano solo se la generazione della famiglia non è
    cambiata: una risposta in ritardo non ricrea «confermata».
- Il pallino non c'è nello skeleton del Menu.
- **Offline** (scelta del worker): pallino e giorni verdi non si mostrano e `markWeekSeen` non si
  chiama, anche se la risposta è ancora nella cache in memoria della sessione aperta (TanStack Query
  non la toglie quando cade la rete); al ritorno della rete la query si aggiorna e il pallino torna se
  il server lo conferma. Inoltre la query di `getNewWeek` **non** si salva nella cache persistente
  (`web/src/api/persister.ts`): un pallino vecchio, magari già spento da un altro dispositivo, non deve
  ricomparire all'avvio.
- **Secondo segnale visibile dei giorni nuovi** (rilievo 7 della revisione, scelta dell'utente del 23
  ottobre 2026): il fondo verde chiaro della cella, oltre al numero verde. Il numero verde da solo,
  contro l'inchiostro `#232323` dei numeri normali, ha contrasto 2,9:1, sotto la soglia di 3:1 del
  criterio WCAG 1.4.1. Il fondo aggiunge un'area piena con la forma della cella. **Limite dichiarato:**
  il fondo `#eef5e8` contro il bianco del pannello ha contrasto 1,11:1, quindi chi vede poco il
  contrasto lo distingue soprattutto dalla forma della fila di celle piene, non dalla luminosità.

Prototipo di riferimento: `prototype/src/routes/menu/+page.svelte`, `DatePicker.svelte`,
`store/new-week-notice.svelte.ts` (commit `06d30da`).

### 6.2 Link dell'email

`validateMenuSearch` accetta `family` (uuid), solo per la rotta `/menu`: la lista della spesa, che
oggi usa lo stesso validatore, non lo riceve (validatore proprio o campo ignorato lì). Se la persona è membro di quella famiglia e non è la
famiglia mostrata, il Menu la sceglie con `profile.setCurrentFamily` prima di aprire il giorno; se non
è membro, il parametro si ignora e si apre il Menu della famiglia corrente. Il parametro sparisce
dall'indirizzo dopo l'uso (`replace`).

### 6.3 Preferenze

In `PreferencesPage`, sotto la lingua, una casella (componente dei moduli esistente, casella verde da
20 px, riga da almeno 44 px): «Email con il menu della settimana» con il sottotitolo grigio «Il
mercoledì sera, quando è pronto il menu della settimana dopo» / «Menu emails» «On Wednesday evening,
when next week's menu is ready». Salva subito con `profile.update({ menuEmails })`, avviso di conferma
come gli altri campi delle Preferenze; offline il controllo è disattivato come gli altri.

## 7. Accessibilità

- Il pallino è decorativo (`aria-hidden`); l'informazione sta nel nome accessibile del pulsante del
  calendario. Niente annunci `aria-live`: l'avviso non deve interrompere chi usa un lettore di schermo.
- I giorni nuovi hanno il nome accessibile con «settimana nuova» e, per chi vede il calendario, due
  segnali: numero verde e fondo verde chiaro della cella (sezione 6.1, con il limite di contrasto del
  fondo).
- Email: `lang` della persona sull'`html`, `role="presentation"` sulle tabelle, testo alternativo vuoto
  sulle miniature (decorative), contrasto dei testi come nell'app, versione in testo semplice.

## 8. Test

- **Dominio e SQL:** `menu_week_to_announce` uguale a `isNextWeekDue`/`nextWeekStart` su mercoledì
  19:59 e 20:00, domenica 23:59, lunedì 00:00, fusi diversi e cambio dell'ora legale; famiglia creata
  prima e dopo il mercoledì alle 20:00; settimana assente.
- **pgTAP:** RLS di `menu_week_views` (solo le proprie righe, solo da membro), di `menu_announcements` e
  `menu_emails` (nessun accesso da `authenticated`), `new_menu_week` prima e dopo la visita, preferenza
  predefinita `true` senza riga, destinatari senza chi ha spento l'opzione o non ha confermato l'email,
  `menu_email_address` nullo dopo l'uscita dalla famiglia, cascata alla cancellazione, `coverage_test`.
- **Server (con database):**
  - un'email sola per persona e settimana: due esecuzioni dell'annuncio e della consegna, anche
    concorrenti, danno una riga e un invio; un `409` di idempotenza chiude come ambigua;
  - rispetto della preferenza: spenta prima dell'annuncio → nessuna riga; spenta dopo → `skipped`,
    nessun invio;
  - lingua: oggetto e corpo in italiano e in inglese secondo il profilo; nome della famiglia
    nell'oggetto solo con più famiglie;
  - generazione pigra: settimana creata dalla lettura del menu → annunciata al giro dopo;
  - famiglia nuova creata il giovedì → nessun annuncio per quella settimana, annuncio la settimana
    dopo;
  - membro entrato dopo l'annuncio → nessuna email, `getNewWeek` sì;
  - scadenza al lunedì e dopo 23 ore dal primo tentativo, con l'orologio iniettato (anche nelle query);
    `429` ferma il giro;
  - **controllo atomico** (acquisizione), separato: mentre la richiesta della prima riga è sospesa nel
    Resend finto, il test porta nel database di prova `first_attempt_at` della seconda riga oltre le
    23 ore rispetto all'orologio iniettato → l'acquisizione della seconda non riesce, nessuna richiesta;
  - **controllo finale**, separato, attraversando ciascun confine **fra acquisizione e richiesta**
    (l'orologio avanza durante il controllo dell'indirizzo): 23 ore → `expired`, nessuna richiesta;
    mezzanotte locale del lunedì → `expired`; mezzanotte UTC → nessuna richiesta, acquisizione
    liberata, prenotazione del giorno prima consumata, al giro dopo nuova prenotazione sul giorno nuovo
    e un'email; ultimo minuto del giorno UTC raggiunto **dopo** l'acquisizione → nessun invio,
    acquisizione liberata, prenotazione consumata (come la mezzanotte);
  - ultimo minuto del giorno UTC già raggiunto **prima** della prenotazione → nessuna prenotazione,
    giro fermo;
  - budget: con 59 prenotazioni due consegne concorrenti spediscono una sola email; un invio accettato
    con la risposta persa consuma la prenotazione; un errore nel salvataggio di `sent_at` consuma la
    prenotazione e la ripresa dopo 15 minuti usa la stessa chiave, lo stesso oggetto e lo stesso corpo;
    recupero di un'acquisizione abbandonata; riprova dopo la mezzanotte UTC sul budget del giorno nuovo.
    Il Resend finto distingue le **richieste ricevute** dalle **email accettate** (una per chiave):
    nelle riprove le richieste possono essere più d'una, le email accettate mai;
  - `getNewWeek` con il job fallito genera la settimana (generazione pigra) e la restituisce; con
    `getOpening` in parallelo, nessuno dei due vede uno stato a metà;
  - un errore di una famiglia non ferma le altre; senza configurazione nessun invio;
  - miniature: create una volta, servite solo per foto correnti, intestazioni, errore di Images senza
    miniatura;
  - contenuto: HTML con valori escaped (un pasto libero con `<script>`), pasti vuoti assenti, link con
    `day` e `family`.
- **Contratto:** convenzioni (`checkContract`), `getNewWeek` e `markWeekSeen` senza MCP,
  `profile.update` con `menuEmails`.
- **Web:** pallino presente fino alla prima visita della settimana nuova e assente dopo (calendario,
  fila dei giorni, swipe, `?day=`); giorni nuovi con numero verde e fondo verde chiaro, giorno scelto
  scuro anche al passaggio del mouse; nomi accessibili; errore di
  `markWeekSeen` → uscita dalla settimana → nuova visita richiama; stessa settimana in due famiglie senza
  rimontare la pagina → due chiamate; visita → uscita (o rimozione) dalla famiglia → rientro con lo
  stesso `QueryClient` → il pallino torna e una nuova visita richiama `markWeekSeen`; una risposta di
  `markWeekSeen` partita prima della revoca e arrivata dopo non ricrea «confermata»; lettura di
  `getNewWeek` avviata **dopo** l'aggiornamento
  ottimistico, con il risultato preso dal server prima del commit di `markWeekSeen` e consegnato dopo il
  successo → il pallino resta spento; `getNewWeek` che risponde `null` prima della generazione pigra e
  poi si aggiorna alla fine della lettura del menu; passaggio online → offline con il pallino caricato
  (sparisce, nessuna chiamata navigando offline); riconnessione mentre si mostra la settimana
  **precedente** (il pallino torna, se non vista); riconnessione mentre si mostra la settimana **nuova**
  (`markWeekSeen` parte e, completata, il pallino resta assente); parametro `family`; casella delle
  Preferenze.
- **Primo rilascio:** prova ripetibile sullo stack locale (database alla migrazione precedente,
  settimane inserite per famiglie in fusi ai due lati della mezzanotte UTC, poi la migrazione W24):
  nessuna email al primo giro.
- Prove sullo stack locale con Mailpit (`MAILPIT_API_URL`): **nessuna email vera** e nessuna chiave di
  produzione.

## 9. Da provare a mano sull'iPhone (dopo il rilascio)

L'email vera arriva il mercoledì sera dopo il rilascio: controllare in Mail e in Gmail sull'iPhone e su
un computer che miniature, colori e link funzionino; aprire «Apri il menu» dalla PWA e da Safari;
spegnere l'opzione dal link in fondo. Pallino sul calendario il giovedì mattina, sparito dopo aver
guardato la settimana, anche sull'altro dispositivo.

## 10. Rapporti con le altre attività

- **W23** (pulsante «Oggi» nella barra del Menu) tocca la stessa barra di `MenuPage` dove sta l'icona
  del calendario; questa attività cambia `DatePicker` (pallino, giorni verdi) e aggiunge una query in
  `MenuPage`. **Ordine deciso dal coordinatore (23 ottobre 2026): W23 prima di W24.** Dopo il merge di
  W23 questo branch si riallinea a `main` prima della verifica finale e della PR, e si controlla la
  barra completa: «Oggi», calendario con il pallino e borsa, con il focus e l'aggiornamento della data
  introdotti da W23.
- **W22** (skeleton nelle pagine rare): il suo piano tocca anche `web/src/routes/profile/PreferencesPage.tsx`
  (skeleton delle Preferenze) e `design/design.md`. Se W22 è già unito al riallineamento, lo skeleton
  delle Preferenze si adegua alla nuova riga «Email con il menu della settimana»; in `design/design.md`
  i due testi stanno in sezioni diverse.

## 11. Rilascio

Lo prepara il coordinatore dopo il merge: migrazione `20261023100000_menu_ready_notice.sql`, variabile
`APP_ORIGIN` in `wrangler.jsonc` (versionata, non segreta), nessun segreto nuovo (`RESEND_API_KEY`
esiste), nessuna risorsa nuova (bucket `PHOTOS`, binding `IMAGES` e limitatore esistono). Rilasciare
prima di un mercoledì sera, così la prima email parte con il job.

## 12. Lasciato al builder

Nomi interni dei moduli e delle funzioni TypeScript, struttura dei test, testo esatto dei log oltre ai
nomi degli eventi, `staleTime` della query del pallino.

## Decisioni da riportare nella specifica

### Prodotto

- L'app **manda un'email** quando è pronto il menu della settimana dopo, e mostra un **pallino** sul
  calendario del Menu; la frase «Non manda notifiche sui menu» in «Cosa l'app non fa (per ora)» cambia
  (resta vero che non ci sono notifiche push né email per le singole modifiche). Sezioni: «Cosa l'app
  non fa (per ora)», «Una settimana tipo».
- Email: a tutti i membri, nella loro lingua, attiva all'inizio, opzione per persona nelle Preferenze
  «Email con il menu della settimana», link in fondo alle Preferenze; righe compatte con miniatura;
  fotografia del menu; una per persona, famiglia e settimana. Sezioni: «Una settimana tipo», 7
  (Preferenze), 12 («Lingua delle email»).
- Pallino verde sull'icona del calendario e giorni della settimana nuova con numero verde su fondo verde
  chiaro nel mese, per persona,
  fino alla prima visita della settimana o al lunedì. Sezioni: 14, `design/design.md` («Calendario e
  navigazione»).
- Casi: generazione pigra annunciata come il job; famiglia creata dopo il mercoledì alle 20:00 senza
  avviso per quella settimana; chi entra dopo l'annuncio ha il pallino, non l'email. Sezione 4.

### Tecniche

- Regola unica della settimana da annunciare (sezione 3 di questa spec) in `app.menu_week_to_announce`,
  allineata a `@app/domain/planner`. Sezione 4.
- Tabelle `menu_week_views`, `menu_announcements`, `menu_emails`, `menu_email_budget`; colonna
  `profile_preferences.menu_emails`; funzioni `new_menu_week`, `menu_email_recipients`,
  `menu_email_address`, `menu_email_week`. Sezione 2.
- Annuncio e consegna nel cron orario, dopo il job, in transazioni proprie; consegna sul modello degli
  allarmi (acquisizione atomica, chiave di idempotenza, `409` ambiguo, scadenza al lunedì o 24 ore dopo
  il primo tentativo con margine di un'ora, un minuto di margine sulle mezzanotti, ricontrollata a ogni
  acquisizione e prima della richiesta con un orologio unico passato anche alle query, nessun invio se
  il giorno UTC cambia dopo la prenotazione, stop al `429`, budget
  di 60 prenotazioni per giorno UTC in `menu_email_budget` consumato da ogni tentativo, per la quota
  gratuita di Resend). Meglio nessuna email che un doppione: una consegna ambigua o scaduta può
  lasciare una persona senza email. Sezione 4 («Email operative» diventa «Email del servizio» o una
  voce accanto).
- Una **seconda trasformazione per foto**, oltre a quella del caricamento: la miniatura delle email,
  fatta una volta sola e mai alla lettura (cambia «una trasformazione per caricamento» delle sezioni 2
  e 8).
- Miniature JPEG 144×144 in R2 (`email/{id}.jpg`) create una volta con il binding Images, rotta
  pubblica `/photos/email/{id}.jpg` con `cache-control: public, max-age=86400` e CORP `cross-origin`,
  servite solo per foto correnti; **eccezione** alla decisione del W12 «`/photos/*` senza cache HTTP»,
  con il limite dichiarato che le copie già scaricate dai programmi di posta possono restare. Sezioni 2
  (foto) e 8.
- Operazioni `menu.getNewWeek` (con generazione pigra, come le altre letture del menu) e
  `menu.markWeekSeen` senza MCP e non versionate: **eccezione alla parità web/MCP della sezione 13**,
  perché sono uno stato di visualizzazione personale (confermata dal coordinatore il 23 ottobre 2026);
  `profile.update.menuEmails` anche via MCP. Sezioni 5 e 13.
- Variabile `APP_ORIGIN` per i link generati dal cron. Sezione 1.
- Primo rilascio: tutte le settimane già esistenti risultano annunciate, senza email; il pallino può
  ricomparire una volta a chi le aveva già guardate. Sezione 10.
- Parametro `family` del link al Menu. Sezione 14 / `design/percorsi.md`.

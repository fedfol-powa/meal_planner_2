# Avviso «menu pronto» — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quando la settimana dopo è pronta, un'email per persona (righe compatte con miniature) e un
pallino sull'icona del calendario del Menu, con i giorni nuovi in verde, fino alla prima visita.

**Architecture:** una regola SQL unica decide la «settimana da annunciare»; il web la legge per il
pallino (`menu.getNewWeek`) e registra la visita (`menu.markWeekSeen`); il cron orario, dopo il job,
annuncia (miniature fuori transazione, poi annuncio e email fotografate in una transazione `job`) e
consegna sul modello degli allarmi operativi.

**Tech Stack:** Postgres/Supabase (RLS, pgTAP), Cloudflare Worker (cron, R2, Images), oRPC, React +
TanStack Query, Vitest, Resend/Mailpit.

**Spec:** `progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md` (leggerla tutta prima di
cominciare; le sezioni citate sotto sono di quella spec).

## Global Constraints

- Migrazione unica `supabase/migrations/20261023100000_menu_ready_notice.sql`, solo aggiunte, RLS su
  ogni tabella; ricontrollare prima della PR che nessuna PR aperta usi la stessa versione.
- Nessuna dipendenza nuova.
- Codice, commenti, test in inglese; testi per le persone in it-IT ed en-GB; commit piccoli in italiano.
- Colori: verde `#067a46` (`var(--green)`), inchiostro `#232323`, fondo `#faf8f3`, pasti liberi
  `#f0f3ea` / bordo `#dce4d2`, grigio `#676767`.
- Log: solo id, codici e numeri; mai indirizzi, oggetti o corpi.
- Prove solo sullo stack locale con Mailpit (`MAILPIT_API_URL`); nessuna email vera, nessuna chiave di
  produzione. Le prove web con il server di sviluppo o con le variabili dello stack locale.
- Valori fissi: budget `MENU_EMAILS_PER_UTC_DAY = 60` prenotazioni per giorno UTC in
  `app.menu_email_budget`, consumate da ogni tentativo; acquisizione libera dopo 15 minuti; finestra di
  invio fino al lunedì della settimana (data locale della famiglia) e fino a 23 ore dopo
  `first_attempt_at`, con 1 minuto di margine sulla mezzanotte locale del lunedì, ricontrollata a ogni
  acquisizione e prima della richiesta; nessuna prenotazione nell'ultimo minuto del giorno UTC e
  nessun invio se il giorno UTC è cambiato dopo la prenotazione; orologio iniettabile usato anche nei
  predicati SQL della consegna (mai `now()`); pulizia dopo 90 giorni;
  miniature 144×144 JPEG qualità 80, mostrate 72×72; `cache-control: public, max-age=86400`; chiave di
  idempotenza `menu-email/{familyId}/{weekStart}/{userId}`.
- Meglio nessuna email che un doppione (decisione del coordinatore del 23 ottobre 2026).
- Ordine dei merge: W23 prima di W24; riallineamento a `main` nel Task 11.
- Giorni della settimana nuova nel mese: numero `var(--green)` su fondo `var(--soft-green)` (`#eef5e8`),
  raggio 8 px, solo per `:not([aria-pressed='true'])` (scelta dell'utente del 23 ottobre 2026, spec 6.1).

## Review Focus

1. **Famiglia creata giovedì con le settimane della prima generazione**: nessun pallino e nessuna email
   per quella settimana; test nel Task 1 (pgTAP) e nel Task 6.
2. **Opzione spenta fra annuncio e invio**: la riga si chiude `skipped`, nessuna chiamata a Resend;
   test nel Task 7.
3. **Testo libero o nome con HTML** (`<script>`, `&`, virgolette) nell'email: escaped nell'HTML, intatto
   nel testo semplice; test nel Task 4.
4. **Giorno scelto nella settimana nuova**: resta scuro con testo bianco, e la visita spegne il pallino
   anche quando si arriva con lo swipe o con `?day=`; test nel Task 9.
5. **Persona in due famiglie**: un'email per famiglia, nome della famiglia nell'oggetto, link con
   `family`; il link porta alla famiglia giusta; test nei Task 4, 6 e 10.

---

### Task 1: Migrazione e test pgTAP

**Files:**
- Create: `supabase/migrations/20261023100000_menu_ready_notice.sql`
- Create: `supabase/tests/menu_ready_notice_test.sql`
- Modify: `supabase/tests/coverage_test.sql` (elenchi delle funzioni per ruolo)

**Interfaces:**
- Produces (SQL): colonna `app.profile_preferences.menu_emails`; tabelle `app.menu_week_views`,
  `app.menu_announcements`, `app.menu_emails` (spec 4.1–4.3, colonne esatte lì); funzioni
  `app.menu_week_to_announce(uuid, timestamptz) → date` (solo `app_job`),
  `app.new_menu_week(uuid, timestamptz) → date` (solo `authenticated`, membri),
  `app.menu_email_recipients(uuid) → table(user_id uuid, locale text, family_count int)`,
  `app.menu_email_address(uuid, uuid) → text`,
  `app.menu_email_week(uuid, date) → table(date date, meal_type text, recipe_name jsonb, free_text text, photo_key text)`
  (le ultime tre solo `app_job`). Tutte `security definer set search_path = ''`. Tabella
  `app.menu_email_budget (day date primary key, reserved int not null check (reserved >= 0))` con RLS e
  privilegi ad `app_job` (spec 4.3 bis).

- [ ] **Step 1: test pgTAP che falliscono** in `menu_ready_notice_test.sql` (modello: `email_test.sql`,
  fixture di `helpers/fixtures.psql`). Casi, con l'istante passato esplicitamente:
  - `menu_week_to_announce(f, '2026-10-21 18:59+00')` (Roma 20:59 mercoledì, settimana del 26 presente,
    famiglia creata il 1 ottobre) = `'2026-10-26'`; alle `18:59` di un'ora prima (19:59 locali) `null`;
    domenica `2026-10-25 22:59+00` (23:59 locali, ora solare) = `'2026-10-26'`; lunedì
    `2026-10-25 23:00+00` (00:00 locali) `null` se la settimana del 2 novembre non c'è;
  - famiglia `America/New_York`: `2026-10-21 23:59+00` (19:59 locali) `null`, `2026-10-22 00:00+00` sì;
  - famiglia con `created_at = '2026-10-22 08:00+02'` → `null` per il 26 ottobre; con
    `created_at = '2026-10-21 19:59+02'` → `'2026-10-26'`;
  - settimana assente → `null`;
  - `new_menu_week` da membro: la settimana, poi `null` dopo `insert into app.menu_week_views`; da non
    membro: `throws_ok … '42501'`;
  - RLS di `menu_week_views`: un membro non vede né inserisce righe di un altro (`user_id` diverso) né
    di un'altra famiglia; `authenticated` non ha privilegi su `menu_announcements` e `menu_emails`;
  - preferenza: senza riga in `profile_preferences` `menu_email_recipients` include la persona; con
    `menu_emails = false` no; con `auth.users.email_confirmed_at is null` no; `family_count` = 2 per
    chi sta in due famiglie;
  - `menu_email_address` restituisce l'indirizzo, `null` dopo `delete from app.family_members` della
    persona o con l'opzione spenta;
  - `menu_email_week`: nome della versione pubblicata corrente, `free_text` dei pasti liberi,
    `photo_key` solo con foto non rimossa;
  - cascata: cancellare la famiglia toglie annunci, email e visite;
  - `menu_email_budget`: `authenticated` senza privilegi; `app_job` inserisce e aggiorna.
  (Il seme del primo rilascio non si prova in pgTAP, dove i dati nascono dopo la migrazione: si
  controlla nel Task 11 sullo stack locale.)
- [ ] **Step 2:** `supabase test db` → i nuovi test falliscono (funzioni mancanti).
- [ ] **Step 3: migrazione.** Calcolo di «mercoledì 20:00 locale» in SQL:
  `(date_trunc('week', (p_now at time zone tz)::date) + interval '2 days 20 hours')` confrontato con
  `p_now at time zone tz`; `W = date_trunc('week', local)::date + 7`; condizione sulla famiglia:
  `f.created_at < ((W - 5) + time '20:00') at time zone tz`. Seme finale, **tutte** le settimane
  esistenti (spec 4.3, decisione del coordinatore):
  `insert into app.menu_announcements (family_id, week_start) select family_id, starts_on from app.weeks on conflict do nothing`.
  Grant come in spec 4.1–4.4; `menu_email_recipients` legge `auth.users`.
- [ ] **Step 4:** aggiornare `coverage_test.sql`: le nuove funzioni negli elenchi di `authenticated`
  (`new_menu_week`) e di `app_job` (le altre quattro), nessuna a `anon`/PUBLIC.
- [ ] **Step 5:** applicare la migrazione al database locale: `supabase migration up --local` (o
  `supabase db reset` se lo stack è usa e getta), poi `supabase test db` → PASS tutti.
- [ ] **Step 6: commit** «Avviso del menu pronto: migrazione con settimane viste, annunci, email e preferenza».

### Task 2: Contratto

**Files:**
- Modify: `contract/src/profile/index.ts`, `contract/src/menu/operations.ts`, `contract/src/menu/views.ts`
- Test: `contract/src/menu/operations.test.ts`, `contract/src/contract.test.ts` (se elenca le operazioni)

**Interfaces:**
- Produces: `profileViewSchema.user.menuEmails: boolean`; `profileContract.update` input
  `{ displayName?, locale?, menuEmails?: boolean }` con il `refine` «almeno uno»;
  `menuContract.getNewWeek` (`GET /families/{familyId}/menu/new-week`, input `{ familyId }`, output
  `newWeekView = z.object({ weekStartsOn: monday.nullable() })`); `menuContract.markWeekSeen`
  (`PUT /families/{familyId}/menu/weeks/{weekStartsOn}/seen`, input `{ familyId, weekStartsOn: monday }`,
  output `z.object({ ok: z.literal(true) })`); entrambe `{ mcp: false, offline: false, role: 'familyMember' }`,
  senza `reads`.

- [ ] **Step 1: test che falliscono:** in `operations.test.ts` il controllo «versioned, read-only» si
  restringe a `getOpening`, `getWeek`, `getDates`; nuovo `it('keeps the notice operations out of MCP')`:
  `expect(menuContract.getNewWeek['~orpc'].meta).toEqual({ mcp: false, offline: false, role: 'familyMember' })`
  e lo stesso per `markWeekSeen`; `checkContract({ menu: menuContract })` resta `[]`; `profile.update`
  accetta `{ menuEmails: false }` e rifiuta `{}`.
- [ ] **Step 2:** `npx vitest run contract` → FAIL.
- [ ] **Step 3:** implementare; la descrizione di `profile.update` diventa «Change your display name,
  your language (it-IT or en-GB) or whether you get the weekly menu email».
- [ ] **Step 4:** `npx vitest run contract` → PASS; `npm run typecheck` segnala i punti da completare
  nei Task 3 e 9 (atteso).
- [ ] **Step 5: commit** «Avviso del menu pronto: contratto (preferenza email, settimana nuova)».

### Task 3: Server, preferenza e pallino

**Files:**
- Modify: `server/src/profile/router.ts`, `server/src/profile/views.ts`, `server/src/menu/router.ts`
- Create: `server/src/menu/new-week.ts`
- Test: `server/test/profile.test.ts`, `server/test/menu/new-week.test.ts`, `server/test/profile-family-mcp.test.ts` (descrizione MCP)
- Modify: `server/test/support/menu.ts` (fixture `setFamilyCreatedAt(familyId, iso)`)

**Interfaces:**
- Consumes: Task 1 (`new_menu_week`), Task 2 (contratto).
- Produces: `newWeekOf(tx: Tx, familyId: string, now: Date): Promise<string | null>` (prima
  `ensureWeeks(tx, familyId, now)` di `menu/generation.ts`, poi `new_menu_week`) e
  `markWeekSeen(tx: Tx, familyId: string, weekStartsOn: string, now: Date): Promise<void>` in
  `new-week.ts`; fixture `menuFixtures(db).setFamilyCreatedAt(familyId: string, at: string)` (le
  famiglie dei test nascono «adesso», dopo le date fisse dei test: senza questa fixture la regola non
  annuncia nulla).

- [ ] **Step 1: test che falliscono** (`new-week.test.ts`, con database, istante fissato come in
  `menu/mcp.test.ts`): `getNewWeek` = `{ weekStartsOn: '2026-10-26' }` giovedì 22 ottobre per una
  famiglia creata il 1 ottobre con la settimana del 26; dopo `markWeekSeen('2026-10-26')`
  `{ weekStartsOn: null }`; `markWeekSeen` su un'altra settimana non scrive righe
  (`select count(*) from app.menu_week_views` invariato); un altro membro vede ancora il pallino;
  `getWeek` della famiglia mantiene la stessa `version` prima e dopo `markWeekSeen`; un non membro
  riceve `forbidden`. Generazione pigra: famiglia con il job fallito e nessuna settimana del 26,
  giovedì → `getNewWeek` restituisce `'2026-10-26'` e la settimana esiste dopo la chiamata;
  `getNewWeek` e `getOpening` lanciati insieme (`Promise.all`) → la settimana esiste una volta sola e
  `getNewWeek` restituisce `'2026-10-26'` (il lucchetto per famiglia li serializza). In `profile.test.ts`: `menuEmails` vale `true` senza riga, `false` dopo
  `update({ menuEmails: false })`, di nuovo `true` dopo il contrario; cambiare solo `menuEmails` non
  tocca `display_name`.
- [ ] **Step 2:** `npm test -w server -- new-week profile` → FAIL.
- [ ] **Step 3:** implementare: `profileView` legge `coalesce(pp.menu_emails, true)`; `update` scrive
  `menu_emails` con `insert … on conflict (user_id) do update`; `markWeekSeen` inserisce solo se
  `weekStartsOn` è uguale a `new_menu_week(familyId, now)` (altrimenti niente), `on conflict do nothing`.
- [ ] **Step 4:** test → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: preferenza nel profilo e settimana nuova lato server».

### Task 4: Contenuto dell'email

**Files:**
- Create: `server/src/menu-emails/content.ts`
- Test: `server/test/menu-emails/content.test.ts` (senza database)

**Interfaces:**
- Produces:
  ```ts
  export interface MenuEmailMeal { date: string; mealType: 'lunch' | 'dinner'; name: string | null; freeText: string | null; thumbnailUrl: string | null }
  export interface MenuEmailInput { locale: Locale; familyName: string; familyCount: number; weekStart: string; meals: MenuEmailMeal[]; menuUrl: string; preferencesUrl: string }
  export function menuEmail(input: MenuEmailInput): { subject: string; html: string; text: string }
  ```
  (`name` già nella lingua della persona; un pasto senza `name` né `freeText` non compare.)

- [ ] **Step 1: test che falliscono:**
  - oggetto it `'Il menu della settimana 26 ottobre – 1 novembre è pronto'`, en
    `'The menu for 26 October – 1 November is ready'`; con `familyCount: 2` termina con `' · Folloni'`;
  - HTML: `lang="it-IT"`, titolo del giorno `'Lunedì 26 ottobre'`, etichetta `PRANZO` (uppercase via CSS
    o testo: il test cerca `Pranzo`/`Lunch` e `text-transform:uppercase`), `src="{thumbnailUrl}"` con
    `width="72" height="72" alt=""`, riquadro senza foto quando `thumbnailUrl` è `null`, pasto libero
    con `#f0f3ea` e `Pasto libero`, due link a `menuUrl`, link `Non ricevere più queste email` a
    `preferencesUrl`;
  - `freeText: '<script>alert(1)</script> & "x"'` → nell'HTML solo la forma escaped, nel testo
    semplice intatto;
  - un pasto con `name` e `freeText` entrambi `null` non compare né nell'HTML né nel testo;
  - testo semplice: riga `'Lunedì 26 ottobre – Pranzo: Pasta con crema di peperoni'` e i due link.
- [ ] **Step 2:** `npx vitest run server/test/menu-emails/content.test.ts` → FAIL.
- [ ] **Step 3:** implementare sul modello di `prototype/static/w24-email/it.html` (forma B) e di
  `mail/password-email.ts` (testi it/en nello stesso file, `escapeHtml`); date con `Intl.DateTimeFormat`
  `timeZone: 'UTC'`, prima lettera del giorno maiuscola.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: email a righe compatte in italiano e inglese».

### Task 5: Miniature e rotta pubblica

**Files:**
- Create: `server/src/menu-emails/thumbnails.ts`, `server/src/photos/serve-email.ts`
- Modify: `server/src/app.ts:148` (ramo per `/photos/email/` prima di `/photos/`)
- Test: `server/test/menu-emails/thumbnails.test.ts`, `server/test/photos-route.test.ts`

**Interfaces:**
- Produces: `EMAIL_THUMBNAIL = /^[A-Za-z0-9_-]{22}$/`;
  `ensureEmailThumbnail(env: Pick<Env, 'PHOTOS' | 'IMAGES'>, storageKey: string): Promise<boolean>`
  (true se la miniatura esiste o è stata creata; false se manca `PHOTOS`/`IMAGES`, l'originale o
  Images fallisce; mai eccezioni, log `menu_email_thumbnail_failed`);
  `emailThumbnailPath(storageKey: string): string` → `/photos/email/{id}.jpg`;
  `serveEmailThumbnail(request: Request, env: Env, id: string): Promise<Response>`.

- [ ] **Step 1: test che falliscono:** con R2 e Images finti (modello dei test delle foto del W12):
  prima chiamata → una `transform({ width: 144, height: 144, fit: 'cover' })`, `output({ format: 'image/jpeg', quality: 80 })`,
  `put('email/{id}.jpg')`; seconda chiamata → nessuna trasformazione; Images che lancia → `false`.
  Rotta: foto corrente → 200 con `content-type: image/jpeg`, `cache-control: public, max-age=86400`,
  `cross-origin-resource-policy: cross-origin`, `x-content-type-options: nosniff`; foto rimossa → 404;
  id non valido (`../x`, 21 caratteri) → 404; limitatore negativo → 429; `POST` → 405.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** implementare; la rotta usa `PHOTO_READ_LIMIT` e `app.served_photo('photos/{id}.webp')`
  nel ruolo `anon`, come `servePhoto`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: miniature delle foto per le email».

### Task 6: Annuncio

**Files:**
- Create: `server/src/menu-emails/announce.ts`
- Test: `server/test/menu-emails/announce.test.ts`

**Interfaces:**
- Consumes: Task 1 (funzioni SQL), Task 4 (`menuEmail`), Task 5 (`ensureEmailThumbnail`, `emailThumbnailPath`).
- Produces: `announceMenus(sql: postgres.Sql, env: MenuEmailEnv, now: Date, options?: { families?: readonly string[] }): Promise<{ announced: number; emails: number }>`
  con `MenuEmailEnv = Pick<Env, 'APP_ORIGIN' | 'PHOTOS' | 'IMAGES'>`. Una famiglia alla volta, ognuna
  nel suo `try`: lettura breve (`menu_week_to_announce` e assenza dell'annuncio) → miniature fuori
  transazione → transazione `job` con `insert into app.menu_announcements … on conflict do nothing returning`
  (nessuna riga → stop), destinatari, pasti, una riga di `menu_emails` per destinatario. Senza
  `APP_ORIGIN`: log `menu_email_no_origin` (error) e nessun annuncio. Log `menu_email_announced`
  `{ familyId, weekStart, recipients }`.

- [ ] **Step 1: test che falliscono** (database; famiglie con `setFamilyCreatedAt('2026-10-01T00:00:00Z')`,
  settimana del 26 ottobre con `insertWeek`/`insertSlot`, istante giovedì `2026-10-22T06:00:00Z`):
  - due membri (it, en) → un annuncio, due righe con oggetto nella lingua giusta; seconda esecuzione →
    nessuna riga nuova; due esecuzioni concorrenti (`Promise.all`) → un annuncio, due righe;
  - membro con `menu_emails = false` → nessuna riga per lui;
  - famiglia creata il 22 ottobre (`setFamilyCreatedAt('2026-10-22T07:00:00Z')`) con la settimana del
    26 → nessun annuncio; stessa famiglia il 29 ottobre con la settimana del 2 novembre → annuncio;
  - settimana creata da `ensureWeeks` (generazione pigra) dopo il job fallito → annunciata
    all'esecuzione successiva;
  - membro aggiunto dopo l'annuncio → nessuna riga per lui alla esecuzione successiva;
  - una famiglia che fa fallire la propria transazione (mock come in `menu/job.test.ts`) non ferma
    l'altra;
  - persona in due famiglie → due righe, oggetti con il nome della famiglia, link con
    `family={familyId}`;
  - senza `APP_ORIGIN` → nessun annuncio, log `menu_email_no_origin`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** implementare; URL: `{APP_ORIGIN}/menu?day={W}&family={familyId}`,
  `{APP_ORIGIN}/profile/preferences`, miniature `{APP_ORIGIN}{emailThumbnailPath(key)}` solo se
  `ensureEmailThumbnail` ha dato `true`; nome della ricetta dalla lingua della persona, altrimenti
  l'altra (spec 4.4).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: annuncio delle settimane nel cron orario».

### Task 7: Consegna

**Files:**
- Create: `server/src/menu-emails/deliver.ts`
- Test: `server/test/menu-emails/deliver.test.ts`

**Interfaces:**
- Consumes: Task 1, `sendEmail` di `server/src/mail/transport.ts`.
- Produces: `deliverMenuEmails(sql: postgres.Sql, env: Pick<Env, 'RESEND_API_KEY' | 'MAILPIT_API_URL'>, options?: { fetch?: typeof fetch; families?: readonly string[]; clock?: () => Date }): Promise<{ sent: number }>`;
  `emailAddressOf(sql: postgres.Sql, familyId: string, userId: string): Promise<string | null>` in
  `server/src/menu-emails/address.ts` (chiama `menu_email_address` in una transazione `job`; modulo a
  parte perché i test lo sostituiscono con `vi.mock` per far passare il tempo fra acquisizione e
  richiesta); funzione pura `sendCheck(row: { firstAttemptAt: Date; weekStart: string; timeZone: string; reservedDay: string }, at: Date): 'send' | 'expired' | 'defer'`;
  costante `MENU_EMAILS_PER_UTC_DAY = 60`. Mai eccezioni. Ordine: pulizia (annunci e giorni di budget
  > 90 giorni), scadenze, candidate, poi per ogni candidata: una transazione `job` con prenotazione del
  budget e acquisizione condizionata alla validità (spec 5.5, testo SQL della prenotazione lì; budget
  esaurito o ultimo minuto del giorno UTC → rollback e fine del giro; riga non più valida → rollback e
  prossima), `emailAddressOf`, `sendCheck` con l'orologio letto di nuovo (`expired` → chiusa;
  `defer` → acquisizione liberata, log `menu_email_deferred`), invio, esito in una transazione
  propria. **Ogni** istante delle query viene da `clock()` letto nella fase, passato come parametro.

- [ ] **Step 1a: test puri di `sendCheck`** (senza database): `'send'` a 22 h 59 min da
  `firstAttemptAt`; `'expired'` a 23 h; con `weekStart: '2026-10-26'`, `timeZone: 'Europe/Rome'`,
  `'send'` a `2026-10-25T22:58:59Z` e `'expired'` a `2026-10-25T22:59:00Z` (ultimo minuto prima della
  mezzanotte locale, ora solare); con `reservedDay: '2026-10-22'` `'defer'` a `2026-10-23T00:00:00Z` e
  a `2026-10-22T23:59:00Z` (ultimo minuto), `'send'` a `2026-10-22T23:58:59Z`; con
  `America/Los_Angeles` la scadenza segue la mezzanotte di Los Angeles, non quella UTC.
- [ ] **Step 1: test che falliscono** (database, Resend finto sul modello di `fakeResend` di
  `server/test/ops-alerts.test.ts` ma con due contatori: `requests` (ogni chiamata) e `accepted`
  (un'email per chiave di idempotenza, la prima), righe create con `announceMenus` o inserite
  direttamente; **tempo controllato solo con l'orologio iniettato** `clock`, un oggetto mutabile del
  test, mai con `vi.setSystemTime`, che non cambia l'ora di Postgres; i valori di `first_attempt_at` e
  `claimed_at` si preparano nel database di prova rispetto a quell'orologio):
  - successo → `sent_at` valorizzato, una chiamata con chiave `menu-email/{f}/{w}/{u}`, destinatario
    preso da `menu_email_address`; seconda esecuzione → nessuna chiamata;
  - due consegne concorrenti → una sola chiamata per riga;
  - opzione spenta dopo l'annuncio → `closed_reason = 'skipped'`, nessuna chiamata; idem per un membro
    uscito;
  - `409` `invalid_idempotent_request` → `ambiguous`, nessun nuovo tentativo; `409`
    `concurrent_idempotent_requests` → acquisizione liberata, riprova;
  - `429` alla prima riga → nessuna chiamata per le altre in quel giro, tutte ancora aperte;
  - `500` → acquisizione liberata, `attempts = 1`, `first_attempt_at` valorizzato;
  - scadenza: riga con `week_start` uguale alla data locale (lunedì) → `expired`; riga con
    `first_attempt_at` di 25 ore fa → `expired`;
  - budget: `menu_email_budget` del giorno con `reserved = 60` → nessuna richiesta, giro fermo; il
    giorno UTC dopo sì; con `reserved = 59` due `deliverMenuEmails` concorrenti su due righe diverse →
    una sola richiesta, `reserved = 60`;
  - risposta persa: il finto `fetch` registra l'email come accettata e poi lancia → riga ancora aperta,
    acquisizione liberata, `reserved` aumentato di 1; il giro dopo rispedisce con la stessa chiave e lo
    stesso `subject`/`text`/`html` e il finto conta **una** email accettata per quella chiave;
  - salvataggio di `sent_at` che fallisce (mock della transazione di esito) → riga acquisita; dopo
    `claimed_at` spostato indietro di 16 minuti la riprende un altro giro, stessa chiave, una email
    accettata, `reserved` aumentato di 2 in tutto;
  - **controllo atomico** (acquisizione): due righe; il finto `fetch` della prima, prima di rispondere,
    scrive nel database di prova (`db.admin`) `first_attempt_at` della seconda a 23 ore e 1 minuto prima
    dell'orologio iniettato → la seconda non viene acquisita (`attempts` invariato), nessuna richiesta
    per lei; il giro dopo la chiude `expired`;
  - **controllo finale**, ogni confine attraversato fra acquisizione e richiesta: `emailAddressOf`
    sostituito con `vi.mock` che, prima di restituire l'indirizzo, avanza l'orologio iniettato
    (a) oltre le 23 ore da `first_attempt_at` → `expired`, nessuna richiesta, prenotazione consumata;
    (b) oltre la mezzanotte locale del lunedì meno 1 minuto → `expired`, nessuna richiesta;
    (c) oltre la mezzanotte UTC → nessuna richiesta, `claimed_at` nullo, `reserved` del giorno prima
    aumentato di 1; il giro successivo (orologio al giorno nuovo) prenota sul giorno nuovo e spedisce
    **una** email; (d) dentro l'ultimo minuto del giorno UTC → come (c);
  - ultimo minuto del giorno UTC all'inizio della prenotazione → nessuna prenotazione, nessuna
    acquisizione, giro fermo;
  - lunedì: riga di una famiglia `America/Los_Angeles` con `week_start` uguale alla sua data locale
    quando in UTC è già martedì e viceversa → valida solo finché la data **locale** precede `week_start`;
  - riprova dopo la mezzanotte UTC: prenota sul giorno nuovo (`menu_email_budget.day` nuovo);
  - senza `RESEND_API_KEY` né `MAILPIT_API_URL` → nessuna acquisizione, log `menu_email_not_configured`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** implementare (stesse query a stati di `ops-alerts/index.ts`, colonne di
  `menu_emails`, ma con l'istante dell'orologio come parametro al posto di `now()`;
  `first_attempt_at = coalesce(first_attempt_at, ${at}::timestamptz)` all'acquisizione).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: consegna delle email con quota e idempotenza».

### Task 8: Cron e configurazione

**Files:**
- Modify: `server/src/scheduled.ts`, `server/src/env.ts`, `server/wrangler.jsonc`, `server/test/scheduled.test.ts`
- Modify: configurazione dello stack locale e della CI se definiscono le variabili del Worker
  (cercare `MAILPIT_API_URL` in `server/`, `.github/workflows/ci.yml`, `.dev.vars*`)

**Interfaces:**
- Consumes: Task 6 e 7.
- Produces: `Env.APP_ORIGIN?: string` (commento: «Origin of the links the cron writes in emails; no request to derive it from»);
  `"APP_ORIGIN": "https://cosasimangia.app"` in `vars`; in `dispatchScheduled` ramo orario, dopo la
  ripresa delle cancellazioni, `runMenuEmailSteps(env, time)` con connessione propria, `announceMenus`
  e `deliverMenuEmails` ognuno nel suo `catch` (log `menu_email_announce_crashed`,
  `menu_email_delivery_crashed`, livello error); un loro errore non fa fallire l'esecuzione.

- [ ] **Step 1: test che fallisce** in `scheduled.test.ts`: l'esecuzione oraria chiama annuncio e
  consegna dopo il job; un errore dell'annuncio non impedisce consegna, allarmi né il risultato
  dell'esecuzione (modello dei test esistenti di `runAlertSteps`).
- [ ] **Step 2:** → FAIL. **Step 3:** implementare. **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: annuncio e consegna nel cron orario, APP_ORIGIN».

### Task 9: Web, pallino e giorni verdi

**Files:**
- Modify: `web/src/api/queries.ts` (query `newWeekQuery`), `web/src/api/mutations.ts`
  (`'menu.markWeekSeen'`), `web/src/api/persister.ts` (non salvare la query), `web/src/routes/MenuPage.tsx`,
  `web/src/components/DatePicker.tsx`, `web/src/components/DatePicker.module.css`,
  `web/src/i18n/messages/menu.ts`, `web/src/test/rpcServer.ts` e il finto backend `web/src/api/fake/`
- Test: `web/src/routes/MenuPage.test.tsx` (o `MenuPage.newWeek.test.tsx`), `web/src/api/persister.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces: `queryKeys.newWeek(familyId)`; `newWeekQuery(deps, familyId)`; hook
  `useNewWeek(familyId: string, selected: IsoDate | null): { weekStartsOn: IsoDate | null }` in
  `web/src/routes/menu/newWeek.ts` (lettura, stato delle visite, aggiornamento ottimistico e
  riconciliazione, solo online); stato delle visite per `QueryClient`:
  `weekVisits(queryClient): { get(familyId, week): 'pending' | 'done' | undefined; set(familyId, week, state): void; clear(familyId, week): void }`
  (una `WeakMap` per client, come `attachFamilyAccess` in `api/queries.ts`); `newWeekQuery` filtra la
  risposta con `weekVisits` **dopo** averla ricevuta;
  `DatePicker` props in più
  `dot: boolean`, `fresh: readonly IsoDate[]`; testi `'menu.newWeekReady'` («menu della settimana
  prossima pronto» / «next week's menu is ready»), `'menu.newWeekDay'` («settimana nuova» / «new week»).

- [ ] **Step 1: test che falliscono** (finto backend con `getNewWeek` = `{ weekStartsOn: '2026-10-26' }`,
  oggi 22 ottobre):
  - il pulsante del calendario si chiama «Scegli un giorno, menu della settimana prossima pronto» e
    contiene l'elemento del pallino; aprendo il mese i giorni 26–31 ottobre hanno la classe del verde e
    il nome «…, settimana nuova», gli altri no;
  - toccando il 26 nel calendario → una chiamata `markWeekSeen({ familyId, weekStartsOn: '2026-10-26' })`,
    il pulsante torna «Scegli un giorno», nessun giorno verde;
  - stesso effetto con lo swipe alla settimana dopo e aprendo `/menu?day=2026-10-28`;
  - i giorni 26–31 hanno la classe dei giorni nuovi (numero verde, fondo verde chiaro: test sul CSS
    module, che la regola esista con `:not([aria-pressed='true'])` per `color` e `background`);
  - con `selected` sul 26 il giorno ha `aria-pressed="true"` e la regola del giorno scelto (sfondo
    `var(--ink)`, testo bianco) vince sul verde, anche con `:hover` (test sul CSS module o sullo stile
    calcolato);
  - `getNewWeek` = `{ weekStartsOn: null }` → nessun pallino, nessuna chiamata;
  - errore: `markWeekSeen` che risponde errore → pallino di nuovo visibile dopo l'invalidazione; si
    torna a una settimana precedente e poi al 26 → seconda chiamata;
  - due famiglie: stessa settimana del 26 nuova in A e B; visita in A, cambio di famiglia senza
    rimontare `MenuView`, visita in B → due chiamate, una per famiglia;
  - lettura in corso: `getNewWeek` lenta che risponderebbe la settimana, visita del 26 nel frattempo →
    dopo la risposta il pallino resta spento (`cancelQueries` prima dell'aggiornamento ottimistico);
  - lettura avviata **dopo** l'aggiornamento ottimistico: il finto backend tiene `markWeekSeen` in
    sospeso; il test invalida `newWeek` (come farebbe la fine di `getOpening`), il finto `getNewWeek`
    calcola subito `'2026-10-26'` (il server non ha ancora registrato la visita) ma consegna la risposta
    solo dopo che il test ha fatto riuscire `markWeekSeen` → la cache resta `{ weekStartsOn: null }` e
    pallino e verde restano spenti;
  - generazione pigra: `getNewWeek` risponde prima `null`, poi la lettura di `getOpening` si conclude
    con dati nuovi → `getNewWeek` si rilegge e il pallino compare;
  - offline: con il pallino caricato si va offline (`connectivity` dei test) → pallino e verde
    spariscono; offline si apre il 26 → nessuna chiamata;
  - riconnessione mentre si mostra la settimana **precedente** (offline si torna al 22): la query si
    rilegge e il pallino torna;
  - riconnessione mentre si mostra la settimana **nuova** (offline si apre il 26): parte
    `markWeekSeen`, e quando è completata il pallino è assente e nessun giorno è verde;
  - `persistOptions(...).dehydrateOptions.shouldDehydrateQuery` è `false` per `queryKeys.newWeek(...)`.
- [ ] **Step 2:** `npm test -w web -- MenuPage persister` → FAIL.
- [ ] **Step 3:** implementare come il prototipo (`prototype/src/lib/components/DatePicker.svelte`):
  pallino 10 px `var(--green)` con bordo 2 px del fondo, `top: 7px; right: 6px`; `.day.fresh { color: var(--green) }`
  e `background: var(--soft-green)` su `.day.fresh:not([aria-pressed='true'])` e sul suo `:hover`
  (stesso fondo), così il giorno scelto resta scuro anche al passaggio del mouse. `useNewWeek`: alla
  visita (online, coppia senza stato): `weekVisits.set(…, 'pending')`, `cancelQueries` della query
  della famiglia, `setQueryData({ weekStartsOn: null })`, mutazione; successo → `'done'` e di nuovo
  `setQueryData({ weekStartsOn: null })` (riconciliazione, nessuna invalidazione); errore →
  `weekVisits.clear` e `invalidateQueries`; invalidare `newWeek` quando `getOpening`/`getWeek` della
  famiglia cambiano `dataUpdatedAt`; restituire `null` se `!useOnline()`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: pallino sul calendario e giorni nuovi in verde».

### Task 10: Web, link dell'email e Preferenze

**Files:**
- Modify: `web/src/routes/search.ts` (`validateMenuSearch` con `family`; validatore proprio per la spesa
  senza `family`), `web/src/router.tsx:118` (rotta della spesa), `web/src/routes/MenuPage.tsx`,
  `web/src/routes/profile/PreferencesPage.tsx`, `web/src/i18n/messages/profile.ts`, `web/src/api/mutations.ts`
  (`'profile.updateMenuEmails'`)
- Test: `web/src/routes/search.test.ts`, `web/src/routes/MenuPage.test.tsx`, `web/src/routes/profile/PreferencesPage.test.tsx`

**Interfaces:**
- Consumes: Task 2; `profile.setCurrentFamily` esistente (`useAreaMutation('profile.setCurrentFamily', …)`).
- Produces: `MenuSearch.family?: string`; testi `'preferences.menuEmails'` («Email con il menu della
  settimana» / «Menu emails»), `'preferences.menuEmailsHint'` («Il mercoledì sera, quando è pronto il
  menu della settimana dopo» / «On Wednesday evening, when next week's menu is ready»).

- [ ] **Step 1: test che falliscono:**
  - `validateMenuSearch({ day: '2026-10-26', family: '<uuid>' })` conserva `family`; un valore non uuid
    → `undefined`; il validatore della spesa non ha `family`;
  - `/menu?day=2026-10-26&family=<altra famiglia della persona>` → una chiamata `setCurrentFamily` con
    quell'id, poi il Menu sul 26 di quella famiglia e l'indirizzo senza `family`;
    `family` di una famiglia non sua → nessuna chiamata, Menu della famiglia corrente;
  - Preferenze: casella «Email con il menu della settimana» selezionata con `menuEmails: true`; il tocco
    chiama `profile.update({ menuEmails: false })` e mostra «Salvataggio…» poi la conferma; offline è
    disattivata.
- [ ] **Step 2:** → FAIL. **Step 3:** implementare (casella verde 20 px dei moduli, riga ≥ 44 px).
  **Step 4:** → PASS.
- [ ] **Step 5: commit** «Avviso del menu pronto: link dell'email alla famiglia giusta e opzione nelle Preferenze».

### Task 11: Riallineamento dopo W23 (e W22)

Si fa quando il coordinatore comunica il merge di W23 (ordine deciso: W23 prima di W24).

- [ ] **Step 1:** `git fetch origin && git rebase origin/main` (o merge di `origin/main`, come preferisce
  il coordinatore), risolvendo i conflitti in `web/src/routes/MenuPage.tsx`, `MenuPage.module.css` e
  `DatePicker.tsx` conservando il pulsante «Oggi» di W23, il suo focus e l'aggiornamento della data.
- [ ] **Step 2:** test del Menu di W23 e di W24 insieme (`npm test -w web -- MenuPage DatePicker`) →
  PASS; controllo visivo della barra con agent-browser sul server di sviluppo: «Oggi», calendario con
  il pallino, borsa, a 375 px e a 1024 px.
- [ ] **Step 3:** se W22 è unito: lo skeleton delle Preferenze (`PreferencesPage.tsx` o il file che W22
  ha introdotto) include la riga della nuova casella; test dello skeleton aggiornato; in
  `design/design.md` nessun conflitto fra le due sezioni.
- [ ] **Step 4: commit** della risoluzione, se serve.

### Task 12: Verifica finale

- [ ] **Step 1:** `npm run typecheck` → nessun errore; `npm test` → tutto verde (con `TEST_DATABASE_URL`
  dello stack locale); `supabase test db` → verde; `npm run build -w web` con le variabili dello stack
  locale.
- [ ] **Step 2: prova sullo stack locale** con Mailpit: famiglia di prova con due membri (it, en), una
  ricetta con foto, istante simulato di giovedì (chiamare `announceMenus`/`deliverMenuEmails` da uno
  script di prova o dal test di stack): le due email in Mailpit con miniature, oggetti e link giusti;
  aprire il link nel server di sviluppo → Menu sul lunedì, pallino spento; nel mese i giorni non sono
  più verdi. Screenshot con agent-browser allegati al rapporto.
- [ ] **Step 3: seme del primo rilascio**, sequenza ripetibile sullo stack locale, senza dati né
  credenziali di produzione:
  1. `supabase db reset --version 20261017100000` (database alla migrazione precedente a W24);
  2. con `psql` sullo stack locale: due famiglie (`Europe/Rome`, `America/Los_Angeles`) con
     `created_at` di un mese prima e la settimana del lunedì prossimo in `app.weeks`;
  3. `supabase migration up --local`;
  4. eseguire `announceMenus` con l'istante di domenica 23:30 UTC (lunedì per Roma, ancora domenica a
     Los Angeles) e di giovedì → nessuna riga in `menu_emails`;
  5. `supabase db reset` per tornare allo stato normale.
  Scrivere la sequenza nel rapporto della PR.
- [ ] **Step 4:** scrivere nella descrizione della PR cosa resta da provare a mano sull'iPhone (spec,
  sezione 9) e i passi del rilascio (spec, sezione 11: migrazione, `APP_ORIGIN`).
- [ ] **Step 5: commit** di eventuali correzioni, push, PR.

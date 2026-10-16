# Gestione della famiglia (W11, ondata 3, attività C): piano di implementazione

> **Per gli agenti:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development
> (consigliata) o superpowers:executing-plans, compito per compito. I passi usano le
> caselle (`- [ ]`).

**Obiettivo:** inviti alla famiglia (anche con account nuovo, al più 10 per link),
membri e ruoli, uscita con successore, eliminazione della famiglia, cancellazione
dell'account e degli utenti, con MCP e prove sullo stack locale.

**Architettura:** una migrazione additiva con tabelle e funzioni `security definer` che
portano regole e lucchetti; aree `familyInvitations` e `account` nuove, operazioni nuove
in `family` e `users`; cancellazione dell'account in tre passi (transazione, `DELETE` di
Auth dopo il commit con `afterCommit`, chiusura) con ripresa nel Cron Trigger orario;
pagine web del prototipo (quarto e sesto giro).

**Tecnologie:** Postgres/pgTAP, Supabase Auth (API di amministrazione), oRPC e zod,
Worker di Cloudflare, React con TanStack Router e Query, Vitest.

**Spec:** `progetto/superpowers/specs/2026-10-16-gestione-famiglia.md` (leggerla prima:
il piano rimanda alle sue sezioni per tabelle, funzioni, testi e stati).

## Vincoli globali

- Codice, identificatori, commenti e test in inglese; documenti in italiano; testi
  dell'interfaccia in `it-IT` ed `en-GB` nei dizionari (`AGENTS.md`).
- Migrazione **solo additiva**: `supabase/migrations/20261016100000_family_management.sql`,
  nessuna modifica a migrazioni o funzioni esistenti.
- Funzioni: schema `app`, `security definer`, `set search_path = ''`, `EXECUTE` revocato
  a `public` e concesso solo ai ruoli della spec (sezione 1); `coverage_test.sql`
  aggiornato a ogni funzione nuova.
- Lucchetti (spec, sezione 1, «Ordine dei lucchetti»): `app_admin_roles` → utente
  (`user_memberships:<id>`, poi ricontrollo di profilo e `account_deletions`) → email
  (`registration_email:<email normalizzata>`, primo lucchetto di `claim`) → righe di
  `app.families` in ordine di id, prima di ogni scrittura su righe della famiglia →
  link → prenotazioni → resto; chi parte da impronta o prenotazione legge senza
  lucchetto, prende i lucchetti nell'ordine e ricontrolla. I percorsi della famiglia non
  prendono `app_admin_roles`. Transazioni `read committed`. `family.delete`,
  `account.delete`, `users.delete` ripetono una volta su `40P01`.
- `SUPABASE_SECRET_KEY` letta solo da `server/src/accounts/`; nessuna scrittura nello
  schema `auth`.
- Pagine pubbliche: `role: 'public'`, `mcp: false`, `rateLimit` (`read`/`accept`, binding
  esistenti), token di 32 byte nel frammento, nel database solo l'impronta SHA-256.
- Niente aggiornamenti ottimistici; comandi disattivati offline.
- Schermate secondo `design/design.md` e `design/index.html`, confrontate con
  `design/references/hellofresh/` e con le rotte del quarto e sesto giro in
  `prototype/`; si riusano token e componenti esistenti (`settings-card`, `row-list`,
  etichette, pulsante `danger`, `BottomSheet`), nessun linguaggio visivo nuovo.
- Tetto: `FAMILY_INVITATION_ACCOUNT_LIMIT = 10` prenotazioni per link (email distinte;
  testi «persone registrate con questo link»); validità del link 7 giorni; ripresa
  delle cancellazioni ferme da `5 minutes`; segnalazione `account_deletion_overdue` dopo
  3 tentativi falliti.
- Nei log mai password, token, email, nomi o corpi di richiesta e risposta.
- Prove locali solo sullo stack locale di questo worktree: mai la produzione
  (`protocollo-worker.md`, «Prove sullo stack locale»). Nessuna dipendenza nuova.
- Ogni commit lascia verdi `npm run typecheck` e `npm test` (più `supabase test db` per i
  compiti del database).

## Attenzione in revisione

1. **Ripetizioni dopo una risposta persa**: `create` dell'invito, `accept`, `join`,
   `leave`, `delete` ripetuti devono dare lo stesso esito o un esito che il web tratta
   come riuscito (`forbidden` dopo un'uscita riuscita). Test nei compiti 6, 7 e 8.
2. **Persona che ha già un account e apre il link senza accesso**: la pagina deve
   portarla all'accesso e tornare all'invito con il token intatto (frammento dentro
   `redirect`). Test nel compito 12.
3. **Famiglia sparita mentre la si guarda** (rimozione, eliminazione da un altro
   membro): i dati spariscono dal dispositivo anche senza `forbidden`. Test nel compito
   14.
4. **Due schede aperte durante la cancellazione dell'account**: l'altra scheda riceve
   `unauthorized` e chiude la sessione, senza ciclo di rinnovi. Test nel compito 15.
5. **Tetto raggiunto per chi ha già un account**: entra comunque (`join`), mentre la
   creazione è rifiutata. Test nei compiti 1 e 6.

---

### Compito 1: tabelle e funzioni degli inviti alla famiglia

**File:**
- Crea: `supabase/migrations/20261016100000_family_management.sql`
- Crea: `supabase/tests/family_management_test.sql`
- Modifica: `supabase/tests/coverage_test.sql` (elenchi di `anon` e `authenticated`)

**Interfacce:**
- Produce: tabelle `app.family_invitations`, `app.family_invitation_reservations`,
  `app.family_joins`, `app.family_removals`, `app.account_deletions` (spec, sezione 1,
  colonne esatte), nessun trigger di versione nuovo; `app.create_family` ridefinita
  (`create or replace`, stessa firma) con il lucchetto dell'utente e il ricontrollo del
  profilo; funzioni `create_family_invitation`,
  `revoke_family_invitation`, `family_invitations_view`, `family_joins_view`,
  `family_invitation_by_token`, `claim_family_invitation` (`returns table (user_id uuid,
  email text, state text, member boolean)`, `state` in `create`/`joined`/`closed`/
  `unavailable`), `account_id_deleted(uuid) returns boolean`, `complete_family_invitation(p_user_id
  uuid)` (`returns table (family_id uuid, joined boolean)`), `family_invitation_status`,
  `join_family`, con firme, passi e codici della spec (sezione 1).

- [ ] **Passo 1: test pgTAP che falliscono** in `family_management_test.sql` (con
  `helpers/setup.psql` e le fixture esistenti): tabelle con RLS e senza privilegi a
  `anon`/`authenticated`; creazione solo `family_admin` (`42501` per un membro);
  ripetizione con lo stesso id e impronta nuova → una riga, impronta nuova; id usato da
  altri → `P0A05`; revoca e `revoke_reason = 'manual'`; vista con soli link usabili e
  `created_by_name` nullo per un autore non più membro; `by_token` senza riga per link
  scaduto (`expires_at` spostato indietro) o revocato; `claim` ripetuto per la stessa
  email → stesso `user_id`; email con account → `P0A03`; 10 email prenotate →
  `accounts_available` falso e undicesima `P0A01`; prenotazione esistente restituita
  anche a link revocato; `complete` dopo l'inserimento in `auth.users` → membro
  `member`, `current_family_id`, ripetizione senza effetti; `status` con
  `already_member`; rimozione posteriore al link → `status` senza riga e `join`
  `P0A01`, mentre un altro utente entra; link creato dopo la rimozione → entra; uscita
  volontaria (cancellazione dell'appartenenza senza `family_removals`) → il link vale.
  In più tutti i casi della spec (sezione 5, pgTAP, punti «Inviti», «Stato terminale» e
  «Registro»), in particolare: `reserved` a link revocato → `closed`; famiglia eliminata
  → prenotazione con riferimenti nulli ritrovata per impronta ed email; accettazione →
  rimozione → `claim` → `joined` con `member` falso e nessuna scrittura; ripetizione con
  la stessa email dopo `weak_password` senza riga in più. E i casi della seconda
  revisione (spec, sezione 5, pgTAP, «Seconda revisione»): `join` che chiude la
  prenotazione `reserved`; `complete` dopo una rimozione → `closed`; `complete` con la
  persona già membro senza seconda riga di ingresso; link scaduto e aperto revocato
  dalla retrocessione, rimozione e uscita dell'autore (la cancellazione nel compito 3);
  stato `closed` confermato con `unavailable`; vista con i link scaduti con prenotazioni
  `reserved`; `create_family_test.sql` invariato e verde.
- [ ] **Passo 2:** `supabase test db` → i nuovi test falliscono.
- [ ] **Passo 3:** scrivere tabelle, indici, trigger, funzioni e `grant` nella
  migrazione, con l'ordine dei lucchetti della spec in ogni funzione (utente, email,
  famiglia, invito, prenotazione; rilettura dopo i lucchetti); `claim` con i passi della
  spec nell'ordine esatto (lucchetto dell'email, prenotazione esistente, solo poi i
  controlli di una registrazione nuova) e senza sollevare per gli esiti che scrivono uno
  stato; inserimento della prenotazione con `on conflict
  (token_hash, email) where email is not null do nothing` e rilettura.
- [ ] **Passo 4:** `supabase db reset && supabase test db` → tutti verdi, compreso
  `coverage_test`.
- [ ] **Passo 5: commit** «Database: inviti alla famiglia, prenotazioni, ingressi e
  rimozioni».

### Compito 2: funzioni di membri, ruoli, uscita ed eliminazione

**File:**
- Modifica: `supabase/migrations/20261016100000_family_management.sql`
- Modifica: `supabase/tests/family_management_test.sql`, `coverage_test.sql`

**Interfacce:**
- Produce: `app.set_family_member_role(uuid, uuid, text) returns void`,
  `app.remove_family_member(uuid, uuid) returns void`,
  `app.leave_family(uuid, uuid) returns void`,
  `app.family_deletion_view(uuid) returns table (name text, member_names jsonb,
  week_count int, can_delete boolean)`, `app.delete_family(uuid) returns void`; codici
  `P0A09`, `P0A10`, `P0A13`, `P0A14`.
- Funzione interna (non eseguibile dagli utenti): `app.revoke_invitations_of(p_family_id
  uuid, p_user_id uuid, p_reason text) returns int` (usata da questi percorsi e dal
  compito 3; `p_family_id` nullo = tutte le famiglie).

- [ ] **Passo 1: test pgTAP**: retrocessione dell'ultimo amministratore `P0A09`;
  autoretrocessione con un altro amministratore; bersaglio non membro `P0A14`; ruolo non
  valido `22023`; rimozione di sé `22023`; rimozione ripetuta senza effetti; righe di
  `family_removals`; link revocati con `creator_demoted`, `creator_removed`,
  `creator_left`; uscita: unico membro `P0A10`, ultimo amministratore senza successore
  `P0A13`, con successore promosso, membro semplice con successore `P0A13`, nessuna
  riga di rimozione; eliminazione solo `family_admin` e cascata (zero righe per la
  famiglia in `family_members`, `weeks`, `meal_slots`, `meal_changes`, `meal_actions`,
  `shopping_lists`, `recipe_exclusions`, `family_ingredients`, `family_books`,
  `family_tried_recipes`, `weekly_jobs`, `temporary_lists`, `family_invitations`,
  `family_removals`), con voti, altre famiglie e account intatti e
  `current_family_id` nullo; «ex membro»: dopo la rimozione la media di
  `app.family_ratings` esclude il rimosso, il suo voto in `ratings` resta.
- [ ] **Passo 2:** `supabase test db` → falliscono.
- [ ] **Passo 3:** implementare; ogni funzione prende `for update` sulla riga della
  famiglia come prima istruzione (famiglia inesistente: `42501`) e poi ricontrolla chi
  chiama.
- [ ] **Passo 4:** `supabase db reset && supabase test db` → verdi.
- [ ] **Passo 5: commit** «Database: membri, ruoli, uscita ed eliminazione della
  famiglia».

### Compito 3: funzioni della cancellazione dell'account

**File:**
- Modifica: la migrazione, `family_management_test.sql`, `coverage_test.sql` (anche
  l'elenco di `app_job`)

**Interfacce:**
- Produce: `app.account_deletion_plan(uuid) returns jsonb` (chiavi `families[]` con
  `familyId, name, outcome, candidates[{userId, displayName}]`, `lastAppAdmin`,
  `openInvitations`, `pending`), `app.begin_account_deletion(uuid, jsonb, uuid[]) returns
  void`, `app.pending_account_deletions(interval) returns table (user_id uuid, attempts
  int)`, `app.record_account_deletion_attempt(uuid, text) returns int`,
  `app.admin_account_deletions() returns table (user_id uuid, requested_at timestamptz,
  attempts int, last_error text)`; trigger `user_roles_require_profile` su
  `app.user_roles` con la funzione `app.user_roles_require_profile()`; trigger
  `profiles_reject_deleted_ids` su `app.profiles` con `app.profiles_reject_deleted_ids()`; codici `P0A11`,
  `P0A12` (sollevato dal server, nessuna funzione), `P0A13`, `P0A15`.

- [ ] **Passo 1: test pgTAP**: piano con i tre esiti, candidati, `lastAppAdmin`,
  `openInvitations` (link più inviti all'app `pending`), `pending`; chiamante né
  interessato né `app_admin` → `42501`; utente inesistente → `P0A07`; `begin` con
  insieme delle famiglie diverso → `P0A11`; successore mancante o non membro → `P0A13`;
  ultimo `app_admin` → `P0A08`; effetti (successore promosso, link `creator_deleted`,
  invito all'app `revoked`, famiglia con un solo membro eliminata, nessuna riga in
  `ratings`, `user_roles`, `family_members`, `profiles`, `profile_preferences`, riga
  `account_deletions` con `requested_by`); seconda chiamata senza effetti;
  `record_account_deletion_attempt(user, 'auth_admin_failed')` → `attempts` 1;
  `record_account_deletion_attempt(user, null)` con l'utente ancora in `auth.users` →
  `55000`, dopo `delete from auth.users` → `completed_at`; `pending_account_deletions`
  ignora le righe più recenti dell'intervallo; `admin_account_deletions` solo
  `app_admin`; `create_app_invitation` per l'email di un account in attesa → `P0A03`;
  `set_user_role` che assegna un ruolo a un account in attesa → `P0A07`;
  `complete_app_invitation` per un account nuovo ancora funzionante; con la famiglia che
  continua, nessuna prenotazione con l'email della persona e nessuna sua riga in
  `family_joins`, conteggio del link invariato; richiesta con `client_id` nei claim
  (`request.jwt.claims`) e una famiglia `deleted` → `P0A15` e nessuna scrittura; la
  stessa senza famiglie `deleted` → procede; email prenotata su due link con id
  diversi, account solo per uno, cancellazione → nessuna prenotazione con quell'email,
  conteggi invariati; link scaduto e aperto dell'utente revocato (`creator_deleted`);
  `begin_account_deletion` prende il lucchetto dell'email dopo quello dell'utente
  (verificato nei test di concorrenza del compito 6);
  inserimento in `auth.users` di un id in `account_deletions` → errore, nessuna riga
  rimasta; `create_family` dello stesso utente dopo `begin_account_deletion` confermata →
  `42501`.
- [ ] **Passo 2:** `supabase test db` → falliscono.
- [ ] **Passo 3:** implementare `begin_account_deletion` nell'ordine esatto della spec
  (sezione 1, passi 1–11: profilo prima dei ruoli, controllo del canale prima delle
  scritture), con un commento che richiama la regola del lucchetto di B; il trigger sui
  ruoli con un commento che lo collega al passo 10.
- [ ] **Passo 4:** `supabase db reset && supabase test db` → verdi.
- [ ] **Passo 5: commit** «Database: cancellazione dell'account in attesa e ripresa».

### Compito 4: `deleteAccount` e Auth finta

**File:**
- Modifica: `server/src/accounts/index.ts`, `server/src/accounts/index.test.ts`
- Modifica: `server/test/support/fake-auth.ts`

**Interfacce:**
- Produce: `deleteAccount(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>,
  userId: string, options?: { fetch?: typeof fetch }): Promise<'deleted' | 'absent'>`;
  `installFakeAuth` risponde a `DELETE /auth/v1/admin/users/{id}` (cancella da
  `auth.users`, 200; 404 `user_not_found` se assente) con l'aggancio
  `failNextDelete(status: number | 'network')`.

- [ ] **Passo 1: test** in `index.test.ts`: `skips the POST when beforeCreate answers
  true` (opzione nuova di `createInvitedAccount`: `beforeCreate?: () =>
  Promise<boolean>`, chiamata subito prima del `POST`), `deletes with the apikey header and no
  Authorization`, `treats 204 as deleted`, `treats 404 user_not_found as absent`,
  `throws auth_admin_failed with the status on 500`, `throws auth_admin_failed on network
  failure`, `throws auth_admin_key_missing without a key`; i test esistenti di
  `createInvitedAccount` restano invariati.
- [ ] **Passo 2:** `npm test -w server -- src/accounts` → falliscono.
- [ ] **Passo 3:** portare `send` a livello di modulo con `'DELETE'`; scrivere
  `deleteAccount`; estendere `fake-auth.ts`.
- [ ] **Passo 4:** `npm test -w server` → verdi.
- [ ] **Passo 5: commit** «Server: cancellazione dell'account in Auth».

### Compito 5: `afterCommit` nel pipeline

**File:**
- Modifica: `server/src/pipeline.ts`, `server/test/pipeline.test.ts`

**Interfacce:**
- Produce: `afterCommit<T>(next: () => Promise<T>): AfterCommit<T>` esportata da
  `server/src/pipeline.ts`; un gestore che la restituisce ottiene come output il
  risultato di `next()`, eseguito dopo il commit.

- [ ] **Passo 1: test** in `pipeline.test.ts` con un'operazione del contratto di prova
  (`server/test/support/test-contract.ts`): `runs the continuation after the commit`
  (dentro `next` una seconda connessione vede la riga scritta dal gestore),
  `uses the continuation result as output` (validato dallo schema),
  `maps a continuation error to the usual error code with the transaction committed`.
- [ ] **Passo 2:** `npm test -w server -- test/pipeline.test.ts` → falliscono.
- [ ] **Passo 3:** implementare (marcatore di classe o simbolo; il pipeline controlla il
  valore restituito dal gestore dopo `withDb`).
- [ ] **Passo 4:** `npm test -w server` → verdi.
- [ ] **Passo 5: commit** «Server: lavoro dopo il commit nel pipeline».

### Compito 6: area `familyInvitations` e `family.join`

**File:**
- Crea: `contract/src/family-invitations/index.ts` (schemi e operazioni della spec,
  sezione 2), `server/src/family-invitations/router.ts`, `db-errors.ts`
- Modifica: `contract/src/contract.ts`, `contract/src/index.ts`, `server/src/router.ts`,
  `contract/src/family/members.ts` (crea, solo `join` in questo compito) e
  `contract/src/family/index.ts`, `server/src/family/members.ts` (crea) e
  `server/src/family/router.ts`, `server/src/messages.ts`
- Test: `server/test/family-invitations.test.ts`,
  `server/test/family-invitations-locks.test.ts`

**Interfacce:**
- Consuma: funzioni del compito 1; `newToken`, `hashTokenHex` da
  `server/src/app-invitations/tokens.ts`; `createInvitedAccount`; `publicContext`.
- Produce: `familyInvitations.{list, create, revoke, listJoins, get, status, accept}`
  (`accept` → `{ email, joined }`) e `family.join` con input, output ed errori della
  spec;
  `familyInvitationUrl(origin: string, token: string): string` (`/invite#<token>`);
  `FAMILY_INVITATION_ACCOUNT_LIMIT` esportata dal contratto; `mapFamilyError(error)` in
  `server/src/family/db-errors.ts` (crea) per `P0A09`→`last_admin`, `P0A10`→`sole_member`,
  `P0A13`→`invalid`, `P0A14`→`not_found`, `P0A01`→`invitation_unavailable`, usato anche dai
  compiti 7 e 8.

- [ ] **Passo 1: test** (`setupActors`, `installFakeAuth`): `list/create/revoke are
  forbidden to a plain member`; `create returns a url with the token in the fragment`;
  `create repeated with the same id returns a working new link`; `get shows only the
  family name and who invites`; `accept creates the account, the membership and the
  current family`; `accept repeated does not duplicate`; `accept keeps the reservation
  after weak_password`; `accept answers account_exists for a registered email`;
  `accept refuses the eleventh new account with invitation_unavailable`; `a registered
  user joins after the cap`; `expired, revoked and post-removal links give the same
  invitation_unavailable`; `status reports alreadyMember without changes`; `join is
  idempotent and returns the profile with the new current family`; `a removed member
  repeating accept stays out and Auth is not called`; `repeating accept after the
  account was deleted does not recreate the old id`; `revocation between claim and
  complete leaves the account without a family and answers joined false`; `family
  deleted during the Auth call: the retry answers joined false` (con `holdNextCreate` di
  `fake-auth.ts`); `interruption after creation, then family deleted: the retry answers
  joined false`; `listJoins shows new and existing accounts with former members
  unnamed`; le due sequenze con richieste in volo della spec (sezione 5, «Accettazione con
  richieste in volo»), con Auth e `complete` sospendibili separatamente; `list` non
  versionata, aggiornata dopo una prenotazione con `weak_password` e dopo una scadenza. In `family-invitations-locks.test.ts` i due casi del tetto concorrente della
  spec (sezione 5) con nove prenotazioni di partenza, la stessa email alla decima quota
  (seconda richiesta in attesa accertata sul lucchetto dell'email, stesso id, nessun
  errore) e la prenotazione in corso su L1 contro la cancellazione di U2 in entrambi gli
  ordini (nessuna email rimasta, conteggi invariati; nell'ordine opposto
  `account_exists`); `public operations
  answer rate_limited with refuseAll`; `MCP lists familyInvitations_list/create/revoke/
  status and family_join, not get or accept`. Più `contract/src/check.test.ts` verde
  con le operazioni nuove (regole delle pubbliche).
- [ ] **Passo 2:** `npm test -w server -- test/family-invitations.test.ts` → falliscono.
- [ ] **Passo 3:** contratto, gestori e registrazioni; `accept` con i tre passi di A
  (due `anonDb`, creazione dell'account in mezzo senza connessioni), saltando Auth e
  `complete` con `state` `joined` o `closed`.
- [ ] **Passo 3b:** prova negativa del tetto della spec (sezione 5): in locale, una
  variante di `claim_family_invitation` senza nessuna serializzazione del conteggio
  (utente, famiglia, invito) e con la barriera di prova dopo il conteggio; il test
  termina e fallisce sulle asserzioni finali (11 prenotazioni). Nessun commit della
  variante.
- [ ] **Passo 4:** `npm run typecheck && npm test` → verdi.
- [ ] **Passo 5: commit** «Inviti alla famiglia: contratto, server e MCP».

### Compito 7: membri, ruoli, uscita ed eliminazione nel server, con i lucchetti

**File:**
- Modifica: `contract/src/family/members.ts`, `server/src/family/members.ts`,
  `server/src/pipeline.ts` (`RETRY_ON_DEADLOCK`)
- Test: `server/test/family-members.test.ts`, `server/test/family-locks.test.ts`,
  `server/test/pipeline.test.ts`

**Interfacce:**
- Consuma: funzioni del compito 2; `mapFamilyError`.
- Produce: `family.{setMemberRole, removeMember, leave, getDeletion, delete}`; `delete`
  con `webOnly: { path: '/profile/family/delete?family=:familyId' }`.

- [ ] **Passo 1: test** in `family-members.test.ts`: ogni esito della spec (sezione 2,
  tabella dell'area `family`); `the removed member gets forbidden on the next read with
  the same token, web and MCP`; `the average leaves out the removed member and the
  rating stays`; `leave repeated answers forbidden`; `family_delete over MCP answers
  web_only with the page URL and keeps the family`; `delete from the web removes the
  family and returns the profile without it`; `leave answers invalid on successorId when
  the other administrator left meanwhile`. In `family-locks.test.ts` i casi 1–7 della
  spec e il 6b (il caso 1 si aspetta `P0A13`, il caso 5 esclude `40P01`, il caso 6
  accetta entrambi gli esiti dello stallo ma mai `40P01` da `family.delete`, il 6b la
  creazione di una famiglia dopo il ricalcolo, anche con un secondo membro) (sezione 5, modello di `users-locks.test.ts`: `holdTransaction`, PID della
  seconda connessione, attesa accertata in `pg_stat_activity` con
  `wait_event_type = 'Lock'`), con l'invariante «almeno un amministratore se ci sono
  membri» controllata per prima. Il caso 3 e il caso 4 usano `begin_account_deletion`
  direttamente in SQL (il gestore arriva nel compito 8).
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** operazioni e gestori; ripetizione su `40P01` per `family.delete` (e
  per le operazioni del compito 8): la transazione è del pipeline, quindi la ripetizione
  sta nel pipeline, attivata da un elenco di operazioni nel server
  (`RETRY_ON_DEADLOCK` in `server/src/pipeline.ts`, non nel contratto): una ripetizione
  dell'intera transazione, poi l'errore ordinario (`internal`); test in
  `pipeline.test.ts` per tutti i confini della spec (sezione 5, «Ripetizione su
  `40P01`»: annullamento, rilettura di sessione e ruolo, seguito una volta sola, nessuna
  ripetizione per errori del seguito, `internal` al secondo stallo, nessuna ripetizione
  fuori elenco).
- [ ] **Passo 4:** `npm run typecheck && npm test` → verdi; in locale, una volta,
  sostituire a mano `leave_family` senza `for update` e vedere fallire il caso 1 per
  l'invariante (non si fa commit della prova).
- [ ] **Passo 5: commit** «Famiglia: membri, ruoli, uscita ed eliminazione».

### Compito 8: area `account` e cancellazione degli utenti

**File:**
- Crea: `contract/src/account/index.ts`, `server/src/account/router.ts`,
  `server/src/account/delete.ts`
- Modifica: `contract/src/users/index.ts` (campo `deletion`, `getDeletionPlan`,
  `delete`), `contract/src/errors.ts` (`own_account`), `server/src/users/router.ts`,
  `server/src/users/db-errors.ts`, `contract/src/contract.ts`, `contract/src/index.ts`,
  `server/src/router.ts`, `server/src/messages.ts`
- Test: `server/test/account-deletion.test.ts`, `server/test/account-deletion-locks.test.ts`

**Interfacce:**
- Consuma: funzioni del compito 3; `deleteAccount`; `afterCommit`; `withDb` con identità
  `{ kind: 'job' }`.
- Produce: `account.{getDeletionPlan, delete}`, `users.{getDeletionPlan, delete}`;
  `deletionPlanSchema`, `deletionInputSchema`, `deletionFamilySchema` esportati da
  `contract/src/account/`; in `server/src/account/delete.ts`
  `finishAccountDeletion(env: Env, userId: string): Promise<boolean>` (chiama
  `deleteAccount`, poi `record_account_deletion_attempt` come `job`; vero se completata),
  riusato dal compito 9.

- [ ] **Passo 1: test** in `account-deletion.test.ts`: tutti i casi della spec
  (sezione 5, «Server», punto `account-deletion.test.ts`), in particolare `the already
  issued token is refused on RPC, REST and MCP after deletion`, `MCP with a family to
  delete answers web_only and writes nothing`, `MCP without families to delete deletes`,
  `conflict after someone joins a sole-member family`, `Auth failure answers completed
  false and leaves the row pending`, `users.delete own account answers not_allowed
  own_account`, `users.delete on a pending row repeats only the Auth step`,
  `users.delete after completion answers completed true`, `users.list and users.get
  carry deletion`. In `account-deletion-locks.test.ts`: due `app_admin` che cancellano
  ciascuno il proprio account, l'uno l'altro, e cancellazione contro `set_user_role`
  (attesa sul lucchetto `advisory`, resta un amministratore).
- [ ] **Passo 2:** test → falliscono.
  Più: `MCP account.delete and users.delete answer web_only when the family composition
  changes while waiting for the lock` (piano letto con F condivisa, uscita dell'altro
  membro mentre la richiesta attende, lucchetto tenuto con `holdTransaction`);
  `roles cannot be granted to a pending account and the last app admin survives the
  resume` (Auth indisponibile con `failNextDelete`); in `account-deletion-locks.test.ts`
  l'assegnazione di `app_admin` tenuta a metà contro `begin_account_deletion`, in
  entrambi gli ordini, con l'utente senza ruoli alla fine.
- [ ] **Passo 3:** gestori: piano letto e scorciatoia del rimando MCP; poi
  `begin_account_deletion` (che ha la regola vera: `P0A15` → `web_only` con l'URL della
  pagina), con la ripetizione su `40P01` del compito 7;
  `afterCommit(() => finishAccountDeletion(...))` che dà `{ completed }` e registra il
  fallimento invece di propagarlo.
- [ ] **Passo 4:** `npm run typecheck && npm test` → verdi.
- [ ] **Passo 5: commit** «Cancellazione dell'account e degli utenti: contratto, server
  e MCP».

### Compito 9: ripresa nel Cron Trigger e job settimanale

**File:**
- Crea: `server/src/account/resume.ts`
- Modifica: `server/src/scheduled.ts`, `server/src/menu/job.ts`
- Test: `server/test/scheduled.test.ts`, `server/test/menu/` (test del job esistente)

**Interfacce:**
- Produce: `resumeAccountDeletions(env: Env, now: Date): Promise<void>`.

- [ ] **Passo 1: test**: `resumes rows idle for five minutes and skips newer ones`;
  `closes a row when Auth answers 404`; `logs account_deletion_overdue at error level
  from the third failure`; `the hourly cron runs the weekly job and the resume, and a
  failure in one does not stop the other`; `the weekly job skips a family deleted
  during the run with weekly_job_family_gone`.
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare con `logEvent` di `server/src/log.ts`.
- [ ] **Passo 4:** `npm test -w server` → verdi.
- [ ] **Passo 5: commit** «Job: ripresa delle cancellazioni e famiglie eliminate».

### Compito 10: prova sullo stack

**File:**
- Crea: `server/test/stack/family.stack.test.ts`

- [ ] **Passo 1:** avviare lo stack locale di questo worktree (`server/README.md`,
  «Sviluppo locale»; con Podman il wrapper di `~/.cache/podwrap` per la copia dei
  segreti) e ricavare le variabili con `scripts/invitations/invite-stack.sh`.
- [ ] **Passo 2: test** come nella spec (sezione 5, «Stack»): link → account vero →
  accesso con password → menu; retrocessione e rimozione immediate; `join` di un
  account esistente; cancellazione: nessuna riga in `auth.sessions`, `auth.identities`,
  `auth.oauth_consents` per l'utente, token rifiutato, refresh rifiutato; con un agente
  autorizzato (flusso OAuth dello stack come nelle prove di collegamento) il token
  dell'agente rifiutato.
- [ ] **Passo 3:** `scripts/invitations/invite-stack.sh` → verdi.
- [ ] **Passo 4: commit** «Prova sullo stack: invito, famiglia e cancellazione».

### Compito 11: client web e API finta

**File:**
- Crea: `web/src/api/fake/fakeFamilyInvitations.ts`, `web/src/api/fake/fakeAccount.ts`
  (con test)
- Modifica: `web/src/api/fake/fakeApi.ts`, `family.ts`, `fakeUsers.ts`, `seed.ts`,
  `web/src/api/types.ts` (`SERVER_AREAS`), `web/src/api/mutations.ts` (+ test)

**Interfacce:**
- Produce: le operazioni nuove nell'oggetto `api` (finto e reale); registro delle
  mutazioni: `familyInvitations.create/revoke` → bersaglio nuovo `familyInvitations`
  (rilettura, come `appInvitations`); `family.join` e `family.leave` e `family.delete` →
  `profile` scritto dalla risposta; `family.setMemberRole`/`removeMember` → `family`
  scritto dalla risposta e `familyInvitations` da rileggere; `account.delete` nessuna
  scrittura; `users.delete` → `users` da rileggere.

- [ ] **Passo 1: test** dell'API finta: stessi errori del server (`last_admin`,
  `sole_member`, `invitation_unavailable` per Marco con il link vecchio, tetto, `conflict`,
  `own_account`, `web_only` non serve nel web); seed con un link valido, uno scaduto,
  uno revocato e Marco rimosso dopo il link valido. Test del registro per ogni
  operazione nuova.
- [ ] **Passo 2:** `npm test -w web -- src/api` → falliscono.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm run typecheck && npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: client e API finta della gestione della famiglia».

### Compito 12: pagina dell'invito alla famiglia

**File:**
- Crea: `web/src/features/family-invitations/InvitePage.tsx` (+ test, CSS)
- Modifica: `web/src/router.tsx` (`/invite` pubblica), `web/public/_headers` (`/invite`),
  `web/src/i18n/messages/family.ts`

**Interfacce:**
- Consuma: `familyInvitations.get/status/accept`, `family.join`; lettura del token e
  contatore di generazione come `web/src/features/app-invitations/InvitePage.tsx`
  (estrarre l'aiuto comune in `web/src/features/app-invitations/token.ts` se serve, senza
  cambiare il comportamento di A).

- [ ] **Passo 1: test**: ogni riga della tabella degli stati della spec (sezione 3);
  `the account form creates the account, signs in and opens the menu`; `the sign-in link
  keeps the token through redirect and comes back to the invitation` (Attenzione 2);
  `without accountsAvailable there is no form but the sign-in link stays` (Attenzione 5);
  `another account open offers sign out and continue`; `joined false shows the ready
  account text and opens login with the email`; `_headers` contiene `/invite` con
  `no-referrer` (test del file come quello esistente di A, se c'è, altrimenti nuovo).
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare con i testi della spec.
- [ ] **Passo 4:** `npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: pagina dell'invito alla famiglia».

### Compito 13: membri e link d'invito

**File:**
- Modifica: `web/src/routes/profile/MembersPage.tsx` (+ test, CSS),
  `web/src/i18n/messages/family.ts`

- [ ] **Passo 1: test**: azioni solo per gli amministratori e mai sul proprio nome;
  «Rendi amministratore» diretto; «Rendi membro» diretto senza link e con conferma «I 2
  link d'invito creati da Anna smetteranno di valere» con link; `last_admin` con il suo
  testo; rimozione con la conferma e la riga dei link; elenco dei link con autore,
  scadenza, «{n} persone registrate con questo link»; creazione con il foglio, la nota
  «Il link si vede solo ora» e Copia/Condividi; revoca con conferma; card «Ingressi con
  i link» (nome o «ex membro», data, autore del link, «Account nuovo», stato vuoto);
  membro semplice con «chiedi un link a» e senza card degli ingressi; uscita nei tre
  casi, successore obbligatorio, riga dei propri link, `invalid` su `successorId` che
  porta alla scelta del successore, navigazione dopo l'uscita; tutto disattivato
  offline.
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare (foglio di condivisione riusato da A).
- [ ] **Passo 4:** `npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: membri, ruoli, link d'invito e uscita».

### Compito 14: eliminazione della famiglia e dati sul dispositivo

**File:**
- Crea: `web/src/features/family-delete/FamilyDeletePage.tsx` (+ test)
- Modifica: `web/src/router.tsx`, `web/src/routes/profile/SettingsPage.tsx`
  (collegamento per gli amministratori), `web/src/session/SessionScope.tsx` o
  `session.ts` (revoca delle famiglie sparite), `web/src/i18n/messages/family.ts`

**Interfacce:**
- Produce: nel gestore della sessione, a ogni profilo scritto nella cache,
  `session.revoke(familyId)` per ogni famiglia del profilo precedente assente nel nuovo;
  record persistito `revokedKey` → `{ revokedAt, restoredAt }` (un numero della
  versione precedente vale `{ revokedAt: n, restoredAt: 0 }`), scritto solo con
  `store.transact` e fusione col massimo, mai cancellato al ripristino;
  `markRevoked(store, userId, familyId, at)` e `markRestored(store, userId, familyId,
  startedAt)` in `web/src/api/persister.ts` (il secondo sostituisce `clearRevoked`);
  accesso revocato se `revokedAt > restoredAt`; pulizia separata: ogni revoca, propria o
  ricevuta, toglie sempre le viste e le operazioni della spesa della famiglia fino a
  `revokedAt`, e il persister non scrive né ripristina viste con `dataUpdatedAt <=
  revokedAt`; `session.restore(familyId: string, startedAt: number): boolean`;
  messaggi `{ type: 'revoked', userId, familyId, revokedAt }` (campo nuovo) e
  `{ type: 'restored', userId, familyId, startedAt }`; `restore` chiamata dalla
  risposta di `family.join`/`family.create` e da ogni profilo letto che contiene la
  famiglia. Modifica anche `web/src/session/channel.ts`, `web/src/api/persister.ts` e
  `web/src/features/shopping/queue/queue.ts` (pulizia fino a un istante).

- [ ] **Passo 1: test**: riepilogo per l'amministratore e per il membro; conferma che
  elimina e porta a `/profile` o `/menu`; nessuna chiamata all'apertura della pagina;
  `a family missing from a fresh profile is revoked: queries removed, mark written,
  shopping queue cleared` (Attenzione 3); `leave and delete revoke before navigating`;
  `leave then join restores the family without old data`; `removal, new link, join
  restores the family`; `a second tab applies restored`; `a profile read started before
  a newer revocation does not restore`; `delayed revoked then restored, and the reverse
  order, leave the family visible in the second tab`; `a real revocation after the
  rejoin wins in both tabs`; e i casi della terza revisione (spec, sezione 5, «Web»,
  rilievo 3): `reverse delivery removes the old queries and queued shopping operations
  from tab B and re-reads the family`; `a late tab rewriting the old revocation keeps the
  family visible`; `a third session started later does not restore queries older than
  the revocation and shows the family`; `a numeric mark from the previous version reads
  as revokedAt`.
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: eliminazione della famiglia e revoca dei dati sul
  dispositivo».

### Compito 15: cancellazione dell'account e pagina di accesso

**File:**
- Crea: `web/src/features/account/DeletionFamilies.tsx`,
  `web/src/features/account/AccountDeletePage.tsx` (+ test),
  `web/src/i18n/messages/account.ts`
- Modifica: `web/src/router.tsx`, `web/src/routes/profile/PreferencesPage.tsx` (zona di
  pericolo), `web/src/auth/LoginPage.tsx`, `web/src/session/session.ts` (esito di
  chiusura `ended: 'unauthorized'`)

**Interfacce:**
- Produce: `DeletionFamilies({ title, families, outcomeText, successors, onChange })`
  riusato dal compito 16.

- [ ] **Passo 1: test**: tre esiti; pulsante disattivato con successore mancante, ultimo
  `app_admin`, offline; agenti e link nel testo; `conflict` con le scelte ancora valide
  conservate; dopo la risposta `session.close()` e `/login` con «Account cancellato.»;
  `LoginPage shows «Questo account è stato cancellato.» when the first profile read is
  unauthorized after sign-in`; `a second tab receiving unauthorized closes the session
  once, without a refresh loop` (Attenzione 4).
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: cancellazione dell'account».

### Compito 16: cancellazione degli utenti dall'amministrazione

**File:**
- Crea: `web/src/features/admin/UserDeletePage.tsx` (+ test)
- Modifica: `web/src/router.tsx`, `web/src/features/admin/UserPage.tsx` e
  `UsersSection.tsx` (+ test), `web/src/i18n/messages/admin.ts`

- [ ] **Passo 1: test**: pagina in terza persona con i testi della spec; `own_account`
  con il rimando; area di pericolo sotto «Famiglie» (altri) e rimando alle Preferenze
  (sé); `deletion` → avviso, tentativi, «Completa la cancellazione» al posto degli
  interruttori; etichetta «Cancellazione in corso» nell'elenco; dopo la cancellazione
  `/admin` sostituendo la cronologia; accesso con `AdminAccessGate`.
- [ ] **Passo 2:** test → falliscono.
- [ ] **Passo 3:** implementare.
- [ ] **Passo 4:** `npm test -w web` → verdi.
- [ ] **Passo 5: commit** «Web: cancellazione degli utenti dall'amministrazione».

### Compito 17: benvenuto e stato senza famiglia

**File:**
- Modifica: `web/src/features/family-new/WelcomeCard.tsx`,
  `web/src/components/FamilyGate.tsx` (+ test), dizionari

- [ ] **Passo 1: test**: «Invita la famiglia» verso `/profile/family` nella scheda;
  riga degli inviti sotto «Crea la tua famiglia».
- [ ] **Passo 2–4:** test rossi, implementazione, `npm test -w web` verdi.
- [ ] **Passo 5: commit** «Web: invito della famiglia dal benvenuto».

### Compito 18: verifica finale

- [ ] **Passo 1:** `npm run typecheck && npm test && npm run build -w web`, `supabase
  test db`, `scripts/invitations/invite-stack.sh` → tutti verdi.
- [ ] **Passo 2:** prova con la skill agent-browser su `wrangler dev` con lo stack
  locale, confrontando ogni schermata con `design/design.md`, `design/index.html`, i
  riferimenti di `design/references/hellofresh/` e le rotte del prototipo (quarto e
  sesto giro), (variabili dello stack esplicite, URL di Auth controllato prima di accedere) e
  in modalità finta, a 1280 e 390 px, in italiano e inglese, con un nome lungo: i
  percorsi della spec (sezione 5, «Web»). Correggere quanto emerge con commit piccoli.
- [ ] **Passo 3:** aggiornare la spec di dettaglio con «Provato con agent-browser» e
  «Da provare a mano sull'iPhone» (sezione 5).
- [ ] **Passo 4: commit** «Spec: esito delle prove della gestione della famiglia».

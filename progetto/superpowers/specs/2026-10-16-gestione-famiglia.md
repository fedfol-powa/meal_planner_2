# W11: Gestione della famiglia (ondata 3, attività C)

Creato: 16 ottobre 2026
Stato: spec di dettaglio dopo il brainstorming con il coordinatore (decisione dell'utente
sull'account nato da un invito alla famiglia; riepilogo del design approvato con le
precisazioni del messaggio `w11-01-riepilogo-design.md`).
Branch: `ondata3/gestione-famiglia` · Worktree: `.worktrees/famiglia`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`: Parte 1 «Chi la usa»,
«Amministrare l'app», «Usare l'app attraverso il proprio agente»; sezioni 1, 2, 4, 7, 8,
13, 14, 15 e 16), al piano generale (`progetto/superpowers/plans/2026-10-11-piano-generale.md`,
«Ordine dell'ondata 3», riga C, e «Interfacce decise») e alle interfacce di A
(`specs/2026-10-13-inviti-app.md`, sezione 7, «Per C») e di B
(`specs/2026-10-15-amministrazione-utenti.md`, sezione 6).

## Obiettivo

Un amministratore della famiglia invita altre persone con un link, anche chi non ha un
account; gestisce membri e ruoli; chi vuole esce dalla famiglia. Un amministratore della
famiglia può eliminarla dall'app. Ogni utente può cancellare il proprio account, e un
amministratore dell'app può cancellare un altro utente dal dettaglio di B. Oggi nessuna di
queste cose si fa dall'app: si fanno con SQL in produzione o non si fanno.

## Perimetro

Dentro:

1. **Inviti alla famiglia**: tabelle `family_invitations`, `family_invitation_accounts`
   e `family_removals`; creazione, elenco, revoca dalla pagina dei membri; pagina
   pubblica `/invite#<token>`; ingresso con un account esistente o con un account nuovo
   creato dal link (al più 10 per link); rientro dopo la rimozione bloccato per i link
   creati prima; «Invita la famiglia» nella scheda di benvenuto; rimando agli inviti
   nello stato «Non fai ancora parte di una famiglia».
2. **Membri e ruoli**: rimozione, cambio di ruolo, uscita con successore, ultimo
   amministratore della famiglia protetto sotto concorrenza.
3. **Eliminazione della famiglia** dall'app web (`/profile/family/delete?family=<id>`);
   via MCP solo il collegamento.
4. **Cancellazione dell'account** (Preferenze, `/profile/account/delete`) e **degli
   utenti** (amministrazione, `/admin/users/$userId/delete`), con prima transazione,
   cancellazione in Auth, chiusura e ripresa dal Cron Trigger orario.
5. Strumenti MCP per ogni operazione, con i rimandi all'app previsti dalla sezione 7.

Fuori: email (D), Google, ripristino del ricettario, foto, PDF (E).

## Decisioni del brainstorming

| # | Decisione | Motivo |
|---|---|---|
| 1 | **Account nato da un invito alla famiglia** (decisione dell'utente del 16/10, opzione 2): il link riusabile crea account nuovi **fino a 10 per link**; superato il tetto la creazione risponde come un link non valido. Creazione dell'account e ingresso in famiglia sono un solo passaggio con conferma esplicita («Crea l'account ed entra»): nessun account nasce senza famiglia. L'email scritta nel modulo non è verificata fino a D; un'email presa da altri si rimedia cancellando quell'account dall'amministrazione | Tiene il caso d'uso della specifica (un link nel gruppo WhatsApp, tutti dentro) e limita il danno di un link finito in giro senza passaggi in più |
| 2 | Il tetto conta le **prenotazioni di account** (una per email per link), non gli ingressi di chi ha già un account; chi ha un account entra anche a tetto raggiunto | Il rischio da limitare è la creazione di account; un account esistente che entra non costa nulla di nuovo |
| 3 | **Il link si vede solo alla creazione** (impronta SHA-256 nel database, come in A): l'elenco mostra autore, scadenza e account creati, con «Revoca»; per ricondividere si crea un link nuovo. **Scostamento dal prototipo**, che condivideva dall'elenco | Vincolo del coordinamento (token nel frammento, funzioni per impronta); un link che fa entrare in una famiglia non deve essere ricostruibile dal database |
| 4 | **«Ex membro» e voti**: nessuna regola nuova. Il server mostra il nome di un autore solo finché è membro (`family/views.ts`, `menu/week-view.ts`, `shopping/read.ts`) e la media conta solo i membri attuali (`app.family_ratings`): rimozione e uscita valgono già. Alla cancellazione dell'account i voti si cancellano (cascata), alla rimozione restano ma escono dalla media | Già nel codice e nella sezione 7; il lavoro è provarlo con test |
| 5 | **Ricettario**: bozze aperte, salvataggi e versioni di un curatore cancellato restano; gli autori diventano nulli per cascata (`on delete set null`) e le bozze restano agli altri curatori, che possono riprenderle, pubblicarle o scartarle. Le ricette pubblicate restano nel catalogo | Sezione 8: le bozze sono condivise fra curatori e non si cancellano mai; sezione 7: niente cancellazioni implicite dei contributi pubblicati |
| 6 | **Link creati da una persona** (scelta di prodotto del coordinatore, 16/10): si revocano quando quella persona esce dalla famiglia, viene rimossa, perde il ruolo di amministratore o cancella l'account. Il dialogo di conferma di ognuno di questi passaggi lo dice quando ci sono link attivi creati da quella persona («I 2 link d'invito creati da Anna smetteranno di valere») | «Te l'ha mandato X» resta vero, e un link resta sotto il controllo di un amministratore attuale |
| 7 | **Ultimo amministratore della famiglia**: ogni percorso che può togliere amministratori a una famiglia (uscita, cambio di ruolo, rimozione, cancellazione di un account, ingresso che cambia i membri di una famiglia in cancellazione) prende `select … for update` sulla riga di `app.families` e solo dopo riconta | Lucchetto sulla riga esistente, nessuna tabella nuova; serializza anche con l'eliminazione della famiglia e con gli ingressi (la chiave esterna di `family_members` prende `for key share`, che confligge con `for update`) |
| 8 | **Ordine dei lucchetti** (coordinatore): la cancellazione di un account prende prima `app_admin_roles`, poi le righe delle famiglie in ordine di id; i percorsi della famiglia prendono solo la riga della propria famiglia | Nessun ciclo di attesa possibile |
| 9 | **Cancellazione dell'account in tre passi**: prima transazione nel database (tutti i dati dell'app, riga `account_deletions` in attesa), cancellazione definitiva in Auth dopo il commit, chiusura. Ripresa dal Cron Trigger orario esistente | Le due scritture non sono atomiche fra loro: la prima transazione è il punto di non ritorno e tutto ciò che segue è idempotente (sezione 4 sotto) |
| 10 | **Revoca degli accessi**: la cancellazione definitiva in Auth (`DELETE /auth/v1/admin/users/{id}` senza `should_soft_delete`) elimina a cascata `auth.sessions`, `auth.identities`, `auth.oauth_consents` e `auth.oauth_authorizations` (verificato con Context7 su `/supabase/auth` e sulle chiavi esterne dello stack locale); i token già emessi li rifiuta subito `loadSession`, perché il profilo non c'è più dalla prima transazione | Nessuna scrittura nello schema `auth`; un token non scaduto non serve a nulla |
| 11 | **Numero di agenti collegati**: sulla pagina del proprio account sì («Si scollegano anche i tuoi 2 agenti»), da `app.connected_agents()`; sulla pagina in terza persona no, solo «anche quelli degli agenti collegati» | Per sé il dato c'è già e aiuta a capire; per un altro utente servirebbe una lettura nuova di `auth` per un dato che non cambia la decisione (motivo di B) |
| 12 | **Account in attesa di cancellazione**: compare nell'elenco degli utenti con l'etichetta «Cancellazione in corso» e nel dettaglio con l'avviso e «Completa la cancellazione»; `account_exists` degli inviti all'app resta vero finché la riga non è completata, perché l'account in Auth esiste ancora | L'amministratore deve poterlo vedere e sbloccare; la regola di A legge `auth.users` e resta coerente da sé |
| 13 | **Accesso con un account in attesa**: l'accesso con password riesce in Auth, ma ogni operazione risponde `unauthorized` (niente profilo) e il web chiude la sessione dopo il rinnovo; la pagina di accesso mostra «Questo account è stato cancellato» invece di tornare in silenzio al modulo | Nessuno stato strano: la sessione esiste per un istante, non apre dati e il motivo si legge |
| 14 | `family.join` (ingresso con un account esistente) ha il suo strumento MCP; la pagina pubblica e l'accettazione con un account nuovo no (`role: 'public'`, regola di A) | Un agente che riceve il link può far entrare la persona dopo la sua conferma; creare account resta solo sulla pagina |
| 15 | Una sola PR (decisione dell'utente del 16/10) | Le regole comuni (successore, «ex membro», lucchetti) restano coerenti |

## 1. Database

Migrazione `supabase/migrations/20261016100000_family_management.sql`, **solo additiva**:
tabelle e funzioni nuove, nessuna modifica a tabelle o funzioni esistenti. Tutte le
funzioni nello schema `app`, `security definer`, `set search_path = ''`, `EXECUTE`
revocato a `public` e concesso solo ai ruoli indicati. Le funzioni per gli utenti
ricontrollano l'autorizzazione al loro interno.

### Tabelle nuove

**`app.family_invitations`**

| Colonna | Tipo e vincoli |
|---|---|
| `id` | `uuid primary key` (scelto dal client, idempotenza) |
| `family_id` | `uuid not null references app.families (id) on delete cascade` |
| `token_hash` | `bytea not null unique check (octet_length(token_hash) = 32)` |
| `created_by` | `uuid references auth.users (id) on delete set null` |
| `created_at` | `timestamptz not null default now()` |
| `expires_at` | `timestamptz not null` (7 giorni dalla creazione) |
| `revoked_at`, `revoked_by` | `timestamptz`, `uuid references auth.users (id) on delete set null` |
| `revoke_reason` | `text check (in ('manual','creator_left','creator_removed','creator_demoted','creator_deleted'))`, non nullo se e solo se `revoked_at` non è nullo |

Indice su `(family_id, created_at desc)`. RLS attiva, nessun privilegio diretto a
`authenticated` o `anon`: tutto passa dalle funzioni. Un link è **usabile** se
`revoked_at is null and expires_at > now()`.

**`app.family_invitation_accounts`**: prenotazioni degli account nuovi.

| Colonna | Tipo e vincoli |
|---|---|
| `invitation_id` | `uuid not null references app.family_invitations (id) on delete cascade` |
| `email` | `text not null` (minuscolo e senza spazi, `check`) |
| `user_id` | `uuid not null unique` (id prenotato, **senza** chiave esterna: l'account nasce dopo) |
| `reserved_at` | `timestamptz not null default now()` |
| `completed_at` | `timestamptz` |
| | `primary key (invitation_id, email)` |

Il numero di righe per invito è il contatore del tetto (`FAMILY_INVITATION_ACCOUNT_LIMIT
= 10`, costante nella funzione e nel contratto). RLS attiva, nessun privilegio diretto.

**`app.family_removals`** (specifica, sezione 2)

| Colonna | Tipo e vincoli |
|---|---|
| `family_id` | `uuid not null references app.families (id) on delete cascade` |
| `user_id` | `uuid not null references auth.users (id) on delete cascade` |
| `removed_by` | `uuid references auth.users (id) on delete set null` |
| `removed_at` | `timestamptz not null default clock_timestamp()` |

Indice su `(family_id, user_id, removed_at desc)`. Una rimozione blocca i link della
stessa famiglia con `created_at <= removed_at`. L'uscita volontaria non scrive nulla.
RLS attiva, nessun privilegio diretto.

**`app.account_deletions`**: cancellazioni avviate.

| Colonna | Tipo e vincoli |
|---|---|
| `user_id` | `uuid primary key` (**senza** chiave esterna: la riga sopravvive all'utente) |
| `requested_by` | `uuid` (senza chiave esterna: può essere lo stesso utente) |
| `requested_at` | `timestamptz not null default now()` |
| `attempts` | `int not null default 0` (tentativi falliti della cancellazione in Auth) |
| `last_error` | `text` (solo un codice: `auth_admin_failed`, `auth_admin_key_missing`, `status_<n>`) |
| `last_attempt_at` | `timestamptz` |
| `completed_at` | `timestamptz` |

Nessun dato personale (né email né nome): la riga serve solo a riprendere e a mostrare lo
stato. RLS attiva; lettura solo dalle funzioni. Le righe completate restano
(conservazione minima, nessun dato personale).

### Contatori di versione

Trigger esistenti: `family_members_version` fa crescere la versione della famiglia a ogni
cambio dei membri. Si aggiunge il trigger di versione della famiglia su
`app.family_invitations` (insert e update, con la funzione esistente
`app.touch_family_version()`), perché l'elenco dei link è una lettura della famiglia.
L'eliminazione di una famiglia non incrementa nulla (la riga non c'è più): i client lo
scoprono con `forbidden` o dal profilo (sezione 3, «Dati sul dispositivo»).

### Funzioni per gli inviti alla famiglia

Codici SQLSTATE nuovi, dopo quelli in uso (`P0A01`–`P0A08`):

| Codice | Significato | Errore del contratto |
|---|---|---|
| `P0A09` | ultimo amministratore della famiglia | `last_admin` |
| `P0A10` | unico membro (serve eliminare la famiglia) | `sole_member` |
| `P0A11` | piano di cancellazione cambiato | `conflict` |
| `P0A12` | il proprio account dall'amministrazione | `not_allowed` `{ reason: 'own_account' }` |
| `P0A13` | successore non valido | `invalid` sul campo `successors` (o `successorId`) |
| `P0A14` | persona non membro della famiglia | `not_found` |

Si riusano `P0A01` (invito non disponibile → `invitation_unavailable`), `P0A03` (email
con un account → `not_allowed` `account_exists`), `P0A05` (id in uso → `invalid` `in_use`)
e `42501` (`forbidden`).

- `app.create_family_invitation(p_family_id uuid, p_id uuid, p_token_hash bytea)
  returns app.family_invitations` — `authenticated`. Chi chiama deve essere
  `family_admin` della famiglia (`42501`). Lucchetto consultivo sull'id. Se l'id esiste
  per la stessa famiglia, non revocato, creato da chi chiama: sostituisce solo
  `token_hash` (ripetizione dopo una risposta persa: il nuovo link vale, come in A); se
  l'id esiste in altro modo: `P0A05`. Altrimenti inserisce con `expires_at = now() + 7
  days`.
- `app.revoke_family_invitation(p_family_id uuid, p_id uuid) returns void` —
  `authenticated`, `family_admin` (`42501`); id di un'altra famiglia o inesistente:
  `P0A06` (riuso di A, «invito inesistente» → `not_found`). Già revocato: nessun
  effetto. Imposta `revoked_at`, `revoked_by`, `revoke_reason = 'manual'`.
- `app.family_invitations_view(p_family_id uuid)` — `authenticated`, `family_admin`
  (`42501`). Restituisce i link **usabili**, dal più recente: `id, created_by,
  created_by_name` (nome solo se l'autore è ancora membro, come gli altri autori),
  `created_at, expires_at, accounts_created`.
- `app.family_invitation_by_token(p_token_hash bytea) returns table (family_name text,
  invited_by_name text, accounts_available boolean)` — `anon`. Nessuna riga se il link
  non è usabile. `invited_by_name` è nullo se l'autore non è più membro (non succede: i
  suoi link si revocano, decisione 6). `accounts_available` è falso a tetto raggiunto.
  Nessun altro dato della famiglia.
- `app.claim_family_invitation(p_token_hash bytea, p_email text) returns table (user_id
  uuid, email text)` — `anon`. `select … for update` sull'invito per impronta; non
  usabile: `P0A01`. Email normalizzata. Se esiste già la prenotazione per (invito,
  email): la restituisce (ripetizione), **anche a link scaduto o revocato nel frattempo**
  (stessa regola di A: un invito prenotato si può chiudere). Altrimenti: un account con
  quell'email in `auth.users` → `P0A03`; righe per l'invito ≥ 10 → `P0A01`; un `user_id`
  prenotato altrove per la stessa email (in `app_invitations` o in un altro invito alla
  famiglia, non chiusi) non blocca: vince chi crea l'account per primo, l'altro riceve
  `account_exists` alla creazione. Inserisce la prenotazione con `gen_random_uuid()`.
- `app.complete_family_invitation(p_token_hash bytea, p_user_id uuid) returns uuid` —
  `anon`. Legge l'invito per impronta e la prenotazione di quell'utente (`P0A01` se
  mancano); `P0A01` se `auth.users` non ha l'utente con l'email prenotata. Prende `for
  update` sulla riga della famiglia (`P0A01` se la famiglia non esiste più). Inserisce
  `family_members (role 'member') on conflict do nothing`, imposta
  `profile_preferences.current_family_id` (upsert), segna `completed_at`. Restituisce
  l'id della famiglia. Idempotente. Non controlla le rimozioni: un account nuovo non può
  essere stato rimosso.
- `app.family_invitation_status(p_token_hash bytea) returns table (family_id uuid,
  family_name text, invited_by_name text, already_member boolean)` — `authenticated`.
  Per chi ha già un account: `already_member` vero se chi chiama è membro (anche con il
  link non più usabile); altrimenti nessuna riga se il link non è usabile **o** chi
  chiama è stato rimosso da quella famiglia dopo la creazione del link (stesso esito,
  specifica sezione 7).
- `app.join_family(p_token_hash bytea) returns uuid` — `authenticated`. `for update` sulla
  famiglia; già membro: restituisce l'id senza cambiare nulla (né ruolo né famiglia
  mostrata); link non usabile o rimozione posteriore al link: `P0A01`. Inserisce il
  membro come `member` e imposta la famiglia mostrata.

### Funzioni per membri e ruoli

Tutte `authenticated`. Ognuna prende per prima cosa `select 1 from app.families where id
= p_family_id for update` (famiglia inesistente: `42501`, come oggi per una famiglia
altrui), poi ricontrolla chi chiama sotto il lucchetto.

- `app.set_family_member_role(p_family_id uuid, p_user_id uuid, p_role text) returns
  void` — chi chiama `family_admin` (`42501`); bersaglio non membro: `P0A14`; ruolo non
  valido: `22023`; stesso ruolo: nessun effetto. Retrocessione: se il bersaglio è
  l'ultimo `family_admin`, `P0A09`; altrimenti aggiorna e revoca i link usabili creati
  dal bersaglio in quella famiglia (`creator_demoted`). Si può retrocedere sé stessi se
  c'è un altro amministratore.
- `app.remove_family_member(p_family_id uuid, p_user_id uuid) returns void` — chi chiama
  `family_admin` (`42501`); bersaglio = chi chiama: `22023` (si usa l'uscita); bersaglio
  già fuori: nessun effetto (idempotente). Altrimenti: inserisce `family_removals`,
  revoca i link del bersaglio (`creator_removed`), cancella l'appartenenza. Chi chiama
  resta amministratore, quindi l'ultimo amministratore non è mai in gioco.
- `app.leave_family(p_family_id uuid, p_successor_id uuid) returns void` — chi chiama
  membro (`42501`; già uscito per una ripetizione: `42501`, che il web tratta come
  uscita avvenuta, sezione 3). Unico membro: `P0A10`. Ultimo amministratore con altri
  membri: `p_successor_id` deve essere un altro membro (`P0A13` se manca o non lo è),
  che diventa `family_admin`; per gli altri `p_successor_id` deve essere nullo
  (`P0A13`). Poi revoca i link di chi esce (`creator_left`) e cancella l'appartenenza.
  Nessuna riga in `family_removals`.

### Funzioni per l'eliminazione della famiglia

- `app.family_deletion_view(p_family_id uuid) returns table (name text, member_names
  jsonb, week_count int, can_delete boolean)` — `authenticated`, membro (`42501`).
  `can_delete` è `is_family_admin`.
- `app.delete_family(p_family_id uuid) returns void` — `authenticated`. `for update`
  sulla famiglia, poi `family_admin` (`42501`); poi `delete from app.families`: la
  cascata toglie appartenenze, settimane, pasti, registri, liste, esclusioni,
  impostazioni, link, prenotazioni e rimozioni, job (`weekly_jobs`) e liste temporanee;
  `profile_preferences.current_family_id` diventa nullo. Restano account, voti, altre
  famiglie, ricettario e ruoli globali. Il job settimanale che trovasse la famiglia
  sparita (riga cancellata fra la selezione e la sua transazione) non trova la riga e
  passa oltre (sezione 2, «Job settimanale»).

### Funzioni per la cancellazione dell'account

Il piano di cancellazione è lo stesso per sé e per un altro utente.

- `app.account_deletion_plan(p_user_id uuid) returns jsonb` — `authenticated`. Chi
  chiama è `p_user_id` oppure `app_admin` (`42501`); utente inesistente: `P0A07`.
  Restituisce:
  - `families`: per ogni famiglia dell'utente `{ familyId, name, outcome, candidates }`,
    con `outcome` `stays` (altri membri e un altro amministratore, o l'utente non è
    amministratore), `needs_successor` (unico `family_admin` con altri membri:
    `candidates` sono gli altri membri, `{ userId, displayName }`) o `deleted` (unico
    membro);
  - `lastAppAdmin`: ha `app_admin` e nessun altro lo ha;
  - `openInvitations`: link alla famiglia usabili creati dall'utente più inviti all'app
    `pending` creati dall'utente;
  - `pending`: c'è già una riga `account_deletions` non completata.
- `app.begin_account_deletion(p_user_id uuid, p_successors jsonb, p_deleted_families
  uuid[]) returns void` — `authenticated`. In questo ordine, nella stessa transazione:
  1. `pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`;
  2. **autorizzazione sotto il lucchetto**: `p_user_id = auth.uid()` (nessun ruolo
     globale richiesto) oppure chi chiama è ancora `app_admin` (`42501`); un
     amministratore che indica sé stesso passa dal primo caso solo se chiama come
     utente (il percorso dell'amministrazione rifiuta prima con `P0A12`, sezione 2);
  3. riga `account_deletions` già presente: nessun effetto (la riprende il passo in
     Auth, sezione 4); utente inesistente in `auth.users`: `P0A07`;
  4. ultimo amministratore dell'app: `P0A08`;
  5. `for update` sulle righe di **tutte** le famiglie dell'utente, **in ordine di id**;
  6. ricalcola il piano sotto i lucchetti: l'insieme delle famiglie `deleted` deve
     coincidere con `p_deleted_families` e per ogni famiglia `needs_successor`
     `p_successors[familyId]` deve esserci; insieme diverso: `P0A11`; successore
     mancante o non membro: `P0A13`; chiavi di `p_successors` per famiglie che non ne
     hanno bisogno: ignorate;
  7. nomina i successori (`family_admin`);
  8. revoca i link alla famiglia usabili creati dall'utente (`creator_deleted`) e gli
     inviti all'app `pending` creati dall'utente (`status = 'revoked'`, `revoked_by =
     auth.uid()`);
  9. elimina le famiglie `deleted` (come `delete_family`);
  10. cancella i dati dell'app dell'utente: `ratings`, `user_roles`, `family_members`,
      `app.profiles` (con `profile_preferences` per cascata). Le colonne d'autore restano
      fino alla cancellazione in Auth, che le rende nulle; nel frattempo i nomi non si
      leggono più perché il profilo non c'è;
  11. inserisce `account_deletions (user_id, requested_by)`.
- `app.pending_account_deletions(p_older_than interval) returns table (user_id uuid,
  attempts int)` — `app_job`. Righe non completate con `requested_at` (o
  `last_attempt_at`, se c'è) più vecchio di `p_older_than`.
- `app.record_account_deletion_attempt(p_user_id uuid, p_error text) returns int` —
  `app_job`. `p_error` nullo: segna `completed_at` solo se l'utente non è più in
  `auth.users` (altrimenti solleva `55000`, «oggetto non nello stato atteso»: un errore
  di programmazione, non un esito per l'utente); `p_error` non nullo: `attempts + 1`, `last_error`, `last_attempt_at`.
  Restituisce `attempts`.
- `app.admin_account_deletions() returns table (user_id uuid, requested_at timestamptz,
  attempts int, last_error text)` — `authenticated`, `app_admin` (`42501`): righe non
  completate, per l'elenco e il dettaglio di B.

Le funzioni `app_job` si eseguono con l'identità `job` di `server/src/db.ts`; `coverage_test`
riceve le nuove funzioni negli elenchi di `anon`, `authenticated` e `app_job`.

## 2. Contratto, server e MCP

Aree e file: le operazioni sui membri e sull'eliminazione stanno nell'area `family`
(`contract/src/family/members.ts`, `server/src/family/members.ts`, unite all'indice e al
router dell'area con una riga ciascuno); inviti alla famiglia nell'area nuova
`familyInvitations` (`contract/src/family-invitations/`,
`server/src/family-invitations/`); cancellazione dell'account nell'area nuova `account`
(`contract/src/account/`, `server/src/account/`); cancellazione degli utenti nell'area
`users` di B.

### Pipeline: lavoro dopo il commit

Serve alla cancellazione dell'account: la chiamata ad Auth non può stare dentro la
transazione che ha bloccato le righe che la cascata di Auth deve toccare (si
attenderebbero a vicenda), e la risposta dipende dal suo esito. Il gestore può
restituire, al posto del valore, un **seguito** che il pipeline esegue dopo il commit e
prima di validare l'output:

```ts
// server/src/pipeline.ts
export function afterCommit<T>(next: () => Promise<T>): AfterCommit<T>;
```

Se il gestore restituisce un `AfterCommit`, il pipeline conferma la transazione, poi
chiama `next()` senza connessioni aperte e usa il suo risultato come output; un errore
di `next()` segue la gestione ordinaria degli errori (log e codice), con la transazione
già confermata. Le altre operazioni non cambiano.

### Area `familyInvitations`

```ts
familyInvitationSchema = z.object({
  id: z.uuid(),
  createdBy: z.uuid().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  accountsCreated: z.number().int().min(0).max(FAMILY_INVITATION_ACCOUNT_LIMIT),
});
```

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `list` | `GET /families/{familyId}/invitations` | `familyAdmin`, `reads: ['family']` | lettura | `{ familyId }` | `{ invitations }` | — |
| `create` | `POST /families/{familyId}/invitations` | `familyAdmin`, `creates` | scrittura | `{ familyId, id }` | `{ invitation, url }` | `invalid` (`in_use`) |
| `revoke` | `DELETE /families/{familyId}/invitations/{id}` | `familyAdmin` | scrittura | `{ familyId, id }` | `{ invitations }` | `not_found` |
| `get` | `POST /family-invitations/read` | `public`, `rateLimit: 'read'` | no | `{ token }` | `{ familyName, invitedBy, accountsAvailable }` | `invitation_unavailable`, `rate_limited` |
| `status` | `POST /family-invitations/status` | `user` | lettura | `{ token }` | `{ familyId, familyName, invitedBy, alreadyMember }` | `invitation_unavailable` |
| `accept` | `POST /family-invitations/accept` | `public`, `rateLimit: 'accept'` | no | `{ token, email, displayName, password, locale }` (come A) | `{ email }` | `invitation_unavailable`, `invalid` (email, password), `not_allowed` (`account_exists`), `rate_limited` |

- Token: 32 byte casuali base64url (`newToken`, `hashTokenHex` di A, spostati o
  reimportati da `server/src/app-invitations/tokens.ts` senza cambiarli); link
  `${origin}/invite#<token>`; `url` solo nella risposta di `create`.
- `create` è idempotente sull'`id` (ripetuta restituisce un link nuovo per la stessa
  riga, come A).
- `accept` segue A passo per passo: `claim_family_invitation` in una transazione
  `anonDb` → `createInvitedAccount` di `server/src/accounts/` senza connessioni aperte →
  `complete_family_invitation` in un'altra `anonDb`. Stesse riconciliazioni
  (`email_taken` → `account_exists`, `weak_password` → `invalid` con la prenotazione che
  resta, esiti ambigui riletti per id). Il server non riscrive mai un account esistente.
- Limitatori: si riusano `INVITE_READ_LIMIT` e `INVITE_ACCEPT_LIMIT` (stessa natura delle
  operazioni di A, nessun binding nuovo).
- Strumenti MCP: `familyInvitations_list`, `familyInvitations_create`,
  `familyInvitations_revoke`, `familyInvitations_status`. La descrizione di `create`
  dice che il link si vede solo ora e che chi lo riceve entra come membro.
- `family.join` (sotto) usa lo stesso token.

### Area `family`: membri ed eliminazione

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `join` | `POST /family-invitations/join` | `user` | scrittura | `{ token }` | `profileViewSchema` (nuova famiglia mostrata) | `invitation_unavailable` |
| `setMemberRole` | `PUT /families/{familyId}/members/{userId}/role` | `familyAdmin` | scrittura | `{ familyId, userId, role }` | `familyViewSchema` | `not_found`, `last_admin` |
| `removeMember` | `DELETE /families/{familyId}/members/{userId}` | `familyAdmin` | scrittura | `{ familyId, userId }` | `familyViewSchema` | `invalid` |
| `leave` | `POST /families/{familyId}/leave` | `familyMember` | scrittura | `{ familyId, successorId? }` | `profileViewSchema` | `last_admin`, `sole_member`, `invalid` (`successorId`) |
| `getDeletion` | `GET /families/{familyId}/deletion` | `familyMember`, `reads: ['family']` | lettura | `{ familyId }` | `{ name, memberNames, weekCount, canDelete }` | — |
| `delete` | `DELETE /families/{familyId}` | `familyAdmin`, `webOnly: { path: '/profile/family/delete?family=:familyId' }` | rimando | `{ familyId }` | `profileViewSchema` | — |

- `join` restituisce il profilo, così il web cambia famiglia senza un'altra lettura
  (come `family.create`). Strumento `family_join`: descrizione «chiedi conferma prima di
  far entrare la persona nella famiglia».
- `leave` ripetuta dopo un'uscita riuscita risponde `forbidden` (non è più membro): il
  web, che ha già la risposta o la rilegge, la tratta come uscita avvenuta.
- `delete` via MCP: il pipeline risponde `web_only` con l'URL della pagina prima del
  controllo del ruolo (comportamento esistente), senza eliminare.
- Strumenti: `family_join`, `family_setMemberRole`, `family_removeMember`, `family_leave`,
  `family_getDeletion`, `family_delete` (rimando). Le descrizioni di `removeMember` e di
  `leave` riportano gli effetti (voti fuori dalla media, «ex membro», link revocati).

### Area `account`

```ts
deletionFamilySchema = z.object({
  familyId: z.uuid(),
  name: z.string(),
  outcome: z.enum(['stays', 'needs_successor', 'deleted']),
  candidates: z.array(z.object({ userId: z.uuid(), displayName: z.string() })),
});
deletionPlanSchema = z.object({
  families: z.array(deletionFamilySchema),
  lastAppAdmin: z.boolean(),
  openInvitations: z.number().int().min(0),
  pending: z.boolean(),
});
deletionInputSchema = z.object({
  successors: z.record(z.uuid(), z.uuid()),     // familyId → userId
  deletedFamilies: z.array(z.uuid()),           // ciò che la pagina ha mostrato
});
```

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `getDeletionPlan` | `GET /account/deletion` | `user` | lettura | `{}` | `deletionPlanSchema.extend({ connectedAgents: z.number().int() })` | — |
| `delete` | `POST /account/deletion` | `user` | scrittura (con rimando condizionato) | `deletionInputSchema` | `{ completed: boolean }` | `last_app_admin`, `conflict`, `invalid` (`successors`), `web_only` |

- **Rimando MCP condizionato** (sezione 7): se la chiamata arriva da MCP
  (`context.channel === 'mcp'`) e il piano ricalcolato contiene almeno una famiglia
  `deleted`, il gestore risponde `web_only` con `${origin}/profile/account/delete`
  **prima** di qualsiasi scrittura. Lo strumento non dichiara `webOnly` nei metadati
  (non sempre rimanda); la descrizione lo spiega.
- Flusso del gestore: `begin_account_deletion` nella transazione dell'utente; con
  `afterCommit` la cancellazione in Auth (`deleteAccount`, sotto) e la chiusura con
  l'identità `job`; risposta `{ completed: true }`, oppure `{ completed: false }` se la
  cancellazione in Auth è fallita (la riga resta in attesa e la riprende il Cron
  Trigger). In entrambi i casi l'utente è già fuori: il web chiude la sessione.
- Ripetizione: dopo la prima transazione il token dell'utente non passa più
  `loadSession` (`unauthorized`); il web non ripete.

### Area `users`: cancellazione dall'amministrazione

`userRowSchema` e `userDetailSchema` di B ricevono un campo facoltativo:

```ts
deletion: z.object({ requestedAt: z.iso.datetime(), attempts: z.number().int() }).nullable()
```

valorizzato da `app.admin_account_deletions()` (una lettura in più nel gestore, nessuna
modifica alle funzioni di B). Il nome di un account in attesa è quello di ripiego di
`admin_users` (parte dell'email prima della chiocciola), perché il profilo non c'è più.

| Operazione | Metodo e percorso | Ruolo | MCP | Input | Output | Errori |
|---|---|---|---|---|---|---|
| `getDeletionPlan` | `GET /users/{id}/deletion` | `appAdmin` | lettura | `{ id }` | `deletionPlanSchema.extend({ user: { id, displayName, email } })` | `not_found`, `not_allowed` (`own_account`) |
| `delete` | `POST /users/{id}/deletion` | `appAdmin` | scrittura (rimando condizionato) | `{ id } & deletionInputSchema` | `{ completed: boolean }` | `not_found`, `not_allowed` (`own_account`), `last_app_admin`, `conflict`, `invalid`, `web_only` |

- `own_account`: il server rifiuta `id === auth.uid()` (`P0A12`) prima di chiamare
  `begin_account_deletion`; la pagina del web non arriva a chiamarla (rimando alle
  Preferenze).
- `delete` su un account con la riga già in attesa: salta la prima transazione e ripete
  solo la cancellazione in Auth e la chiusura («Completa la cancellazione»); su un
  account già completato (non più in `auth.users`, riga completata): `{ completed: true
  }` (idempotente).
- Rimando MCP: se il piano contiene una famiglia `deleted`, `web_only` con
  `${origin}/admin/users/<id>/delete`.
- `notAllowedData.reason` riceve `own_account` (`contract/src/errors.ts`, modifica
  minima).
- Strumenti: `users_getDeletionPlan`, `users_delete`; la descrizione chiede conferma
  esplicita all'utente prima di cancellare (decisione 4 di B).

### Modulo `server/src/accounts/`: `deleteAccount`

```ts
export async function deleteAccount(env, userId: string, options?: { fetch? }): Promise<'deleted' | 'absent'>
```

`DELETE /auth/v1/admin/users/{id}` con l'intestazione `apikey` (mai `Bearer`), corpo
vuoto (cancellazione definitiva), tempo massimo 10 s. `200`/`204` → `deleted`; `404`
`user_not_found` → `absent` (già cancellato: successo); ogni altro esito →
`AccountServiceError('auth_admin_failed', status)`; chiave assente →
`auth_admin_key_missing`. Il `send` interno di `createInvitedAccount` diventa una
funzione del modulo con `DELETE` fra i metodi; `createInvitedAccount` non cambia
comportamento. Resta l'unico punto che legge `SUPABASE_SECRET_KEY`.

### Job: ripresa delle cancellazioni (Cron Trigger orario)

Nel ramo `HOURLY_CRON` di `server/src/scheduled.ts`, dopo `runWeeklyJob`, in un `try`
proprio (un errore qui non tocca il job settimanale e viceversa):
`resumeAccountDeletions(env, now)` in `server/src/account/resume.ts`:

1. con l'identità `job`, `app.pending_account_deletions('5 minutes')`: righe non
   completate ferme da almeno 5 minuti (non si sovrappone a una richiesta in corso);
2. per ognuna, fuori da transazioni: `deleteAccount`; poi
   `record_account_deletion_attempt(user, null)` (successo o `absent`) oppure
   `record_account_deletion_attempt(user, code)`;
3. log: `account_deletion_resumed` (info) a ogni successo;
   `account_deletion_failed` (info) a ogni fallimento con `attempts`;
   **dopo 3 tentativi falliti** (cioè almeno tre ore) `account_deletion_overdue` a
   livello `error`, come `weekly_job_overdue`, e di nuovo a ogni tentativo successivo.
   Nessun abbandono: i dati dell'app sono già cancellati e l'account va chiuso; le
   righe si riprovano ogni ora finché non riescono.

Nei log solo id utente, codici e numeri: mai email, nomi, token.

L'amministratore vede le righe in attesa nell'elenco degli utenti («Cancellazione in
corso») e nel dettaglio (avviso con la data di avvio, il numero di tentativi falliti e
«Completa la cancellazione», che chiama `users.delete` e ripete subito il passo in Auth).

### Job settimanale e famiglie eliminate

`runWeeklyJobOn` seleziona i job con un `join` su `families` e lavora una transazione
per famiglia. Una famiglia eliminata dopo la selezione fa fallire l'inserimento delle
settimane per chiave esterna (`23503`) o non trova più il job: il job tratta `23503`
come «famiglia eliminata», scrive `weekly_job_family_gone` (info) e passa alla
successiva, senza `markFailed` (la riga del job è sparita con la famiglia). Modifica
minima in `server/src/menu/job.ts`, con un test.

## 3. Web

Componenti esistenti: `PageHeader`, `StateNotice`, `Loading`, `QueryError`, `BottomSheet`,
`useOnline`, il foglio di condivisione dei link di A (`ShareLinkSheet` o il suo
equivalente in `web/src/features/app-invitations/`, riusato). Componenti nuovi previsti
dal prototipo: `DeletionFamilies` (esito famiglia per famiglia con la scelta del
successore, in `web/src/features/account/`), pulsante rosso per le azioni irreversibili
(stile `danger` già usato da B). Niente aggiornamenti ottimistici: le mutazioni
applicano la risposta del server e marcano da rileggere le viste che ne dipendono
(registro di `web/src/api/mutations.ts`). Tutti i comandi sono disattivati senza
connessione.

### Pagina dell'invito `/invite#<token>` (`web/src/features/family-invitations/InvitePage.tsx`)

Rotta pubblica `/invite`, senza barra di navigazione, con il marchio; token letto dal
frammento (`/^[A-Za-z0-9_-]{43}$/`), come A; risposte superate scartate con lo stesso
contatore di generazione di A. `web/public/_headers` riceve anche `/invite` (oggi copre
solo `/invite/*`); il meta `no-referrer` di `index.html` c'è già.

| Stato | Contenuto |
|---|---|
| Caricamento | `Loading` |
| Non valido (link scaduto, revocato, inesistente, rimozione posteriore) | «Questo invito non vale più» e «Chiedi un link nuovo a un amministratore della famiglia» (stesso testo per tutti i casi, come A) |
| Troppi tentativi | «Troppi tentativi. Riprova tra un minuto» |
| Valido, nessun accesso | «Entra in {famiglia}», «{nome} ti invita a condividere menu e spesa della famiglia» (senza nome: «Hai ricevuto un link d'invito»). Con `accountsAvailable`: modulo di A (Email, Nome, Password, Ripeti la password) con il pulsante «Crea l'account ed entra». Sotto: «Hai già un account? Accedi per entrare» verso `/login?redirect=/invite#…`. Senza `accountsAvailable`: niente modulo, il messaggio dei link non validi per la creazione («Questo invito non vale più per creare un account: chiedi un link nuovo») e il collegamento per accedere |
| Valido, con accesso | da `familyInvitations.status`: «Entra in {famiglia}», «Entri come {nome}», pulsante «Entra nella famiglia» (`family.join`); dopo: la famiglia diventa quella mostrata e la pagina porta a `/menu`. Con un altro account aperto vale «Esci e continua» di A |
| Già membro | «Fai già parte di {famiglia}» con «Apri il menu» |

Dopo «Crea l'account ed entra»: come A, accesso con email e password
(`signInWithPassword`); se riesce, la pagina porta a `/menu` con la famiglia mostrata
(l'ha impostata `complete_family_invitation`); se fallisce, `/login` con l'email scritta e
i testi di A («Il tuo account è pronto: entra con la password che hai scelto la prima
volta»). Errori del modulo come A (`account_exists` con il collegamento all'accesso).

Il ritorno dall'accesso: `LoginPage` accetta già `redirect`; il frammento si conserva
nel valore di `redirect` (`/invite#<token>`), da verificare nel piano con un test.

### Membri e inviti (`/profile/family`, `web/src/routes/profile/MembersPage.tsx`)

Estende la pagina oggi in sola lettura, nella forma del quarto giro:

- **Membri**: righe esistenti (nome, «(tu)», «Dal {data}», ruolo). Per gli amministratori,
  sulle altre persone il pulsante «Azioni per {nome}» apre un `BottomSheet` con il nome
  come titolo e:
  - «Rendi amministratore» (diretto) o «Rendi membro»: diretto se la persona non ha link
    attivi, altrimenti con conferma «I {n} link d'invito creati da {nome} smetteranno di
    valere» e pulsante «Rendi membro». `last_admin`: «Serve almeno un altro
    amministratore: nominane uno prima.»;
  - «Rimuovi dalla famiglia» (rosso) → conferma nello stesso foglio: «I voti di {nome}
    non conteranno più nella media della famiglia e le sue modifiche resteranno come
    «ex membro». Per rientrare servirà un link d'invito nuovo.», più la riga sui link
    attivi se ce ne sono; pulsante «Rimuovi {nome}».
  Sul proprio nome nessun pulsante: per sé si usano «Esci dalla famiglia» e, per un
  amministratore con altri amministratori, «Rendi membro» non serve (esce o resta).
- **Link d'invito** (solo amministratori): «Chi apre il link entra come membro. Ogni link
  vale 7 giorni e si può usare più volte; crea al massimo 10 account nuovi.»; righe dei
  link usabili «Link di {nome}» (o «ex membro»), «Scade {data}», «{n} account creati»
  quando n > 0, pulsante «Revoca» con conferma breve («Revocare il link? Chi lo ha
  ricevuto non potrà più usarlo.»); «Crea un link d'invito» crea il link (`id` nato
  all'apertura del comando) e apre il foglio di condivisione con «Copia» e «Condividi»
  (Web Share con titolo «Entra in {famiglia}») e la nota di A «Il link si vede solo ora:
  se lo perdi, crea un nuovo link».
- **Membri non amministratori**: la riga esistente «Per invitare qualcuno chiedi un link
  a: {nomi}».
- **Esci dalla famiglia** (bordo rosso) → foglio «Esci da {famiglia}» con i tre casi del
  prototipo: unico membro («Sei l'unico membro: per uscire elimina la famiglia» e il
  collegamento alla pagina di eliminazione); ultimo amministratore con altri membri
  (scelta del successore, «Nomina ed esci» disattivato finché manca); altrimenti «Non
  vedrai più il menu e la spesa di questa famiglia. Per rientrare servirà un link
  d'invito.» e «Esci». In tutti i casi con link attivi propri, la riga «I tuoi {n} link
  d'invito smetteranno di valere». Dopo l'uscita: dati della famiglia tolti dal
  dispositivo (sotto) e `/profile` se resta un'altra famiglia, altrimenti `/menu` (che
  mostra «Non fai ancora parte di una famiglia»).

Il numero di link attivi per persona viene dall'elenco dei link (`createdBy`), che solo
gli amministratori leggono; chi non è amministratore non ha link attivi (decisione 6).

### Eliminazione della famiglia (`/profile/family/delete?family=<id>`)

`web/src/features/family-delete/FamilyDeletePage.tsx`; collegamento «Elimina la famiglia»
in fondo alle impostazioni della famiglia, per gli amministratori. Riepilogo del
prototipo da `family.getDeletion`: nome; «Vengono cancellati per tutti i membri
({nomi}):» menu e storico ({n} settimane); note, liste della spesa, impostazioni, «non
proporre più» e link d'invito. «Restano gli account, i voti personali, le altre famiglie
e il ricettario.» Pulsante rosso «Elimina {famiglia}»; per un membro, al suo posto
«Solo un amministratore della famiglia può eliminarla.». Il link è solo navigazione:
nulla si cancella all'apertura; i permessi si ricontrollano alla conferma (server). Dopo:
dati tolti dal dispositivo, `/profile` o `/menu` come per l'uscita. Famiglia non più
accessibile (`forbidden`): lo stato esistente di accesso revocato.

### Cancellazione dell'account (`/profile/account/delete`)

`web/src/features/account/AccountDeletePage.tsx`; collegamento «Cancella l'account» nella
zona di pericolo delle Preferenze. Dati da `account.getDeletionPlan`:

- ultimo amministratore dell'app: `StateNotice` «Non puoi ancora cancellare l'account» /
  «Sei l'unico amministratore dell'app: nomina prima un altro amministratore
  dall'amministrazione.»;
- `DeletionFamilies` «Le tue famiglie»: «La famiglia continua senza di te.»; «Sei l'unico
  amministratore: prima scegli chi lo diventa.» con la scelta; «Sei l'unico membro: la
  famiglia e tutti i suoi dati vengono eliminati.»;
- «Cosa viene cancellato»: «Nome, email, voti e accessi, compresi quelli degli agenti
  collegati.» più, con agenti, «Si scollegano anche i tuoi {n} agenti.» (decisione 11);
  con link: «I tuoi {n} inviti ancora attivi smettono di funzionare.»;
- «Restano le ricette pubblicate e le modifiche ai menu, mostrate come «ex membro».»;
- pulsante rosso «Cancella l'account», disattivato senza connessione, con l'ultimo
  amministratore dell'app o con un successore mancante;
- `conflict`: «Qualcosa è cambiato nelle tue famiglie: controlla di nuovo», con la
  rilettura del piano e le scelte dei successori ancora valide conservate;
- dopo la risposta (`completed` vero o falso): chiusura della sessione con
  cancellazione della copia sul dispositivo (`session.close()` e uscita da Supabase),
  poi `/login` con l'avviso «Account cancellato.».

### Cancellazione di un utente (`/admin/users/$userId/delete`)

`web/src/features/admin/UserDeletePage.tsx` (area di B, file nuovo), stessa struttura in
terza persona da `users.getDeletionPlan`: titolo «Cancella {nome}», email; «È l'unico
amministratore dell'app: nomina prima un altro amministratore.»; «Le sue famiglie» con
«La famiglia continua senza {nome}.», «{nome} è l'unico amministratore: prima scegli chi
lo diventa.», «{nome} è l'unico membro: la famiglia e tutti i suoi dati vengono
eliminati.»; «Si cancellano nome, email, voti e accessi, anche quelli degli agenti
collegati.»; link aperti «I suoi {n} inviti ancora attivi smettono di funzionare.»;
pulsante rosso «Cancella {nome} definitivamente». Dopo: `/admin` (sostituendo la voce
della cronologia) con l'avviso «{nome} è stato cancellato.» (testo senza genere da
fissare nel dizionario: «Utente cancellato: {nome}.»). Per il proprio account
(`own_account`): «Per cancellare il tuo account usa le tue preferenze.» con il
collegamento. Stesso controllo d'accesso di B (`AdminAccessGate`).

Nel **dettaglio** (`UserPage.tsx`) sotto la card «Famiglie»: per gli altri il pulsante
rosso «Cancella l'utente» verso la pagina; per sé la riga «Per cancellare il tuo account
usa le tue preferenze.» con «Account e preferenze». Con `deletion` non nullo: avviso
«Cancellazione in corso dal {data}» (con «{n} tentativi non riusciti» se `attempts > 0`)
e il pulsante «Completa la cancellazione» (`users.delete` con piano vuoto), al posto
degli interruttori dei ruoli. Nell'**elenco** (`UsersSection.tsx`) l'etichetta
«Cancellazione in corso».

### Benvenuto e stato senza famiglia

- `WelcomeCard`: «Invita la famiglia» verso `/profile/family` (solo per chi amministra,
  com'è già la scheda), accanto a «Sistema le impostazioni».
- `FamilyGate` con `status === 'none'`: sotto «Crea la tua famiglia», la riga «Hai un
  link d'invito? Aprilo per entrare nella famiglia di chi te l'ha mandato.».

### Dati sul dispositivo

Un accesso revocato a una famiglia ne toglie subito i dati (specifica, sezione 1). Oggi
il web lo fa al primo `forbidden` (`session.revoke`). Si aggiunge:

- dopo `family.leave`, `family.delete` e la propria rimozione scoperta: `session.revoke(
  familyId)` subito, prima di navigare;
- a ogni profilo letto (`profile.get` o profilo restituito da una mutazione): ogni
  famiglia presente nel profilo precedente e assente nel nuovo è revocata
  (`session.revoke`), così chi è stato rimosso o ha visto eliminare la famiglia da un
  altro perde i dati anche senza aver letto quella famiglia. Il punto è il gestore
  della sessione (`SessionScope.tsx` o `session.ts`), con una modifica minima;
- cancellazione dell'account: `session.close()` (copia persistita e segni cancellati).

### Accesso con un account in cancellazione

`LoginPage` (modifica minima): dopo un accesso con password riuscito, se la prima
lettura del profilo risponde `unauthorized` anche dopo il rinnovo e la sessione viene
chiusa, la pagina mostra «Questo account è stato cancellato.» invece del modulo vuoto
(decisione 13). Il motivo arriva dal gestore della sessione come esito di chiusura
(`ended: 'unauthorized'`), senza leggere nulla di nuovo dal server.

### Modalità finta e testi

- `web/src/api/fake/`: `fakeFamilyInvitations.ts`, operazioni nuove di `family` in
  `family.ts`, `fakeAccount.ts`, cancellazione in `fakeUsers.ts`, sui dati del seed
  (Marco ex membro con un link creato prima della rimozione; un link valido, uno
  scaduto, uno revocato), con gli stessi errori del server; aree in `SERVER_AREAS`.
- Testi nuovi in `web/src/i18n/messages/` (`family.ts`, `account.ts`, `admin.ts`), in
  italiano e inglese britannico, senza genere dove possibile («Sei uscito» del
  prototipo diventa «Non fai più parte di {famiglia}»).

## 4. Cancellazione dell'account: stati parziali e ripresa

| Momento dell'interruzione | Stato | Ripresa |
|---|---|---|
| Durante la prima transazione | rollback: nulla è cambiato | l'utente riprova dalla pagina |
| Dopo il commit, prima della chiamata ad Auth | dati dell'app cancellati, riga in attesa, account Auth presente ma inutilizzabile (`loadSession` rifiuta) | Cron Trigger entro un'ora (righe ferme da 5 minuti), o «Completa la cancellazione» dall'amministrazione |
| Chiamata ad Auth fallita o senza risposta | come sopra, `attempts` incrementato | come sopra; `absent` alla ripresa vale successo |
| Auth ha cancellato, chiusura non scritta | account sparito, riga in attesa | la ripresa riceve `404` → `absent` → chiusura |

Non esiste uno stato con l'account Auth cancellato e i dati dell'app ancora presenti,
perché i dati si cancellano prima; e uno stato con dati cancellati e account
utilizzabile non esiste perché `loadSession` dipende dal profilo. La prima transazione è
completa o assente: nessuna famiglia senza amministratore, nessun successore a metà.

Coerenza con A durante l'attesa: `create_app_invitation` e `claim_*` leggono
`auth.users`, quindi l'email resta occupata (`account_exists`) finché Auth non ha
cancellato; dopo, un nuovo invito per quell'email crea un account nuovo con id nuovo.

## 5. Test

### pgTAP (`supabase/tests/family_management_test.sql`)

- Tabelle nuove con RLS e senza privilegi diretti; funzioni `security definer`, `EXECUTE`
  solo ai ruoli previsti (anche `coverage_test.sql` aggiornato).
- Inviti: creazione solo `family_admin`; idempotenza sull'id e sostituzione
  dell'impronta; revoca; elenco solo dei link usabili, con il nome dell'autore solo da
  membro; `by_token` senza riga per link scaduto o revocato e con `accounts_available`
  falso alla decima prenotazione; `claim` ripetuto per la stessa email (stesso id),
  `account_exists`, undicesima email `P0A01`, prenotazione esistente chiudibile a link
  revocato; `complete` idempotente, membro `member`, famiglia mostrata.
- Rimozione posteriore al link: `status` senza riga e `join` `P0A01` per la persona
  rimossa, mentre il link vale per gli altri; link creato dopo la rimozione: entra.
  Uscita volontaria: il link vale ancora.
- Ruoli: retrocessione dell'ultimo amministratore `P0A09`; autoretrocessione con un
  altro amministratore; revoca dei link alla retrocessione, alla rimozione, all'uscita
  e alla cancellazione con il motivo giusto.
- Uscita: unico membro `P0A10`; ultimo amministratore senza successore `P0A13`, con
  successore promosso; membro semplice con successore indicato `P0A13`.
- Eliminazione: solo `family_admin`; cascata completa (nessuna riga residua in tutte le
  tabelle della famiglia); restano voti, altre famiglie, account.
- Cancellazione: piano (`stays`, `needs_successor` con i candidati, `deleted`,
  `lastAppAdmin`, `openInvitations`); `begin` con insieme diverso `P0A11`, successore
  mancante `P0A13`, ultimo `app_admin` `P0A08`, amministratore retrocesso `42501`;
  effetti (successori, link e inviti all'app revocati, famiglie con un solo membro
  eliminate, voti, ruoli, appartenenze e profilo cancellati, riga in attesa); seconda
  chiamata senza effetti; `record_account_deletion_attempt` che non chiude finché
  l'utente è in `auth.users`.
- Nomi «ex membro»: dopo la rimozione, autore del registro dei pasti, delle esclusioni e
  della spesa senza nome; media dei voti senza il rimosso, voto ancora presente.

### Server

- `server/test/family-invitations.test.ts`: permessi (membro semplice `forbidden` su
  `list`, `create`, `revoke`); `create` restituisce `url` con il token nel frammento;
  `get` pubblico senza dati oltre a nome e chi invita; `accept` con account nuovo (con
  `installFakeAuth`): account creato, membro, famiglia mostrata; ripetizione senza
  doppioni; `weak_password` e riprova; `account_exists`; tetto di 10; link scaduto,
  revocato, dopo una rimozione (`invitation_unavailable` uguale per tutti); `status` e
  `join` per chi ha un account, già membro senza cambiamenti; limitatori
  (`rate_limited`); MCP: `familyInvitations_*` e `family_join` presenti, `get` e `accept`
  assenti.
- `server/test/family-members.test.ts`: `setMemberRole`, `removeMember`, `leave` con
  tutti gli esiti; effetto immediato con lo stesso token (il rimosso riceve `forbidden`
  sulla lettura successiva, web e MCP); voti fuori dalla media dopo la rimozione,
  presenti dopo una ripetizione dell'ingresso; `family_delete` via MCP risponde
  `web_only` con l'URL e la famiglia resta; `family.delete` dal web elimina.
- `server/test/family-locks.test.ts` (modello di `users-locks.test.ts`, con
  `holdTransaction`, `pg_backend_pid()` e attesa accertata su `pg_stat_activity` con
  `wait_event_type = 'Lock'`, qui `wait_event = 'tuple'` o `'transactionid'`):
  1. **due amministratori che escono insieme** (A e B soli amministratori, più un
     membro C): entrambi escono senza successore, perché prima dei lucchetti ognuno vede
     l'altro come amministratore. Rilasciata A, B (ora unico amministratore con C
     membro) riceve `last_admin` e la famiglia ha esattamente un amministratore;
  2. **retrocessione incrociata**: A retrocede B mentre B retrocede A. Rilasciata A, B
     riceve `forbidden` (non è più amministratore) e resta A;
  3. **uscita contro cancellazione dell'account**: A cancella il proprio account (unico
     amministratore, successore B) mentre B esce. Le due operazioni si mettono in fila
     sulla riga della famiglia; in nessun ordine la famiglia resta con membri e senza
     amministratore;
  4. **ingresso contro cancellazione** di una famiglia con un solo membro: C entra con un
     link mentre A cancella l'account indicando la famiglia fra quelle da eliminare. Se
     passa prima l'ingresso, la cancellazione riceve `conflict`; se passa prima la
     cancellazione, l'ingresso riceve `invitation_unavailable`;
  5. isolamento `read committed` verificato come in B.
  La prova senza lucchetto (funzione sostituita a mano, solo in locale) deve far vedere
  l'invariante violata (zero amministratori), come in B.
- `server/test/account-deletion.test.ts` (con `installFakeAuth`, esteso con `DELETE` e
  con i fallimenti a comando): piano; cancellazione completa (riga chiusa, account
  sparito, token già emesso rifiutato su RPC, REST e MCP); `conflict` dopo un ingresso
  nel frattempo; MCP con famiglia da eliminare → `web_only` e nessuna scrittura; MCP
  senza famiglie da eliminare → cancella; Auth che fallisce → `{ completed: false }`,
  riga in attesa, account inutilizzabile; ripresa con `resumeAccountDeletions` (riga
  troppo recente ignorata; `404` → chiusa; tre fallimenti → `account_deletion_overdue`
  nel log); amministrazione: `own_account`, `last_app_admin`, «Completa la
  cancellazione» su una riga in attesa, ripetizione dopo il completamento; `users.list`
  e `users.get` con `deletion`; un invito all'app per l'email in attesa risponde
  `account_exists`.
- `server/test/account-deletion-locks.test.ts`: due amministratori dell'app che
  cancellano ciascuno il proprio account, o l'uno l'altro, nello stesso momento: il
  secondo riceve `last_app_admin` o `forbidden` e resta un amministratore (come B,
  attesa sul lucchetto `advisory`); cancellazione contro `set_user_role` che toglie
  `app_admin` all'altro.
- `server/src/accounts/index.test.ts`: `deleteAccount` (`200`, `204`, `404`, `500`,
  rete, chiave assente, intestazione `apikey` e nessun `Authorization`).
- `server/test/scheduled.test.ts` (o il test esistente del job): il ramo orario chiama
  anche la ripresa, e un errore di una parte non ferma l'altra; famiglia eliminata
  durante il job settimanale (`weekly_job_family_gone`).

### Stack (`server/test/stack/family.stack.test.ts`)

Con Auth, database e pipeline veri (`STACK_*`, come A e B): amministratore crea un link;
una persona nuova lo accetta (account vero), entra con la password e legge il menu;
retrocessione e rimozione con effetto immediato; un'altra persona con un account entra
con `join`; cancellazione dell'account della persona: in Auth non ci sono più sessioni,
identità, consensi OAuth (letti con la connessione di prova), il token già emesso è
rifiutato, il rinnovo con il refresh token fallisce; cancellazione con un agente MCP
autorizzato (consenso creato con il flusso OAuth dello stack, come nelle prove di
collegamento) rifiutato dopo. Eseguito da `scripts/invitations/invite-stack.sh`
(cartella `test/stack/`, già così).

### Web

- Componenti con l'API simulata: pagina dell'invito in tutti gli stati (senza accesso,
  con accesso, già membro, non valido, tetto raggiunto, troppi tentativi, altro account
  aperto), creazione dell'account e ingresso; pagina dei membri (azioni solo per gli
  amministratori, conferme con e senza link attivi, `last_admin`, foglio del link con la
  nota, revoca, uscita nei tre casi); eliminazione della famiglia (amministratore e
  membro); cancellazione dell'account (tre esiti, successore obbligatorio, ultimo
  `app_admin`, agenti, `conflict` con le scelte conservate, chiusura della sessione);
  pagina in terza persona, `own_account`, area di pericolo e «Cancellazione in corso» nel
  dettaglio e nell'elenco; scheda di benvenuto con «Invita la famiglia»; riga degli
  inviti nello stato senza famiglia.
- Dati sul dispositivo: famiglia sparita dal profilo → revocata (query rimosse, segno
  scritto, coda della spesa svuotata); uscita ed eliminazione → revoca prima della
  navigazione; cancellazione dell'account → copia persistita cancellata.
- `LoginPage`: «Questo account è stato cancellato.» dopo un accesso con profilo assente.
- Registro delle mutazioni: invalidazioni delle operazioni nuove.
- **Prova con agent-browser** su `wrangler dev` con lo stack locale (variabili dello
  stack passate esplicitamente, URL di Auth controllato nelle richieste prima di
  accedere: mai la produzione) e in modalità finta, a 1280 e 390 px, in italiano e in
  inglese, con un nome lungo: invito → account → famiglia; ingresso con un account
  esistente; uscita con successore; rimozione e retrocessione con le conferme;
  eliminazione della famiglia; cancellazione dell'account; cancellazione di un utente
  dall'amministrazione; nessuno scorrimento orizzontale.

### Da provare a mano sull'iPhone

- Pagina dell'invito aperta da WhatsApp in Safari e, dopo l'accesso, nella PWA installata
  (il link non apre la PWA: la persona entra in Safari, poi aggiunge l'app alla
  schermata Home; il testo di A lo dice già).
- Foglio di condivisione del link (Web Share) e copia.
- Fogli di conferma con il pulsante rosso; scelta del successore con i pulsanti di
  opzione.
- Cancellazione dell'account nella PWA installata: ritorno alla pagina di accesso con
  l'avviso e nessun dato rimasto.

## 6. Rilascio e collaudo

Lo fa il coordinatore dopo il merge: migrazione `20261016100000_family_management.sql`
in produzione, poi il Worker. Nessun segreto, binding, Cron Trigger o risorsa esterna
nuovi (`SUPABASE_SECRET_KEY` c'è già).

**Collaudo con l'account e la famiglia di prova di A** (li ha tenuti l'utente):

1. con l'account di prova, `/profile/family` della famiglia di prova: crea un link e lo
   apre in un'altra finestra privata (pagina dell'invito, senza accedere), poi lo revoca;
2. se nella famiglia di prova c'è anche Federico: rimozione o uscita con i dialoghi;
3. **eliminazione della famiglia di prova**: dall'account di prova, impostazioni della
   famiglia › «Elimina la famiglia» › «Elimina {famiglia}»;
4. **cancellazione dell'account di prova**: due strade, una da provare per sé e una per
   l'amministrazione: dall'account di prova, Preferenze › «Cancella l'account»; oppure,
   da Federico, Amministrazione dell'app › utente › «Cancella l'utente» › «Cancella
   {nome} definitivamente». Se si salta il passo 3 e l'account è l'unico membro, la
   cancellazione elimina anche la famiglia (e via MCP rimanda alla pagina);
5. controllo: l'utente non compare più nell'elenco (o compare con «Cancellazione in
   corso», da completare); `account_deletions` ha la riga completata.

## 7. Interfaccia

- **Ordine dei lucchetti** (regola per ogni percorso presente e futuro): chi può togliere
  `app_admin` prende prima `pg_advisory_xact_lock(hashtextextended('app_admin_roles',
  0))`; chi tocca i membri o l'esistenza di una famiglia prende `select … for update`
  sulla riga di `app.families`; chi tocca più famiglie le blocca **in ordine di id** e
  **dopo** il lucchetto `app_admin_roles`. I percorsi della famiglia non prendono mai
  `app_admin_roles`. Sotto i lucchetti si ricontrollano chi chiama e le condizioni
  (`read committed`). Dimostrato da `family-locks.test.ts` e
  `account-deletion-locks.test.ts`.
- **Ultimo amministratore della famiglia**: protetto in ogni funzione che toglie un
  `family_admin` o un membro (`set_family_member_role`, `leave_family`,
  `begin_account_deletion`); le scritture dirette su `family_members` restano possibili
  solo dalle politiche esistenti, che il server non usa per questi percorsi (nessuna
  migrazione le restringe: modifiche solo additive). Un'attività futura che tocchi i
  membri usa queste funzioni.
- **`afterCommit` del pipeline**: disponibile per altre operazioni che devono chiamare
  servizi esterni dopo il commit.
- **`deleteAccount`** in `server/src/accounts/`, accanto a `createInvitedAccount`.
- **D (email)**: `familyInvitations.create` potrà spedire il link; l'accettazione resta
  questa, come per A.

## 8. File

**Miei:** `contract/src/family-invitations/`, `contract/src/account/`,
`contract/src/family/members.ts`, `server/src/family-invitations/`,
`server/src/account/` (compreso `resume.ts`), `server/src/family/members.ts`,
`web/src/features/family-invitations/`, `web/src/features/account/`,
`web/src/features/family-delete/`, `web/src/features/admin/UserDeletePage.tsx`,
`web/src/api/fake/fakeFamilyInvitations.ts`, `web/src/api/fake/fakeAccount.ts`, i
dizionari nuovi, la migrazione e il test pgTAP nuovi, i test del server elencati.

**Condivisi, con modifiche minime:** `contract/src/contract.ts`, `contract/src/index.ts`,
`contract/src/family/index.ts` (registrazione di `members.ts`), `contract/src/errors.ts`
(`own_account`), `contract/src/users/index.ts` (`deletion`, operazioni nuove),
`server/src/router.ts`, `server/src/family/router.ts`, `server/src/users/router.ts` e
`db-errors.ts`, `server/src/pipeline.ts` (`afterCommit`), `server/src/accounts/index.ts`
(`deleteAccount`, `send` del modulo), `server/src/scheduled.ts`, `server/src/menu/job.ts`
(`23503`), `server/src/messages.ts`, `server/test/support/fake-auth.ts` (`DELETE`),
`web/src/router.tsx`, `web/public/_headers` (`/invite`),
`web/src/routes/profile/MembersPage.tsx`, `web/src/routes/profile/PreferencesPage.tsx`,
la pagina delle impostazioni della famiglia (collegamento), `web/src/features/admin/UserPage.tsx`
e `UsersSection.tsx`, `web/src/features/family-new/WelcomeCard.tsx`,
`web/src/components/FamilyGate.tsx`, `web/src/auth/LoginPage.tsx`,
`web/src/session/SessionScope.tsx` e/o `session.ts` (revoca delle famiglie sparite,
esito di chiusura), `web/src/api/mutations.ts`, `web/src/api/types.ts` (`SERVER_AREAS`),
`web/src/api/fake/fakeApi.ts`, `family.ts`, `fakeUsers.ts`, `seed.ts`,
`web/src/i18n/messages/*`, `supabase/tests/coverage_test.sql`.

**Tabelle nuove:** `app.family_invitations`, `app.family_invitation_accounts`,
`app.family_removals`, `app.account_deletions`. **Colonne cambiate:** nessuna. **Trigger
nuovo:** versione della famiglia su `app.family_invitations`. **Funzioni nuove:**
`app.create_family_invitation`, `app.revoke_family_invitation`,
`app.family_invitations_view`, `app.family_invitation_by_token`,
`app.claim_family_invitation`, `app.complete_family_invitation`,
`app.family_invitation_status`, `app.join_family`, `app.set_family_member_role`,
`app.remove_family_member`, `app.leave_family`, `app.family_deletion_view`,
`app.delete_family`, `app.account_deletion_plan`, `app.begin_account_deletion`,
`app.pending_account_deletions`, `app.record_account_deletion_attempt`,
`app.admin_account_deletions`.

## Decisioni da riportare nella specifica

**Prodotto:**

- Account nato da un invito alla famiglia: il link crea al più 10 account nuovi, poi
  risponde come un link non valido per la creazione; creazione e ingresso in un solo
  passaggio; email non verificata fino a D, rimedio con la cancellazione
  dall'amministrazione (decisione dell'utente del 16/10; sezione 7, «Prima della
  verifica del dominio di invio» e «Inviti alla famiglia»; Parte 1, «Chi la usa»).
- Link alla famiglia visibile solo alla creazione; elenco con autore, scadenza e account
  creati; scostamento dal prototipo (sezione 7; sezione 14).
- Link creati da una persona revocati quando esce, viene rimossa, perde il ruolo di
  amministratore o cancella l'account, e i dialoghi di conferma lo dicono (scelta di
  prodotto del coordinatore del 16/10; sezione 7, «Inviti alla famiglia»,
  «Rimozione», «Uscita»).
- Cambio di ruolo diretto, con conferma solo per la retrocessione di chi ha link attivi
  (sezione 7; sezione 14).
- Pagina dell'invito alla famiglia `/invite#<token>` (token nel frammento) con i suoi
  stati; ingresso con un account esistente anche via MCP (`family_join`) (sezioni 7 e
  13).
- Bozze e contributi di un curatore cancellato: restano, senza autore; bozze aperte agli
  altri curatori (sezione 7, «Cancellazione dell'account»; sezione 8).
- Numero di agenti collegati solo sulla pagina di cancellazione del proprio account
  (sezione 7; `design/percorsi.md`, sesto giro).
- Account in attesa di cancellazione visibile all'amministratore con «Cancellazione in
  corso» e «Completa la cancellazione»; accesso a un account in attesa con l'avviso
  «Questo account è stato cancellato.» (sezione 7).
- «Invita la famiglia» nella scheda di benvenuto verso la pagina dei membri; riga degli
  inviti nello stato senza famiglia (sezione 7, «Wizard» e «Primo accesso»).
- Dopo l'uscita o l'eliminazione senza altre famiglie si va al Menu con «Non fai ancora
  parte di una famiglia» (il prototipo andava a `/welcome`, che l'app non ha).

**Tecniche:**

- Tabelle `family_invitations` (con `token_hash`, `revoke_reason`, senza `token` in
  chiaro: cambia la riga della sezione 2), `family_invitation_accounts`,
  `family_removals`, `account_deletions`; funzioni elencate nella sezione 8 (sezione 2).
- Ultimo amministratore della famiglia con `for update` sulla riga della famiglia;
  ordine dei lucchetti (`app_admin_roles`, poi famiglie per id) (sezione 7; sezione 2).
- Cancellazione dell'account in tre passi (prima transazione, `DELETE` di Auth dopo il
  commit, chiusura) con ripresa dal Cron Trigger orario dopo 5 minuti, segnalazione dopo
  3 tentativi, nessun abbandono (sezione 7; sezione 4).
- `afterCommit` nel pipeline (sezione 1).
- Revoca degli accessi: cascata della cancellazione definitiva di Auth su sessioni,
  identità, consensi e autorizzazioni OAuth; token rifiutati da `loadSession` (sezioni 1
  e 13).
- Codici SQLSTATE `P0A09`–`P0A14`; `not_allowed` `own_account` (sezione 1).
- Rimando MCP condizionato per `account.delete` e `users.delete`; `family.delete`
  `webOnly` (sezione 13).
- Revoca locale delle famiglie sparite dal profilo, oltre al `forbidden` (sezione 1,
  dati sul dispositivo).
- Job settimanale tollerante a una famiglia eliminata durante l'esecuzione (sezione 4).

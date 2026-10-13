# W9: Inviti all'app e famiglie nuove (ondata 3, attività A)

Creato: 13 ottobre 2026
Stato: spec di dettaglio dopo il brainstorming con il coordinatore (domande 1–6 e sezioni
1–3 del design approvate, messaggi `w9-01`…`w9-04`).
Branch: `ondata3/inviti-app` · Worktree: `.worktrees/inviti`

Subordinata alla specifica principale
(`progetto/superpowers/specs/2026-09-29-app-famiglia-design.md`, sezione 7 nella versione
della PR #44) e al piano generale (`progetto/superpowers/plans/2026-10-11-piano-generale.md`,
«Ordine dell'ondata 3» e «Interfacce decise»).

## Obiettivo

Federico (`app_admin`) crea dall'app un invito all'app per un'email, copia il link e lo
manda a mano (per esempio su WhatsApp). La persona apre il link anche dall'iPhone, scrive
l'email dell'invito, il suo nome e la password; il server crea l'account già confermato e
la pagina la fa entrare subito. Senza famiglie, la persona crea la sua con il wizard
minimo (nome e sistema di misura, fuso dal browser) e trova il menu pronto con la
generazione pigra. Chi ha già una famiglia ne crea un'altra dal Profilo.

Niente email: il DNS di `qunidi.it` non si può modificare (specifica, sezione 7, «Senza
email finché manca il dominio»). Il passaggio al link nell'email (attività D) cambia solo
il modo in cui la persona riceve il link e dimostra di possedere l'email, non il flusso
di accettazione (sezione «Passaggio all'email»).

## Perimetro

Dentro:

1. tabella `app.app_invitations`, funzioni per token e per l'amministrazione, RLS, pgTAP;
2. ruolo `public` nel contratto e nella pipeline, con limiti di frequenza;
3. modulo `server/src/accounts/`, unico lettore della chiave segreta di Supabase Auth;
4. operazioni `appInvitations.create/list/revoke/get/accept` e `family.create`, con gli
   strumenti MCP derivati;
5. web: `/invite/app#<token>`, «Crea la tua famiglia» per chi non ne ha, wizard
   `/family/new`, scheda di benvenuto nel Menu, «Crea un'altra famiglia» nel Profilo,
   `/admin` con la sola sezione «Inviti all'app».

Fuori: email, «password dimenticata» (D); sezioni Utenti e Ripristino di `/admin` (B, poi
E); inviti alla famiglia, rimozione, uscita, ruoli in famiglia, eliminazioni,
cancellazione dell'account e «Invita la famiglia» nella scheda di benvenuto (C). Nessun
segnaposto per questi comandi.

## Decisioni del brainstorming

| # | Decisione | Motivo |
|---|---|---|
| 1 | Il nome si chiede sulla pagina dell'invito, con email e password, e arriva al profilo tramite `user_metadata.display_name` (trigger esistente `app.create_profile_for_new_user`). Nessuna schermata separata di primo accesso, nessuna colonna nuova | Per chi entra da invito l'accettazione è il primo accesso; un passo in meno sull'iPhone. Il nome resta modificabile nelle Preferenze |
| 2 | Operazioni senza utente nel contratto con il ruolo `public`, ammesso solo con `mcp: false`; la pipeline non legge né usa il token, lavora come `anon`; dati solo da funzioni `security definer` per token con `EXECUTE` ad `anon` | Restano dentro il contratto unico (client tipato, zod, errori a codici, OpenAPI); C le riusa per `/invite#<token>` |
| 3 | Nel database solo l'impronta SHA-256 del token; il link si mostra una volta alla creazione (web e MCP); nell'elenco «Nuovo link» per gli inviti in attesa e scaduti | Un invito può dare `app_admin`: un token in chiaro letto dal database, da un log o dall'esportazione notturna in R2 (che copia anche questa tabella) creerebbe un amministratore. **Differenza dal prototipo del sesto giro**, che aveva «Copia il link» nell'elenco |
| 4 | Accettazione in tre passi: prenotazione dell'id, creazione dell'account con id esplicito, chiusura idempotente (sezione «Accettazione») | Ripetibile senza doppioni; nessuna scrittura nello schema `auth` |
| 5 | Limiti di frequenza con il binding `ratelimit` dei Workers, per IP, codice `rate_limited` (429) | Freno al carico su database e Auth (l'API di amministrazione non ha limiti propri) |
| 6 | Scheda di benvenuto legata alla navigazione dal wizard (`/menu?welcome=1`), senza dati salvati | Alla creazione l'unico amministratore è chi crea la famiglia |
| 7 | Token nel frammento: `/invite/app#<token>` invece di `/invite/app/<token>` | Il frammento non arriva mai al server: nessun log (Workers Logs con `observability` attiva registra gli URL delle invocazioni, e la documentazione non chiarisce cosa resta delle richieste agli asset), nessun proxy, mai nell'intestazione `Referer`. Cambia la forma della sezione 7 |
| 8 | Dopo la creazione dell'account la pagina fa entrare con `signInWithPassword`; se l'accesso fallisce lo dice e porta a `/login` con l'email già scritta (l'account esiste, l'invito risulta usato) | Decisione del coordinatore (w9-01) |
| 9 | Scheda dopo la prima generazione con il solo «Sistema le impostazioni»; «Invita la famiglia» arriva con C | Decisione del coordinatore (w9-01) |
| 10 | MCP: `appInvitations_create/list/revoke` (solo `app_admin`) e `family_create` (fuso dichiarato dall'agente, validato); `get` e `accept` solo web | Senza utente non esiste un canale MCP che le chiami (sezione 13) |
| 11 | Testi italiani nuovi senza genere («Hai un invito per Cosa si mangia?») | Coordinatore (w9-04) |

## 1. Database

Una migrazione nuova, solo additiva: `supabase/migrations/20261013100000_app_invitations.sql`.
Le funzioni stanno nello schema `app`, che la Data API di Supabase non espone (in locale
come in produzione solo `public` e `graphql_public`, `supabase/config.toml` `[api]
schemas`): `anon` le raggiunge solo attraverso il Worker, nel ruolo `anon` impostato da
`withDb`. Un test dello stack lo conferma (sezione «Test»).

### Tabella `app.app_invitations`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `uuid` primaria | generato dal client (idempotenza della creazione) |
| `token_hash` | `bytea` not null unique | SHA-256 del token (32 byte), check `octet_length = 32` |
| `email` | `text` not null | normalizzata: check `email = lower(btrim(email))`, non vuota, al più 320 caratteri |
| `roles` | `text[]` not null default `{}` | check con la funzione immutabile `app.app_invitation_roles_valid(roles)`, definita prima della tabella (un `CHECK` non ammette sottoquery): sottoinsieme di `{recipe_curator, app_admin}`, senza doppioni |
| `created_by` | `uuid` → `auth.users` `on delete set null` | |
| `created_at` | `timestamptz` not null default `now()` | |
| `expires_at` | `timestamptz` not null | `created_at + interval '7 days'`, impostato dalla funzione |
| `status` | `text` not null default `pending` | `pending` / `accepted` / `revoked`; «scaduto» si calcola |
| `revoked_at`, `revoked_by` | `timestamptz`, `uuid` → `auth.users` `on delete set null` | |
| `reserved_user_id` | `uuid` | id dell'account prenotato all'accettazione; senza chiave esterna (l'utente non esiste ancora) |
| `reserved_at` | `timestamptz` | |
| `accepted_by` | `uuid` → `auth.users` `on delete set null` | |
| `accepted_at` | `timestamptz` | |

Vincoli: indice univoco parziale `(email) where status = 'pending'`; check di coerenza
(`accepted` ⇒ `accepted_at` e `reserved_user_id` non nulli; `revoked` ⇒ `revoked_at` non
nullo; `pending` ⇒ `accepted_at` e `revoked_at` nulli). Nessun contatore di versione:
l'elenco dell'amministrazione non usa «invariato».

Permessi: RLS attiva; policy `select` per `authenticated` con `app.has_role('app_admin')`;
nessun `insert`, `update` o `delete` diretto per nessun ruolo dell'app. `anon` non ha
privilegi sulla tabella.

### Funzioni

Tutte `security definer`, `set search_path = ''`, nomi qualificati; `EXECUTE` revocato a
PUBLIC e concesso solo al ruolo indicato.

**Scambio con il Worker** (`withDb` lavora con `fetch_types: false`, senza parser né
serializzatore degli array, come già in `server/src/profile/views.ts`): i ruoli entrano
come `jsonb` (array di stringhe, convertito e validato dentro la funzione) ed escono come
`jsonb`; l'impronta del token entra come testo esadecimale, convertita dal server con
`decode(…, 'hex')` nella chiamata. Le firme sotto restano in `bytea` e `jsonb`.

**Scritture serializzate:** `FOR UPDATE` non blocca una riga che non esiste ancora, quindi
le funzioni prendono lucchetti consultivi di transazione
(`pg_advisory_xact_lock(hashtextextended(…, 0))`), **sempre nello stesso ordine**: prima
`app_invitation:id:<id>`, poi `app_invitation:email:<email>`, poi il lucchetto di riga
(`FOR UPDATE`) sulla riga esistente, ricontrollata dopo averlo preso. Lo fanno
`create_app_invitation` (anche nel rinnovo, che blocca la riga esistente e ricontrolla che
sia ancora `pending` prima di sostituire il token), `revoke_app_invitation` e
`complete_app_invitation`; queste due ricavano id ed email dalla riga, prendono i lucchetti e
rileggono la riga con `FOR UPDATE`, controllando di nuovo stato e, per la chiusura, che
l'impronta del token sia ancora quella del link (un rinnovo nel frattempo la invalida).
`claim_app_invitation` blocca solo la riga, che basta perché non crea righe e il rinnovo la
blocca a sua volta. `create_family` prende `family:create:<id>`. Due scritture concorrenti
danno così lo stesso esito di quelle sequenziali: un rinnovo dopo una revoca risponde
`invalid` (id già usato), uno dopo una chiusura `not_allowed`/`account_exists` (la chiusura
richiede l'account, e il controllo dell'email viene prima), una chiusura dopo un rinnovo risponde
`invitation_unavailable`, e nessun link restituito appartiene a un invito già revocato o
chiuso. Errori con `raise exception` e `errcode`
dedicati (classe `P0`, per esempio `P0A01` invito non disponibile), tradotti in codici del
contratto da un piccolo modulo dell'area (`server/src/app-invitations/db-errors.ts`),
senza toccare `server/src/db-errors.ts`.

| Funzione | Ruolo | Comportamento |
|---|---|---|
| `app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles jsonb)` | `authenticated` | Lucchetti su id ed email. Richiede `app.has_role('app_admin')` (altrimenti `forbidden`). Normalizza l'email e valida i ruoli anche qui (sottoinsieme ammesso, senza doppioni). Se in `auth.users` esiste un account con quell'email (confronto in minuscolo) → `account_exists`. Se `p_id` esiste già: stesso autore e ancora `pending` → sostituisce `token_hash` (la ripetizione dà un link nuovo, il vecchio smette di valere); stessa email e ruoli richiesti; altrimenti errore (`invalid` nel contratto). Altrimenti revoca l'eventuale invito `pending` per quell'email (`revoked_by` = chi crea) e inserisce il nuovo con `expires_at = now() + 7 giorni`. Restituisce la riga |
| `app.revoke_app_invitation(p_id uuid)` | `authenticated` | Richiede `app_admin`. Revoca ogni invito `pending` nel database, **anche se già scaduto** (un invito prenotato e scaduto può ancora essere chiuso, quindi deve potersi fermare). A stato assoluto: già revocato → nessun effetto; `accepted` → `not_allowed` (`already_accepted`); inesistente → `not_found` |
| `app.app_invitations_view()` | `authenticated` | Richiede `app_admin`. Elenco con `created_by_name` e `accepted_by_name` dai profili (che `authenticated` legge solo fra co-membri), ruoli come `jsonb`, più recenti prima |
| `app.app_invitation_by_token(p_token_hash bytea)` | `anon` | `valid` se `pending`, non revocato, e non scaduto **oppure** già prenotato (`reserved_user_id` non nullo); altrimenti nessuna riga. Restituisce solo il nome di chi invita (dal profilo, o null) e i ruoli (`jsonb`); **mai l'email** |
| `app.claim_app_invitation(p_token_hash bytea, p_email text)` | `anon` | Blocca la riga (`for update`). Non valida (inesistente, revocata, accettata, scaduta senza prenotazione) → `invitation_unavailable`. Email normalizzata diversa → `email_mismatch`. Esiste in `auth.users` un account con quell'email e id diverso da `reserved_user_id` → `account_exists`. Se `reserved_user_id` è nullo lo fissa (`gen_random_uuid()`, `reserved_at = now()`). Restituisce `reserved_user_id` ed email normalizzata. La scadenza si controlla solo prima della prenotazione |
| `app.complete_app_invitation(p_token_hash bytea, p_user_id uuid)` | `anon` | Blocca la riga. Richiede: non revocata; `reserved_user_id = p_user_id`; in `auth.users` esiste quell'id con l'email dell'invito. Se `accepted` con `accepted_by = p_user_id` → nessun effetto, esito positivo. Altrimenti in una sola istruzione: `status = accepted`, `accepted_by`, `accepted_at`, e `insert` in `app.user_roles` dei ruoli dell'invito con `granted_by = created_by` (`on conflict do nothing`). La scadenza nel frattempo non blocca: conta la prenotazione. Qualunque requisito mancante → `invitation_unavailable` |
| `app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text)` | `authenticated` | Lucchetto sull'id. Utente dal JWT (`auth.uid()`). Se `p_id` esiste: famiglia di cui l'utente è `family_admin` → nessun effetto; altrimenti errore (`invalid` sul campo `id` nel contratto). Altrimenti inserisce `families` (fuso validato dal trigger esistente; il server passa già `Europe/Rome` se il fuso manca o non è valido), `family_members` con ruolo `family_admin`, e imposta `profile_preferences.current_family_id` (upsert). **Non genera settimane**: il menu nasce alla prima lettura con il `prepare` esistente di `menu.getOpening`/`getWeek` (`ensureWeeks`). Il trigger su `family_members` incrementa il contatore della famiglia |

Le funzioni `anon` non si fidano dei parametri del Worker più dello stretto necessario:
il token si confronta solo come impronta, l'id dell'account deve essere quello prenotato e
deve esistere in `auth.users` con l'email dell'invito.

Lettura di `auth.users` (solo `select` su `id` ed `email`, dentro funzioni `security
definer` dell'owner): ammessa; nessuna scrittura nello schema `auth`.

## 2. Contratto e piattaforma

### Ruolo `public`

- `contract/src/op.ts`: `Role` aggiunge `'public'`; `OperationMeta` aggiunge
  `rateLimit?: 'read' | 'accept'`.
- `contract/src/check.ts`: `public` solo con `mcp: false`, senza `reads` né `webOnly`,
  e con `rateLimit`; `rateLimit` solo con `public`. Test in `contract/src/check.test.ts`.
- `contract/src/errors.ts`: codici nuovi `invitation_unavailable` (410) e `rate_limited`
  (429); `not_allowed` aggiunge i motivi `account_exists` e `already_accepted`.
- `server/src/pipeline.ts`: se `meta.role === 'public'`:
  1. limitatore `meta.rateLimit` con chiave `context.clientIp` (da `CF-Connecting-IP`,
     `'unknown'` se manca), prima di ogni accesso al database; superato → `rate_limited`;
  2. nessuna lettura del token, nessun `loadSession`, nessun controllo di ruolo;
  3. **nessuna transazione aperta dalla pipeline**: il contesto `PublicOperationContext`
     (`RequestContext` più `now`, `public: true` e `anonDb(work)`, che apre una
     transazione breve `withDb(..., { kind: 'anon' })` e la chiude) lascia al gestore
     l'apertura delle transazioni. `get` ne apre una sola; `accept` solo quella della
     prenotazione e quella della chiusura, e **nessuna connessione resta occupata durante
     la chiamata ad Auth** (Hyperdrive restituisce la connessione al pool solo a fine
     transazione, e il limite di produzione è 10). Un test verifica l'ordine;
  4. gli handler leggono il contesto con `publicContext(context)`, che verifica il segno
     `public` e fallisce altrimenti. `OperationContext` resta invariato per tutte le altre
     operazioni.
- `server/src/permissions.ts`: `checkRole` ha il caso esplicito `public`, che rifiuta
  (`internal`) se un'operazione pubblica arrivasse per errore al controllo dei ruoli
  autenticati.
- `server/src/app.ts`: `contextFor` aggiunge `clientIp`. Nessun'altra rotta nuova.
- `server/src/env.ts`: `SUPABASE_SECRET_KEY?: string` (segreto del Worker),
  `INVITE_READ_LIMIT: RateLimit`, `INVITE_ACCEPT_LIMIT: RateLimit`.
- `server/wrangler.jsonc`: due binding `ratelimits` (sezione «Limiti di frequenza»).
- `server/test/support/requests.ts`: `testEnv()` con limitatori finti sempre «successo» e
  `SUPABASE_SECRET_KEY` di prova; i test dei limiti ne iniettano uno che rifiuta.

### Area `appInvitations` (nuova: `contract/src/app-invitations/`, `server/src/app-invitations/`)

| Operazione | Ruolo | MCP | Input → output | Errori propri |
|---|---|---|---|---|
| `create` | `appAdmin`, `creates` | sì | `{id, email, roles}` → `{invitation: AppInvitationView, url}` | `not_allowed` (`account_exists`), `invalid` (id già usato con dati diversi) |
| `list` | `appAdmin` | sì, sola lettura | `{}` → `{invitations: AppInvitationView[]}` | — |
| `revoke` | `appAdmin` | sì | `{id}` → `{invitation: AppInvitationView}` | `not_found`, `not_allowed` (`already_accepted`) |
| `get` | `public`, `rateLimit: 'read'` | no | `{token}` → `{invitedBy: string \| null, roles}` | `invitation_unavailable`, `rate_limited` |
| `accept` | `public`, `rateLimit: 'accept'` | no | `{token, email, displayName, password, locale}` → `{email}` | `invitation_unavailable`, `invalid` (campo `email`: `email_mismatch` o un codice di formato di Zod; campo `password`: `password_too_long`, `weak_password`), `not_allowed` (`account_exists`), `rate_limited` |

`AppInvitationView`: `id`, `email`, `roles`, `status` (`pending`/`expired`/`accepted`/
`revoked`, «scaduto» calcolato con `now` della richiesta), `createdBy` e `createdByName`,
`createdAt`, `expiresAt`, `acceptedByName`, `acceptedAt`, `revokedAt`.

Schemi: `email` con `z.email()` e normalizzazione (trim, minuscole) nel contratto;
`roles` array di `recipe_curator | app_admin` senza doppioni; `token` stringa base64url di
43 caratteri; `displayName` come `displayNameSchema` del profilo; `password` da 8
caratteri a 72 **byte** UTF-8 (limite di bcrypt), contati con `TextEncoder`, con un codice
di validazione dedicato (`password_too_long`) che il web traduce (`normalizeError` espone come
codice dell'errore il messaggio di una `refine` del contratto quando è un identificatore, al
posto di `custom`: vale per tutte le `refine` così scritte); `locale` `it-IT` |
`en-GB` (la lingua della pagina, scritta nel profilo).

Token: 32 byte da `crypto.getRandomValues`, base64url senza riempimento; impronta con
`crypto.subtle.digest('SHA-256')`. Link: `new URL('/invite/app', origin)` con
`#<token>`, dove `origin` è `new URL(request.url).origin` (già così in `contextFor`), mai
dalle intestazioni `Origin` o `Host`; vale anche per MCP. Il link si restituisce solo
dalla `create` (anche ripetuta, con token nuovo); nessun'altra operazione lo ricostruisce.

### Area `family`

`family.create`: ruolo `user`, `creates`, MCP sì (non in sola lettura). Input `{id, name,
measurementSystem, timeZone?}`; `name` come `family.rename`; `timeZone` validato come
fuso IANA con `Intl.DateTimeFormat`, altrimenti `Europe/Rome` (sezione 2); gli scostamenti
(`+01:00`, `-0500`), che i runtime recenti accettano ma Postgres non riconosce come nome di
fuso, ripiegano anch'essi su `Europe/Rome`. Output: la
vista del profilo aggiornata (`profileViewSchema`), con la nuova famiglia corrente, così
il web cambia famiglia senza un'altra lettura. Ripetere con lo stesso id non crea nulla e
restituisce la stessa vista.

### Modulo `server/src/accounts/`

`createInvitedAccount(env, {id, email, password, displayName, locale}, {fetch?})` →
`{status: 'created' | 'existing'} | {status: 'email_taken'}`. Unico punto che legge
`env.SUPABASE_SECRET_KEY`. **Non riscrive mai le credenziali né i metadati di un account
esistente** (decisione del coordinatore dopo la revisione, rilievi 1, 5 e 11): niente
`PUT`. Nome, lingua e password restano quelli del primo tentativo riuscito.

1. `POST ${SUPABASE_URL}/auth/v1/admin/users` con intestazione `apikey:
   <SUPABASE_SECRET_KEY>` (la chiave segreta non è un JWT: mai `Authorization: Bearer`)
   e corpo `{id, email, password, email_confirm: true, user_metadata: {display_name,
   locale}}`. 200 → `created`.
2. Ogni altro esito della creazione, compresi 422 `email_exists`, un 5xx, un tempo
   scaduto (`AbortSignal.timeout`, 10 s) e un errore di rete, è **ambiguo**: due creazioni
   simultanee possono superare entrambe il controllo dell'email di Auth, e la seconda può
   fallire sull'unicità dell'id con un errore interno invece di `email_exists` (sorgente di
   Supabase Auth v2.197.0, `internal/api/admin.go`); una creazione riuscita può anche
   rispondere in ritardo. Si riconcilia leggendo `GET /auth/v1/admin/users/{id}` con l'id
   prenotato:
   - utente con quell'id e l'email dell'invito → `existing` (la creazione è avvenuta, in
     questa o in un'altra richiesta), si prosegue con la chiusura;
   - 404 dopo un `email_exists`, oppure utente con quell'id ma un'altra email →
     `email_taken` (`account_exists` nel contratto: l'email appartiene a un altro
     account, creato nel frattempo a mano);
   - 404 dopo un esito non `email_exists` (**account non ancora osservabile**: la creazione
     originale può non essere avvenuta o essere ancora in corso) o lettura fallita →
     `AccountServiceError` (`internal`): la persona riprova dallo stesso link, con lo stesso
     id prenotato; se nel frattempo la creazione originale è diventata visibile, la ripresa
     la trova e chiude (decisione del coordinatore, w9-06).
3. Chiave assente → `AccountServiceError` senza chiamate. Ogni `AccountServiceError`
   diventa `internal` con `requestId` e una riga di log (`auth_admin_failed` con lo stato
   HTTP, oppure `auth_admin_key_missing`).

Mai nei log: password, token, corpi di richiesta e risposta, email. `fetch` iniettabile
per i test, come `server/src/agents/grants.ts`.

### Accettazione

`appInvitations.accept`, nell'ordine:

1. **Limite** `accept` per IP (pipeline).
2. **Prenotazione**: transazione `anon`, `app.claim_app_invitation(hash, email)` →
   `reservedUserId`. Errori: `invitation_unavailable`, `invalid` sul campo `email`,
   `not_allowed`/`account_exists`.
3. **Account**: `createInvitedAccount` con `id = reservedUserId`, senza transazioni né
   connessioni aperte. `email_taken` → `not_allowed`/`account_exists` (un account creato
   nel frattempo a mano).
4. **Chiusura**: transazione `anon`, `app.complete_app_invitation(hash, reservedUserId)`:
   invito `accepted` e ruoli globali nella stessa istruzione.
5. Risposta `{email}`; la SPA entra con `signInWithPassword(email, password)` usando la
   password appena scritta. Se l'accesso fallisce (per esempio perché l'account era già
   stato creato da un tentativo precedente con un'altra password), la pagina dice «Il tuo
   account è pronto: entra con la password che hai scelto la prima volta» e porta a
   `/login` con l'email già scritta. Una password dimenticata la reimposta
   l'amministratore dalla dashboard di Supabase finché non c'è il dominio (attività D).

Concorrenza: due accettazioni dello stesso link prenotano lo stesso id (`claim` blocca la
riga). Se la seconda arriva dopo la chiusura della prima riceve `invitation_unavailable`;
se arriva prima, la sua creazione è riconciliata come `existing` e la sua chiusura è un
no-op. In nessun caso cambia la password, il nome o la lingua dell'account: la finestra di
concorrenza sulle credenziali non esiste.

Fallimenti a metà:

| Si ferma dopo | Stato | Cosa succede ripetendo dallo stesso link |
|---|---|---|
| 2 | invito prenotato, nessun account | stesso id, l'account si crea con i dati del nuovo modulo |
| 3 | account senza ruoli, invito `pending` prenotato | la creazione è riconciliata come `existing`, la chiusura completa; password, nome e lingua restano quelli del primo tentativo (se la password scritta ora è diversa, l'ingresso automatico fallisce e la pagina porta all'accesso). Nel frattempo la persona potrebbe entrare da `/login` senza ruoli: limite accettato |
| 3, poi scadenza | come sopra | lettura e prenotazione valgono ancora (prenotato e non revocato); la chiusura completa |
| 3, poi revoca | account senza ruoli né famiglia, invito revocato | il link non vale più; l'amministratore può revocare anche un invito scaduto ma ancora `pending`, quindi può sempre fermarlo; nuovo invito impossibile (l'email ha un account): caso consegnato a B, «Interfaccia per B e C» |
| 4 | invito `accepted` | il link non vale più (`invitation_unavailable`); la persona entra da `/login` |

### Limiti di frequenza

Binding `ratelimit` dei Workers (stabile dal settembre 2025; documentazione verificata con
Context7 il 13 ottobre 2026): solo configurazione in `server/wrangler.jsonc`, nessuna
libreria, nessun passo nella dashboard.

```jsonc
"ratelimits": [
	{ "name": "INVITE_READ_LIMIT", "namespace_id": "9101", "simple": { "limit": 30, "period": 60 } },
	{ "name": "INVITE_ACCEPT_LIMIT", "namespace_id": "9102", "simple": { "limit": 5, "period": 60 } }
]
```

`namespace_id` è un intero (scritto come stringa) unico nell'account Cloudflare: due
Worker con lo stesso id condividono i contatori. Prima del primo rilascio il coordinatore
verifica che 9101 e 9102 non siano usati da altri Worker dell'account POWA. I contatori
sono per sede di Cloudflare e approssimati: un freno, non una garanzia. Con `wrangler
dev` il binding funziona in locale; nei test in Node è finto.

## 3. Web

Rotte nuove in `web/src/router.tsx`: `/invite/app` sulla radice (pubblica, come `/login`);
`/family/new` e `/admin` nel layout dell'app. `web/public/_headers`:
`/invite/*` → `Referrer-Policy: no-referrer` (si applica alle risposte statiche, quindi
anche al ripiego su `index.html`; verificato con `wrangler dev`). Con il service worker attivo
la navigazione riceve invece la shell dalla cache, senza le intestazioni di `_headers`: per
questo `index.html` porta anche `<meta name="referrer" content="no-referrer">`, che vale per
tutta l'app (nessuna funzione dipende dal referrer).

### Pagina dell'invito `/invite/app#<token>` (`web/src/features/app-invitations/`)

Stessa forma della pagina d'invito del prototipo (sesto giro) e della pagina di accesso:
marchio in alto, colonna stretta, cambio di lingua, «Sei offline» senza connessione. Le
chiamate usano un client pubblico (`createRpcClient` con `getCredentials` che restituisce
`null`), indipendente dalla sessione. Il token si legge da `location.hash` e resta nel
frammento (un ricaricamento funziona).

| Stato | Contenuto |
|---|---|
| Caricamento | `Loading` |
| Valido, nessun accesso | «Hai un invito per Cosa si mangia?»; «Te l'ha mandato {nome}» (senza nome: «Hai ricevuto un link d'invito»); ruoli se presenti («Con questo invito diventi anche: curatore del ricettario»); modulo: Email (aiuto: «Quella a cui è arrivato l'invito»), Nome (aiuto: «Come ti vedranno in famiglia»), Password, Ripeti la password; pulsante «Crea l'account» |
| Valido, con un altro account aperto | «Hai aperto l'app come {nome}. Per usare questo invito esci e torna qui»; pulsante «Esci e continua»: chiusura unica della sessione (`useSignOut`), si resta sulla pagina con il frammento e compare il modulo |
| Non valido | `invitation_unavailable`: «Questo invito non vale più» e «Chiedi un link nuovo a chi ti ha invitato». Stesso testo per scaduto, revocato, usato o inesistente |
| Troppi tentativi | `rate_limited`: «Troppi tentativi. Riprova tra un minuto» e «Riprova», che rilegge il link |

Invio: `accept`, poi `backend.signIn(email, password)`, poi `/family/new` con
sostituzione della cronologia e un avviso se l'invito dava ruoli («Ora sei anche
curatore del ricettario», parametro `granted` del wizard). Il passaggio al wizard avviene
tramite `/login?redirect=/family/new…`: Supabase notifica la sessione nuova dopo che
`signIn` ha risposto, e la guardia della pagina di accesso inoltra al wizard appena l'app la
vede (verificato con agent-browser: la navigazione diretta finiva sul Menu). Errori del modulo: email diversa sul campo («Non è l'email di
questo invito»), email malformata sul campo («Email non valida»); `account_exists`: «Esiste già un account con questa email: entra dalla
pagina di accesso», con il collegamento; password troppo corta, troppo lunga (72 byte:
«Password troppo lunga: al massimo 72 byte, e lettere accentate ed emoji ne usano più di
uno»; anche il codice `password_too_long` del server), diverse. Accesso fallito dopo la
creazione: con credenziali rifiutate (account creato da un tentativo precedente con un'altra
password) «Il tuo account è pronto: entra con la password che hai scelto la prima volta»; per
rete o altro «Il tuo account è pronto, ma l'accesso non è riuscito: controlla la connessione ed
entra con la password che hai appena scelto». In entrambi i casi il pulsante «Vai all'accesso»
verso `/login` con l'email già scritta (`validateLoginSearch` aggiunge `email` facoltativa).

**Validità del tentativo** (come `AuthorizePage`): ogni invio è un tentativo legato alla
pagina, al token del frammento e all'identità (nessuna sessione aperta). Un riferimento
sincrono (`sending`) ammette un solo invio alla volta, anche con due tocchi prima del nuovo
rendering. Il tentativo sorveglia da sé, fino alla gestione della risposta di `signIn`
compresa, la cronologia del router e `backend.onChange`, perché la pagina può essere
rimontata nel frattempo (dal proprio ingresso): qualunque navigazione che lasci
`/invite/app` o cambi il frammento lo chiude **per sempre**, anche se si torna allo stesso
link (quello è un tentativo nuovo); lo chiude anche l'apertura di una sessione di un altro
account (un accesso da un'altra scheda). Dopo la risposta di `accept` è atteso il proprio
ingresso: un evento con l'email dell'invito non chiude il tentativo, uno con un'altra email
sì. Prima di `signIn` valgono anche la generazione della pagina e l'assenza di sessione.
Non si usa la chiusura della sessione «senza utente» di `SessionScope`: dopo «Esci e
continua» Supabase può notificare ancora l'account appena chiuso, e quella sessione restava
chiusa bloccando il modulo (trovato con agent-browser, test di regressione). Per questo gli
eventi di quell'account sono ignorati **solo finché la sua uscita è in corso**: un suo nuovo
accesso dopo la fine dell'uscita chiude il tentativo come ogni altro. Quando arriva la
risposta di `accept` la pagina controlla che il tentativo sia ancora valido, e di nuovo alla
risposta di `signIn`: altrimenti non chiama `signIn`, non naviga e non mostra nulla.
L'account creato resta valido: la persona entra da `/login`.

### Senza famiglia

`FamilyGate` con `state.status === 'none'`: «Non fai ancora parte di una famiglia» e il
pulsante «Crea la tua famiglia» (`/family/new`). Il riferimento agli inviti alla famiglia
lo aggiunge C. Il Ricettario resta com'è.

### Wizard `/family/new` (`web/src/features/family-new/`)

Come il prototipo (quarto giro), con `PageHeader`: nome della famiglia; sistema di misura
(metrico; `uk_imperial` di default se la lingua è `en-GB`); nota «Il resto si sistema
dalle impostazioni»; pulsante «Crea la famiglia» (disattivato offline o con nome vuoto).
Fuso da `Intl.DateTimeFormat().resolvedOptions().timeZone`. L'`id` si genera all'apertura
della pagina, così un doppio tocco o una ripetizione non creano due famiglie. All'esito:
la vista del profilo restituita entra nella cache, la famiglia mostrata è quella nuova,
poi `/menu?welcome=1` con sostituzione. Indietro: al Profilo se si hanno altre famiglie,
altrimenti al Menu (che mostra «Crea la tua famiglia»).

### Scheda di benvenuto nel Menu

Con `welcome=1` (in `validateMenuSearch`), per un `family_admin`, solo quando la settimana
è caricata (non durante la generazione pigra): «Il primo menu è pronto», «Sistema le
impostazioni» (verso `/profile/family/settings`) e la chiusura. Entrambe tolgono il
parametro con navigazione `replace`, così il tasto indietro non la ripropone. Nessun dato
salvato.

Nella stessa scheda, **solo su iOS fuori dalla modalità standalone** (Safari:
`navigator.standalone === false` o `display-mode: standalone` assente su un dispositivo
iOS), una nota: «Per usarla dalla schermata Home: Condividi › Aggiungi alla schermata
Home, poi entra con email e password». Chi apre il link da WhatsApp è in Safari, e la
sessione resta lì (la PWA installata non la condivide). Nessun componente nuovo: una riga
di testo nella scheda.

### Profilo

Nella sezione delle famiglie, «Crea un'altra famiglia» verso `/family/new`. In Account,
«Amministrazione dell'app» verso `/admin`, solo se `profile.user.globalRoles` contiene
`app_admin`. Nessun altro comando dell'ondata 3.

### `/admin` (`web/src/features/admin/`)

Nel layout dell'app; nella barra in basso resta attivo Profilo. Senza `app_admin`:
«Non hai accesso a questa pagina» e il ritorno al Profilo; il server rifiuta comunque
(`forbidden`). Intestazione «Amministrazione dell'app», sola sezione «Inviti all'app»:

- «Nuovo invito» apre un foglio (`BottomSheet`): Email, caselle «Curatore del ricettario»
  e «Amministratore dell'app», «Crea il link». Dopo la creazione il foglio mostra il link
  con `CopyField` (importato da `features/agents` così com'è) e «Condividi» (Web Share API, se presente), più la nota «Il link si vede solo
  ora: se lo perdi, crea un nuovo link». `account_exists`: «Questa email ha già un
  account» (con B diventerà un collegamento all'utente). Un riferimento sincrono blocca il
  doppio invio. Un ritentativo con la stessa email (normalizzata) e gli stessi ruoli riusa
  l'id (la prima scrittura può essere avvenuta con la risposta persa); email o ruoli diversi
  sono un invito nuovo con un id nuovo, anche nello stesso foglio. Il foglio mostra il
  link solo se la risposta appartiene al foglio ancora aperto e la sessione è la stessa.
  L'elenco si rilegge comunque, anche per le risposte superate.
- Elenco: email, ruoli come etichette («nessun ruolo» se vuoto), stato con data («Scade
  il…», «Scaduto il…», «Accettato da {nome} il…», «Revocato il…»), autore.
- Azioni: «Nuovo link» e «Revoca» (con conferma) per gli inviti in attesa **e per quelli
  scaduti**, che nel database sono ancora `pending` e, se prenotati, possono ancora essere
  chiusi: l'amministratore deve poterli fermare. «Nuovo link» fa una nuova `create` con
  stessa email e ruoli e id nuovo (sostituisce quello in attesa). Ogni conferma di revoca
  parte senza l'errore di una revoca precedente. Offline i comandi sono
  disattivati.

Query: `['appInvitations', 'list', {}]`, non versionata. **Mutazioni nel registro
`INVALIDATIONS` di `web/src/api/mutations.ts`** (le chiamate passano da
`useAreaMutation`/`runAreaMutation`, che oggi accettano solo i nomi del registro):

- `family.create`: destinazione `profile` (la risposta è la vista del profilo, scritta
  nella sua chiave come `profile.setCurrentFamily`), nessun'altra lettura scaduta;
- `appInvitations.create` e `appInvitations.revoke`: destinazione nuova `appInvitations`
  che non scrive la risposta nella cache ma invalida `['appInvitations']`. L'esito è
  `applied` solo se la sessione che ha inviato è ancora aperta (`sessionOpen()`); il
  cambio di lingua non conta, perché il link non dipende dalla lingua. Il foglio mostra il
  link solo con `applied`: una risposta arrivata dopo l'uscita o un cambio d'utente non
  mostra nulla. Test su risposta tardiva dopo l'uscita, cambio di lingua durante la
  richiesta e due creazioni in fila.

### Modalità finta

Senza variabili Supabase l'app parte con l'API finta (`web/src/api/fake/`): aggiungo le
operazioni nuove con dati minimi (un invito valido demo, `family.create`), così le pagine
si provano anche senza stack.

### Testi

Dizionari nuovi `web/src/i18n/messages/invitations.ts`, `admin.ts`, `onboarding.ts`
(italiano ed inglese britannico), registrati in `messages/index.ts`; errori nuovi in
`errors.ts`. Testi italiani senza genere.

## 4. Test

**pgTAP** (`supabase/tests/app_invitations_test.sql`, `create_family_test.sql`):

- RLS: chi non è `app_admin` non legge righe; nessun ruolo dell'app scrive la tabella
  direttamente; `anon` esegue solo le tre funzioni per token, `authenticated` non le
  esegue.
- Tutte le letture fatte nel ruolo `anon` usano solo le funzioni per token; i valori di
  confronto si salvano con `set_config` prima di cambiare ruolo (nessun privilegio in
  più per i test).
- `create_app_invitation`: non `app_admin`, ruoli non ammessi o doppi, email con account
  (anche con maiuscole diverse), sostituzione dell'invito in attesa, ripetizione con lo
  stesso id (token nuovo, nessun doppione), id di un altro autore.
- `revoke_app_invitation`: ripetuta, su accettato, inesistente, **su un invito scaduto ma ancora `pending`**, poi chiusura rifiutata.
- `app_invitation_by_token`: valido, scaduto, prenotato e scaduto, revocato, accettato;
  nessuna email nell'uscita.
- `claim_app_invitation`: email diversa, prenotazione ripetuta con lo stesso id, scadenza
  prima e dopo la prenotazione, account esistente.
- `complete_app_invitation`: id diverso da quello prenotato, utente inesistente o con
  altra email, revocato dopo la prenotazione, scaduto dopo la prenotazione (completa),
  ripetuta, ruoli inseriti con `granted_by`.
- `create_family`: righe di famiglia, amministratore e famiglia corrente; idempotenza;
  id di una famiglia altrui; fuso non valido; contatore di versione; nessuna settimana.

**Server** (Vitest, database locale, Auth finta con `fetch` iniettato):

- `createInvitedAccount`: creato; esiti ambigui (`email_exists`, 5xx, tempo scaduto,
  errore di rete) riconciliati con la lettura dell'id prenotato (`existing`,
  `email_taken` o `internal`); **mai un `PUT`**; chiave assente; nei log nessun campo
  sensibile.
- Concorrenza deterministica con barriere nell'Auth finta: due accettazioni dello stesso
  link con password e nomi diversi, la seconda sospesa fino a dopo la chiusura della
  prima e, in un secondo caso, fino a dopo la sola creazione: un solo account, password,
  nome e lingua del primo tentativo (verificati con `profile.get` e con l'accesso);
  revoca fra la creazione e la chiusura; creazione Auth che risponde 500 dopo aver creato
  l'utente (riconciliata come `existing`).
- Creazioni concorrenti: due `appInvitations.create` con lo stesso id e due con id diversi
  e la stessa email (un solo invito in attesa, nessun errore); due `family.create` con lo
  stesso id (una famiglia).
- Connessioni: durante la chiamata ad Auth di `accept` nessuna transazione di `app_server`
  è aperta (`pg_stat_activity` letto da una connessione amministrativa del test nel
  momento della chiamata; un controllo di riprova con una transazione esterna tenuta
  aperta deve rilevarla).
- Rinnovo concorrente, deterministico (una transazione tenuta aperta su una connessione del
  test): rinnovo contro revoca e contro chiusura, in entrambi gli ordini.
- Ruoli attraverso il vero `withDb`: inviti con `[]`, un ruolo e due ruoli, in creazione,
  elenco, lettura pubblica e assegnazione.
- Operazioni: invito valido, scaduto, revocato, usato, inesistente (stesso codice), email
  diversa, email con account esistente (alla creazione e all'accettazione), non
  `app_admin` su `create/list/revoke`, accettazione ripetuta dopo ogni passo fallito
  (tabella sopra), ruoli assegnati, `rate_limited` con limitatore che rifiuta, token
  ignorato sulle operazioni `public` (anche non valido), password di 72 byte e di 73.
- `family.create`: creazione, ripetizione, MCP con fuso dell'agente e fuso non valido;
  prima lettura del menu che genera la settimana.
- Contratto: regole del ruolo `public` in `check.ts`; strumenti MCP presenti per
  `create/list/revoke` e `family_create`, assenti per `get/accept`.

**Web** (Vitest con jsdom): pagina dell'invito in tutti gli stati, «Esci e continua»,
accesso fallito dopo la creazione, wizard con id stabile, scheda di benvenuto (solo con
la settimana caricata, tolta con `replace`, nota solo su iOS non standalone), Profilo con
e senza `app_admin`, `/admin` (creazione, link mostrato una volta, «Nuovo link»,
revoca, `account_exists`).

**Stack locale con le iscrizioni spente** (decisione del coordinatore, rilievo 10): lo stack
comune (`supabase/config.toml`) ha `[auth] enable_signup = false`, come la produzione.
`[auth.email] enable_signup` resta `true`: nella CLI spegne il provider email intero
(l'accesso con password risponde `email_provider_disabled`), mentre «Allow new users to sign
up» della produzione corrisponde al solo `[auth]`. Le persone di
prova si creano con l'API di amministrazione e la chiave segreta locale (`SECRET_KEY` di
`supabase status -o env`), con modifiche minime e dichiarate a: `web/src/test/stack.ts`
(`person()`), `scripts/oauth/agents-e2e.mjs` (prova del cambio di password),
`scripts/password/password-stack.sh` e `scripts/oauth/agents-e2e.sh` (passano la chiave).

`scripts/invitations/invite-stack.sh` (in CI dopo le prove della password e di OAuth)
esegue con le variabili `STACK_*` i test dello stack del server, che stanno nella
configurazione normale di Vitest e si saltano senza quelle variabili (come quelli del
web), quindi non vengono esclusi dal filtro:

- impostazioni di Auth con `disable_signup: true`;
- **percorso completo** attraverso contratto e pipeline veri (`createApp` con il router
  dell'app, chiavi JWKS dello stack, Auth reale): l'amministratore (creato con l'API di
  amministrazione e reso `app_admin` via SQL) entra con la password e crea un invito con il
  ruolo di curatore; un client senza token legge l'invito e lo accetta; la persona entra
  con `/token?grant_type=password`; i ruoli finali sono quelli dell'invito; `family.create`
  crea la famiglia; `menu.getOpening` genera la settimana;
- **la prima creazione prevale**, contro Auth reale, in modo controllato: l'id viene
  prenotato con `claim` e l'account creato direttamente con l'API di amministrazione (password,
  nome e lingua «del primo tentativo»), come una prima accettazione interrotta prima della
  chiusura; poi un'accettazione dal Worker con un'altra password, un altro nome e l'altra
  lingua riesce e chiude, la password iniziale funziona, la seconda no, `profile.get` mostra
  nome e lingua iniziali;
- **ripresa dopo `internal`**: la prima `POST` di creazione è intercettata e risponde 500
  senza raggiungere Auth, la lettura dell'id va ad Auth reale e risponde 404 (account non
  ancora osservabile) → `internal`; l'account con l'id prenotato compare poi (creato con
  l'API di amministrazione, come una creazione arrivata in ritardo) e la ripetizione dallo
  stesso link lo trova, chiude e assegna i ruoli;
- due accettazioni concorrenti dal Worker: un solo account;
- rifiuto della Data API su `app` (RPC `app_invitation_by_token` con la chiave
  pubblicabile e `Content-Profile: app`).

**Interfaccia** con la skill agent-browser su `wrangler dev` e stack locale, anche a
larghezza da telefono (390 px): percorso completo, `/admin`, intestazione
`Referrer-Policy` su `/invite/app`.

**Provato con agent-browser** (13 ottobre 2026, `wrangler dev` sullo stack locale con iscrizioni
spente, 1280 e 390 px): `/admin` (creazione con ruolo, link mostrato una volta, elenco, Profilo
attivo nella barra), link aperto con l'amministratore collegato, «Esci e continua», cambio di
lingua, email diversa sul campo, creazione e ingresso, wizard (en-GB con misure britanniche),
menu generato con la scheda, chiusura senza ritorno col tasto indietro, Profilo della persona
nuova (famiglia corrente, «Crea un'altra famiglia», nessuna amministrazione), ruolo di curatore
nel database, link usato «non vale più», `Referrer-Policy: no-referrer` su `/invite/app`,
nessun token, password o email nei log di `wrangler dev`.

**Da provare a mano sull'iPhone** (dopo il rilascio, dal coordinatore con l'utente):
link aperto da WhatsApp in Safari (il frammento deve arrivare intero); modulo con la
tastiera dell'iPhone (email senza maiuscola automatica, suggerimento e salvataggio della
password di iOS con `new-password`); «Condividi» del link dal foglio di `/admin` (Web Share);
ingresso e wizard; fuso del telefono nella famiglia nuova; nota della schermata Home visibile
in Safari e assente nella PWA installata; aggiunta alla schermata Home e accesso nella PWA
con email e password; menu pronto.

## 5. Rilascio

Non lo faccio io: lo fa il coordinatore dopo il merge. Passi in più rispetto a un rilascio
normale:

1. **Chiave segreta di Supabase Auth.** L'utente crea in Supabase (Settings › API keys ›
   Secret keys) una chiave dedicata, per esempio `worker-invitations`, revocabile da sola,
   poi da `server/` esegue `npx wrangler secret put SUPABASE_SECRET_KEY` e incolla il
   valore. Il valore non passa mai in conversazione né nei file. Senza il segreto il resto
   dell'app funziona e l'accettazione risponde `internal` (log `auth_admin_key_missing`).
2. **Migrazione** `20261013100000_app_invitations.sql` con lo strumento della messa in
   produzione, prima del deploy del Worker (solo aggiunte: la versione precedente del
   Worker continua a funzionare).
3. **`namespace_id` dei limitatori** liberi nell'account (sopra).
4. Iscrizioni libere spente: nessun cambiamento, il controllo di `npm run release` resta.
5. Le impostazioni di Supabase in produzione non si toccano.

## 6. Passaggio all'email (attività D)

Quando il dominio è verificato, `create` potrà anche spedire il link: il flusso di
accettazione resta questo, perché la pagina chiede già email e password e il server crea
l'account. L'email aggiunge solo una prova del possesso della casella; se D vorrà il link
di Supabase per scegliere la password, `createInvitedAccount` si estende con una
variante senza password, e `claim`/`complete` restano uguali.

## 7. Interfaccia per B e C

Ciò che le attività successive riusano, da registrare in «Interfacce decise».

**Per B (amministrazione utenti e ruoli):**

- Rotta `/admin` in `web/src/features/admin/AdminPage.tsx` con le sezioni come componenti
  in sequenza; B aggiunge la sezione Utenti sopra «Inviti all'app». Il controllo nel web
  è `hasAppAdmin(profile)` (`web/src/features/admin/access.ts`); sul server il ruolo
  `appAdmin` del contratto (già in `server/src/permissions.ts`).
- Voce «Amministrazione dell'app» nel Profilo, già condizionata ad `app_admin`.
- Caso consegnato: un account nato da un invito revocato dopo la prenotazione resta
  senza ruoli né famiglia; lo si gestisce dall'elenco degli utenti.
- `account_exists` alla creazione di un invito: B lo trasforma in un collegamento
  all'utente.

**Per C (gestione della famiglia):**

- Ruolo `public` e limitatori: un'operazione pubblica dichiara `role: 'public'`,
  `mcp: false`, `rateLimit`; l'handler usa `publicContext(context)` e apre le sue
  transazioni brevi con `anonDb` (la pipeline non ne apre); i dati passano solo
  da funzioni `security definer` per impronta del token con `EXECUTE` ad `anon`. C può
  aggiungere un binding `ratelimit` proprio o riusare `INVITE_READ_LIMIT`/
  `INVITE_ACCEPT_LIMIT`.
- Token: 32 byte casuali base64url, impronta SHA-256 nel database, link con il token nel
  frammento (`/invite#<token>` consigliato), `Referrer-Policy: no-referrer` su
  `/invite/*` già impostata.
- `createInvitedAccount(env, {id, email, password, displayName, locale})` di
  `server/src/accounts/`: l'unico che usa la chiave segreta; con un id prenotato riconcilia ogni esito ambiguo leggendo l'utente e non riscrive mai un account esistente. Lo
  schema prenotazione → creazione → chiusura si ripete con funzioni proprie di C.
- `family.create` e `app.create_family`; il wizard `/family/new`; la scheda di benvenuto,
  dove C aggiunge «Invita la famiglia».
- Codici `invitation_unavailable` e `rate_limited` e i loro testi nel web.

## 8. File

**Miei:** `contract/src/app-invitations/`, `server/src/app-invitations/`,
`server/src/accounts/`, `web/src/features/app-invitations/`,
`web/src/features/admin/`, `web/src/features/family-new/`, i dizionari nuovi, la
migrazione e i test pgTAP nuovi, `scripts/invitations/`.

**Condivisi, con modifiche minime:** `contract/src/op.ts`, `contract/src/check.ts`
(e test), `contract/src/errors.ts`, `contract/src/contract.ts`,
`contract/src/family/index.ts`, `contract/src/index.ts`, `server/src/pipeline.ts`,
`server/src/app.ts` (`clientIp`), `server/src/env.ts`, `server/src/router.ts`,
`server/src/family/router.ts`, `server/wrangler.jsonc`,
`server/src/errors.ts` (`AccountServiceError` come `internal`), `server/src/messages.ts`,
`server/test/support/requests.ts`, `server/test/support/context.ts`,
`server/test/support/test-contract.ts`, `web/src/router.tsx`, `web/src/routes/search.ts`,
`web/src/auth/LoginPage.tsx` (email iniziale), `web/src/session/SessionScope.tsx`
(`useOptionalSignOut`, se serve), `web/src/components/FamilyGate.tsx`,
`web/src/components/StateNotice.tsx` (azione facoltativa, se serve),
`web/src/components/BottomNav.tsx` (Profilo attivo su `/admin`, se serve),
`web/src/routes/MenuPage.tsx`, `web/src/routes/ProfilePage.tsx`,
`web/src/api/types.ts`, `web/src/api/clients.ts`, `web/src/api/errors.ts`,
`web/src/i18n/messages/index.ts`, `errors.ts` e `family.ts`, `web/src/api/fake/`
(`fakeApi.ts`, `family.ts`), `web/public/_headers`,
`.github/workflows/ci.yml` (passo dello stack degli inviti), `server/src/permissions.ts`
(caso `public`), `web/src/api/mutations.ts` (registro e destinazione `appInvitations`).
Approvati dal coordinatore per le iscrizioni spente in locale: `supabase/config.toml`,
`web/src/test/stack.ts`, `scripts/oauth/agents-e2e.mjs`,
`scripts/password/password-stack.sh`, `scripts/oauth/agents-e2e.sh`.

**Tabelle e colonne:** nuova `app.app_invitations`; nessuna colonna cambiata altrove.
Funzioni nuove: quelle della sezione 1.

## Decisioni da riportare nella specifica

**Prodotto:**

- Pagina dell'invito all'app: email, nome e password in un solo modulo; il nome dato lì è
  il primo accesso (sezione 7, «Primo accesso»; Parte 1, «Chi la usa»).
- Link d'invito con il token nel frammento, `/invite/app#<token>` (sezione 7, «Inviti
  all'app» e «Senza email finché manca il dominio»; sezione 14).
- Link visibile solo alla creazione, «Nuovo link» nell'elenco; differenza dal sesto giro
  (sezione 7, «Amministrazione globale»; `design/percorsi.md`).
- Messaggio unico per invito scaduto, revocato, usato o inesistente (sezione 7).
- Scheda di benvenuto con il solo «Sistema le impostazioni» e la nota della schermata
  Home su iOS in Safari (sezione 7, «Wizard della famiglia nuova»).
- Senza famiglia: «Crea la tua famiglia» in Menu e Spesa (sezione 7, «Primo accesso»).

**Tecniche:**

- Ruolo `public` nel contratto con `mcp: false` e `rateLimit` obbligatorio, pipeline in
  `anon` senza token (sezione 1, «Contratto delle operazioni»; sezione 13).
- Codici `invitation_unavailable` (410) e `rate_limited` (429); motivi `account_exists`,
  `already_accepted` (sezione 1, «Errori a codici»).
- `app_invitations` con impronta del token, prenotazione (`reserved_user_id`) e funzioni
  per token (sezione 2).
- Account creato dal Worker con `POST /auth/v1/admin/users` (`id` esplicito,
  `email_confirm: true`), chiave segreta dedicata `SUPABASE_SECRET_KEY` letta solo da
  `server/src/accounts/` (sezioni 1, 7, 15: chiude il punto aperto «API di Supabase per
  creare l'utente»).
- Limiti di frequenza con il binding `ratelimit` dei Workers (sezione 7, «Limiti di
  frequenza»).
- `family.create` con `app.create_family`, senza generazione nella funzione (sezioni 2, 4,
  13).
- Iscrizioni spente anche nello stack locale; persone di prova create con l'API di
  amministrazione (sezione 7, «Iscrizioni libere spente»; sezione 9).
- Il server non riscrive mai le credenziali di un account esistente: un'accettazione
  ripresa conserva password, nome e lingua del primo tentativo riuscito (sezione 7).
- Operazioni `public` senza transazione della pipeline: nessuna connessione occupata
  durante le chiamate ad Auth (sezione 1).
- Codice di validazione delle `refine` del contratto: il messaggio, se è un identificatore,
  al posto di `custom` (sezione 1, «Errori»).
- `Referrer-Policy: no-referrer` anche nell'HTML della shell, perché il service worker la
  serve dalla cache senza le intestazioni di `_headers` (sezioni 7 e 14).
- Fusi a scostamento (`+01:00`) trattati come non validi: ripiego su `Europe/Rome`
  (sezione 2).

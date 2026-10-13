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
| `roles` | `text[]` not null default `{}` | check: sottoinsieme di `{recipe_curator, app_admin}`, senza doppioni |
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
PUBLIC e concesso solo al ruolo indicato. Errori con `raise exception` e `errcode`
dedicati (classe `P0`, per esempio `P0A01` invito non disponibile), tradotti in codici del
contratto da un piccolo modulo dell'area (`server/src/app-invitations/db-errors.ts`),
senza toccare `server/src/db-errors.ts`.

| Funzione | Ruolo | Comportamento |
|---|---|---|
| `app.create_app_invitation(p_id uuid, p_token_hash bytea, p_email text, p_roles text[])` | `authenticated` | Richiede `app.has_role('app_admin')` (altrimenti `forbidden`). Normalizza l'email e valida i ruoli anche qui (sottoinsieme ammesso, senza doppioni). Se in `auth.users` esiste un account con quell'email (confronto in minuscolo) → `account_exists`. Se `p_id` esiste già: stesso autore e ancora `pending` → sostituisce `token_hash` (la ripetizione dà un link nuovo, il vecchio smette di valere); stessa email e ruoli richiesti; altrimenti errore (`invalid` nel contratto). Altrimenti revoca l'eventuale invito `pending` per quell'email (`revoked_by` = chi crea) e inserisce il nuovo con `expires_at = now() + 7 giorni`. Restituisce la riga |
| `app.revoke_app_invitation(p_id uuid)` | `authenticated` | Richiede `app_admin`. A stato assoluto: già revocato → nessun effetto; `accepted` → `not_allowed` (`already_accepted`); inesistente → `not_found` |
| `app.app_invitations_view()` | `authenticated` | Richiede `app_admin`. Elenco con `created_by_name` e `accepted_by_name` dai profili (che `authenticated` legge solo fra co-membri), più recenti prima |
| `app.app_invitation_by_token(p_token_hash bytea)` | `anon` | `valid` se `pending`, non revocato, e non scaduto **oppure** già prenotato (`reserved_user_id` non nullo); altrimenti nessuna riga. Restituisce solo stato, nome di chi invita (dal profilo, o null) e ruoli; **mai l'email** |
| `app.claim_app_invitation(p_token_hash bytea, p_email text)` | `anon` | Blocca la riga (`for update`). Non valida (inesistente, revocata, accettata, scaduta senza prenotazione) → `invitation_unavailable`. Email normalizzata diversa → `email_mismatch`. Esiste in `auth.users` un account con quell'email e id diverso da `reserved_user_id` → `account_exists`. Se `reserved_user_id` è nullo lo fissa (`gen_random_uuid()`, `reserved_at = now()`). Restituisce `reserved_user_id` ed email normalizzata. La scadenza si controlla solo prima della prenotazione |
| `app.complete_app_invitation(p_token_hash bytea, p_user_id uuid)` | `anon` | Blocca la riga. Richiede: non revocata; `reserved_user_id = p_user_id`; in `auth.users` esiste quell'id con l'email dell'invito. Se `accepted` con `accepted_by = p_user_id` → nessun effetto, esito positivo. Altrimenti in una sola istruzione: `status = accepted`, `accepted_by`, `accepted_at`, e `insert` in `app.user_roles` dei ruoli dell'invito con `granted_by = created_by` (`on conflict do nothing`). La scadenza nel frattempo non blocca: conta la prenotazione. Qualunque requisito mancante → `invitation_unavailable` |
| `app.create_family(p_id uuid, p_name text, p_measurement_system text, p_time_zone text)` | `authenticated` | Utente dal JWT (`auth.uid()`). Se `p_id` esiste: famiglia di cui l'utente è `family_admin` → nessun effetto; altrimenti errore (`invalid` sul campo `id` nel contratto). Altrimenti inserisce `families` (fuso validato dal trigger esistente; il server passa già `Europe/Rome` se il fuso manca o non è valido), `family_members` con ruolo `family_admin`, e imposta `profile_preferences.current_family_id` (upsert). **Non genera settimane**: il menu nasce alla prima lettura con il `prepare` esistente di `menu.getOpening`/`getWeek` (`ensureWeeks`). Il trigger su `family_members` incrementa il contatore della famiglia |

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
  3. `withDb(..., { kind: 'anon' })`;
  4. contesto `PublicOperationContext` (`RequestContext` più `now`, `tx`, `public: true`),
     letto dagli handler con `publicContext(context)`, che verifica il segno `public` e
     fallisce altrimenti. `OperationContext` resta invariato per tutte le altre operazioni.
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
| `accept` | `public`, `rateLimit: 'accept'` | no | `{token, email, displayName, password, locale}` → `{email}` | `invitation_unavailable`, `invalid` (campo `email`: `email_mismatch`), `not_allowed` (`account_exists`), `rate_limited` |

`AppInvitationView`: `id`, `email`, `roles`, `status` (`pending`/`expired`/`accepted`/
`revoked`, «scaduto» calcolato con `now` della richiesta), `createdBy` e `createdByName`,
`createdAt`, `expiresAt`, `acceptedByName`, `acceptedAt`, `revokedAt`.

Schemi: `email` con `z.email()` e normalizzazione (trim, minuscole) nel contratto;
`roles` array di `recipe_curator | app_admin` senza doppioni; `token` stringa base64url di
43 caratteri; `displayName` come `displayNameSchema` del profilo; `password` da 8
caratteri a 72 **byte** UTF-8 (limite di bcrypt), contati con `TextEncoder`, con un codice
di validazione dedicato (`password_too_long`) che il web traduce; `locale` `it-IT` |
`en-GB` (la lingua della pagina, scritta nel profilo).

Token: 32 byte da `crypto.getRandomValues`, base64url senza riempimento; impronta con
`crypto.subtle.digest('SHA-256')`. Link: `new URL('/invite/app', origin)` con
`#<token>`, dove `origin` è `new URL(request.url).origin` (già così in `contextFor`), mai
dalle intestazioni `Origin` o `Host`; vale anche per MCP. Il link si restituisce solo
dalla `create` (anche ripetuta, con token nuovo); nessun'altra operazione lo ricostruisce.

### Area `family`

`family.create`: ruolo `user`, `creates`, MCP sì (non in sola lettura). Input `{id, name,
measurementSystem, timeZone?}`; `name` come `family.rename`; `timeZone` validato come
fuso IANA con `Intl.DateTimeFormat`, altrimenti `Europe/Rome` (sezione 2). Output: la
vista del profilo aggiornata (`profileViewSchema`), con la nuova famiglia corrente, così
il web cambia famiglia senza un'altra lettura. Ripetere con lo stesso id non crea nulla e
restituisce la stessa vista.

### Modulo `server/src/accounts/`

`createInvitedAccount(env, {id, email, password, displayName, locale}, {fetch?})` →
`{status: 'created' | 'existing'} | {status: 'email_taken'}`. Unico punto che legge
`env.SUPABASE_SECRET_KEY`.

1. `POST ${SUPABASE_URL}/auth/v1/admin/users` con intestazione `apikey:
   <SUPABASE_SECRET_KEY>` (la chiave segreta non è un JWT: mai `Authorization: Bearer`)
   e corpo `{id, email, password, email_confirm: true, user_metadata: {display_name,
   locale}}`. 200 → `created`.
2. Risposta «email già registrata» (422 `email_exists`) → `GET /auth/v1/admin/users/{id}`:
   - utente con quell'id e quell'email → `PUT /auth/v1/admin/users/{id}` con `password` e
     `user_metadata` (vale l'ultima scelta) → `existing`. È ammesso solo perché il
     chiamante ha appena prenotato quell'id su un invito ancora `pending`: dopo la
     chiusura il token non vale più e non si arriva qui;
   - altrimenti → `email_taken`.
3. Ogni altra risposta, tempo scaduto (`AbortSignal.timeout`, 10 s) o chiave assente →
   `AccountServiceError`, che diventa `internal` con `requestId` e una riga di log
   (`auth_admin_failed` con lo stato HTTP, oppure `auth_admin_key_missing`).

Mai nei log: password, token, corpi di richiesta e risposta, email. `fetch` iniettabile
per i test, come `server/src/agents/grants.ts`.

### Accettazione

`appInvitations.accept`, nell'ordine:

1. **Limite** `accept` per IP (pipeline).
2. **Prenotazione**: transazione `anon`, `app.claim_app_invitation(hash, email)` →
   `reservedUserId`. Errori: `invitation_unavailable`, `invalid` sul campo `email`,
   `not_allowed`/`account_exists`.
3. **Account**: `createInvitedAccount` con `id = reservedUserId`, fuori da ogni
   transazione. `email_taken` → `not_allowed`/`account_exists` (un account creato nel
   frattempo a mano).
4. **Chiusura**: transazione `anon`, `app.complete_app_invitation(hash, reservedUserId)`:
   invito `accepted` e ruoli globali nella stessa istruzione.
5. Risposta `{email}`; la SPA entra con `signInWithPassword(email, password)`.

Fallimenti a metà:

| Si ferma dopo | Stato | Cosa succede ripetendo dallo stesso link |
|---|---|---|
| 2 | invito prenotato, nessun account | stesso id, l'account si crea |
| 3 | account senza ruoli, invito `pending` prenotato | la creazione trova l'utente con quell'id e quell'email, aggiorna password e nome, la chiusura completa. Nel frattempo la persona potrebbe entrare da `/login` senza ruoli: limite accettato |
| 3, poi scadenza | come sopra | lettura e prenotazione valgono ancora (prenotato e non revocato); la chiusura completa |
| 3, poi revoca | account senza ruoli né famiglia, invito revocato | il link non vale più; nuovo invito impossibile (l'email ha un account): caso consegnato a B, «Interfaccia per B e C» |
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
anche al ripiego su `index.html`; verificato con `wrangler dev`).

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
| Troppi tentativi | `rate_limited`: «Troppi tentativi. Riprova tra un minuto» |

Invio: `accept`, poi `backend.signIn(email, password)`, poi `/family/new` con
sostituzione della cronologia e un avviso se l'invito dava ruoli («Ora sei anche
curatore del ricettario»). Errori del modulo: email diversa sul campo («Non è l'email di
questo invito»); `account_exists`: «Esiste già un account con questa email: entra dalla
pagina di accesso», con il collegamento; password troppo corta, troppo lunga (72 byte:
«Password troppo lunga: al massimo 72 byte, e lettere accentate ed emoji ne usano più di
uno»), diverse. Accesso fallito dopo la creazione: «L'account è pronto, ma non è stato
possibile entrare» e il pulsante «Vai all'accesso» verso `/login` con l'email già
scritta (`validateLoginSearch` aggiunge `email` facoltativa).

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
  account» (con B diventerà un collegamento all'utente).
- Elenco: email, ruoli come etichette («nessun ruolo» se vuoto), stato con data («Scade
  il…», «Scaduto il…», «Accettato da {nome} il…», «Revocato il…»), autore.
- Azioni: «Nuovo link» per gli inviti in attesa e scaduti (nuova `create` con stessa
  email e ruoli e id nuovo: sostituisce quello in attesa) e «Revoca» con conferma per
  quelli in attesa. Offline i comandi sono disattivati.

Query: `['appInvitations', 'list', {}]`, non versionata; le mutazioni applicano la risposta
e invalidano l'elenco (nessun aggiornamento ottimistico). `family.create` scrive la vista
del profilo nella sua chiave.

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
- `create_app_invitation`: non `app_admin`, ruoli non ammessi o doppi, email con account
  (anche con maiuscole diverse), sostituzione dell'invito in attesa, ripetizione con lo
  stesso id (token nuovo, nessun doppione), id di un altro autore.
- `revoke_app_invitation`: ripetuta, su accettato, inesistente.
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

- `createInvitedAccount`: creato; `email_exists` con lo stesso id (aggiornamento) e con
  un altro; errore e tempo scaduto (`internal`); chiave assente; nei log nessun campo
  sensibile.
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

**Stack locale** (`supabase start`, script `scripts/invitations/invite-stack.sh` in CI
come `password-stack.sh`): il percorso completo da invito a menu della famiglia nuova
contro Auth vera, con la chiave segreta locale da `supabase status -o env`
(`SECRET_KEY`); creazione amministrativa con `email_confirm: true` **con le iscrizioni
spente**; `signInWithPassword` riuscito; rifiuto della Data API su `app` (RPC
`app_invitation_by_token` con la chiave pubblicabile e `Content-Profile: app`).

Iscrizioni spente in locale: oggi `supabase/config.toml` le tiene accese e due prove le
usano (`web/src/test/stack.ts` e `scripts/oauth/agents-e2e.mjs` chiamano `/signup`).
Proposta: spegnerle anche in locale come in produzione e far creare le persone di prova a
quelle due prove con l'API di amministrazione e la chiave segreta locale (file fuori dalla
mia area: chiedo il via al coordinatore). Ripiego, se il coordinatore preferisce non
toccarle: lo script dello stack degli inviti avvia un secondo stack con una copia della
configurazione con le iscrizioni spente (`supabase start --workdir`, porte diverse), più
lento in CI.

**Interfaccia** con la skill agent-browser su `wrangler dev` e stack locale, anche a
larghezza da telefono (390 px): percorso completo, `/admin`, intestazione
`Referrer-Policy` su `/invite/app`.

**Da provare a mano sull'iPhone** (dopo il rilascio, dal coordinatore con l'utente):
link aperto da WhatsApp in Safari; modulo con la tastiera dell'iPhone (email senza
maiuscola automatica, gestione delle password di iOS); ingresso e wizard; nota della
schermata Home visibile in Safari e assente nella PWA installata; aggiunta alla schermata
Home e accesso nella PWA con email e password; menu pronto.

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
  `mcp: false`, `rateLimit`; l'handler usa `publicContext(context)`; i dati passano solo
  da funzioni `security definer` per impronta del token con `EXECUTE` ad `anon`. C può
  aggiungere un binding `ratelimit` proprio o riusare `INVITE_READ_LIMIT`/
  `INVITE_ACCEPT_LIMIT`.
- Token: 32 byte casuali base64url, impronta SHA-256 nel database, link con il token nel
  frammento (`/invite#<token>` consigliato), `Referrer-Policy: no-referrer` su
  `/invite/*` già impostata.
- `createInvitedAccount(env, {id, email, password, displayName, locale})` di
  `server/src/accounts/`: idempotente sull'id, l'unico che usa la chiave segreta. Lo
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
`server/test/support/requests.ts`, `web/src/router.tsx`, `web/src/routes/search.ts`,
`web/src/components/FamilyGate.tsx`, `web/src/routes/MenuPage.tsx`,
`web/src/routes/ProfilePage.tsx`, `web/src/i18n/messages/index.ts` ed `errors.ts`,
`web/src/api/fake/`, `web/public/_headers`,
`.github/workflows/ci.yml` (passo dello stack degli inviti). Da approvare dal
coordinatore: `supabase/config.toml`, `web/src/test/stack.ts`,
`scripts/oauth/agents-e2e.mjs` (iscrizioni spente in locale).

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
- Iscrizioni spente anche nello stack locale, se approvato (sezione 7, «Iscrizioni
  libere spente»; sezione 9).

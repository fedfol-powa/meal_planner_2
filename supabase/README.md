# Database (Supabase)

Schema del traguardo A, creato da codice: migrazioni, test delle policy, dati locali e
script dei primi utenti. Il design è in
`progetto/superpowers/specs/2026-10-11-schema-e-permessi.md`, subordinato alla specifica
principale.

## Prerequisiti

- VM Podman avviata (`podman machine start`; «already running» va bene). Podman espone
  l'API compatibile Docker, che la CLI usa senza configurazione.
- CLI di Supabase in `~/.local/bin` e Podman in `/opt/podman/bin`:

```bash
export PATH=/opt/podman/bin:$HOME/.local/bin:$PATH
```

## Comandi

Dalla radice del repository (o del worktree):

```bash
supabase db start     # avvia il Postgres locale (una volta)
supabase db reset     # riapplica tutte le migrazioni e seed.sql
supabase test db      # esegue i test pgTAP di supabase/tests
supabase stop         # ferma i container
```

Il container si chiama `supabase_db_meal_planner_2`; per una query a mano:
`podman exec -i supabase_db_meal_planner_2 psql -U postgres`.

**Nessun comando di questa cartella tocca il progetto remoto.** Niente `supabase link`,
`supabase db push` o esecuzioni sul remoto: ogni passo remoto passa da una domanda
all'utente (vedi «Passi remoti»).

## Schema `app`

Tabelle e funzioni stanno nello schema `app`, non in `public`. La Data API di Supabase
(PostgREST) espone solo `public` e `graphql_public` (`[api] schemas` in `config.toml`):
con un JWT valido nessuno può scrivere le tabelle saltando le operazioni del server, che
raggiunge il database direttamente.

## Ruoli

| Ruolo | Tipo | Poteri |
|---|---|---|
| `app_server` | LOGIN, NOINHERIT | membro di `authenticated`, `anon`, `app_job`, `app_backup`; nessun permesso diretto: senza `set local role` non legge nulla |
| `authenticated` | di Supabase | permessi espliciti su `app`, sempre filtrati da RLS |
| `anon` | di Supabase | solo `usage` su `app` ed `execute` su `app.temporary_list_by_token(text)` |
| `app_job` | NOLOGIN | legge famiglie, preferenze, voti, settimane, pasti e catalogo pubblicato di tutte le famiglie; scrive `weeks`, i contenuti di `meal_slots` e `weekly_jobs` |
| `app_backup` | NOLOGIN, BYPASSRLS | legge tutte le tabelle di `app` (anche le future) e le migrazioni applicate; esegue solo `app.backup_auth_rows()`; non scrive nulla. Usato dall'esportazione notturna |

Il server sceglie il ruolo per transazione: richieste degli utenti con
`set local role authenticated` e `request.jwt.claims`; `/internal/jobs/*` con
`set local role app_job`; `/shopping-lists/<token>` con `set local role anon`;
l'esportazione notturna con `set local role app_backup`. La
password di `app_server` non sta nelle migrazioni.

Funzioni eseguibili per ruolo:

| Ruolo | Funzioni |
|---|---|
| `anon` | `temporary_list_by_token` |
| `authenticated` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `has_role`, `session_is_active`, `is_member`, `is_family_admin`, `shares_family`, `can_access_week`, `can_access_slot`, `can_access_list`, `catalogue_author_names`, `meal_passed_at`, `recipe_version_at` |
| `app_job` | `is_localized_text`, `is_localized_list`, `unit_dimension`, `meal_passed_at`, `recipe_version_at` |
| `app_backup` | `backup_auth_rows` |
| PUBLIC, `app_server` | nessuna |

**Regola per ogni funzione nuova:** Postgres concede `EXECUTE` a PUBLIC su ogni funzione
creata e `alter default privileges` non basta. Ogni migrazione esegue subito
`revoke execute on function … from public` e poi concede `execute` solo ai ruoli della
tabella. `coverage_test.sql` confronta la tabella con le ACL effettive.

## Test

pgTAP in `tests/`, un file per area; `tests/helpers/` contiene le funzioni di aiuto
(`setup.psql`), i dati di prova (`fixtures.psql`) e la pulizia (`cleanup.psql`), con
estensione `.psql` perché `pg_prove` non li esegua come test.

- Tutti i file tranne `versions_test.sql` sono una transazione annullata alla fine.
- `versions_test.sql` prova i contatori con transazioni reali: scrive e cancella davvero
  i dati di prova. Se si interrompe a metà, `supabase db reset` (oppure il file stesso
  alla prossima esecuzione, che parte da `cleanup.psql`) li toglie.
- **Isolamento dal seed:** i dati di prova hanno il prefisso `test-` (slug, nomi delle
  famiglie) ed email `@test.local`; i conteggi su dati visibili oltre la famiglia si
  limitano a quei dati, quindi `seed.sql` e altri dati locali non cambiano l'esito.

## Dati locali (`seed.sql`)

Solo per lo sviluppo locale; `supabase db reset` lo applica dopo le migrazioni e non va
mai eseguito sul progetto vero. Contiene quattro persone con password `password123`:
`anna@example.test` (amministratrice della Famiglia Rossi), `bruno@example.test`
(membro), `carla@example.test` (amministratrice di Carla's family, sistema imperiale,
Londra, `en-GB`) e `dario@example.test` (curatore, senza famiglia). Niente catalogo: le
ricette locali arrivano dall'import (W3).

Per accedere con Auth locale: `supabase start` escludendo con `-x` i servizi che non
servono (per esempio `-x realtime,storage-api,imgproxy,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`),
poi `supabase status` per l'URL dell'API e la chiave pubblica. Se è già avviato solo il
database, prima `supabase stop`.

### Agenti MCP in locale

`config.toml` attiva il server OAuth 2.1 (percorso di consenso `/authorize`, registrazione
dinamica) e usa come Site URL il Vite di sviluppo (`http://127.0.0.1:5174`), dove vive la
pagina di consenso. Per collegare Claude Code allo stack locale: Worker su 8787
(`npm run dev -w server`), web su 5174 (`npm run dev -w web`), poi dalla pagina
Profilo › Collega un agente copia indirizzo e comando (in sviluppo puntano al Worker) e in
Claude Code `/mcp` › Authenticate. `scripts/oauth/agents-e2e.sh` esegue la prova
end-to-end della CI (token reali, scollegamento dall'app e dall'agente); con uno stack su
altre porte: `SUPABASE=<comando della CLI> APP_PORT=<porta> INSPECTOR_PORT=<porta>`. Se
`supabase start` fallisce con «failed to copy secret file into container», vedi
`progetto/coordinamento/messaggi/w2-podman.md`.

## Primi utenti del progetto vero (`scripts/bootstrap.sql`)

Nel traguardo A non ci sono inviti: utenti e famiglia si preparano a mano, dopo
l'applicazione delle migrazioni al progetto. In produzione lo script si compila **fuori
dal repository** (`~/.config/cosasimangia/bootstrap.production.sql`: contiene email e
nomi) e lo lancia il coordinatore con `scripts/prod-sql.sh --launch` dopo il «vai»
dell'utente (sezione «Impronta, rimozione della famiglia e azzeramento»); i passi sotto
valgono anche per l'editor SQL in locale.

1. Creare gli utenti dalla dashboard: Authentication > Users > Add user (email,
   password, «Auto Confirm User»).
2. Compilare in testa allo script la famiglia e l'elenco delle persone (email, nome,
   lingua, ruolo nella famiglia, ruoli globali). La famiglia è identificata da un UUID:
   generarlo una volta (`select gen_random_uuid()`), scriverlo nello script e
   **conservarlo** per eventuali rilanci.
3. Eseguire tutto lo script. Si può rilanciare senza duplicati, anche dopo una rinomina
   della famiglia nell'app: una famiglia esistente resta com'è, mentre nome, lingua e
   ruolo delle persone si riallineano ai valori del file. Si ferma se manca un utente o
   un amministratore della famiglia, o se l'UUID è ancora quello d'esempio.

Sul remoto lo lancia solo il coordinatore, con anteprima e «vai» dell'utente.
`scripts/bootstrap_test.sh` lo prova sul database locale (famiglia omonima, rilancio
dopo la rinomina, utente mancante, segnaposto rifiutato) e tocca solo le famiglie e
l'utente che crea.

### Impostazioni della famiglia dopo lo script

Lo script crea la famiglia con le impostazioni di default (sezione 2 della specifica).
In produzione le impostazioni vere le scrive il caricamento (`scripts/import/load.ts`),
**prima che qualcuno apra l'app**, perché la prima apertura genera il menu: solo le
chiavi diverse dai default e ancora assenti. Dopo, si cambiano dall'app (Profilo →
Impostazioni) o da un agente collegato (`family_setMeal`, `family_addRule`,
`family_setIngredientRestriction`…). La tabella resta il riferimento del primo
collaudo. Valori della famiglia di Federico, dalle regole del progetto d'origine
(`scripts/planner-data/family.ts`):

| Pasto | Lun | Mar | Mer | Gio | Ven | Sab | Dom |
|---|---|---|---|---|---|---|---|
| Pranzo | 2, ≤ 30 min | 3, ≤ 30 min | 3, ≤ 30 min | 3, ≤ 30 min | 3, ≤ 30 min | 4 | 4, fisso «Pizza» |
| Cena | 2, ≤ 20 min | 4 | 2, ≤ 20 min | 4 | 4 | 4, fisso «Cena libera» | 4 |

- Regole: pasta solo a pranzo; pesce almeno una volta il venerdì; mai pesce di
  pescheria il lunedì.
- Ingredienti: cetrioli limitati a 1 volta la settimana, scritto dal caricamento per
  ogni ingrediente `cetriol…` del catalogo (oggi il ricettario d'origine non ne ha:
  nessuna riga).
- Quota note/nuove e intervalli dei gruppi: i default.
- Sistema metrico e fuso `Europe/Rome`: già nello script.

## Passi remoti

Li lancia il coordinatore, sempre dopo un'anteprima mostrata all'utente e il suo «vai»;
l'ordine e i comandi esatti sono nel runbook del piano
`progetto/superpowers/plans/2026-10-11-messa-in-produzione.md` (parte B).

- **Migrazioni:** dentro `npm run release` (`server/README.md`, «Pubblicazione»), con
  `supabase db push --db-url` sulla URL verificata; la prima volta da sole con
  `--migrations-only`, perché `app_server`, `app_job` e `app_backup` nascono lì.
- **Password di `app_server`** (dopo le migrazioni) e Hyperdrive sul Session pooler
  (utente `app_server.<project_ref>`): la password la imposta l'utente; `node
  scripts/import/load.ts --env-file <file> --check-connection` la prova.
- **Data API:** *Exposed schemas* solo `public` e `graphql_public`.
- **Famiglia:** `bootstrap.sql` compilato fuori dal repository, con `scripts/prod-sql.sh
  --launch` (sezione sotto).
- **Ricettario e dati della famiglia:** `node scripts/import/load.ts` con `--dry-run`,
  poi `--confirm <impronta degli input>`; una transazione sola, canale `import`, nessun
  valore già presente sovrascritto.

## Impronta, rimozione della famiglia e azzeramento

Spec di dettaglio della messa in produzione, sezione 8. File in `supabase/scripts/`:

| File | Cosa fa |
|---|---|
| `app-fingerprint.sql` | `pg_temp.app_fingerprint()` (MD5 di tutte le righe di `app`, tranne `profile_preferences`), `pg_temp.lock_app_tables(mode)`, `pg_temp.launch_start()`; `prod-sql.sh` lo invia prima di ogni file |
| `show-fingerprint.sql` | stampa l'impronta (sola lettura) |
| `remove-family.sql` | toglie una famiglia mai usata (`family_id`, `expected_fingerprint`); catalogo e voti restano |
| `reset-app-data.sql` | svuota catalogo e famiglie (`expected_fingerprint`); restano schema, utenti, profili e ruoli globali |
| `check-first-generation.sql` | la prima settimana l'ha creata il cron del mercoledì? (`family_id`, `week_start`) |

**SQL sulla produzione.** `scripts/prod-sql.sh --preview <file> [--launch] [--set
nome=valore …]` esegue il file e chiude con `rollback`; stampa l'**impronta
dell'operazione** (file, `app-fingerprint.sql`, `--launch`, coppie `--set`,
destinazione), calcolata prima di collegarsi. `--apply` con gli stessi argomenti e
`--confirm <impronta>` la ricalcola e rifiuta senza collegarsi se qualcosa è cambiato.
Usa `psql` dell'immagine Postgres dello stack locale con Podman (`CONTAINER_CLI=docker`
in CI); la stringa di connessione passa solo nell'ambiente del container. Accetta solo
file con esattamente una riga `begin;` e una `commit;`.

**Impronta di avvio.** Rimozione e azzeramento sono ammessi solo se l'impronta di `app` è
l'ultima **impronta di avvio**, prodotta dentro la transazione delle scritture di avvio
con tutte le tabelle di `app` bloccate. Ne nascono solo due, in catena:

1. bootstrap con `prod-sql.sh --apply … --launch`: blocca le tabelle, rifiuta se esiste
   già una famiglia, stampa `launch_baseline` prima del `commit`;
2. caricamento con `load.ts … --launch-from <impronta precedente>`: blocca le tabelle,
   rifiuta se l'impronta di partenza è diversa, scrive e stampa la nuova.

I rilanci non la rinnovano: il bootstrap si rilancia senza `--launch`, il caricamento
senza `--launch-from` (stampa «No launch baseline»). Se il caricamento fallisce, il
rollback lascia valida l'impronta del bootstrap. Qualsiasi scrittura dopo l'ultima
impronta, anche concorrente (aspetta i lock e cade dopo), fa rifiutare rimozione e
azzeramento: «app data changed since the launch baseline». Il coordinatore annota ogni
impronta nel registro; al collaudo completo la segna come chiusa.

Le prove sono in `scripts/destructive/` (stack locale, ultime in CI con
`vitest.destructive.config.ts`; in locale `DESTRUCTIVE_TESTS=1`, poi `supabase db
reset`): svuotano lo schema `app`.

## Interfaccia con il server

I nomi esatti usati dal server (profilo, sessione, ruoli, appartenenze, contatori,
ruoli per rotta, login) sono nella sezione «Interfaccia per W1» della spec di dettaglio
`progetto/superpowers/specs/2026-10-11-schema-e-permessi.md`. Contratto dei contatori:
al massimo un incremento per transazione; una scrittura senza effetti può farlo crescere
comunque (invalidazione in più, mai dati sbagliati).

## Esportazione notturna e ripristino

Il Worker esporta ogni notte alle 02:30 UTC (secondo tentativo alle 04:30) i dati di
`app` e gli utenti di Auth (`auth.users`, `auth.identities`) nel bucket R2
`cosasimangia-backups` (giurisdizione UE), cifrati con la chiave del secret
`BACKUP_ENCRYPTION_KEY`, e conserva le ultime 7. Restano fuori sessioni, token e agenti
collegati. Spec: `progetto/superpowers/specs/2026-10-11-esportazione-r2.md`.

Tutti i comandi partono dalla radice del repository, salvo dove è indicato `cd server`.
Chiave e password si inseriscono con `read -rs` (non compaiono a schermo né nella
cronologia della shell):

```bash
read -rs BACKUP_ENCRYPTION_KEY && export BACKUP_ENCRYPTION_KEY   # la chiave dal gestore di password
```

### 1. Scarica l'esportazione

La chiave completa dell'oggetto (comincia già con `exports/`) si legge nel dashboard
(R2 → `cosasimangia-backups` → `exports/`) o nel log `backup_export_done`.

```bash
KEY='exports/2026-10-12T02-30Z.json.gz.enc'
(cd server && npx wrangler r2 object get "cosasimangia-backups/$KEY" --remote --jurisdiction eu --file ../export.bin)
```

### 2. Trova il commit delle migrazioni

```bash
git fetch origin
node scripts/backup/restore.ts inspect export.bin
```

Stampa data, versione del Worker, migrazioni e il commit di `origin/main` in cui
`supabase/migrations/` ha esattamente quelle migrazioni. Prepara la destinazione da
quel commit: `git worktree add ../ripristino <commit>`.

### 3. Prepara la destinazione

Un database con le migrazioni del commit e nessun dato:

- **ambiente di verifica locale:** dal worktree del commit, con uno stack Supabase che
  non contiene dati da conservare, `supabase db reset --no-seed`, poi la password di
  `app_server` usata in `server/.env` (il reset la azzera e il Worker locale risponde
  500 con `28P01`);
- **progetto di produzione perso:** un progetto Supabase nuovo; applica le migrazioni
  dal worktree del commit (`supabase link` e `supabase db push`, passi da concordare
  con il coordinatore), poi imposta la password di `app_server`.

Le uniche righe ammesse sono quelle che le migrazioni inseriscono (oggi la riga
iniziale di `app.catalogue_state`); qualsiasi altro dato fa rifiutare il ripristino.

### 4. Prova a vuoto, poi ripristino

Destinazione remota (progetto Supabase): scarica il certificato radice da Database
settings → SSL Configuration → Download certificate, poi

```bash
export DATABASE_URL='postgresql://postgres@<host>:<porta>/postgres?sslmode=verify-full&sslrootcert=/percorso/prod-ca-2021.crt'   # senza password
read -rs PGPASSWORD && export PGPASSWORD
node scripts/backup/restore.ts restore export.bin --dry-run
node scripts/backup/restore.ts restore export.bin
```

Ambiente di verifica locale: `DATABASE_URL='postgresql://postgres@127.0.0.1:54322/postgres'`.

Per una destinazione remota la CLI accetta solo `sslmode=verify-full` (certificato e
nome dell'host verificati; `sslrootcert=system` usa i certificati di sistema) e rifiuta
ogni altra modalità prima di leggere l'esportazione e di collegarsi:
`refused: destination tls_required`. Solo `localhost`, `127.0.0.1` e `[::1]` senza
parametri TLS sono ammessi in chiaro. Argomenti sconosciuti o scritti male
(`--dryrun`, `--dry-run=true`) fanno uscire con l'uso e codice 2, senza collegarsi.

La CLI rifiuta destinazioni non vuote, migrazioni diverse, chiavi sbagliate e file
alterati; carica tutto in una transazione e fa il commit solo se chiavi esterne e
contenuti coincidono con l'esportazione. Non stampa mai valori: in caso d'errore indica
motivo, tabella e codice.

### 5. Ricollega l'app (solo su un progetto nuovo)

In quest'ordine:

1. Auth del progetto nuovo: chiavi di firma asimmetriche, provider, SMTP di Resend,
   server OAuth 2.1, URL del sito e di redirect.
2. Hyperdrive verso il Session pooler nuovo, come utente `app_server.<ref del nuovo progetto>` (il Session pooler vuole il riferimento nel nome), con il limite
   di connessioni di prima: `(cd server && npx wrangler hyperdrive update <id> --origin-host <host> --origin-port 5432 --database postgres --origin-user "app_server.$NEW_PROJECT_REF" --origin-password "$APP_SERVER_PASSWORD")`
   dopo `NEW_PROJECT_REF=<ref del nuovo progetto>` e `read -rs APP_SERVER_PASSWORD && export APP_SERVER_PASSWORD`.
3. `SUPABASE_URL` in `server/wrangler.jsonc` (issuer, JWKS, scoperta OAuth per MCP).
4. `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` della build della SPA.
5. `npm run deploy` (compila la SPA e pubblica il Worker).
6. Verifica: accesso, famiglia e menu nell'app, `/.well-known/oauth-protected-resource/mcp`
   che indica il progetto nuovo. Avvisa che tutti rifanno l'accesso e ricollegano gli
   agenti.

### Prove

- **Prova locale completa** (criterio di fine della PR dell'esportazione): i passi 1-4
  su un'esportazione di `wrangler dev`, poi accesso e lettura di famiglia e menu
  dall'app locale puntata alla destinazione. La scoperta MCP in locale richiede
  `[auth.oauth_server] enabled = true` nello stack e il percorso RFC 8414
  `/.well-known/oauth-authorization-server/auth/v1`, che il Kong locale non serve
  (Supabase ospitato sì): senza, `/.well-known/oauth-protected-resource/mcp` risponde 500
  anche prima del ripristino.
- **Prova automatica in CI:** `npm run test:drill -w server` (azzera il database).
- **Prova di produzione** (a carico dell'utente, voce separata del registro): dopo la
  creazione del bucket e la prima notte, i passi 1-4 con un'esportazione vera e la
  chiave presa dal gestore di password, non dal secret.

Con più chiavi (dopo una rotazione): `BACKUP_ENCRYPTION_KEY='k1=<…>,k2=<…>'`.

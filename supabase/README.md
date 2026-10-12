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

Nel traguardo A non ci sono inviti e in produzione le iscrizioni libere sono spente
(Authentication › Sign In / Providers, «Allow new users to sign up» disattivato): utenti
e famiglia si preparano a mano, dopo l'applicazione delle migrazioni al progetto.

1. Creare gli utenti dalla dashboard: Authentication > Users > Add user (email,
   password, «Auto Confirm User»).
2. Lanciare lo script con `node scripts/prod-sql.ts` (lo fa il coordinatore, con
   anteprima e «vai» dell'utente; sezione «Impronta e azzeramento»). I dati non si
   scrivono nel file: passano come variabili `--set`, coperte dall'impronta
   dell'operazione, e lo strumento apre la transazione:

   ```bash
   node scripts/prod-sql.ts --preview bootstrap --launch --set family_id=<uuid> --set family_name='<nome>' --set measurement_system=metric --set time_zone=Europe/Rome --set people='[{"email":"…","display_name":"…","locale":"it-IT","family_role":"family_admin","global_roles":["app_admin","recipe_curator"]}]'
   ```

   La famiglia è identificata da un UUID: generarlo una volta e **conservarlo** per
   eventuali rilanci.
3. Si può rilanciare (senza `--launch`) senza duplicati, anche dopo una rinomina della
   famiglia nell'app: una famiglia esistente resta com'è, mentre nome, lingua e ruolo
   delle persone si riallineano ai valori dati. Si ferma se manca un utente o un
   amministratore della famiglia, o se l'UUID è quello d'esempio (tutti zeri).

`scripts/bootstrap_test.sh` lo prova sul database locale (famiglia omonima, rilancio
dopo la rinomina, utente mancante, segnaposto rifiutato) con le stesse variabili e
tocca solo le famiglie e l'utente che crea (`DB=<container>` per uno stack con un altro
nome).

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
`progetto/superpowers/plans/2026-10-11-messa-in-produzione.md` (parte B). Nessuna
password passa da una riga di comando.

- **Migrazioni:** dentro `npm run release` (`server/README.md`, «Pubblicazione»), con
  `supabase db push` verso la destinazione verificata (password in `PGPASSWORD`); la
  prima volta da sole con `--migrations-only`, perché `app_server`, `app_job` e
  `app_backup` nascono lì.
- **Password di `app_server`** (dopo le migrazioni, dall'utente nell'editor SQL) e
  **Hyperdrive** sul Session pooler (utente `app_server.<project_ref>`), creato e
  modificato dall'utente nella dashboard di Cloudflare; `node scripts/import/load.ts
  --credentials <file> --check-connection` prova la password.
- **Data API:** *Exposed schemas* solo `public` e `graphql_public`.
- **Iscrizioni spente, OAuth server e URL del sito:** prima del primo rilascio, che li
  controlla.
- **Famiglia:** `bootstrap` con `node scripts/prod-sql.ts … --launch` (sezione sopra).
- **Ricettario e dati della famiglia:** `node scripts/import/load.ts` con `--dry-run`,
  poi `--confirm <impronta degli input>`; una transazione sola, canale `import`, nessun
  valore già presente sovrascritto.

## Impronta e azzeramento

Spec di dettaglio della messa in produzione, sezione 8. File in `supabase/scripts/`,
eseguiti solo con `node scripts/prod-sql.ts <nome>` (lista chiusa nel codice):

| Nome | File | Cosa fa |
|---|---|---|
| — | `app-fingerprint.sql` | `pg_temp.app_fingerprint()` (MD5 di tutte le righe di `app`, tranne `profile_preferences`), `pg_temp.lock_app_tables(mode)`, `pg_temp.launch_start()` (stato iniziale); lo strumento lo invia prima di ogni script |
| `migrations-state` | `migrations-state.sql` | migrazioni applicate e ruoli applicativi (sola lettura) |
| `show-fingerprint` | `show-fingerprint.sql` | stampa l'impronta (sola lettura) |
| `bootstrap` | `bootstrap.sql` | famiglia e persone dalle variabili; l'unico con `--launch` |
| `reset-app-data` | `reset-app-data.sql` | svuota catalogo e famiglie (`expected_fingerprint`); restano schema, utenti, profili e ruoli globali |
| `check-first-generation` | `check-first-generation.sql` | la prima settimana l'ha creata il cron del mercoledì? (`family_id`, `week_start`; sola lettura) |

**SQL sulla produzione.** `node scripts/prod-sql.ts --preview <nome> [--launch] [--set
nome=valore …]` esegue lo script in `begin … rollback` e stampa l'**impronta
dell'operazione** (commit, byte di `app-fingerprint.sql` e dello script, nome,
`--launch`, valori `--set`, destinazione), calcolata prima di collegarsi; `--apply` con
gli stessi argomenti e `--confirm <impronta>` la ricalcola, rifiuta senza collegarsi se
qualcosa è cambiato e applica con `psql --single-transaction`. Con la destinazione di
produzione legge gli script da `HEAD` e rifiuta un checkout non pulito. Gli script non
contengono `begin` né `commit`: un controllo sul testo rifiuta comandi di transazione,
metacomandi di `psql` e variabili non quotate fuori da stringhe, commenti e corpi `$$`.
Usa `psql` dell'immagine Postgres dello stack locale con Podman (`CONTAINER_CLI=docker`
in CI); la password passa solo in `PGPASSWORD`.

**Impronta di avvio.** L'azzeramento è ammesso solo se l'impronta di `app` è l'ultima
**impronta di avvio**, prodotta dentro la transazione delle scritture di avvio con tutte
le tabelle di `app` bloccate. Ne nascono solo due, in catena:

1. bootstrap con `prod-sql.ts --apply bootstrap --launch …`: blocca le tabelle, rifiuta
   se il database non è nello **stato iniziale** (tutte le tabelle di `app` vuote tranne
   `profiles`, `profile_preferences`, `user_roles` e `catalogue_state`), stampa
   `launch_baseline` alla fine;
2. caricamento con `load.ts … --launch-from <impronta precedente>`: blocca le tabelle,
   rifiuta se l'impronta di partenza è diversa, scrive e stampa la nuova subito dopo il
   commit.

I rilanci non la rinnovano: il bootstrap si rilancia senza `--launch`, il caricamento
senza `--launch-from` (stampa «No launch baseline»). Se il caricamento fallisce, il
rollback lascia valida l'impronta del bootstrap. Qualsiasi scrittura dopo l'ultima
impronta, anche concorrente (aspetta i lock e cade dopo), fa rifiutare l'azzeramento:
«app data changed since the launch baseline». Per ripartire prima del collaudo
completo si azzera con l'ultima impronta e si rifà il bootstrap dallo stato iniziale. Il
coordinatore annota ogni impronta nel registro; al collaudo completo la segna come
chiusa.

Le prove sono in `scripts/destructive/` (stack locale, ultime in CI con
`vitest.destructive.config.ts`; in locale `DESTRUCTIVE_TESTS=1`, poi `supabase db
reset`): svuotano lo schema `app`. Ogni config di Vitest che prepara il database rifiuta
un `TEST_DATABASE_URL` che non sia lo stack locale prima di collegarsi.

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
- **progetto di produzione perso:** non da qui. C'è un solo percorso, il runbook
  «Cambio di progetto dopo un ripristino» del piano
  `progetto/superpowers/plans/2026-10-11-messa-in-produzione.md` (parte B): progetto
  nuovo, PR con `scripts/production-target.json`, URL e chiave pubblica del Worker e
  della SPA, migrazioni con `npm run release -- --migrations-only`, password di
  `app_server`, poi i passi 1, 2 e 4 di questa sezione.

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

Segue il runbook «Cambio di progetto dopo un ripristino» (sopra, passo 3): Auth del
progetto nuovo (chiavi di firma, iscrizioni spente, OAuth server, URL del sito),
Hyperdrive aggiornato dall'utente nella dashboard di Cloudflare, rilascio con `npm run
release` (che rifiuta configurazioni incoerenti), collaudo. Nessun `supabase link`, `db
push` o `npm run deploy` a mano. Avvisa che tutti rifanno l'accesso e ricollegano gli
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
